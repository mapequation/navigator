import {
  buildGraph,
  buildStateGraph,
  type LumpedStateNetwork,
  type Network,
  type NetworkGraph,
  type StateNetworkGraph,
} from "@mapequation/d3gl/network";
import { makeAutoObservable, observable } from "mobx";
import { withClustering } from "../lib/apply-ftree";
import { parseNodeNames } from "../lib/node-names";
import { OCCURRENCE_COLORS } from "../lib/occurrence-colors";
import { pathKey } from "../lib/path-key";
import { statesOf } from "../lib/state-ids";
import type { InfomapTree, LoadedNetwork } from "../lib/types";

/**
 * What a selection is: a plain network's node, a state node, a physical node
 * (the physical view's, or a both-view container), a lump (one physical node's
 * state nodes in one module, drawn as one: d3gl#529), a whole module, or an
 * aggregate of part of a module or of no module.
 */
export type SelectionKind =
  | "node"
  | "state node"
  | "physical node"
  | "lump"
  | "module"
  | "aggregate";

export interface SelectionInfo {
  kind: SelectionKind;
  /** Node ids (a state network's state ids): the node, or an aggregate's members. */
  ids: number[];
  aggregate: boolean;
  /** A physical node of a state network, or a lump (one physical node in one
   *  module, d3gl#529): named and weighed as itself, `ids` its state nodes. */
  physical: boolean;
  name: string;
  /**
   * Its module: a node's enclosing module, the module an aggregate's, physical
   * node's or lump's members share; null without modules.
   */
  path: number[] | null;
  /** A single node's Infomap tree path: its module, then its rank in it. */
  treePath: number[] | null;
  /**
   * A physical node's modules one level below `path` that its state nodes
   * split over, by share of its flow, largest first (see moduleShares); null
   * when they don't split.
   */
  modules: ModuleShare[] | null;
  flow: number | null;
  /**
   * The flow entering it: a node's enter flow (LoadedNetwork.boundaryEnterFlow,
   * a physical node's physicalBoundaryEnterFlow, a lump's lumpedEnterFlow), a
   * whole module's enter flow; null when unknown.
   */
  enterFlow: number | null;
  /**
   * The flow leaving it: a node's flow border (LoadedNetwork.boundaryFlow, a
   * physical node's physicalBoundaryFlow, a lump's lumpedExitFlow), a whole
   * module's exit flow; null when unknown.
   */
  exitFlow: number | null;
  /**
   * Its enter and exit flow are the flow along links only, short of all of
   * it (LoadedNetwork.partialNodeFlow).
   */
  linksOnly: boolean;
  /**
   * A node's, physical node's or lump's link count in an undirected network
   * (a self-link once, as NetworkGraph.degree); null for an aggregate, and in
   * a directed network, which counts its links in and out instead.
   */
  degree: number | null;
  inDegree: number | null;
  outDegree: number | null;
  /** A single state node's state id (a lump of one state node's too). */
  stateId: number | null;
  /** The file's id of a node, physical node, lump's or state node's physical node. */
  physicalId: number | null;
}

/**
 * Node `i`'s link count in `g`, or, `g` directed, its links in and out (a
 * self-link once each way). O(links) when directed: per selection, not per
 * frame.
 */
function degreesOf(
  g: NetworkGraph | null | undefined,
  i: number,
): Pick<SelectionInfo, "degree" | "inDegree" | "outDegree"> {
  if (!g) return { degree: null, inDegree: null, outDegree: null };
  if (!g.directed)
    return { degree: g.degree[i] ?? null, inDegree: null, outDegree: null };
  let inDegree = 0;
  let outDegree = 0;
  for (let e = 0; e < g.edgeCount; e++) {
    if (g.source[e] === i) outDegree++;
    if (g.target[e] === i) inDegree++;
  }
  return { degree: null, inDegree, outDegree };
}

export interface ModuleShare {
  path: number[];
  /** Its share of the nodes' flow, or of the nodes without flow. */
  share: number;
}

export interface OccurrenceFile {
  /** Stable identity for React keys — files may share a name. */
  id: string;
  name: string;
  /** Size in bytes. */
  size: number;
  /** File text as loaded, so the load dialog can restage it. */
  text: string;
  ids: number[];
  idSet: Set<number>;
  color: string;
  enabled: boolean;
}

