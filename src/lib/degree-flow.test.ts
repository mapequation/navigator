import { describe, expect, it } from "vitest";
import { degreeExitFlow, degreeFlow } from "./degree-flow";

describe("degreeFlow", () => {
  it("is each node's weighted degree over the total, a self-link counted once", () => {
    // 0–1 (2), 1–2 (1), self-link 2–2 (1): degrees 2, 3, 2 of 2·4 − 1 = 7.
    const flow = degreeFlow(3, [0, 1, 2], [1, 2, 2], [2, 1, 1]);
    expect(Array.from(flow)).toEqual(
      [2 / 7, 3 / 7, 2 / 7].map((f) => Math.fround(f)),
    );
  });

  it("counts links as weight 1 without weights, and is zero without links", () => {
    expect(Array.from(degreeFlow(3, [0], [1]))).toEqual([0.5, 0.5, 0]);
    expect(Array.from(degreeFlow(2, [], []))).toEqual([0, 0]);
  });
});

describe("degreeExitFlow", () => {
  const close = (a: Float32Array, b: number[]) =>
    expect(Array.from(a)).toEqual(b.map((v) => expect.closeTo(v, 6)));

  it("is the degree flow leaving each node; a self-link stays", () => {
    // 0–1 (2), 1–2 (1), self-link 2–2 (1): D = 7, w/D out of each end.
    close(degreeExitFlow(3, [0, 1, 2], [1, 2, 2], [2, 1, 1]), [
      2 / 7,
      3 / 7,
      1 / 7,
    ]);
  });

  it("is the flow leaving each group; a link inside one stays", () => {
    // Nodes 0 and 1 in group 0, node 2 in group 1.
    close(degreeExitFlow(2, [0, 1, 2], [1, 2, 2], [2, 1, 1], [0, 0, 1]), [
      1 / 7,
      1 / 7,
    ]);
  });
});
