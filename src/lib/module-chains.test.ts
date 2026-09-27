import type { ModuleNode } from "@mapequation/d3gl/network";
import { describe, expect, it } from "vitest";
import { NetworkStore } from "../stores/network-store";
import { moduleChains } from "./module-chains";
import { computeModuleStats, computeStats } from "./network-stats";
import { pathKey } from "./path-key";
import type { LoadedNetwork } from "./types";

/** Deterministic LCG in [0, 1). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Random ragged hierarchy (depth 1–5, branches 1–4), records in shuffled id order or in tree order. */
function randomModules(seed: number, n: number, sorted: boolean): ModuleNode[] {
  const r = rng(seed);
  const ids = Array.from({ length: n }, (_, i) => i).sort(() => r() - 0.5);
  const records = ids.map((id) => ({
    id,
    path: Array.from(
      { length: 1 + Math.floor(r() * 5) },
      () => 1 + Math.floor(r() * 4),
    ),
  }));
  if (sorted)
    records.sort((a, b) =>
      pathKey(a.path).localeCompare(pathKey(b.path), "en", { numeric: true }),
    );
  return records;
}

describe("moduleChains", () => {
  it("interns every enclosing module once, parents first", () => {
    const { keys, parent, recordModule } = moduleChains([
      { id: 0, path: [1, 1, 1] },
      { id: 1, path: [1, 1, 2] },
      { id: 2, path: [2] },
      { id: 3, path: [1, 2, 1] },
    ]);
    expect(keys).toEqual(["", "1", "1:1", "1:2"]);
    expect(Array.from(parent)).toEqual([-1, 0, 1, 1]);
    expect(Array.from(recordModule)).toEqual([2, 2, 0, 3]);
  });
});

/** The string-keyed computeModuleStats it replaced: one ":"-joined key per node. */
function referenceLeafModules(modules: readonly ModuleNode[]): number {
  const keys = new Set<string>();
  for (const m of modules)
    if (m.path.length)
      keys.add(Array.prototype.slice.call(m.path, 0, -1).join(":"));
  return keys.size;
}

describe("computeModuleStats over module chains", () => {
  it("counts the leaf modules the string-keyed version counted", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const modules = randomModules(seed, 200 + 97 * seed, seed % 2 === 0);
      expect(computeModuleStats(modules).leafModules).toBe(
        referenceLeafModules(modules),
      );
    }
  });
});

/** The per-prefix topLeaves it replaced: first-seen highest-flow leaf per module key. */
function referenceTopLeaves(
  modules: readonly ModuleNode[],
  flow: ArrayLike<number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const { id, path } of modules) {
    for (let k = 1; k < path.length; k++) {
      const key = pathKey(Array.prototype.slice.call(path, 0, k));
      const best = out.get(key);
      if (best === undefined || (flow[id] ?? 0) > (flow[best] ?? 0))
        out.set(key, id);
    }
  }
  return out;
}

describe("module labels (topLeaves)", () => {
  it("name every module by the leaf the per-prefix version picked, ties included", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const n = 300 + 50 * seed;
      const modules = randomModules(seed, n, seed % 2 === 1);
      const r = rng(seed + 100);
      // Quantised flows, so ties are common and the tie-break (first in record order) is exercised.
      const nodeFlow = Float32Array.from(
        { length: n },
        () => Math.floor(r() * 8) / 8,
      );
      const names = Array.from({ length: n }, (_, i) => `n${i}`);
      const net: LoadedNetwork = {
        kind: "clustered",
        filename: "random.tree",
        sources: [],
        stats: computeStats(n, [], [], []),
        directed: false,
        isStates: false,
        graph: {
          nodeCount: n,
          source: [],
          target: [],
          weight: [],
          nodeFlow,
          directed: false,
        },
        names,
        modules,
      };
      const store = new NetworkStore();
      store.setNetwork(net);
      for (const [key, leaf] of referenceTopLeaves(modules, nodeFlow)) {
        expect(store.moduleLabel(key.split(":").map(Number))).toBe(names[leaf]);
      }
    }
  });
});
