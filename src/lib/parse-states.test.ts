import { describe, expect, it } from "vitest";
import { parseStates } from "./parse-states";

const STATES = `# a state network
*Vertices 3
1 "alpha"
2 "beta"
3 "gamma"
*States
# state_id physical_id name
10 1 "alpha-in"
11 1 "alpha-out"
12 2
13 3 "gamma-x"
*Links
10 11 2
11 12 1
12 13 0.5
`;

describe("parseStates", () => {
  const parsed = parseStates(STATES, "test_states.net");

  it("indexes state nodes densely and maps to dense physical ids", () => {
    expect(parsed.stateGraph.stateCount).toBe(4);
    expect(parsed.stateGraph.physicalCount).toBe(3);
    expect(Array.from(parsed.stateGraph.stateToPhysical as number[])).toEqual([
      0, 0, 1, 2,
    ]);
    expect(parsed.stateIds).toEqual([10, 11, 12, 13]);
    expect(parsed.physicalIds).toEqual([1, 1, 2, 3]);
  });

  it("names states, falling back to the physical name", () => {
    expect(parsed.names).toEqual(["alpha-in", "alpha-out", "beta", "gamma-x"]);
  });

  it("names the physical nodes by their dense index", () => {
    expect(parsed.physicalNames).toEqual(["alpha", "beta", "gamma"]);
  });

  it("builds the flat state-level graph from links", () => {
    expect(parsed.graph.nodeCount).toBe(4);
    expect(Array.from(parsed.graph.source as number[])).toEqual([0, 1, 2]);
    expect(Array.from(parsed.graph.target as number[])).toEqual([1, 2, 3]);
    expect(Array.from(parsed.graph.weight as number[])).toEqual([2, 1, 0.5]);
  });

  it("throws on links referencing unknown states", () => {
    expect(() =>
      parseStates("*States\n1 1\n*Links\n1 99 1", "bad.net"),
    ).toThrow(/unknown state/i);
  });
});
