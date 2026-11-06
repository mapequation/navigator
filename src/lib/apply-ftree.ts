import type { ModuleNode } from "@mapequation/d3gl/network";
import { boundaryFlow, moduleFlowOf } from "./boundary-flow";
import type { InfomapTree, InfomapTreeNode, LoadedNetwork } from "./types";

/**
 * The ids Infomap gives the nodes when it reads the network file itself, per
 * dense index: state ids for a state network, else the file's node ids. Throws
 * when the file has none: an edge list whose labels aren't all plain integer
 * ids, which Infomap refuses (names) or reads as other nodes (01 as 1).
 */
export function fileIds(net: LoadedNetwork): readonly number[] {
  const ids = net.isStates && net.stateIds ? net.stateIds : net.physicalIds;
  if (!ids) {
    throw new Error(
      `${net.filename}: Infomap's output can't be matched to its nodes; that needs every node label to be a plain integer id, such as 0, 7 or 42 (not a name, 01 or +1)`,
    );
  }
  return ids;
}

/**
 * Attach an Infomap JSON tree to a raw network, keeping the real edges.
 * No moduleLinks: the raw graph already holds every leaf edge, and d3gl sums
 * moduleLinks on top of the graph's edges, so they would count twice.
 *
 * `flowText` is the same run's flow output (-o flow). With it, each node gets
 * its exit flow (its flow border) and enter flow along links, marked partial
 * where they miss the tree's module exit and enter flow; see boundaryFlow.
 *
 * `ids` are the ids the run gave the nodes, per dense index: the file's
 * (fileIds) unless Navigator wrote the network for it (infomapInput).
 */
export function withClustering(
  net: LoadedNetwork,
  tree: InfomapTree,
  flowText?: string,
  ids: readonly number[] = fileIds(net),
): LoadedNetwork {
  // Raw states networks are keyed by state id; plain networks by physical id.
  const keyOf = (n: InfomapTreeNode): number =>
    net.isStates ? (n.stateId ?? n.id) : n.id;
  // Each node needs an id of its own: two nodes sharing one would leave one of
  // them unmatched, so name the pair rather than report it as missing below.
  const denseIndex = new Map<number, number>();
  ids.forEach((id, i) => {
    const first = denseIndex.get(id);
    if (first !== undefined) {
      throw new Error(
        `${net.filename}: nodes "${net.names[first]}" and "${net.names[i]}" are two nodes here but one to Infomap (id ${id})`,
      );
    }
    denseIndex.set(id, i);
  });

  const modules: ModuleNode[] = new Array(net.graph.nodeCount);
  const nodeFlow = new Float32Array(net.graph.nodeCount);
  const names = [...net.names];
  let covered = 0;
  for (const n of tree.nodes) {
    const idx = denseIndex.get(keyOf(n));
    // Skip unknown and duplicate keys (first write wins) so `covered`
    // counts distinct filled indices and the guard below stays sound.
    if (idx === undefined || modules[idx] !== undefined) continue;
    modules[idx] = { id: idx, path: n.path };
    nodeFlow[idx] = n.flow ?? 0;
    // Infomap names a state node by its physical node: keep the file's state names.
    if (n.name && !net.isStates) names[idx] = n.name;
    covered++;
  }
  if (covered < net.graph.nodeCount) {
    throw new Error(
      `Infomap output is missing ${net.graph.nodeCount - covered} of ${net.graph.nodeCount} nodes`,
    );
  }

  // A state network's views draw state nodes or physical nodes, so it gets
  // a flow border for each: the state nodes' exit flow, and the flow leaving
  // each physical node, for the physical view.
  let ring: Float32Array | undefined;
  let enter: Float32Array | undefined;
  let physicalRing: Float32Array | undefined;
  let physicalEnter: Float32Array | undefined;
  let partial: string | undefined;
  const sg = net.stateGraph;
  if (flowText) {
    const r = boundaryFlow(
      tree,
      flowText,
      net.graph.nodeCount,
      (id) => denseIndex.get(id),
      keyOf,
      sg
        ? {
            of: sg.stateToPhysical,
            count: sg.physicalCount ?? net.physicalNames?.length ?? 0,
          }
        : undefined,
    );
    if (r.ok) {
      ring = r.node;
      enter = r.enter;
      physicalRing = r.group;
      physicalEnter = r.groupEnter;
      partial = r.partial;
      if (partial) console.info(`Node flows along links only: ${partial}`);
    } else console.info(`No flow borders: ${r.reason}`);
  }

  return {
    ...net,
    kind: "clustered",
    graph: { ...net.graph, nodeFlow },
    stateGraph: net.stateGraph ? { ...net.stateGraph, nodeFlow } : undefined,
    names,
    modules,
    infomap: {
      codelength: tree.codelength,
      numLevels: tree.numLevels,
      numTopModules: tree.numTopModules,
      relativeCodelengthSavings: tree.relativeCodelengthSavings,
    },
    infomapJson: tree,
    boundaryFlow: ring,
    boundaryEnterFlow: enter,
    physicalBoundaryFlow: physicalRing,
    physicalBoundaryEnterFlow: physicalEnter,
    partialNodeFlow: partial,
    moduleFlow: moduleFlowOf(tree),
  };
}