/** Common module path shared by a set of leaf paths (excluding the leaf position). */
function commonPathPrefix(paths: ArrayLike<number>[]): number[] {
  const first = paths[0];
  if (!first) return [];
  let len = first.length - 1;
  for (const p of paths) {
    let k = 0;
    const max = Math.min(len, p.length - 1);
    while (k < max && p[k] === first[k]) k++;
    len = k;
    if (!len) break;
  }
  return Array.from({ length: len }, (_, k) => first[k]);
}

/**
 * The modules one level below `prefix` that the nodes `ids` are in, by their
 * share of the nodes' summed flow (their count without flow), largest first.
 * A node directly in `prefix` is in none of them. O(ids).
 */
export function moduleShares(
  ids: readonly number[],
  modules: ArrayLike<{ readonly path: ArrayLike<number> } | undefined>,
  flow: ArrayLike<number> | undefined,
  prefix: readonly number[],
): ModuleShare[] {
  const k = prefix.length;
  const byFlow = new Map<number, number>();
  const byCount = new Map<number, number>();
  let total = 0;
  for (const i of ids) {
    const w = flow?.[i] ?? 0;
    total += w;
    const path = modules[i]?.path;
    const m = path && path.length - 1 > k ? path[k] : undefined;
    if (m === undefined) continue;
    byFlow.set(m, (byFlow.get(m) ?? 0) + w);
    byCount.set(m, (byCount.get(m) ?? 0) + 1);
  }
  const [by, sum] = total > 0 ? [byFlow, total] : [byCount, ids.length];
  return [...by]
    .map(([m, w]) => ({ path: [...prefix, m], share: w / sum }))
    .sort((a, b) => b.share - a.share || a.path[k] - b.path[k]);
}

/** See {@link NetworkStore.maxLinkFlow}. */
function maxLinkFlowOf(net: LoadedNetwork, maxLeafWeight: number): number {
  let max = maxLeafWeight;
  for (const l of net.moduleLinks ?? []) if (l.flow > max) max = l.flow;
  const modules = net.modules;
  if (!modules) return max;
  // Leaf links summed per ordered pair of distinct top modules (the coarsest super-edges).
  const g = net.graph;
  const pair = new Map<number, number>();
  const tops = 1 + modules.reduce((m, r) => Math.max(m, r.path[0] ?? 0), 0);
  for (let e = 0; e < g.source.length; e++) {
    const a = modules[g.source[e]]?.path[0];
    const b = modules[g.target[e]]?.path[0];
    if (a === undefined || b === undefined || a === b) continue;
    const key = a * tops + b;
    const sum = (pair.get(key) ?? 0) + (g.weight?.[e] ?? 1);
    pair.set(key, sum);
    if (sum > max) max = sum;
  }
  return max;
}

/** The largest node flow, degree and link weight of a built graph. */
function maxOf(values: ArrayLike<number> | undefined): number {
  let max = 0;
  for (let i = 0; i < (values?.length ?? 0); i++)
    if ((values?.[i] ?? 0) > max) max = values?.[i] ?? 0;
  return max;
}

/**
 * `sg` with the state nodes' new `flow` and the physical flow its sum per
 * physical node, as buildStateGraph sums it; every other buffer is shared.
 */
function withStateFlow(
  sg: StateNetworkGraph,
  flow: Float32Array,
): StateNetworkGraph {
  const physical = new Float32Array(sg.physicalCount);
  for (let s = 0; s < flow.length; s++) {
    const p = sg.stateToPhysical[s] ?? 0;
    physical[p] = (physical[p] ?? 0) + (flow[s] ?? 0);
  }
  return {
    ...sg,
    state: { ...sg.state, flow },
    physical: { ...sg.physical, flow: physical },
  };
}

function maximaOf(g: NetworkGraph): {
  flow: number;
  degree: number;
  weight: number;
} {
  let flow = 0;
  let degree = 0;
  let weight = 0;
  if (g.flow) for (const f of g.flow) flow = Math.max(flow, f);
  for (const d of g.csr.degree) degree = Math.max(degree, d);
  for (const w of g.weight) weight = Math.max(weight, w);
  return { flow, degree, weight };
}

/**
 * Each lump's sum of its state nodes' `values` (by state id), or null without
 * `values`. A lump is one physical node's state nodes in one module, so a link
 * between two of them crosses no module boundary: summed, their flow entering
 * and leaving their module (LoadedNetwork.boundaryEnterFlow, boundaryFlow) is
 * the lump's own enter and exit flow. O(state nodes).
 *
 * Also null for a lumping without modules, which puts each physical node's
 * state nodes in the root module as one lump (lumpStateGraph; the app never
 * lumps a network without modules). Their flow is then not flow across the
 * root module's boundary: before Infomap runs it is the flow leaving each
 * state node, so the sum would count the links between them.
 */
