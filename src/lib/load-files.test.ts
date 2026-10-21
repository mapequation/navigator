import { describe, expect, it, vi } from "vitest";
import { loadFiles, networkToLoaded } from "./load-files";
import { type RunInfomapOptions, runInfomap } from "./run-infomap";
import type { InfomapTree, InfomapTreeNode } from "./types";

vi.mock("./run-infomap", () => ({ runInfomap: vi.fn() }));

const PAJEK = `*Vertices 3
1 "n1"
2 "n2"
3 "n3"
*Edges
1 2 1
2 3 2
`;

/** 1-based vertex ids with 0-based numeric names, as SNAP conversions write. */
const PAJEK_NUMERIC = `*Vertices 3
1 "0"
2 "1"
3 "2"
*Arcs
1 2 1
2 3 1
`;

/** SNAP-style edge list: sparse, 0-based integer node ids. */
const EDGES = `# FromNodeId ToNodeId
5 0
0 7
`;

const NAMED_EDGES = "a b\nb c\n";

/** Infomap `-o json` output (header values hand-picked). */
const infomapTree = (nodes: InfomapTreeNode[]): InfomapTree => ({
  version: "v2.14.0",
  args: "",
  startedAt: "",
  completedIn: 0,
  codelength: 1.5,
  numLevels: 2,
  numTopModules: 2,
  relativeCodelengthSavings: 0,
  directed: false,
  flowModel: "undirected",
  higherOrder: false,
  nodes,
  modules: [],
});

const FTREE = `# path flow name node_id
1:1 0.6 "n1" 1
1:2 0.4 "n2" 2
*Links undirected
*Links 1 0 0 1 2
1 2 1.0
`;

describe("networkToLoaded", () => {
  it("parses Pajek into a raw LoadedNetwork", () => {
    const net = networkToLoaded(PAJEK, "toy.net");
    expect(net.kind).toBe("raw");
    expect(net.isStates).toBe(false);
    expect(net.graph.nodeCount).toBe(3);
    expect(net.names).toEqual(["n1", "n2", "n3"]);
    expect(net.physicalIds).toEqual([1, 2, 3]);
    expect(net.networkText).toBe(PAJEK);
  });

  it("keeps Pajek vertex numbers as ids when the labels are numbers", () => {
    const net = networkToLoaded(PAJEK_NUMERIC, "snap.net");
    expect(net.physicalIds).toEqual([1, 2, 3]);
    expect(net.names).toEqual(["0", "1", "2"]);
    expect(net.directed).toBe(true);
  });

  it("names unlabelled Pajek vertices by their number", () => {
    const net = networkToLoaded("*Vertices 3\n*Edges\n1 3\n", "bare.net");
    expect(net.physicalIds).toEqual([1, 2, 3]);
    expect(net.names).toEqual(["1", "2", "3"]);
  });

  it("keeps vertex ids for Pajek found by its headings, with no .net extension", () => {
    const net = networkToLoaded(PAJEK_NUMERIC, "snap.paj");
    expect(net.physicalIds).toEqual([1, 2, 3]);
    expect(net.names).toEqual(["0", "1", "2"]);
  });

  it("uses edge-list node tokens as the ids and the names", () => {
    const net = networkToLoaded(EDGES, "snap.txt");
    expect(net.graph.nodeCount).toBe(3);
    expect(net.physicalIds).toEqual([5, 0, 7]);
    expect(net.names).toEqual(["5", "0", "7"]);
  });

  it("gives an edge list with non-integer tokens names but no ids", () => {
    const net = networkToLoaded(NAMED_EDGES, "named.txt");
    expect(net.names).toEqual(["a", "b", "c"]);
    expect(net.physicalIds).toBeUndefined();
  });

  it("detects state networks", () => {
    const states = '*Vertices 1\n1 "a"\n*States\n1 1\n2 1\n*Links\n1 2 1\n';
    const net = networkToLoaded(states, "toy_states.net");
    expect(net.isStates).toBe(true);
    expect(net.stateGraph?.stateCount).toBe(2);
    expect(net.stateIds).toEqual([1, 2]);
  });
});

