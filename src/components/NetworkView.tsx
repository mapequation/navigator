import {
  type ModuleNode,
  type NetworkGraph,
  type NetworkHit,
  type NetworkLayoutOptions,
  type NetworkLODOptions,
  type NetworkStyle,
  network,
} from "@mapequation/d3gl/network";
import { scaleLinear, scaleSqrt } from "d3-scale";
import { computed, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { c3ModuleColor, type ModuleColor } from "../lib/c3-module-colors";
import { fitTransform } from "../lib/fit-transform";
import { pathKey } from "../lib/path-key";
import {
  lumpStates,
  physicalModule,
  type StateView,
  viewIds,
} from "../lib/state-ids";
import type { LoadedNetwork } from "../lib/types";
import { useStores } from "../stores";
import type { NetworkStore } from "../stores/network-store";
import type { ScaleKind, SettingsStore } from "../stores/settings-store";

const DEFAULT_NODE_FILL = "#4878d0";
// Color by flow: the colour ranges of d3gl's "Flow borders and half-arrows"
// example (website/src/examples/flow-borders/data.ts), low → high, over
// [0, max] of this network's values.
const NODE_FILL_RANGE: [string, string] = ["#EF7518", "#D75908"];
const NODE_BORDER_RANGE: [string, string] = ["#FFAE38", "#f9a327"];
const LINK_RANGE: [string, string] = ["#71B2D7", "#418EC7"];
// Flow-border ring width (px in screen size mode) at the largest node exit
// flow, or, without node rings, the largest node flow; a module's ring
// extrapolates above it.
const RING_NODE_MAX_WIDTH = 4;
const HALF_ARROW_BEND = 0.15; // d3gl#299: half-arrow bend is a chord fraction too
const LINE_BEND = 0.15;
// Every layout runs on the layout backend chosen in Settings when it starts
// (d3gl's "auto", "gpu" or "worker"; "auto" by default, d3gl#375). A switch
// leaves a running layout on its backend and applies from the next layout.
// A load lays the network out from scratch, simulation or not: it has no
// positions yet. With a module hierarchy (see holdsModules; whatever the LOD
// mode) and Nested layout on in Settings (the default), that's the nested map
// of modules (d3gl#324): each module's children inside it, by their own links
// only. Otherwise it's the force layout. fit keeps the camera framed while it
// streams.
const LAYOUT = { fit: true } as const;

/**
 * The layout after new modules or a Nested layout switch, or null for none.
 * The nodes stay where they are unless the kind of layout they have (a nested
 * map of the modules, or not: `have`) is no longer the kind asked for
 * (`want`); then, while the simulation runs, the layout goes on from where the
 * nodes are (d3gl#454, `warm`), streamed from its first frame: nothing
 * restarts from a disc, and nothing is solved out of sight first. (With the
 * simulation off nothing moves the nodes until it's switched back on, which
 * lays the network out anew as set then.)
 *
 * - A nested map of the (new) modules streams from the positions on screen:
 *   the nodes glide into their modules' discs as it forms, and it goes to its
 *   own size, centred where the nodes are. Switched on from a force layout it
 *   shrinks to about a third of the force layout's width, framed as it goes
 *   (fit). A re-clustering (`recluster`) streams the same way but keeps the
 *   camera the user left: a nested map of the old modules has the new one's
 *   size already, so it stays in view.
 * - A force layout streams from the nested map and glides out to the force
 *   model's own scale (about 3× wider) as it converges, framed as it grows.
 *   It asks for `nested: false`: d3gl lays a network with modules out as
 *   their nested map unless told otherwise (d3gl#566).
 * Either way d3gl eases the nodes from where they are toward each frame of
 * the solve as it lands, so the switch glides rather than steps.
 *
 * So with Nested layout off a re-clustering lays nothing out: the new modules
 * regroup the LOD and recolour the nodes where they are. (A states network's
 * re-clustering is a load, see NetworkStore.)
 */
export function relayoutOf(
  want: boolean,
  have: boolean,
  simulation: boolean,
  recluster = false,
): Omit<NetworkLayoutOptions, "backend"> | null {
  if (!simulation || want === have) return null;
  if (!want) return { nested: false, fit: true, warm: true };
  return recluster
    ? { nested: true, warm: true }
    : { nested: true, warm: true, fit: true };
}
// Rings around the modules the LOD cut has opened (d3gl#329), drawn over the
// links in each module's own colour (d3gl#471). They are the discs of a nested
// map of the modules; without one d3gl rings each module's centroid + extent,
// which over other (e.g. force) positions is a tangle of huge rings. So they
// follow the positions, not the setting: drawn once a nested map of the
// modules the engine holds has landed, whatever Nested layout is set to now.
const MODULE_BOUNDARY = { width: 1, color: "fill", opacity: 0.8 } as const;
const ZOOM_EXTENT: [number, number] = [0.002, 200];
// Longest a node label is drawn, in screen px: longer names end in "…" and
// show in full while their node is hovered (d3gl#496).
const LABEL_MAX_WIDTH = 160;

const makeScale = (kind: ScaleKind) =>
  kind === "root" ? scaleSqrt() : scaleLinear();

/**
 * Flow → ring width, shared by the flow-border rings (exit flow) and the open
 * modules' boundaries (enter flow), so the two read on one scale. Not clamped:
 * a module's ring extrapolates on the nodes' scale, as its radius does on
 * nodeRadius's, so ring and disc grow together.
 */
/** The flow-border width scale: over the physical nodes' flow borders in a state network's physical view. */
function ringScaleOf(store: NetworkStore, settings: SettingsStore) {
  const physical =
    store.current?.isStates && settings.stateView === "physical"
      ? store.physicalMax
      : null;
  const max = physical
    ? physical.boundary || physical.flow
    : store.maxBoundaryFlow || store.maxFlow;
  return makeScale(settings.nodeScale)
    .domain([0, max || 1])
    .range([0, RING_NODE_MAX_WIDTH]);
}

/**
 * The open-module boundary: as wide as the module's enter flow on the ring
 * scale (its collapsed ring shows the exit flow), never thinner than the
 * plain line it is without module flow.
 */
function moduleBoundaryOf(store: NetworkStore, settings: SettingsStore) {
  const flows = store.current?.moduleFlow;
  if (!flows) return MODULE_BOUNDARY;
  const scale = ringScaleOf(store, settings);
  return {
    ...MODULE_BOUNDARY,
    width: (path: readonly number[]) => {
      const m = flows.get(pathKey(path));
      return m && Math.max(MODULE_BOUNDARY.width, scale(m.enterFlow));
    },
  };
}

/**
 * The style. `color` is the module colour (c3ModuleColor) of the modules the
 * engine holds — a plain network's, given to data(), or a state network's,
 * given to stateNetwork() — or null without modules.
 */
export function buildStyle(
  store: NetworkStore,
  settings: SettingsStore,
  color: ModuleColor | null,
): NetworkStyle {
  const cur = store.current;
  const occurrences = store.occurrenceFiles.filter((f) => f.enabled);
  const byFlow = settings.nodeSizeBy === "flow" && !!cur?.graph.nodeFlow;
  // half-arrow only makes sense with direction; undirected graphs render lines.
  const linkStyle = cur?.directed ? settings.linkStyle : "line";
  const halfArrow = linkStyle === "half-arrow";
  // Flow colours need node flow; without it the module colours stand in.
  const flowColors = settings.colorBy === "flow" && !!cur?.graph.nodeFlow;
  // A state network's physical view draws its physical graph: the scales span
  // that graph's flow, degree and link weights. (The both view draws the
  // state nodes and links.)
  const sg = cur?.isStates ? store.builtState : null;
  const physical =
    sg && settings.stateView === "physical" ? store.physicalMax : null;
  // Lumped (d3gl#529), the state and both views draw the lumps: the scales
  // span the lumped graph's flow, degree and link weights.
  const lumped = sg && settings.stateView !== "physical" ? store.lumped : null;
  const max = physical ?? (lumped ? store.lumpedMax : null);
  const maxFlow = max ? max.flow : store.maxFlow;
  const maxDegree = max ? max.degree : store.maxDegree;
  const maxLinkFlow = max ? max.weight : store.maxLinkFlow;
  const linkDomain: [number, number] = [0, maxLinkFlow || 1];
  const flowFill = scaleLinear<string>()
    .domain([0, maxFlow || 1])
    .range(NODE_FILL_RANGE)
    .clamp(true);
  // Node i's module colour, as d3gl's { by: "module" } gives it: a node's
  // enclosing module's, a state network's physical node its largest top
  // module's. A lump's records are the lumped network's, by lump id.
  const modules = cur?.modules;
  const moduleFillOf = (i: number, g: NetworkGraph): string => {
    if (!color || !modules) return DEFAULT_NODE_FILL;
    const path =
      sg && g === sg.physical
        ? physicalModule(sg.physicalToState, i, modules, sg.state.flow)
        : Array.from(
            (lumped ? lumped.modules : modules)?.[i]?.path ?? [],
          ).slice(0, -1);
    return color(path) ?? DEFAULT_NODE_FILL;
  };
  const fillOf = (i: number, g: NetworkGraph): string =>
    flowColors ? flowFill(g.flow?.[i] ?? 0) : moduleFillOf(i, g);
  // Occurrence ids are state ids in a state network: its physical graph's
  // nodes, and lumps, take the colour of a file that holds one of their
  // state nodes.
  const stateOccurrences = occurrences.map((f) => ({
    color: f.color,
    ids:
      lumped && sg
        ? new Set(
            viewIds(f.ids, "state", sg.stateToPhysical, lumped.stateToLump),
          )
        : f.idSet,
  }));
  const physicalOccurrences = sg
    ? occurrences.map((f) => ({
        color: f.color,
        ids: new Set(viewIds(f.ids, "physical", sg.stateToPhysical)),
      }))
    : stateOccurrences;
  // A state network's physical view draws its physical nodes' flow borders.
  // A lump's own exit flow is not known (its state nodes' sum would count the
  // flow between them): lumped views draw the modules' rings only.
  const ring = physical
    ? cur?.physicalBoundaryFlow
    : lumped
      ? undefined
      : cur?.boundaryFlow;
  const moduleFlow = cur?.moduleFlow;
  const ringScale = ringScaleOf(store, settings);
  const ringColor = scaleLinear<string>()
    .domain(ringScale.domain())
    .range(NODE_BORDER_RANGE)
    .clamp(true);
  return {
    directed: cur?.directed,
    sizeMode: settings.sizeMode,
    linkStyle,
    // Half-arrow bend is an absolute world offset; line bend a chord fraction.
    linkBend: settings.bendLinks
      ? halfArrow
        ? HALF_ARROW_BEND
        : LINE_BEND
      : 0,
    // Without a flow border, each node's border is a darker shade of its own
    // fill (d3gl#506).
    nodeBorder: { width: 1 },
    nodeRadius: {
      by: byFlow ? "flow" : "degree",
      scale: makeScale(settings.nodeScale)
        .domain([0, (byFlow ? maxFlow : maxDegree) || 1])
        .range([...settings.nodeRadiusRange]),
    },
    linkWidth: {
      by: "weight",
      scale: makeScale(settings.linkScale)
        .domain(linkDomain)
        .range([...settings.linkWidthRange])
        .clamp(true),
    },
    // By module, opacity rises with flow so weak links recede and overlaps
    // read as density (as in d3gl's directed map of modules). By flow, the
    // blues of the flow-borders example, over the same per-link value as the
    // width (the link weight; super-edges their summed weight).
    linkStroke: (settings.linkScale === "root"
      ? scaleSqrt<string>()
      : scaleLinear<string>()
    )
      .domain(linkDomain)
      .range(
        flowColors
          ? LINK_RANGE
          : ["rgba(90,100,120,0.12)", "rgba(60,70,90,0.85)"],
      )
      .clamp(true),
    // Occurrence colours win, per node. Otherwise by flow each glyph takes
    // the flow scale's colour of its own flow: a module's is its members'
    // summed flow (d3gl#446), not a member's colour. By module d3gl asks
    // `color` once per module, in every view of a state network (d3gl#494).
    // The pies and the both view's containers take `moduleColor` whatever
    // the nodes are filled by.
    ...(color ? { moduleColor: color } : {}),
    nodeFill: occurrences.length
      ? (i: number, g: NetworkGraph) => {
          const files =
            g === sg?.physical ? physicalOccurrences : stateOccurrences;
          for (const f of files) if (f.ids.has(i)) return f.color;
          return fillOf(i, g);
        }
      : flowColors
        ? { by: "flow", scale: flowFill }
        : color
          ? { by: "module", color }
          : DEFAULT_NODE_FILL,
    // Flow borders show the share of a glyph's flow that leaves it, its exit
    // flow over its flow, as a share of its area (d3gl#510): a node whose exit
    // flow is its flow is covered. A node has one where an in-app Infomap run
    // gave its own exit flow (checked against the modules' exit flow), or a
    // raw network's degree flow. A module of the hierarchy takes Infomap's own
    // exit flow for it (d3gl#446), from the run or an .ftree's *Links headers:
    // summing its members' would count the flow between its own submodules
    // too. Without node flow borders, a module without its own exit flow draws
    // none (d3gl#471). By module, with no colour given, each flow border is a
    // darker shade of its glyph's own fill.
    flowBorder:
      ring || moduleFlow
        ? {
            share: true,
            ...(ring ? { flow: ring } : {}),
            moduleFlow: (path: readonly number[]) =>
              moduleFlow?.get(pathKey(path))?.exitFlow,
            ...(flowColors ? { color: (v: number) => ringColor(v) } : {}),
          }
        : undefined,
  };
}

/**
 * The module hierarchy a plain network gives data() (d3gl#326), or undefined.
 * `modules` is dense-indexed by node id in `cur.graph` (buildGraph's space).
 * A *States network's records are state-indexed and go to stateNetwork()
 * instead (see holdsModules).
 */
function hierarchyOf(cur: LoadedNetwork | null) {
  return cur?.modules && !cur.isStates
    ? { modules: cur.modules, moduleLinks: cur.moduleLinks }
    : undefined;
}

/**
 * Whether `view` holds the modules as its hierarchy, which d3gl's module LOD,
 * module rings and nested layout work on: a plain network's, given to data(),
 * or a clustered state network's in its state view, which d3gl holds as
 * data(stateGraph, { modules }) would (d3gl#495). The physical and both views
 * hold none.
 */
function holdsModules(cur: LoadedNetwork | null, view: StateView): boolean {
  return !!cur?.modules && (!cur.isStates || view === "state");
}

/**
 * The LOD options. `discs`: the positions are a nested map of the modules the
 * engine holds, landed, whose discs the module rings outline. A state
 * network's LOD is its state view's, the one view d3gl draws it in (it keeps
 * the request across view switches), so `discs` are that view's.
 */
export function buildLod(
  store: NetworkStore,
  settings: SettingsStore,
  discs: boolean,
): NetworkLODOptions | false {
  if (settings.lodMode === "off") return false;
  const cur = store.current;
  // "modules" cuts the hierarchy the engine holds (see holdsModules); without
  // one it falls back to "spatial", which groups nodes by where the layout
  // put them (a quadtree, d3gl#343), so an aggregate is a compact region.
  const cutsModules =
    settings.lodMode === "modules" && holdsModules(cur, "state");
  return {
    source: cutsModules ? "modules" : "spatial",
    ...(cutsModules && discs
      ? { moduleBoundary: moduleBoundaryOf(store, settings) }
      : {}),
    ...(settings.expandPx !== null ? { expandPx: settings.expandPx } : {}),
    maxAggregateRadius: settings.maxAggregateRadius,
    declutter: settings.declutter,
    declutterSpacing: settings.declutterSpacing,
    superEdges: settings.superEdges,
    crossLevelEdges: settings.crossLevelEdges,
    crossFade: settings.crossFade,
  };
}

export const NetworkView = observer(function NetworkView() {
  const { network: store, settings, ui } = useStores();
  const hostRef = useRef<HTMLDivElement>(null);

  // One engine per host. A load hands it new data; a re-clustering keeps its
  // camera and positions (see NetworkStore.topologyVersion); a render backend
  // switch keeps everything (see the backend reaction below).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const net = network(host, { backend: settings.backend });
    store.engine = net;

    let colorFor: ArrayLike<ModuleNode> | undefined;
    let paletteFor: string | undefined;
    let color: ModuleColor | null = null;
    const colorOf = (cur: LoadedNetwork | null): ModuleColor | null => {
      const { colorTone: tone, colorHue: hue, colorOffset: offset } = settings;
      const palette = `${tone}:${hue}:${offset}`;
      if (cur?.modules !== colorFor || palette !== paletteFor) {
        colorFor = cur?.modules;
        paletteFor = palette;
        color = colorFor
          ? c3ModuleColor(colorFor, cur?.graph.nodeFlow, {
              hue,
              ...(tone !== null ? { tone } : {}),
              ...(offset !== null ? { offset } : {}),
            })
          : null;
      }
      return color;
    };

    // A state network's ids in the store are state ids; the engine draws the
    // view's own (see viewIds).
    const inView = (ids: readonly number[]): readonly number[] => {
      const sg = store.current?.isStates ? store.builtState : null;
      return sg
        ? viewIds(
            ids,
            settings.stateView,
            sg.stateToPhysical,
            store.lumped?.stateToLump,
          )
        : ids;
    };

    // A state-level id names a state node, or while lumped (d3gl#529) a lump:
    // named by its physical node.
    const stateName = (id: number): string => {
      const lumped = net.lumped;
      const cur = store.current;
      return lumped
        ? (cur?.physicalNames?.[lumped.graph.stateToPhysical[id] ?? -1] ?? "")
        : (cur?.names[id] ?? "");
    };

    net.enableZoom(ZOOM_EXTENT);
    net.interactive({
      selectable: { multi: true },
      draggable: true,
      hover: { others: { opacity: 0.5 } },
      selection: { others: { opacity: 0.3 } },
    });

    net.on("click", (hit) => {
      runInAction(() => {
        if (hit?.layer !== "nodes") {
          store.clearSelection();
          return;
        }
        const datum = hit.datum as NetworkHit;
        const members = hit.members ? hit.members().map(Number) : null;
        // Lumped (d3gl#529), a state or both view's ids are lumps: the store
        // keeps state ids.
        const lumped = settings.stateView !== "physical" ? store.lumped : null;
        if (lumped && datum.level === "state" && datum.aggregate !== true) {
          store.selectLump(Number(hit.id));
          return;
        }
        store.selectFromHit(
          Number(hit.id),
          datum.aggregate === true,
          lumped && members ? lumpStates(lumped, members) : members,
          // A physical node: the physical view's, or a both-view container.
          datum.level === "physical" ? (datum.physical ?? null) : null,
        );
      });
    });

    // Positions are the view on screen's, by its own ids (d3gl#495: in the
    // both view the state dots' at their places in their containers).
    store.zoomTo = (ids) => {
      const positions = net.positions;
      if (!positions) return;
      const t = fitTransform(
        positions,
        ids && inView(ids),
        host.clientWidth,
        host.clientHeight,
        undefined,
        ZOOM_EXTENT,
      );
      if (!t) return;
      net.setTransform(t);
      // enableZoom seeds d3-zoom's internal transform only at call time, so a
      // programmatic setTransform leaves it stale and the next wheel gesture
      // snaps back to the old view (mapequation/d3gl#202). Re-calling
      // enableZoom re-seeds it from the engine's current transform.
      net.enableZoom(ZOOM_EXTENT);
    };

    const onDblClick = (ev: MouseEvent) => {
      const rect = host.getBoundingClientRect();
      const hit = net.pick(ev.clientX - rect.left, ev.clientY - rect.top);
      // A group zooms to its members; a single node has nothing to fit, so
      // d3-zoom's own double-click zoom applies.
      const members = hit?.members?.().map(Number);
      // zoomTo takes state ids; a lumped view's members are lumps (d3gl#529).
      const lumped = settings.stateView !== "physical" ? store.lumped : null;
      if (members && members.length > 1)
        store.zoomTo?.(lumped ? lumpStates(lumped, members) : members);
    };
    host.addEventListener("dblclick", onDblClick);

    // Style and LOD are computed once per change and shared by the reaction
    // that keeps them live and by `show`, so a network swap applies each once.
    const style = computed(() =>
      buildStyle(store, settings, colorOf(store.current)),
    );
    // Each layout's latest run: whether it's a nested map of the modules its
    // view holds, and whether it has landed (converged, or been stopped). A
    // state network keeps a layout per view (d3gl#495): the physical and both
    // views share the physical graph's, the state view has its own. A plain
    // network has the one, "physical". Not landed: running, or not run yet.
    const UNLAID = { nested: false, settled: false };
    const latestOf = {
      physical: observable.box(UNLAID, { deep: false }),
      state: observable.box(UNLAID, { deep: false }),
    };
    const slotOf = (view: StateView): keyof typeof latestOf =>
      store.current?.isStates && view === "state" ? "state" : "physical";
    // The view on screen's layout: what data-nested-map reports.
    const latest = computed(() => latestOf[slotOf(settings.stateView)].get());
    const discs = computed(() => latest.get().nested && latest.get().settled);
    // The LOD's rings follow the layout of the view the LOD draws in.
    const lod = computed(() => {
      const l = latestOf[slotOf("state")].get();
      return buildLod(store, settings, l.nested && l.settled);
    });
    let appliedStyle: NetworkStyle | null = null;
    let appliedLod: NetworkLODOptions | false | null = null;
    const applyStyle = (s: NetworkStyle): void => {
      if (s === appliedStyle) return;
      appliedStyle = s;
      net.style(s);
    };
    const applyLod = (l: NetworkLODOptions | false): void => {
      if (l === appliedLod) return;
      appliedLod = l;
      net.lod(l);
    };

    // The network the engine holds, and the topology it was loaded with. The
    // reactions below track store state that a network swap also changes, and
    // mobx may run them before `show` within the same action: until the
    // engine holds the current network they leave it alone (show applies it).
    let shown: LoadedNetwork | null = null;
    let shownTopology = -1;
    const holdsCurrent = () => shown !== null && shown === store.current;

    let layoutRun = 0; // a layout's landing counts only while it's the latest
    let lastNested = false; // whether the last layout() asked for a nested map
    /**
     * Follows a run of the view on screen's layout, which `start` starts (or
     * d3gl has): not landed, then landed once it settles, unless another run,
     * a load or a switch to the other layout comes first. d3gl lays out a
     * nested map only of a hierarchy the view holds.
     */
    const follow = (start?: () => void): void => {
      const run = ++layoutRun;
      const box = latestOf[slotOf(settings.stateView)];
      const nested =
        lastNested && holdsModules(store.current, settings.stateView);
      runInAction(() => box.set({ nested, settled: false }));
      start?.();
      void net.whenSettled().then(() => {
        if (run === layoutRun)
          runInAction(() => box.set({ nested, settled: true }));
      });
    };
    const layout = (opts: Omit<NetworkLayoutOptions, "backend">): void => {
      lastNested = !!opts.nested;
      follow(() => {
        applyLod(lod.get());
        net.layout({ ...opts, backend: settings.layoutBackend });
      });
    };
    /** A layout from scratch, framed: a load's or a restarted simulation's. */
    const layoutAnew = (): void =>
      layout({ ...LAYOUT, nested: settings.nestedLayout });
    /**
     * After new modules (`recluster`) or a Nested layout switch: goes on with
     * the layout the network should have now, from where it is (see
     * relayoutOf); otherwise the LOD regroups in place.
     */
    const relayout = (recluster = false): void => {
      const nested =
        settings.nestedLayout &&
        holdsModules(store.current, settings.stateView);
      const next = relayoutOf(
        nested,
        latest.get().nested,
        settings.simulation,
        recluster,
      );
      if (next) layout(next);
      else applyLod(lod.get());
    };

    // d3gl draws a state network's LOD in its state view only.
    const drawsLod = (): boolean =>
      lod.get() !== false &&
      !(store.current?.isStates && settings.stateView !== "state");

    // A load waits in its dialog until its network is on screen (ui.viewPhase). d3gl reports no load phase
    // or first frame (proposed upstream: d3gl#466), so this watches what it does expose: with LOD on, the engine has a
    // tree to draw (lodSource); with LOD off it draws on data(). Then two more frames: the frame that draws
    // the tree, with the view's one-time builds (link styles and tables), has run by then.
    let readyWatch = 0;
    const watchFirstFrame = (): void => {
      if (ui.viewPhase === null) return;
      const watch = ++readyWatch;
      let after = -1;
      const step = (): void => {
        if (watch !== readyWatch || ui.viewPhase === null) return;
        if (
          after < 0 &&
          (!drawsLod() || net.lodSource !== "none" || latest.get().settled)
        )
          after = 2;
        if (after === 0) {
          ui.viewReady();
          return;
        }
        if (after > 0) after--;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const show = (): void => {
      const cur = store.current;
      const graph = store.built;
      if (!cur || !graph) {
        ui.viewReady(); // nothing to wait for
        return; // cleared: the view is unmounting
      }
      const reCluster =
        shown !== null && shownTopology === store.topologyVersion;
      shown = cur;
      shownTopology = store.topologyVersion;
      const s = style.get();
      // data()/stateNetwork() re-resolve the engine's current style against
      // the new graph, and style() resolves against the old one. Sizing by
      // flow throws on a graph without flow, so apply the new style after the
      // swap when the new graph has flow and before it otherwise.
      const flowFirst = !!cur.graph.nodeFlow;
      if (!flowFirst) applyStyle(s);
      if (cur.isStates && store.builtState) {
        net.stateNetwork(store.builtState, {
          modules: cur.modules,
          view: settings.stateView,
          // As Nested layout: lumped by the network's modules, if it has any.
          lump: settings.lumpStates && !!cur.modules,
        });
        store.setLumped(net.lumped);
      } else {
        net.data(graph, hierarchyOf(cur));
      }
      // Read again: lumped (d3gl#529), the style follows the lumps just set,
      // and `s`'s per-state-node arrays would not fit them.
      if (flowFirst) applyStyle(style.get());
      net.select(
        "nodes",
        store.searchHighlight && inView(store.searchHighlight),
      );
      watchFirstFrame();
      if (!reCluster) {
        // No layout of the new network has run: this lays out the view on
        // screen, d3gl a state network's other layout as it's first shown.
        runInAction(() => {
          latestOf.physical.set(UNLAID);
          latestOf.state.set(UNLAID);
        });
        layoutAnew();
        return;
      }
      // data() has stopped any layout, and a nested map of the old modules
      // is none of the new ones.
      layoutRun++;
      runInAction(() =>
        latestOf.physical.set({ nested: false, settled: true }),
      );
      relayout(true);
    };

    const disposers = [
      // A state network's view. Before the style, which follows the view (its
      // scales), so the new style resolves against the new view's graph. d3gl
      // maps a clicked selection across the switch (d3gl#316); a search
      // highlight is the matching state nodes' in the new view.
      //
      // Each view keeps its layout (d3gl#495). A switch to the other layout
      // leaves a landed one alive for a drag, and stops a running one where
      // it is; d3gl goes on with it, or lays out a view not laid out yet, with
      // the last layout() options as the view is shown. Then, should Nested
      // layout have been switched in the other view, it goes on with the kind
      // of layout set now (see relayoutOf).
      reaction(
        () => settings.stateView,
        (view, prev) => {
          if (!holdsCurrent() || !store.current?.isStates) return;
          net.view(view);
          if (store.searchHighlight)
            net.select("nodes", inView(store.searchHighlight));
          if (slotOf(view) === slotOf(prev)) return;
          layoutRun++; // the landing of a run stopped by the switch
          if (!latest.get().settled) follow(); // d3gl started it in view()
          relayout();
        },
      ),
      // Lumping (d3gl#529) switched: the state and both views draw the lumps,
      // or the state nodes as given, and d3gl maps the selection across. The
      // physical layout stays. The state view keeps its picture: d3gl starts
      // the other form where this one's nodes are and settles it with a warm
      // run, now in the state view, else as the state view is next shown.
      reaction(
        () => settings.lumpStates,
        (on) => {
          // A network without modules is not lumped (see show).
          if (
            !holdsCurrent() ||
            !store.current?.isStates ||
            !store.current.modules
          )
            return;
          net.lump(on);
          store.setLumped(net.lumped);
          if (store.searchHighlight)
            net.select("nodes", inView(store.searchHighlight));
          if (settings.stateView === "state") follow();
          else
            runInAction(() =>
              latestOf.state.set({ ...latestOf.state.get(), settled: false }),
            );
        },
      ),
      reaction(
        () => style.get(),
        (s) => {
          if (holdsCurrent()) applyStyle(s);
        },
      ),
      reaction(
        () => lod.get(),
        (l) => {
          if (holdsCurrent()) applyLod(l);
        },
      ),
      // Loads and re-clusterings. After the two above, so that when the store
      // swaps the network those usually run first and skip.
      reaction(() => [store.current, store.topologyVersion], show, {
        fireImmediately: true,
      }),
      reaction(
        () => ({ on: settings.labelsVisible, max: settings.maxLabels }),
        ({ on, max }) =>
          net.labels(
            on
              ? {
                  max,
                  maxWidth: LABEL_MAX_WIDTH,
                  // Modules are named like v1: curated name, else their
                  // highest-flow node. info.path is the module's Infomap path.
                  // A state network's physical view labels physical nodes.
                  labelOf: (id, info) =>
                    info.aggregate
                      ? info.path
                        ? store.moduleLabel(info.path)
                        : `${info.count.toLocaleString()} node${info.count === 1 ? "" : "s"}`
                      : info.level === "physical"
                        ? (store.current?.physicalNames?.[id] ?? "")
                        : stateName(id),
                  importanceOf: (id, info) =>
                    info.aggregate
                      ? info.count
                      : info.level === "physical"
                        ? (store.builtState?.physical.flow?.[id] ?? 0)
                        : ((net.lumped?.graph.state ?? store.built)?.flow?.[
                            id
                          ] ?? 0),
                }
              : false,
          ),
        { fireImmediately: true },
      ),
      reaction(
        () => settings.simulation,
        (on) => {
          if (!holdsCurrent()) return;
          if (on) layoutAnew();
          else net.stopLayout();
        },
      ),
      // Nested layout switched: see relayoutOf. A network without a module
      // hierarchy has the force layout either way.
      reaction(
        () => settings.nestedLayout,
        () => {
          if (holdsCurrent()) relayout();
        },
      ),
      // Busy while a layout runs, for assistive tech (and the e2e tests). Once
      // it lands, data-layout-transport names where d3gl ran it: "gpu", or the
      // worker's "shared" / "copy" ("none" if it was stopped first).
      reaction(
        () => latest.get().settled,
        (done) => {
          host.setAttribute("aria-busy", String(!done));
          if (done) host.dataset.layoutTransport = net.layoutTransport;
          else delete host.dataset.layoutTransport;
        },
        { fireImmediately: true },
      ),
      // For the e2e tests too: data-nested-map says whether the view on
      // screen's layout, landed, is the nested map of the modules the view
      // asked d3gl for (what the module rings follow). It's the view's
      // record, not d3gl's report: neither the transport nor any d3gl getter
      // tells the kind (d3gl#434).
      reaction(
        () => discs.get(),
        (landed) => {
          host.dataset.nestedMap = String(landed);
        },
        { fireImmediately: true },
      ),
      // For the e2e tests: whether the nodes carry flow-border rings.
      reaction(
        () => !!style.get().flowBorder,
        (on) => {
          host.dataset.flowBorders = String(on);
        },
        { fireImmediately: true },
      ),
      reaction(
        () => store.searchHighlight,
        (ids) => {
          if (holdsCurrent()) net.select("nodes", ids && inView(ids));
        },
      ),
      reaction(
        () => settings.pickLinks,
        (p) => net.pickLinks(p),
        { fireImmediately: true },
      ),
      // A render backend switch keeps the engine, as d3gl's examples do: the
      // network, style, camera and selection stay, and a running layout goes
      // on where it was (d3gl#311).
      reaction(
        () => settings.backend,
        (b) => net.setBackend(b),
      ),
    ];

    return () => {
      readyWatch++;
      for (const dispose of disposers) dispose();
      host.removeEventListener("dblclick", onDblClick);
      store.zoomTo = null;
      if (store.engine === net) store.engine = null;
      net.destroy();
    };
  }, [store, settings, ui]);

  return <div ref={hostRef} className="absolute inset-0" />;
});
