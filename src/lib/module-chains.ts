import type { ModuleNode } from "@mapequation/d3gl/network";

/** Every module a hierarchy's records spell, interned once (see {@link moduleChains}). */
export interface ModuleChains {
  /** Module index → its path key (`"1:2"`); index 0 is the root, key `""`. */
  keys: string[];
  /** Module index → its parent module (-1 for the root). A module comes after its parent. */
  parent: Int32Array;
  /** Record index → its enclosing module (the path minus its last entry). */
  recordModule: Int32Array;
}

/**
 * Intern the enclosing-module chain of every record in one pass. A record only walks the part of its
 * chain it does not share with the record before it, so for records in tree order (as Infomap writes
 * them) this is a few integer compares per node, and a module's key string is built once — not once per
 * node and path prefix. Exact for records in any order.
 */
export function moduleChains(records: readonly ModuleNode[]): ModuleChains {
  const keys = [""];
  const parents = [-1];
  const children: (Map<number, number> | undefined)[] = [undefined];
  const recordModule = new Int32Array(records.length);
  const chain: number[] = []; // chain[d]: the module the previous record's path prefix of length d + 1 names
  let previous: ArrayLike<number> = [];
  for (let r = 0; r < records.length; r++) {
    const path = records[r]?.path ?? [];
    const depth = path.length - 1; // modules on the path: all entries but the node's rank
    let shared = 0;
    const limit = Math.min(depth, chain.length);
    while (shared < limit && path[shared] === previous[shared]) shared++;
    chain.length = shared;
    let m = shared > 0 ? (chain[shared - 1] ?? 0) : 0;
    for (let d = shared; d < depth; d++) {
      const branch = path[d] ?? 0;
      let kids = children[m];
      if (!kids) children[m] = kids = new Map();
      let child = kids.get(branch);
      if (child === undefined) {
        child = keys.length;
        keys.push(m === 0 ? String(branch) : `${keys[m]}:${branch}`);
        parents.push(m);
        children.push(undefined);
        kids.set(branch, child);
      }
      m = child;
      chain.push(m);
    }
    recordModule[r] = m;
    previous = path;
  }
  return { keys, parent: Int32Array.from(parents), recordModule };
}