function sumByLump(
  values: Float32Array | undefined,
  lumped: LumpedStateNetwork,
): Float32Array | null {
  if (!values || !lumped.modules) return null;
  const sum = new Float64Array(lumped.graph.state.nodeCount);
  const { stateToLump } = lumped;
  for (let s = 0; s < stateToLump.length; s++) sum[stateToLump[s]] += values[s];
  return Float32Array.from(sum);
}

/** Module pathKey → highest-flow leaf, over every module prefix. O(nodes · depth). */
function topLeaves(net: LoadedNetwork): Map<string, number> {
  const out = new Map<string, number>();
  const flow = net.graph.nodeFlow as ArrayLike<number> | undefined;
  if (!net.modules || !flow) return out;
  for (const { id, path } of net.modules) {
    for (let k = 1; k < path.length; k++) {
      const key = pathKey(Array.prototype.slice.call(path, 0, k));
      const best = out.get(key);
      if (best === undefined || flow[id] > flow[best]) out.set(key, id);
    }
  }
  return out;
}

export class NetworkStore {
  current: LoadedNetwork | null = null;
  selection: SelectionInfo | null = null;
  searchHighlight: number[] | null = null;
  /** Whether the view shows the search's matches: a click's selection replaces them. */
  searchShown = false;
  occurrenceFiles: OccurrenceFile[] = [];
  breadcrumb: number[] = [];
  maxFlow = 0;
  maxDegree = 0;
  maxWeight = 0;
  /**
   * Largest link flow/weight at any level: leaf links, ftree module links, and
   * top-module pairs aggregated from leaf links — the link-width scale's domain,
   * so module super-edges and leaf links share one scale.
   */
  maxLinkFlow = 0;
  /**
   * Largest node boundary flow (LoadedNetwork.boundaryFlow): the flow-border
   * rings' domain; 0 without node flow borders (LoadedNetwork.partialNodeFlow).
   */
  maxBoundaryFlow = 0;
  /**
   * A state network's physical graph's largest node flow (its state nodes'
   * summed flow), degree and link weight: the physical view's scale domains.
   */
  physicalMax: {
    flow: number;
    degree: number;
    weight: number;
    /** Largest physical flow border (LoadedNetwork.physicalBoundaryFlow). */
    boundary: number;
  } | null = null;
  /**
   * The lumped network the engine draws a state network's state and both
   * views by (d3gl#529), as `net.lumped` gives it after a load or a toggle,
   * and its largest node flow, degree and link weight: those views' scale
   * domains. Null while they draw the state nodes as given.
   */
  lumped: LumpedStateNetwork | null = null;
  lumpedMax: {
    flow: number;
    degree: number;
    weight: number;
    /** Largest lump flow border (lumpedExitFlow). */
    boundary: number;
  } | null = null;
  /**
   * Each lump's enter and exit flow, by lump id (see sumByLump); the exit
   * flow is the lumped views' flow borders. Null while not lumped, or without
   * node enter or exit flow.
   */
  lumpedEnterFlow: Float32Array | null = null;
  lumpedExitFlow: Float32Array | null = null;
  /**
   * Bumped on every load (setNetwork): the view takes the network as new data,
   * lays it out from scratch and frames it. A re-clustering of a plain network
   * keeps it — same nodes, same graph buffers — so the view keeps its engine,
   * camera and positions and re-lays the map out from where it is.
   */
  topologyVersion = 0;

  /** Non-observable: typed-array graphs + engine handle (imperative surface). */
  built: NetworkGraph | null = null;
  builtState: StateNetworkGraph | null = null;
  engine: Network | null = null;
  /** Set by NetworkView; null ids = fit whole network. Placeholder for d3gl fitToNodes (d3gl#197). */
  zoomTo: ((ids: readonly number[] | null) => void) | null = null;

  private moduleLeafCache = new Map<string, readonly number[]>();
  /** Module pathKey → its highest-flow leaf (names unnamed modules, v1-style). */
  private moduleTopLeaf = new Map<string, number>();

