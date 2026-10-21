import type { ModuleLink } from "@mapequation/d3gl/network";
import { parseTree } from "@mapequation/infomap-parser";
import type { ModuleFlow } from "./boundary-flow";
import { byteLength, computeStats } from "./network-stats";
import { normalizeModulePath, parseNodePath, pathKey } from "./path-key";
import type { LoadedNetwork } from "./types";

interface ParsedNode {
  path: number[] | string;
  flow?: number;
  name?: string;
  id: number;
  stateId?: number;
}

/**
 * An .ftree stores leaf links only inside bottom modules; every coarser link
 * appears once, aggregated, in its parent module's *Links section. Leaf-to-leaf
 * rows become the graph's edges; every row with a module endpoint is kept as a
 * path-addressed module link for d3gl's `data(graph, { moduleLinks })`
 * (d3gl#199). Nothing is synthesized: the graph holds exactly the links the
 * file lists.
 */
export function ftreeToNetwork(
  text: string,
  filename: string,
  size = byteLength(text),
): LoadedNetwork {
  const result = parseTree(text, undefined, true, false);
  const nodes = result.nodes as unknown as ParsedNode[];
  if (!nodes.length) throw new Error(`${filename}: no nodes found`);

  const directed = result.directed ?? /^\*Links\s+directed/im.test(text);
  const isStates = nodes[0]?.stateId !== undefined;

  const names: string[] = [];
  const physicalIds: number[] = [];
  const stateIds: number[] = [];
  const nodeFlow = new Float32Array(nodes.length);
  const paths: number[][] = [];
  const leafByPath = new Map<string, number>();
  const modulePaths = new Set<string>();

  nodes.forEach((node, i) => {
    const path = parseNodePath(node.path);
    paths.push(path);
    names.push(node.name ?? String(node.id));
    physicalIds.push(node.id);
    if (node.stateId !== undefined) stateIds.push(node.stateId);
    nodeFlow[i] = node.flow ?? 0;
    leafByPath.set(pathKey(path), i);
    for (let k = 1; k < path.length; k++)
      modulePaths.add(pathKey(path.slice(0, k)));
  });

  const source: number[] = [];
  const target: number[] = [];
  const weight: number[] = [];
  const moduleLinks: ModuleLink[] = [];
  // Each module's own enter/exit flow, from its `*Links path enterFlow exitFlow …` header.
  const moduleFlow = new Map<string, ModuleFlow>();
  let moduleFlowOk = true;
  for (const module of result.modules ?? []) {
    const modPath = normalizeModulePath(module.path);
    const { enterFlow, exitFlow } = module;
    if (Number.isFinite(enterFlow) && Number.isFinite(exitFlow))
      moduleFlow.set(pathKey(modPath), { enterFlow, exitFlow });
    else moduleFlowOk = false;
    const endpoint = (child: number): number[] => {
      const path = [...modPath, child];
      const key = pathKey(path);
      if (!leafByPath.has(key) && !modulePaths.has(key))
        throw new Error(`${filename}: link endpoint ${key} not found`);
      return path;
    };
    for (const link of module.links ?? []) {
      const s = endpoint(link.source);
      const t = endpoint(link.target);
      const sLeaf = leafByPath.get(pathKey(s));
      const tLeaf = leafByPath.get(pathKey(t));
      if (sLeaf !== undefined && tLeaf !== undefined) {
        source.push(sLeaf);
        target.push(tLeaf);
        weight.push(link.flow);
      } else moduleLinks.push({ source: s, target: t, flow: link.flow });
    }
  }
  const stats = computeStats(nodes.length, source, target, weight, {
    weightIsFlow: true,
    physicalIds,
  });
  stats.moduleLinks = moduleLinks.length;

  const net: LoadedNetwork = {
    kind: "clustered",
    filename,
    sources: [{ name: filename, size, text, kind: "ftree" }],
    stats,
    directed,
    isStates,
    graph: {
      nodeCount: nodes.length,
      source,
      target,
      weight,
      nodeFlow,
      directed,
    },
    names,
    physicalIds,
    modules: paths.map((path, i) => ({ id: i, path })),
    moduleLinks,
    ftree: text,
  };
  if (moduleFlowOk && moduleFlow.size > 0) net.moduleFlow = moduleFlow;

  if (isStates) {
    net.stateIds = stateIds;
    // A state row names its physical node.
    const physicalIndex = new Map<number, number>();
    const physicalNames: string[] = [];
    physicalIds.forEach((id, i) => {
      if (physicalIndex.has(id)) return;
      physicalIndex.set(id, physicalIndex.size);
      physicalNames.push(names[i] ?? String(id));
    });
    net.physicalNames = physicalNames;
    net.stateGraph = {
      stateCount: nodes.length,
      stateToPhysical: physicalIds.map((id) => physicalIndex.get(id) ?? 0),
      source,
      target,
      weight,
      nodeFlow,
      directed,
      physicalCount: physicalIndex.size,
    };
  }

  return net;
}
