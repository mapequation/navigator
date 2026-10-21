import {
  buildGraph,
  buildStateGraph,
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

export interface SelectionInfo {
  /** Node ids (a state network's state ids): the node, or an aggregate's members. */
  ids: number[];
  aggregate: boolean;
  /** A physical node of a state network: named and weighed as itself, `ids` its state nodes. */
  physical: boolean;
  name: string;
  path: number[] | null;
  /**
   * A physical node's modules one level below `path` that its state nodes
   * split over, by share of its flow, largest first (see moduleShares); null
   * when they don't split.
   */
  modules: ModuleShare[] | null;
  flow: number | null;
  /**
   * The flow leaving it: a node's flow border (LoadedNetwork.boundaryFlow, a
   * physical node's physicalBoundaryFlow), a whole module's exit flow; null
   * when unknown.
   */
  exitFlow: number | null;
  /** A node's or physical node's link count; null for an aggregate. */
  degree: number | null;
  physicalId: number | null;
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
  /** Largest node boundary flow (LoadedNetwork.boundaryFlow): the flow-border rings' domain. */
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
    this.adopt(net, buildGraph(net.graph));
  }

  /** Make `net` (built as `g`) current and reset everything derived from it. */
  private adopt(net: LoadedNetwork, g: NetworkGraph): void {
    this.built = g;
    this.builtState = net.stateGraph ? buildStateGraph(net.stateGraph) : null;
    this.moduleLeafCache.clear();
    this.current = net;
    this.selection = null;
    this.searchHighlight = null;
    this.occurrenceFiles = [];
    this.breadcrumb = [];
    const max = maximaOf(g);
    this.maxFlow = max.flow;
    this.maxDegree = max.degree;
    this.maxWeight = max.weight;
    this.maxLinkFlow = maxLinkFlowOf(net, max.weight);
    this.physicalMax = this.builtState
      ? {
          ...maximaOf(this.builtState.physical),
          boundary: maxOf(net.physicalBoundaryFlow),
        }
      : null;
    this.maxBoundaryFlow = maxOf(net.boundaryFlow);
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
    this.occurrenceFiles = [];
    this.breadcrumb = [];
    this.maxFlow = 0;
    this.maxDegree = 0;
    this.maxWeight = 0;
    this.maxLinkFlow = 0;
    this.maxBoundaryFlow = 0;
    this.physicalMax = null;
    this.moduleLeafCache.clear();
    this.moduleTopLeaf = new Map();
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
    if (cur.isStates) {
      // A state network takes its modules with the state graph
      // (stateNetwork()) — new data for the engine, so this is a load.
      this.setNetwork(net);
    } else {
      // Same nodes and edges: share every buffer of the built graph (no CSR
      // rebuild), the positions included, and swap in the new flow.
      const flow = net.graph.nodeFlow;
      this.adopt(net, {
        ...built,
        flow: flow ? Float32Array.from(flow) : null,
      });
    }
    this.occurrenceFiles = occurrenceFiles;
  }

  clearSelection(): void {
    this.selection = null;
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
        name: cur.physicalNames?.[physical] ?? String(physical),
        path,
        modules: shares.length > 1 ? shares : null,
        flow: sg.physical.flow?.[physical] ?? null,
        exitFlow: cur.physicalBoundaryFlow?.[physical] ?? null,
        degree: sg.physical.csr.degree[physical] ?? null,
        physicalId: cur.physicalIds?.[ids[0] ?? -1] ?? null,
      };
      if (path) this.breadcrumb = path;
      return;
    }
    if (!aggregate) {
      const record = cur.modules?.[id];
      const path = record ? Array.from(record.path) : null;
      this.selection = {
        ids: [id],
        aggregate: false,
        physical: false,
        name: cur.names[id] ?? String(id),
        path,
        modules: null,
        flow: nodeFlow ? nodeFlow[id] : null,
        exitFlow: cur.boundaryFlow?.[id] ?? null,
        degree: this.built?.csr.degree[id] ?? null,
        physicalId: cur.physicalIds?.[id] ?? null,
      };
      if (path) this.breadcrumb = path.slice(0, -1);
      return;
    }
    const ids = members ?? [];
    const path = cur.modules
      ? commonPathPrefix(ids.map((i) => cur.modules?.[i]?.path ?? []))
      : null;
    const flow = nodeFlow ? ids.reduce((sum, i) => sum + nodeFlow[i], 0) : null;
    // A whole module's exit flow; an aggregate of part of one has none known.
    const whole =
      path?.length && this.leavesOfModule(path).length === ids.length;
    this.selection = {
      ids,
      aggregate: true,
      physical: false,
      name: this.moduleName(path, ids),
      path,
      modules: null,
      flow,
      exitFlow: whole
        ? (cur.moduleFlow?.get(pathKey(path))?.exitFlow ?? null)
        : null,
      degree: null,
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
      return;
    }
    const ids: number[] = [];
    for (let i = 0; i < cur.names.length && ids.length < 5000; i++) {
      if (cur.names[i].toLowerCase().includes(q)) ids.push(i);
    }
    this.searchHighlight = ids;
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
