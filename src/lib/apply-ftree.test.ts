import { describe, expect, it } from "vitest";
import { withClustering } from "./apply-ftree";
import { networkToLoaded } from "./load-files";
import { computeStats } from "./network-stats";
import type { InfomapTree, InfomapTreeNode, LoadedNetwork } from "./types";

const raw: LoadedNetwork = {
  kind: "raw",
  filename: "toy.net",
  sources: [{ name: "toy.net", size: 0, text: "", kind: "network" }],
  stats: computeStats(3, [0, 1], [1, 2], [1, 1]),
  directed: false,
  isStates: false,
  graph: {
    nodeCount: 3,
    source: [0, 1],
    target: [1, 2],
    weight: [1, 1],
    directed: false,
  },
  names: ["n1", "n2", "n3"],
  physicalIds: [1, 2, 3],
  networkText: "*Vertices 3\n...",
};

/** Test fixture in the shape of Infomap's `-o json` output (values hand-picked). */
const tree = (
  nodes: InfomapTreeNode[] = [
    { path: [1, 1], modules: [1], name: "n1", flow: 0.5, mec: 0.5, id: 1 },
    { path: [1, 2], modules: [1], name: "n2", flow: 0.3, mec: 0.3, id: 2 },
    { path: [2, 1], modules: [2], name: "n3", flow: 0.2, mec: 0.2, id: 3 },
  ],
): InfomapTree => ({
  version: "v2.14.0",
  args: "/work/toy.net /work --output json",
  startedAt: "2026-01-01 00:00:00",
  completedIn: 0.01,
  codelength: 1.25,
  numLevels: 2,
  numTopModules: 2,
  numModules: [2, 0],
  relativeCodelengthSavings: 0.1,
  directed: false,
  flowModel: "undirected",
  higherOrder: false,
  nodes,
  modules: [
    {
      path: [0],
      enterFlow: 0,
      exitFlow: 0,
      numEdges: 1,
      numChildren: 2,
      codelength: 0.2,
    },
  ],
});

describe("withClustering", () => {
  const json = tree();
  const clustered = withClustering(raw, json);

  it("keeps the original edges and adds modules + flow by matching ids", () => {
    expect(clustered.kind).toBe("clustered");
    expect(Array.from(clustered.graph.source as number[])).toEqual([0, 1]);
    expect(clustered.modules).toEqual([
      { id: 0, path: [1, 1] },
      { id: 1, path: [1, 2] },
      { id: 2, path: [2, 1] },
    ]);
    expect(Array.from(clustered.graph.nodeFlow as Float32Array)).toEqual(
      [0.5, 0.3, 0.2].map((v) => Math.fround(v)),
    );
    expect(clustered.networkText).toBe(raw.networkText);
  });

  it("keeps the header summary and the tree for export, and no ftree or module links", () => {
    expect(clustered.infomap).toEqual({
      codelength: 1.25,
      numLevels: 2,
      numTopModules: 2,
      relativeCodelengthSavings: 0.1,
    });
    expect(clustered.infomapJson).toBe(json);
    expect(clustered.ftree).toBeUndefined();
    // The raw graph already holds every leaf edge; d3gl would add these on top.
    expect(clustered.moduleLinks).toBeUndefined();
  });

  it("throws when the tree does not cover all nodes", () => {
    expect(() =>
      withClustering(raw, tree([{ path: [1, 1], flow: 1, id: 1 }])),
    ).toThrow(/missing/i);
  });

  it("throws when duplicate ids leave a node uncovered", () => {
    const duplicated = tree([
      { path: [1, 1], flow: 0.5, name: "n1", id: 1 },
      { path: [1, 2], flow: 0.3, name: "n1b", id: 1 },
      { path: [2, 1], flow: 0.2, name: "n2", id: 2 },
    ]);
    expect(() => withClustering(raw, duplicated)).toThrow(/missing/i);
  });

  it("matches state trees by state id", () => {
    const states = networkToLoaded(
      '*Vertices 2\n1 "a"\n2 "b"\n*States\n1 1 "a-in"\n2 1 "a-out"\n3 2\n*Links\n1 3 1\n3 2 1\n',
      "toy_states.net",
    );
    const out = withClustering(
      states,
      tree([
        { path: [1, 1], flow: 0.5, name: "a", stateId: 2, id: 1 },
        { path: [1, 2], flow: 0.3, name: "a", stateId: 1, id: 1 },
        { path: [2, 1], flow: 0.2, name: "b", stateId: 3, id: 2 },
      ]),
    );
    expect(out.modules?.map((m) => m.path)).toEqual([
      [1, 2],
      [1, 1],
      [2, 1],
    ]);
    expect(Array.from(out.stateGraph?.nodeFlow as Float32Array)).toEqual(
      [0.3, 0.5, 0.2].map((v) => Math.fround(v)),
    );
    // Infomap names states by their physical node; the file's names stay.
    expect(out.names).toEqual(["a-in", "a-out", "b"]);
    expect(out.physicalNames).toEqual(["a", "b"]);
  });

  it("does not mutate the input", () => {
    expect(raw.kind).toBe("raw");
    expect(raw.modules).toBeUndefined();
  });
});
