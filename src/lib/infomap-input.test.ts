import { describe, expect, it } from "vitest";
import { withClustering } from "./apply-ftree";
import { fileInput, infomapInput, weightText } from "./infomap-input";
import { networkToLoaded } from "./load-files";

describe("infomapInput", () => {
  it("writes an edge list with names as Pajek, node i as vertex i + 1", () => {
    const net = networkToLoaded(
      "alice bob\nbob carol 0.1\ncarol alice 2\n",
      "names.txt",
    );
    expect(infomapInput(net)).toEqual({
      network:
        '*Vertices 3\n1 "alice"\n2 "bob"\n3 "carol"\n*Links\n1 2 1\n2 3 0.1\n3 1 2\n',
      filename: "names.net",
      ids: [1, 2, 3],
    });
  });

  it("keeps 01 and 1 two vertices, as they are two nodes here", () => {
    const net = networkToLoaded("01 2\n1 3\n", "lead.txt");
    expect(infomapInput(net).network).toBe(
      '*Vertices 4\n1 "01"\n2 "2"\n3 "1"\n4 "3"\n*Links\n1 2 1\n3 4 1\n',
    );
  });

  it("numbers an edge list of plain integer ids the same way", () => {
    const net = networkToLoaded("7 3\n3 9\n", "ints.txt");
    expect(net.physicalIds).toEqual([7, 3, 9]);
    const input = infomapInput(net);
    expect(input.network).toBe(
      '*Vertices 3\n1 "7"\n2 "3"\n3 "9"\n*Links\n1 2 1\n2 3 1\n',
    );
    expect(input.ids).toEqual([1, 2, 3]);
  });

  it("matches Infomap's vertex k to node k - 1", () => {
    const net = networkToLoaded("alice bob\nbob carol\n", "names.txt");
    const tree = {
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
      modules: [],
      nodes: [
        { path: [2, 1], flow: 0.3, id: 3 },
        { path: [1, 1], flow: 0.4, id: 1 },
        { path: [1, 2], flow: 0.3, id: 2 },
      ],
    };
    const clustered = withClustering(
      net,
      tree,
      undefined,
      infomapInput(net).ids,
    );
    expect(clustered.modules?.map((m) => m.path)).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ]);
    expect(clustered.names).toEqual(["alice", "bob", "carol"]);
  });

  it("gives Infomap a Pajek file as it is, keyed by its vertex ids", () => {
    const text = '*Vertices 2\n4 "a"\n9 "b"\n*Arcs\n4 9 1\n';
    const net = networkToLoaded(text, "toy.net");
    expect(infomapInput(net)).toEqual({
      network: text,
      filename: "toy.net",
      ids: [4, 9],
    });
  });

  it("gives a run with a partition the file, which an edge list with names can't match", () => {
    const ints = networkToLoaded("7 3\n3 9\n", "ints.txt");
    expect(fileInput(ints)).toEqual({
      network: "7 3\n3 9\n",
      filename: "ints.txt",
      ids: [7, 3, 9],
    });
    const named = networkToLoaded("alice bob\n", "names.txt");
    expect(() => fileInput(named)).toThrow(
      "names.txt: Infomap's output can't be matched to its nodes",
    );
  });
});

describe("weightText", () => {
  it("writes the file's number when a 32-bit float holds it", () => {
    for (const [w, text] of [
      [1, "1"],
      [0, "0"],
      [0.1, "0.1"],
      [2.5, "2.5"],
      [1e-7, "1e-7"],
      [0.333333, "0.333333"],
    ] as const) {
      expect(weightText(Math.fround(w))).toBe(text);
    }
  });

  it("writes the float d3gl holds when the file's number has more digits", () => {
    expect(weightText(Math.fround(123456789))).toBe("123456792");
    expect(Math.fround(Number(weightText(Math.fround(0.123456789))))).toBe(
      Math.fround(0.123456789),
    );
  });

  it("keeps a weight that isn't a number NaN, for Infomap to refuse", () => {
    expect(weightText(Number.NaN)).toBe("NaN");
  });
});
