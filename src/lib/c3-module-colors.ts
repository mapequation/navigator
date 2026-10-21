import { type HierarchyOptions, hierarchy } from "@mapequation/c3";
import type { ModuleNode } from "@mapequation/d3gl/network";
import { pathKey } from "./path-key";

/** A module's colour by its path (undefined: not a module of the hierarchy). */
export type ModuleColor = (path: readonly number[]) => string | undefined;

/**
 * Module colours from c3's `hierarchy()`, for d3gl's
 * `nodeFill: { by: "module", color }`: d3gl asks it once per module and gives
 * each node its enclosing module's colour (`path` minus the final rank). A
 * module's size is its members' summed node flow (`nodeFlow` indexed by node
 * `id`), or its member count when the network has no flow. For a state
 * network the records and the flow are the state nodes'.
 */
export function c3ModuleColor(
  modules: ArrayLike<ModuleNode>,
  nodeFlow: ArrayLike<number> | undefined,
  options: HierarchyOptions = {},
): ModuleColor {
  const sizes = new Map<string, { path: number[]; flow: number }>();
  for (let r = 0; r < modules.length; r++) {
    const node = modules[r];
    if (!node) continue;
    const path = Array.from(node.path);
    const w = nodeFlow ? (nodeFlow[node.id] ?? 0) : 1;
    for (let k = 1; k < path.length; k++) {
      const key = pathKey(path.slice(0, k));
      const m = sizes.get(key);
      if (m) m.flow += w;
      else sizes.set(key, { path: path.slice(0, k), flow: w });
    }
  }
  return hierarchy([...sizes.values()], options);
}
