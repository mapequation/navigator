import { buildStateGraph, lumpStateGraph } from "@mapequation/d3gl/network";
import { describe, expect, it } from "vitest";
import { lumpStates, physicalModule, statesOf, viewIds } from "./state-ids";

// Five state nodes over three physical nodes: 0 → {0, 1}, 1 → {2}, 2 → {3, 4}.
const sg = buildStateGraph({
  stateCount: 5,
  stateToPhysical: [0, 0, 1, 2, 2],
  source: [0, 1, 2, 3],
  target: [2, 3, 4, 0],
});

describe("viewIds", () => {
  it("keeps state ids in the state and both views", () => {
    expect(viewIds([1, 3], "state", sg.stateToPhysical)).toEqual([1, 3]);
    expect(viewIds([1, 3], "both", sg.stateToPhysical)).toEqual([1, 3]);
  });

  it("maps state ids to their distinct physical nodes in the physical view", () => {
    expect(viewIds([0, 1, 4], "physical", sg.stateToPhysical)).toEqual([0, 2]);
    expect(viewIds([], "physical", sg.stateToPhysical)).toEqual([]);
  });
});

describe("statesOf", () => {
  it("lists a physical node's state nodes", () => {
    expect(statesOf(sg.physicalToState, 0)).toEqual([0, 1]);
    expect(statesOf(sg.physicalToState, 1)).toEqual([2]);
    expect(statesOf(sg.physicalToState, 2).sort()).toEqual([3, 4]);
  });

  it("round-trips through viewIds", () => {
    const states = statesOf(sg.physicalToState, 2);
    expect(viewIds(states, "physical", sg.stateToPhysical)).toEqual([2]);
  });
});

describe("physicalModule", () => {
  const modules = [
    { id: 0, path: [2, 1] },
    { id: 1, path: [1, 3, 1] },
    { id: 2, path: [3, 1] },
    { id: 3, path: [2, 2] },
    { id: 4, path: [2, 1, 1] },
  ];

  it("is the top module with most of the physical node's flow", () => {
    // alpha: state 0 in module 2, state 1 in module 1.
    const flow = [0.1, 0.05, 0.2, 0.3, 0.3];
    expect(physicalModule(sg.physicalToState, 0, modules, flow)).toEqual([2]);
    expect(physicalModule(sg.physicalToState, 2, modules, flow)).toEqual([2]);
  });

  it("is by count without flow; a tie goes to the lower module", () => {
    expect(physicalModule(sg.physicalToState, 0, modules)).toEqual([1]);
    expect(
      physicalModule(sg.physicalToState, 0, modules, [0, 0, 0, 0, 0]),
    ).toEqual([1]);
    expect(physicalModule(sg.physicalToState, 1, modules)).toEqual([3]);
    expect(physicalModule(sg.physicalToState, 2, modules)).toEqual([2]);
  });

  it("is none without module records", () => {
    expect(physicalModule(sg.physicalToState, 0, [])).toEqual([]);
  });
});

describe("lumped ids (d3gl#529)", () => {
  // States 0 and 1 share physical 0 and leaf module [1]; 3 and 4 share
  // physical 2 but sit in leaf modules [1] and [2]. Lumps: {0, 1}, {2}, {3}, {4}.
  const lumped = lumpStateGraph(sg, [
    { id: 0, path: [1, 1] },
    { id: 1, path: [1, 2] },
    { id: 2, path: [2, 1] },
    { id: 3, path: [1, 3] },
    { id: 4, path: [2, 2] },
  ]);

  it("maps state ids to their distinct lumps in the state and both views", () => {
    const to = lumped.stateToLump;
    expect(viewIds([0, 1, 4], "state", sg.stateToPhysical, to)).toEqual([0, 3]);
    expect(viewIds([0, 1, 4], "both", sg.stateToPhysical, to)).toEqual([0, 3]);
    expect(viewIds([0, 1, 4], "physical", sg.stateToPhysical, to)).toEqual([
      0, 2,
    ]);
  });

  it("maps lumps back to their state nodes", () => {
    expect(lumpStates(lumped, [0, 3])).toEqual([0, 1, 4]);
  });
});
