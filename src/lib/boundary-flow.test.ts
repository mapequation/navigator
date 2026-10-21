import { readFileSync } from "node:fs";
import run from "@mapequation/infomap/node";
import { describe, expect, it } from "vitest";
import { withClustering } from "./apply-ftree";
import { boundaryFlow, moduleFlowOf, parseFlowLinks } from "./boundary-flow";
import { buildInfomapArgs, infomapArgString } from "./infomap-args";
import { networkToLoaded } from "./load-files";
import { pathKey } from "./path-key";
import type { InfomapTree } from "./types";

describe("parseFlowLinks", () => {
  it("reads the link rows of any link section, skipping vertices and comments", () => {
    const text = [
      "# v2.14.0",
      "*Vertices",
      "#id name flow",
      '1 "a" 0.5',
      '2 "b" 0.5',
      "*Arcs",
      "#source target flow",
      "1 2 0.25",
      "2 1 1.11022e-16",
      "",
    ].join("\n");
    const links = parseFlowLinks(text);
    expect(links.count).toBe(2);
    expect(Array.from(links.source.subarray(0, 2))).toEqual([1, 2]);
    expect(Array.from(links.target.subarray(0, 2))).toEqual([2, 1]);
    expect(Array.from(links.flow.subarray(0, 2))).toEqual([0.25, 1.11022e-16]);
    expect(links.undirected).toBe(false);
    const edges = parseFlowLinks("*Edges\n0 7 0.1\n*Links\n7 0 0.2");
    expect(edges.count).toBe(2);
    expect(edges.undirected).toBe(true);
  });

  it("grows past its initial capacity", () => {
    const rows = Array.from({ length: 3000 }, (_, i) => `${i} ${i + 1} 0.001`);
    const links = parseFlowLinks(`*Edges\n${rows.join("\n")}\n`);
    expect(links.count).toBe(3000);
    expect(links.target[2999]).toBe(3000);
  });

  it("refuses a row it can't read rather than guess", () => {
    expect(() => parseFlowLinks("*Arcs\n1 x 0.5\n")).toThrow(/unreadable/);
  });
});

/** Infomap's -o json shape; the flows below are hand-picked, not Infomap's. */
const toyTree = (modules: InfomapTree["modules"]): InfomapTree =>
  ({
    nodes: [
      { path: [1, 1], flow: 0.3, id: 10 },
      { path: [1, 2], flow: 0.2, id: 20 },
      { path: [2, 1], flow: 0.5, id: 30 },
    ],
    modules,
  }) as unknown as InfomapTree;
const toyModule = (path: number[], enterFlow: number, exitFlow: number) => ({
  path,
  enterFlow,
  exitFlow,
  numEdges: 0,
  numChildren: 0,
  codelength: 0,
});
const toyFlow = "*Arcs\n10 20 0.1\n20 30 0.2\n30 10 0.2\n";
const dense = new Map([
  [10, 0],
  [20, 1],
  [30, 2],
]);

describe("boundaryFlow", () => {
  it("adds each cross-module arc's flow to its source: the flow leaving the module", () => {
    const tree = toyTree([
      toyModule([0], 0, 0),
      toyModule([1], 0.2, 0.2),
      toyModule([2], 0.2, 0.2),
    ]);
    const r = boundaryFlow(tree, toyFlow, 3, (id) => dense.get(id));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 10→20 stays in module 1; 20→30 leaves module 1, 30→10 leaves module 2.
    expect(Array.from(r.node)).toEqual([0, Math.fround(0.2), Math.fround(0.2)]);
    expect(r.max).toBe(Math.fround(0.2));
  });

  it("keys a state network's nodes by state id, and sums the flow leaving each physical node", () => {
    const tree = toyTree([
      toyModule([0], 0, 0),
      toyModule([1], 0.2, 0.2),
      toyModule([2], 0.2, 0.2),
    ]);
    // State nodes 10 and 20 in physical node 1, 30 in physical node 2.
    const states = {
      ...tree,
      nodes: tree.nodes.map((n, i) => ({
        ...n,
        stateId: n.id,
        id: [1, 1, 2][i],
      })),
    } as InfomapTree;
    const r = boundaryFlow(
      states,
      toyFlow,
      3,
      (id) => dense.get(id),
      (n) => n.stateId ?? n.id,
      { of: [0, 0, 1], count: 2 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Array.from(r.node)).toEqual([0, Math.fround(0.2), Math.fround(0.2)]);
    // 10→20 stays in physical node 0; 20→30 leaves it, 30→10 leaves 1.
    expect(Array.from(r.group ?? [])).toEqual([
      Math.fround(0.2),
      Math.fround(0.2),
    ]);
  });

  it("splits a cross-module edge's flow (both ways) between its ends", () => {
    const tree = toyTree([
      toyModule([0], 0, 0),
      toyModule([1], 0.2, 0.2),
      toyModule([2], 0.2, 0.2),
    ]);
    const edges = toyFlow.replace("*Arcs", "*Edges");
    const r = boundaryFlow(tree, edges, 3, (id) => dense.get(id));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Array.from(r.node)).toEqual(
      [0.1, 0.1, 0.2].map((v) => Math.fround(v)),
    );
  });

  it("refuses rings that don't add up to a module's exit flow", () => {
    // As with recorded teleportation: flow crosses without a link.
    const tree = toyTree([
      toyModule([0], 0, 0),
      toyModule([1], 0.2, 0.25),
      toyModule([2], 0.2, 0.2),
    ]);
    const r = boundaryFlow(tree, toyFlow, 3, (id) => dense.get(id));
    expect(r).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/^module 1:/),
    });
  });

  it("refuses a link to a node the tree lacks", () => {
    const tree = toyTree([toyModule([1], 0.2, 0.2), toyModule([2], 0.2, 0.2)]);
    const r = boundaryFlow(tree, "*Arcs\n10 99 0.1\n", 3, (id) =>
      dense.get(id),
    );
    expect(r).toMatchObject({ ok: false });
  });

  it("keys module flow by path, root as the empty path", () => {
    const flows = moduleFlowOf(
      toyTree([toyModule([0], 0, 0), toyModule([2, 1], 0.1, 0.3)]),
    );
    expect(flows.get("")).toEqual({ enterFlow: 0, exitFlow: 0 });
    expect(flows.get("2:1")).toEqual({ enterFlow: 0.1, exitFlow: 0.3 });
  });
});

