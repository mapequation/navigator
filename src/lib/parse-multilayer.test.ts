import { describe, expect, it } from "vitest";
import { fileIds } from "./apply-ftree";
import { isMultilayerText, isStatesText } from "./file-kinds";
import { networkToLoaded } from "./load-files";
import { parseMultilayer } from "./parse-multilayer";

const LAYERS = `# two layers
*Vertices 4
1 "a"
2 "b"
3 "c"
4 "lonely"
*Intra
# layer node node weight
1 1 2 2.5
1 2 3
2 1 3 1
`;

describe("parseMultilayer", () => {
  it("makes a state node of each physical node in each layer it has links in", () => {
    const p = parseMultilayer(LAYERS, "l.net");
    // a, b, c in layer 1; a, c in layer 2; "lonely" has no link, so no state node.
    expect(p.layerIds).toEqual([1, 1, 1, 2, 2]);
    expect(p.physicalIds).toEqual([1, 2, 3, 1, 3]);
    expect(p.names).toEqual(["a", "b", "c", "a", "c"]);
    expect(p.physicalNames).toEqual(["a", "b", "c"]);
    expect(p.stateGraph.stateToPhysical).toEqual([0, 1, 2, 0, 2]);
    expect(p.stateGraph.physicalCount).toBe(3);
    // The file's links only: none between layers.
    expect(p.stateGraph.source).toEqual([0, 1, 3]);
    expect(p.stateGraph.target).toEqual([1, 2, 4]);
    expect(p.stateGraph.weight).toEqual([2.5, 1, 1]);
    expect(p.stateGraph.directed).toBe(false);
  });

  it("reads *Inter as a link between a node's layers, and *Multilayer as any link", () => {
    const p = parseMultilayer(
      "*Intra\n1 1 2\n*Inter\n1 1 2 0.5\n*Multilayer\n2 1 1 2 3\n",
      "l.net",
    );
    // a@1, b@1, then *Inter a@1 -> a@2, then *Multilayer a@2 -> b@1.
    expect(p.layerIds).toEqual([1, 1, 2]);
    expect(p.physicalIds).toEqual([1, 2, 1]);
    expect(p.stateGraph.source).toEqual([0, 0, 2]);
    expect(p.stateGraph.target).toEqual([1, 2, 1]);
    expect(p.stateGraph.weight).toEqual([1, 0.5, 3]);
  });

  it("names the line it can't read, and a file without links", () => {
    expect(() => parseMultilayer("*Intra\n1 1 2\n1 x 2\n", "l.net")).toThrow(
      "l.net, line 3: a *Intra line is layer node node weight",
    );
    expect(() => parseMultilayer("*Intra\n1 1 2 heavy\n", "l.net")).toThrow(
      "line 2",
    );
    expect(() =>
      parseMultilayer('*Vertices 1\n1 "a"\n*Intra\n', "l.net"),
    ).toThrow("no links");
  });
});

describe("a multilayer file", () => {
  it("is told apart from a state network", () => {
    expect(isMultilayerText(LAYERS)).toBe(true);
    expect(isStatesText(LAYERS)).toBe(false);
    expect(isMultilayerText("*Vertices 1\n*States\n1 1\n")).toBe(false);
  });

  it("loads as a state network known by layer, undirected unless forced", () => {
    const net = networkToLoaded(LAYERS, "l.net");
    expect(net.isStates).toBe(true);
    expect(net.directed).toBe(false);
    expect(net.layerIds).toEqual([1, 1, 1, 2, 2]);
    expect(net.stateIds).toBeUndefined();
    expect(net.graph.nodeCount).toBe(5);
    expect(net.networkText).toBe(LAYERS);
    expect(networkToLoaded(LAYERS, "l.net", true).directed).toBe(true);
    // Infomap numbers the state nodes: there are no file ids to match by.
    expect(() => fileIds(net)).toThrow("matched by layer");
  });
});
