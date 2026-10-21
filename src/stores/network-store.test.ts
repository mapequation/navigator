import { describe, expect, it } from "vitest";
import { networkToLoaded } from "../lib/load-files";
import { computeStats } from "../lib/network-stats";
import type { LoadedNetwork } from "../lib/types";
import { moduleShares, NetworkStore } from "./network-store";

const toy = (): LoadedNetwork => ({
  kind: "clustered",
  filename: "toy.ftree",
  sources: [{ name: "toy.ftree", size: 0, text: "", kind: "ftree" }],
  stats: computeStats(4, [0, 1, 2], [1, 2, 3], [1, 2, 0.5]),
  directed: false,
  isStates: false,
  graph: {
    nodeCount: 4,
    source: [0, 1, 2],
    target: [1, 2, 3],
    weight: [1, 2, 0.5],
    nodeFlow: new Float32Array([0.4, 0.3, 0.2, 0.1]),
    directed: false,
  },
  names: ["alpha", "beta", "gamma", "delta"],
  physicalIds: [1, 2, 3, 4],
  modules: [
    { id: 0, path: [1, 1] },
    { id: 1, path: [1, 2] },
    { id: 2, path: [2, 1] },
    { id: 3, path: [2, 2] },
  ],
});

describe("NetworkStore", () => {
  it("builds the graph and computes stats on setNetwork", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    expect(store.built?.nodeCount).toBe(4);
    expect(store.maxWeight).toBe(2);
    expect(store.maxFlow).toBeCloseTo(0.4);
    expect(store.maxDegree).toBeGreaterThan(0);
  });

  it("resolves module leaves with memoization", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    expect(store.leavesOfModule([1])).toEqual([0, 1]);
    expect(store.leavesOfModule([2])).toEqual([2, 3]);
    expect(store.leavesOfModule([1])).toBe(store.leavesOfModule([1])); // cached
  });

  it("selects leaves and aggregates with a breadcrumb path", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    store.selectFromHit(0, false, null);
    expect(store.selection).toMatchObject({
      ids: [0],
      aggregate: false,
      name: "alpha",
      physicalId: 1,
    });
    expect(store.breadcrumb).toEqual([1]);

    store.selectFromHit(99, true, [2, 3]);
    expect(store.selection?.ids).toEqual([2, 3]);
    expect(store.selection?.path).toEqual([2]);
    expect(store.selection?.flow).toBeCloseTo(0.3, 5);
    expect(store.selection?.name).toBe("gamma"); // highest-flow member fallback
    expect(store.breadcrumb).toEqual([2]);
  });

  it("keeps actions bound when passed as bare callbacks", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    store.selectFromHit(0, false, null);
    const clear = store.clearSelection;
    clear();
    expect(store.selection).toBeNull();
  });

  it("tolerates a leaf hit without a module record", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    store.selectFromHit(99, false, null);
    expect(store.selection).toMatchObject({ ids: [99], path: null });
  });

  it("returns an empty module name for empty members", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    expect(store.moduleName(null, [])).toBe("");
  });

  it("matches search queries case-insensitively", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    store.setSearch("AL");
    expect(store.searchHighlight).toEqual([0]);
    store.setSearch("");
    expect(store.searchHighlight).toBeNull();
  });

  it("matches occurrence values against names", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    store.addOccurrenceFile({
      name: "occ.csv",
      size: 20,
      text: 'beta,1\n"delta",2\nnope\n',
    });
    expect(store.occurrenceFiles[0].ids).toEqual([1, 3]);
    expect(store.occurrenceFiles[0].enabled).toBe(true);
    expect(store.occurrenceFiles[0].size).toBe(20);
  });

  it("removes an occurrence file by id", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    store.addOccurrenceFile({ name: "a.csv", size: 5, text: "beta\n" });
    store.addOccurrenceFile({ name: "b.csv", size: 6, text: "gamma\n" });
    store.removeOccurrenceFile(store.occurrenceFiles[0].id);
    expect(store.occurrenceFiles.map((f) => f.name)).toEqual(["b.csv"]);
  });

  it("keeps occurrence files across a re-clustering and drops a stale partition", () => {
    const store = new NetworkStore();
    store.setNetwork({
      ...toy(),
      sources: [
        { name: "toy.net", size: 1, text: "x", kind: "network" },
        { name: "toy.clu", size: 1, text: "y", kind: "clu" },
      ],
    });
    store.addOccurrenceFile({ name: "occ.csv", size: 5, text: "beta\n" });
    store.applyClustering({
      version: "v2.14.0",
      args: "",
      startedAt: "",
      completedIn: 0,
      codelength: 1,
      numLevels: 2,
      numTopModules: 2,
      relativeCodelengthSavings: 0,
      directed: false,
      flowModel: "undirected",
      higherOrder: false,
      nodes: [
        { path: [1, 1], flow: 0.4, name: "alpha", id: 1 },
        { path: [1, 2], flow: 0.3, name: "beta", id: 2 },
        { path: [1, 3], flow: 0.2, name: "gamma", id: 3 },
        { path: [2, 1], flow: 0.1, name: "delta", id: 4 },
      ],
      modules: [],
    });
    expect(store.current?.modules?.[3]?.path).toEqual([2, 1]);
    expect(store.occurrenceFiles.map((f) => f.ids)).toEqual([[1]]);
    expect(store.current?.sources.map((f) => f.name)).toEqual(["toy.net"]);
  });

  it("re-clusters over the same graph buffers without a new topology", () => {
    const store = new NetworkStore();
    store.setNetwork({ ...toy(), sources: [] });
    const before = store.built;
    const version = store.topologyVersion;
    before?.positions.set([1, 2, 3, 4, 5, 6, 7, 8]);
    store.applyClustering({
      version: "v2.14.0",
      args: "",
      startedAt: "",
      completedIn: 0,
      codelength: 1,
      numLevels: 2,
      numTopModules: 1,
      relativeCodelengthSavings: 0,
      directed: false,
      flowModel: "undirected",
      higherOrder: false,
      nodes: [1, 2, 3, 4].map((id) => ({
        path: [1, id],
        flow: id / 10,
        name: "",
        id,
      })),
      modules: [],
    });
    const after = store.built;
    expect(after).not.toBe(before);
    expect(after?.positions).toBe(before?.positions);
    expect(after?.csr).toBe(before?.csr);
    expect(Array.from(after?.flow ?? [])).toEqual(
      [0.1, 0.2, 0.3, 0.4].map(Math.fround),
    );
    expect(store.maxFlow).toBeCloseTo(0.4);
    expect(store.topologyVersion).toBe(version);
    store.setNetwork(toy());
    expect(store.topologyVersion).toBe(version + 1);
  });

  it("builds a raw state network's state graph, and selects a physical node as itself", () => {
    // Four state nodes over three physical nodes: alpha {0, 1}, beta {2}, gamma {3}.
    const text = `*Vertices 3
1 "alpha"
2 "beta"
3 "gamma"
*States
1 1 "alpha-in"
2 1 "alpha-out"
3 2
4 3
*Links
1 3 1
3 2 1
2 4 2
4 1 1
`;
    const raw = networkToLoaded(text, "toy_states.net");
    const store = new NetworkStore();
    store.setNetwork(raw);
    expect(store.builtState?.physicalCount).toBe(3);
    // Raw: degree flow, state degrees 2, 3, 2, 3 of 10; alpha's is 0.5. No
    // link stays inside a node, so the flow borders are the flows.
    expect(store.physicalMax?.flow).toBeCloseTo(0.5, 6);
    expect(store.physicalMax?.boundary).toBeCloseTo(0.5, 6);
    expect(store.maxBoundaryFlow).toBeCloseTo(0.3, 6);

    store.selectFromHit(0, false, [0], 0); // the physical view's alpha
    expect(store.selection).toMatchObject({
      ids: [0, 1],
      aggregate: true,
      physical: true,
      name: "alpha",
      flow: expect.closeTo(0.5, 6),
      exitFlow: expect.closeTo(0.5, 6),
      degree: 4, // one link each way with beta and with gamma
      physicalId: 1,
    });
    store.selectFromHit(0, false, null); // the state view's alpha-in
    expect(store.selection).toMatchObject({
      name: "alpha-in",
      physical: false,
      flow: expect.closeTo(0.2, 6),
      exitFlow: expect.closeTo(0.2, 6),
      degree: 2, // from gamma, to beta
    });

    // Clustered: both-view containers (id stateCount + p), weighed by flow.
    const nodeFlow = new Float32Array([0.3, 0.3, 0.1, 0.3]);
    store.setNetwork({
      ...raw,
      kind: "clustered",
      graph: { ...raw.graph, nodeFlow },
      stateGraph: raw.stateGraph && { ...raw.stateGraph, nodeFlow },
      modules: [
        { id: 0, path: [2, 1] },
        { id: 1, path: [1, 1] },
        { id: 2, path: [1, 2] },
        { id: 3, path: [2, 2] },
      ],
    });
    expect(store.physicalMax?.flow).toBeCloseTo(0.6, 5);
    store.selectFromHit(4, true, [0, 1], 0);
    expect(store.selection?.flow).toBeCloseTo(0.6, 5);
    expect(store.selection?.path).toEqual([]); // alpha spans modules 2 and 1
    expect(store.selection?.modules).toEqual([
      { path: [1], share: 0.5 },
      { path: [2], share: 0.5 },
    ]);
    store.selectFromHit(5, true, [2], 1);
    expect(store.selection).toMatchObject({
      name: "beta",
      path: [1],
      modules: null,
    });
  });

  it("shares a node set's flow over the modules below a prefix", () => {
    const modules = [
      { path: [1, 2, 1] },
      { path: [1, 2, 2] },
      { path: [1, 3, 1] },
      { path: [1, 1] }, // directly in module 1: in no submodule
    ];
    const ids = [0, 1, 2, 3];
    expect(moduleShares(ids, modules, [0.1, 0.2, 0.6, 0.1], [1])).toEqual([
      { path: [1, 3], share: expect.closeTo(0.6, 5) },
      { path: [1, 2], share: expect.closeTo(0.3, 5) },
    ]);
    // Without flow (or with none), by count.
    expect(moduleShares(ids, modules, undefined, [1])).toEqual([
      { path: [1, 2], share: 0.5 },
      { path: [1, 3], share: 0.25 },
    ]);
    expect(moduleShares(ids, modules, [0, 0, 0, 0], [])).toEqual([
      { path: [1], share: 1 },
    ]);
  });

  it("resets all network-derived state on clear", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    store.selectFromHit(0, false, null);
    store.setSearch("a");
    store.addOccurrenceFile({ name: "occ.csv", size: 5, text: "beta\n" });
    expect(store.leavesOfModule([1])).toEqual([0, 1]);
    store.clear();
    expect(store.current).toBeNull();
    expect(store.built).toBeNull();
    expect(store.builtState).toBeNull();
    expect(store.selection).toBeNull();
    expect(store.searchHighlight).toBeNull();
    expect(store.occurrenceFiles).toEqual([]);
    expect(store.breadcrumb).toEqual([]);
    expect([store.maxFlow, store.maxDegree, store.maxWeight]).toEqual([
      0, 0, 0,
    ]);
    expect(store.maxLinkFlow).toBe(0);
    expect(store.leavesOfModule([1])).toEqual([]);
    expect(store.moduleLabel([1])).toBe("");
  });
});