/**
 * Through the real Infomap (its node runner), as the app runs it: every
 * bottom module's leaves' rings must add up to the module's exit
 * flow in the JSON tree, within the 6-digit rounding of Infomap's output.
 */
describe("flow-border rings against Infomap's module flow", () => {
  const cluster = async (
    file: string,
    opts: { directed: boolean; flags?: string },
  ) => {
    const text = readFileSync(file, "utf8");
    const name = file.split("/").pop() ?? file;
    const net = networkToLoaded(text, name, opts.directed || undefined);
    const args = buildInfomapArgs({
      directed: opts.directed,
      twoLevel: false,
      noInfomap: false,
    });
    const result = await run(text, {
      filename: name,
      args: `${infomapArgString(args, opts.flags)} --silent`,
    });
    const tree = (result.json_states ?? result.json) as unknown as InfomapTree;
    return { clustered: withClustering(net, tree, result.flow), tree, result };
  };

  const expectRingsMatch = ({
    clustered,
    tree,
  }: Awaited<ReturnType<typeof cluster>>): number => {
    const ring = clustered.boundaryFlow;
    const modules = clustered.modules;
    expect(ring).toBeDefined();
    if (!ring || !modules) return 0;
    const sum = new Map<string, number>();
    for (const m of modules) {
      const key = pathKey(Array.from(m.path).slice(0, -1));
      sum.set(key, (sum.get(key) ?? 0) + ring[m.id]);
    }
    const flows = moduleFlowOf(tree);
    for (const [key, got] of sum) {
      const m = flows.get(key);
      expect(m, `module ${key}`).toBeDefined();
      if (!m) continue;
      const want = m.exitFlow;
      expect(
        Math.abs(got - want),
        `module ${key}: rings ${got}, exit ${want}`,
      ).toBeLessThanOrEqual(2e-5 * Math.max(got, want) + 1e-12);
    }
    return sum.size;
  };

  it("matches on an undirected network", async () => {
    expect(
      expectRingsMatch(
        await cluster("e2e/fixtures/toy.net", { directed: false }),
      ),
    ).toBe(2);
  });

  it("matches on a directed network (unrecorded teleportation)", async () => {
    expect(
      expectRingsMatch(
        await cluster("e2e/fixtures/toy.net", { directed: true }),
      ),
    ).toBe(2);
  });

  it.each([
    ["teleportation to nodes", "--to-nodes", true],
    ["two levels", "--two-level", true],
    ["two levels, undirected", "--two-level", false],
    ["the undirdir flow model", "--flow-model undirdir", false],
    ["the outdirdir flow model", "--flow-model outdirdir", false],
    ["the rawdir flow model", "--flow-model rawdir", false],
  ])("matches with %s", async (_, flags, directed) => {
    expect(
      expectRingsMatch(
        await cluster("e2e/fixtures/toy.net", { directed, flags }),
      ),
    ).toBe(2);
  });

  it("draws no rings on a states network", async () => {
    const { clustered, result } = await cluster("e2e/fixtures/toy_states.net", {
      directed: true,
    });
    expect(result.flow).toBeUndefined();
    expect(clustered.boundaryFlow).toBeUndefined();
  });
});
