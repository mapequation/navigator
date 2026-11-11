import { describe, expect, it } from "vitest";
import { withClustering } from "./apply-ftree";
import { networkToLoaded } from "./load-files";
import type { InfomapTree } from "./types";

/**
 * Two triangles, a b c and d e f, joined by c - d in layer 1, and a - b and
 * e - f in layer 2: Infomap 2.15.1's output for it (`-2 -o json,flow`), whose
 * flow file keys its state nodes by the state ids Infomap gave them.
 */
const NET =
  '*Vertices 6\n1 "a"\n2 "b"\n3 "c"\n4 "d"\n5 "e"\n6 "f"\n*Intra\n1 1 2 1\n1 2 3 1\n1 3 1 1\n1 4 5 1\n1 5 6 1\n1 6 4 1\n1 3 4 1\n2 1 2 1\n2 5 6 1\n';

const TREE = {
  version: "v2.15.1",
  args: "toy.net out -o json,flow -s 3 -2",
  startedAt: "",
  completedIn: 0,
  codelength: 2.1368439001218995,
  numLevels: 2,
  numTopModules: 2,
  numModules: [2, 0],
  relativeCodelengthSavings: 0.1719110598840845,
  directed: true,
  flowModel: "directed",
  higherOrder: true,
  nodes: [
    { path: [1, 1], flow: 0.148213, stateId: 2, layerId: 1, id: 3, name: "c" },
    { path: [1, 2], flow: 0.0976034, stateId: 0, layerId: 1, id: 1, name: "a" },
    { path: [1, 3], flow: 0.0976034, stateId: 1, layerId: 1, id: 2, name: "b" },
    { path: [1, 4], flow: 0.07829, stateId: 3, layerId: 2, id: 2, name: "b" },
    { path: [1, 5], flow: 0.07829, stateId: 4, layerId: 2, id: 1, name: "a" },
    { path: [2, 1], flow: 0.148213, stateId: 5, layerId: 1, id: 4, name: "d" },
    { path: [2, 2], flow: 0.0976034, stateId: 6, layerId: 1, id: 5, name: "e" },
    { path: [2, 3], flow: 0.0976034, stateId: 7, layerId: 1, id: 6, name: "f" },
    { path: [2, 4], flow: 0.07829, stateId: 8, layerId: 2, id: 6, name: "f" },
    { path: [2, 5], flow: 0.07829, stateId: 9, layerId: 2, id: 5, name: "e" },
  ],
  modules: [
    { path: [0], enterFlow: 0.0, exitFlow: 0.0 },
    { path: [1], enterFlow: 0.0469937, exitFlow: 0.0469937 },
    { path: [2], enterFlow: 0.0469937, exitFlow: 0.0469937 },
  ],
} as unknown as InfomapTree;

const FLOW =
  '*Vertices\n0 "0" 0.0976034\n1 "1" 0.0976034\n2 "2" 0.148213\n3 "3" 0.07829\n4 "4" 0.07829\n5 "5" 0.148213\n6 "6" 0.0976034\n7 "7" 0.0976034\n8 "8" 0.07829\n9 "9" 0.07829\n*Arcs\n0 1 0.0465324\n0 2 0.0465324\n0 3 0.00489815\n1 0 0.0465324\n1 2 0.0465324\n1 4 0.00489815\n2 0 0.0469937\n2 1 0.0469937\n2 5 0.0469937\n3 0 0.00407732\n3 2 0.00407732\n3 4 0.0733918\n4 1 0.00407732\n4 2 0.00407732\n4 3 0.0733918\n5 2 0.0469937\n5 6 0.0469937\n5 7 0.0469937\n6 5 0.0465324\n6 7 0.0465324\n6 8 0.00489815\n7 5 0.0465324\n7 6 0.0465324\n7 9 0.00489815\n8 5 0.00407732\n8 6 0.00407732\n8 9 0.0733918\n9 5 0.00407732\n9 7 0.00407732\n9 8 0.0733918\n';

describe("a multilayer network clustered by Infomap", () => {
  const net = networkToLoaded(NET, "toy.net");
  const out = withClustering(net, TREE, FLOW);

  it("puts each state node in its module, matched by layer and node", () => {
    // a b c d e f in layer 1, then a b e f in layer 2, as the links name them.
    expect(net.layerIds).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 2, 2]);
    expect(out.modules?.map((m) => m.path[0])).toEqual([
      1, 1, 1, 2, 2, 2, 1, 1, 2, 2,
    ]);
  });

  it("reads every flow link by the run's state ids: the flow leaves by c - d only", () => {
    expect(out.partialNodeFlow).toBeUndefined();
    const exit = Array.from(out.boundaryFlow ?? []);
    // c and d, in layer 1, carry each module's exit flow.
    expect(exit[2]).toBeCloseTo(0.0469937, 6);
    expect(exit[3]).toBeCloseTo(0.0469937, 6);
    expect(exit.filter((_, i) => i !== 2 && i !== 3)).toEqual(Array(8).fill(0));
    // A physical node's border is its flow to other physical nodes, whatever
    // their modules: all three of c's links, from its one state node.
    const physical = Array.from(out.physicalBoundaryFlow ?? []);
    expect(physical[2]).toBeCloseTo(3 * 0.0469937, 6);
  });
});