  constructor() {
    // `moduleLeafCache` is private; TS's homomorphic AnnotationsMap mapped type drops private
    // members from `keyof this`, so it must be threaded through as an explicit AdditionalKeys
    // type argument rather than inferred from the overrides object literal.
    makeAutoObservable<this, "moduleLeafCache" | "moduleTopLeaf">(
      this,
      {
        // The loaded network is replaced wholesale, never mutated internally —
        // observable.ref avoids deep-proxying its ~10k-element arrays.
        current: observable.ref,
        built: false,
        builtState: false,
        lumped: observable.ref,
        lumpedEnterFlow: observable.ref,
        lumpedExitFlow: observable.ref,
        engine: false,
        zoomTo: false,
        moduleLeafCache: false,
        moduleTopLeaf: false,
      },
      // autoBind: actions are handed bare to d3gl event callbacks (e.g. onClick: store.selectFromHit).
      { autoBind: true },
    );
  }

  setNetwork(net: LoadedNetwork): void {
    this.topologyVersion++;
    this.adopt(
      net,
      buildGraph(net.graph),
      net.stateGraph ? buildStateGraph(net.stateGraph) : null,
    );
  }

  /** Make `net` (built as `g`, its state graph as `sg`) current and reset everything derived from it. */
  private adopt(
    net: LoadedNetwork,
    g: NetworkGraph,
    sg: StateNetworkGraph | null,
  ): void {
    this.built = g;
    this.builtState = sg;
    this.moduleLeafCache.clear();
    this.current = net;
    this.selection = null;
    this.searchHighlight = null;
    this.searchShown = false;
    this.occurrenceFiles = [];
    this.breadcrumb = [];
    const max = maximaOf(g);
    this.maxFlow = max.flow;
    this.maxDegree = max.degree;
    this.maxWeight = max.weight;
    this.maxLinkFlow = maxLinkFlowOf(net, max.weight);
    this.lumped = null;
    this.lumpedMax = null;
    this.lumpedEnterFlow = null;
    this.lumpedExitFlow = null;
    this.physicalMax = this.builtState
      ? {
          ...maximaOf(this.builtState.physical),
          boundary: net.partialNodeFlow ? 0 : maxOf(net.physicalBoundaryFlow),
        }
      : null;
    this.maxBoundaryFlow = net.partialNodeFlow ? 0 : maxOf(net.boundaryFlow);
    this.moduleTopLeaf = topLeaves(net);
  }

  /** A module's display name: curated (example), else its highest-flow node's name. */
  moduleLabel(path: readonly number[]): string {
    const cur = this.current;
    if (!cur) return "";
    const key = pathKey(path);
    const curated = cur.moduleNames?.get(key);
    if (curated) return curated;
    const leaf = this.moduleTopLeaf.get(key);
    return leaf === undefined ? "" : (cur.names[leaf] ?? "");
  }

  /** Unload the network: reset everything derived from it (NetworkView tears the engine down). */
  clear(): void {
    this.current = null;
    this.built = null;
    this.builtState = null;
    this.selection = null;
    this.searchHighlight = null;
    this.searchShown = false;
    this.occurrenceFiles = [];
    this.breadcrumb = [];
    this.maxFlow = 0;
    this.maxDegree = 0;
    this.maxWeight = 0;
    this.maxLinkFlow = 0;
    this.maxBoundaryFlow = 0;
    this.physicalMax = null;
    this.lumped = null;
    this.lumpedMax = null;
    this.lumpedEnterFlow = null;
    this.lumpedExitFlow = null;
    this.moduleLeafCache.clear();
    this.moduleTopLeaf = new Map();
  }

  /** The lumped network the engine draws now (net.lumped), or null. */
  setLumped(lumped: LumpedStateNetwork | null): void {
    if (lumped === this.lumped) return;
    const cur = this.current;
    this.lumped = lumped;
    this.lumpedEnterFlow = lumped
      ? sumByLump(cur?.boundaryEnterFlow, lumped)
      : null;
    this.lumpedExitFlow = lumped ? sumByLump(cur?.boundaryFlow, lumped) : null;
    this.lumpedMax = lumped
      ? {
          ...maximaOf(lumped.graph.state),
          boundary: cur?.partialNodeFlow
            ? 0
            : maxOf(this.lumpedExitFlow ?? undefined),
        }
      : null;
  }