describe("loadFiles", () => {
  it("loads a single ftree", async () => {
    const net = await loadFiles([{ name: "a.ftree", text: FTREE }], {
      directed: false,
      twoLevel: false,
      noInfomap: false,
    });
    expect(net.kind).toBe("clustered");
    expect(net.graph.nodeCount).toBe(2);
  });

  it("loads a single network file raw", async () => {
    const net = await loadFiles([{ name: "toy.net", text: PAJEK }], {
      directed: false,
      twoLevel: false,
      noInfomap: false,
    });
    expect(net.kind).toBe("raw");
    expect(net.sources).toEqual([
      { name: "toy.net", size: PAJEK.length, text: PAJEK, kind: "network" },
    ]);
  });

  it("skips metadata files, which need a network", async () => {
    const opts = { directed: false, twoLevel: false, noInfomap: false };
    const net = await loadFiles(
      [
        { name: "toy.net", text: PAJEK },
        { name: "set.csv", text: "n1\n" },
      ],
      opts,
    );
    expect(net.sources.map((f) => f.name)).toEqual(["toy.net"]);
    await expect(
      loadFiles([{ name: "set.csv", text: "n1\n" }], opts),
    ).rejects.toThrow("Metadata files need a network or .ftree file");
  });

  it("goes by the staged kind: a restaged .txt metadata file is not a network", async () => {
    const net = await loadFiles(
      [
        { name: "toy.net", text: PAJEK, kind: "network" },
        { name: "names.txt", text: "n1\n", kind: "metadata" },
      ],
      { directed: true, twoLevel: false, noInfomap: false },
    );
    expect(net.sources.map((f) => f.name)).toEqual(["toy.net"]);
  });

  it("runs Infomap on a network + partition and clusters from its JSON tree", async () => {
    const tree: InfomapTree = {
      version: "v2.14.0",
      args: "",
      startedAt: "",
      completedIn: 0,
      codelength: 1.5,
      numLevels: 2,
      numTopModules: 2,
      relativeCodelengthSavings: 0,
      directed: false,
      flowModel: "undirected",
      higherOrder: false,
      nodes: [
        { path: [1, 1], flow: 0.4, id: 1 },
        { path: [1, 2], flow: 0.3, id: 2 },
        { path: [2, 1], flow: 0.3, id: 3 },
      ],
      modules: [],
    };
    vi.mocked(runInfomap).mockResolvedValueOnce({ tree });
    const commands: string[] = [];
    const net = await loadFiles(
      [
        { name: "toy.net", text: PAJEK },
        { name: "p.clu", text: "1 1\n2 1\n3 2\n" },
      ],
      { directed: false, twoLevel: false, noInfomap: true },
      { onInfomapStart: (c) => commands.push(c) },
    );
    const opts = vi.mocked(runInfomap).mock.calls[0][0] as RunInfomapOptions;
    expect(opts.args.output).toEqual(["json", "flow"]);
    expect(opts.files).toEqual({ "p.clu": "1 1\n2 1\n3 2\n" });
    expect(commands).toEqual([
      "infomap --cluster-data p.clu --no-infomap --output json,flow",
    ]);
    expect(net.kind).toBe("clustered");
    expect(net.infomap?.codelength).toBe(1.5);
    expect(net.sources).toEqual([
      { name: "toy.net", size: PAJEK.length, text: PAJEK, kind: "network" },
      { name: "p.clu", size: 12, text: "1 1\n2 1\n3 2\n", kind: "clu" },
    ]);
    expect(net.loadOptions).toEqual({
      directed: false,
      twoLevel: false,
      noInfomap: true,
    });
  });

  it("rejects a partition without a network", async () => {
    await expect(
      loadFiles([{ name: "p.clu", text: "1 1\n" }], {
        directed: false,
        twoLevel: false,
        noInfomap: false,
      }),
    ).rejects.toThrow(/network/i);
  });

  it("rejects unsupported extensions", async () => {
    await expect(
      loadFiles([{ name: "a.pdf", text: "" }], {
        directed: false,
        twoLevel: false,
        noInfomap: false,
      }),
    ).rejects.toThrow(/unsupported/i);
  });
});