  /**
   * Select lump `l` of the lumped network: its physical node in its module,
   * named by the physical node, weighed by the lump's own flow and degree,
   * its state nodes the members, its enter and exit flow theirs summed (see
   * sumByLump).
   */
  selectLump(l: number): void {
    this.searchShown = false;
    const cur = this.current;
    const lumped = this.lumped;
    if (!cur || !lumped) return;
    const ids = statesOf(lumped.lumpToState, l);
    const p = lumped.graph.stateToPhysical[l] ?? -1;
    // Its module: its record less its rank. None without modules.
    const record = lumped.modules?.[l];
    const path = record ? Array.from(record.path).slice(0, -1) : null;
    this.selection = {
      ids,
      aggregate: true,
      physical: true,
      kind: "lump",
      name: cur.physicalNames?.[p] ?? String(p),
      path,
      treePath: null,
      modules: null,
      flow: lumped.graph.state.flow?.[l] ?? null,
      enterFlow: this.lumpedEnterFlow?.[l] ?? null,
      exitFlow: this.lumpedExitFlow?.[l] ?? null,
      linksOnly: !!cur.partialNodeFlow,
      ...degreesOf(lumped.graph.state, l),
      // A lump of one state node is that state node.
      stateId: ids.length === 1 ? (cur.stateIds?.[ids[0]] ?? null) : null,
      physicalId: cur.physicalIds?.[ids[0] ?? -1] ?? null,
    };
    if (path) this.breadcrumb = path;
  }

  /** Cluster the current network with an in-app Infomap run's tree and flow text. */
  applyClustering(tree: InfomapTree, flowText?: string): void {
    const cur = this.current;
    const built = this.built;
    if (!cur || !built) return;
    // Re-clustering keeps the dense node ids, so metadata-overlap files stay valid.
    const occurrenceFiles = this.occurrenceFiles;
    const net = withClustering(cur, tree, flowText);
    // A partition the network was loaded with no longer produced these modules.
    net.sources = cur.sources.filter((f) => f.kind === "network");
    // Same nodes and links: share every buffer of the built graphs (no CSR
    // rebuild), the positions included, and swap in the new flow; the engine
    // takes it with the new modules in update() (d3gl#547).
    const nodeFlow = net.graph.nodeFlow;
    const flow = nodeFlow ? Float32Array.from(nodeFlow) : null;
    const sg = this.builtState;
    this.adopt(
      net,
      { ...built, flow },
      sg && flow ? withStateFlow(sg, flow) : sg,
    );
    this.occurrenceFiles = occurrenceFiles;
  }

  clearSelection(): void {
    this.selection = null;
    this.searchShown = false;
  }

  resetView(): void {
    this.breadcrumb = [];
  }

  /**
   * Select a hit: a node, an aggregate of `members`, or, in a state network,
   * the physical node `physical` (the physical view's node, or a both-view
   * container), whose state nodes are its members (whatever the hit's own
   * `members`, which in the physical view are physical ids).
   */
  selectFromHit(
    id: number,
    aggregate: boolean,
    members: number[] | null,
    physical: number | null = null,
  ): void {
    this.searchShown = false;
    const cur = this.current;
    if (!cur) return;
    const nodeFlow = cur.graph.nodeFlow as Float32Array | undefined;
    const sg = this.builtState;
    if (physical !== null && sg) {
      const ids = statesOf(sg.physicalToState, physical);
      const path = cur.modules
        ? commonPathPrefix(ids.map((i) => cur.modules?.[i]?.path ?? []))
        : null;
      const shares =
        path && cur.modules
          ? moduleShares(ids, cur.modules, nodeFlow, path)
          : [];
      this.selection = {
        ids,
        aggregate: true,
        physical: true,
        kind: "physical node",
        name: cur.physicalNames?.[physical] ?? String(physical),
        path,
        treePath: null,
        modules: shares.length > 1 ? shares : null,
        flow: sg.physical.flow?.[physical] ?? null,
        enterFlow: cur.physicalBoundaryEnterFlow?.[physical] ?? null,
        exitFlow: cur.physicalBoundaryFlow?.[physical] ?? null,
        linksOnly: !!cur.partialNodeFlow,
        ...degreesOf(sg.physical, physical),
        stateId: null,
        physicalId: cur.physicalIds?.[ids[0] ?? -1] ?? null,
      };
      if (path) this.breadcrumb = path;
      return;
    }
    if (!aggregate) {
      const record = cur.modules?.[id];
      const treePath = record ? Array.from(record.path) : null;
      const path = treePath ? treePath.slice(0, -1) : null;
      this.selection = {
        ids: [id],
        aggregate: false,
        physical: false,
        kind: cur.isStates ? "state node" : "node",
        name: cur.names[id] ?? String(id),
        path,
        treePath,
        modules: null,
        flow: nodeFlow ? nodeFlow[id] : null,
        enterFlow: cur.boundaryEnterFlow?.[id] ?? null,
        exitFlow: cur.boundaryFlow?.[id] ?? null,
        linksOnly: !!cur.partialNodeFlow,
        ...degreesOf(this.built, id),
        stateId: cur.isStates ? (cur.stateIds?.[id] ?? null) : null,
        physicalId: cur.physicalIds?.[id] ?? null,
      };
      if (path) this.breadcrumb = path;
      return;
    }
    const ids = members ?? [];
    const path = cur.modules
      ? commonPathPrefix(ids.map((i) => cur.modules?.[i]?.path ?? []))
      : null;
    const flow = nodeFlow ? ids.reduce((sum, i) => sum + nodeFlow[i], 0) : null;
    // A whole module's enter and exit flow; an aggregate of part of one has
    // none known.
    const whole =
      path?.length && this.leavesOfModule(path).length === ids.length;
    const moduleFlow = whole ? cur.moduleFlow?.get(pathKey(path)) : undefined;
    this.selection = {
      ids,
      aggregate: true,
      physical: false,
      kind: whole ? "module" : "aggregate",
      name: this.moduleName(path, ids),
      path,
      treePath: null,
      modules: null,
      flow,
      enterFlow: moduleFlow?.enterFlow ?? null,
      exitFlow: moduleFlow?.exitFlow ?? null,
      linksOnly: false, // Infomap's own
      degree: null,
      inDegree: null,
      outDegree: null,
      stateId: null,
      physicalId: null,
    };
    if (path) this.breadcrumb = path;
  }

  moduleName(path: number[] | null, memberIds: readonly number[]): string {
    const cur = this.current;
    if (!cur) return "";
    if (path) {
      const label = this.moduleLabel(path);
      if (label) return label;
    }
    if (memberIds.length === 0) return "";
    const nodeFlow = cur.graph.nodeFlow as Float32Array | undefined;
    let best = memberIds[0] ?? 0;
    if (nodeFlow)
      for (const i of memberIds) if (nodeFlow[i] > nodeFlow[best]) best = i;
    return cur.names[best] ?? "";
  }

  leavesOfModule(path: number[]): readonly number[] {
    const cur = this.current;
    if (!cur?.modules) return [];
    const key = pathKey(path);
    const cached = this.moduleLeafCache.get(key);
    if (cached) return cached;
    const ids: number[] = [];
    for (const m of cur.modules) {
      const p = m.path;
      if (p.length > path.length && path.every((v, k) => p[k] === v))
        ids.push(m.id);
    }
    this.moduleLeafCache.set(key, ids);
    return ids;
  }

  setSearch(query: string): void {
    const cur = this.current;
    const q = query.trim().toLowerCase();
    if (!cur || !q) {
      this.searchHighlight = null;
      this.searchShown = false;
      return;
    }
    const ids: number[] = [];
    for (let i = 0; i < cur.names.length && ids.length < 5000; i++) {
      if (cur.names[i].toLowerCase().includes(q)) ids.push(i);
    }
    this.searchHighlight = ids;
    this.searchShown = true;
  }

  /** Add a metadata file: its node names (see parseNodeNames) matched against the network's. */
  addOccurrenceFile(file: { name: string; size: number; text: string }): void {
    const cur = this.current;
    if (!cur) return;
    const wanted = new Set(parseNodeNames(file.text, file.name));
    const ids: number[] = [];
    cur.names.forEach((n, i) => {
      if (wanted.has(n)) ids.push(i);
    });
    this.occurrenceFiles.push({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      text: file.text,
      ids,
      idSet: new Set(ids),
      color:
        OCCURRENCE_COLORS[
          this.occurrenceFiles.length % OCCURRENCE_COLORS.length
        ],
      enabled: true,
    });
  }

  toggleOccurrenceFile(index: number): void {
    const f = this.occurrenceFiles[index];
    if (f) f.enabled = !f.enabled;
  }

  removeOccurrenceFile(id: string): void {
    const index = this.occurrenceFiles.findIndex((f) => f.id === id);
    if (index >= 0) this.occurrenceFiles.splice(index, 1);
  }
}