describe("loadFiles: a partition applies by Infomap's node ids", () => {
  const opts = { directed: false, twoLevel: false, noInfomap: true };

  it.each([
    {
      format: "Pajek with names",
      network: { name: "toy.net", text: PAJEK },
      partition: { name: "p.tree", text: "" },
      // Infomap lists nodes in tree order, keyed by vertex number.
      nodes: [
        { path: [1, 1], flow: 0.4, name: "n3", id: 3 },
        { path: [1, 2], flow: 0.3, name: "n1", id: 1 },
        { path: [2, 1], flow: 0.3, name: "n2", id: 2 },
      ],
      paths: [
        [1, 2],
        [2, 1],
        [1, 1],
      ],
      names: ["n1", "n2", "n3"],
    },
    {
      format: "Pajek with numeric names",
      network: { name: "snap.net", text: PAJEK_NUMERIC },
      partition: { name: "snap.tree", text: "" },
      nodes: [
        { path: [1, 1], flow: 0.4, name: "2", id: 3 },
        { path: [1, 2], flow: 0.3, name: "0", id: 1 },
        { path: [2, 1], flow: 0.3, name: "1", id: 2 },
      ],
      paths: [
        [1, 2],
        [2, 1],
        [1, 1],
      ],
      names: ["0", "1", "2"],
    },
    {
      format: "edge list",
      network: { name: "snap.txt", text: EDGES },
      partition: { name: "snap.clu", text: "" },
      // Infomap names edge-list nodes by their id.
      nodes: [
        { path: [1, 1], flow: 0.4, name: "7", id: 7 },
        { path: [1, 2], flow: 0.3, name: "0", id: 0 },
        { path: [2, 1], flow: 0.3, name: "5", id: 5 },
      ],
      paths: [
        [2, 1],
        [1, 2],
        [1, 1],
      ],
      names: ["5", "0", "7"],
    },
  ])("$format", async ({ network, partition, nodes, paths, names }) => {
    vi.mocked(runInfomap).mockResolvedValueOnce({ tree: infomapTree(nodes) });
    const net = await loadFiles([network, partition], opts);
    expect(net.kind).toBe("clustered");
    expect(net.modules?.map((m) => m.path)).toEqual(paths);
    expect(net.names).toEqual(names);
  });

  it("an edge list with non-integer tokens cannot take a partition", async () => {
    vi.mocked(runInfomap).mockResolvedValueOnce({
      tree: infomapTree([{ path: [1, 1], flow: 1, name: "a", id: 1 }]),
    });
    await expect(
      loadFiles(
        [
          { name: "named.txt", text: NAMED_EDGES },
          { name: "p.clu", text: "" },
        ],
        opts,
      ),
    ).rejects.toThrow("named.txt has no integer node ids");
  });

  it("an edge list whose distinct tokens Infomap reads as one id says so", async () => {
    // The parse keeps "01" and "1" apart; Infomap reads both as node 1
    // (Infomap CLI 2.9.2 outputs nodes 1, 2, 3 for this file).
    vi.mocked(runInfomap).mockResolvedValueOnce({
      tree: infomapTree([
        { path: [1, 1], flow: 0.5, name: "1", id: 1 },
        { path: [1, 2], flow: 0.25, name: "2", id: 2 },
        { path: [1, 3], flow: 0.25, name: "3", id: 3 },
      ]),
    });
    await expect(
      loadFiles(
        [
          { name: "lead.txt", text: "01 2\n1 3\n" },
          { name: "p.clu", text: "" },
        ],
        opts,
      ),
    ).rejects.toThrow(
      'lead.txt: nodes "01" and "1" are two nodes here but one to Infomap (id 1)',
    );
  });
});
