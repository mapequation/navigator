import { describe, expect, it } from "vitest";
import { fitTransform } from "./fit-transform";

describe("fitTransform", () => {
  //  4 points on a 10×10 world square centered at (5,5)
  const positions = new Float32Array([0, 0, 10, 0, 0, 10, 10, 10]);

  it("fits all nodes into the viewport with padding", () => {
    const t = fitTransform(positions, null, 100, 100);
    expect(t).not.toBeNull();
    expect(t?.k).toBeCloseTo(9); // 0.9 * min(100/10, 100/10)
    expect(t?.x).toBeCloseTo(50 - 5 * 9);
    expect(t?.y).toBeCloseTo(50 - 5 * 9);
  });

  it("fits a subset", () => {
    const t = fitTransform(positions, [0, 1], 100, 50); // y-extent 0 → uses x-extent
    expect(t).not.toBeNull();
    expect(t?.k).toBeCloseTo(0.9 * (100 / 10));
  });

  it("clamps the scale to the zoom extent", () => {
    // A single node has no extent: unclamped it zooms to ~1e11.
    const one = fitTransform(positions, [3], 100, 100, 0.9, [0.002, 200]);
    expect(one?.k).toBe(200);
    expect(one?.x).toBeCloseTo(50 - 10 * 200);
    const all = fitTransform(positions, null, 100, 100, 0.9, [0.002, 2]);
    expect(all?.k).toBe(2);
  });

  it("returns null for empty input", () => {
    expect(fitTransform(new Float32Array(0), null, 100, 100)).toBeNull();
    expect(fitTransform(positions, [], 100, 100)).toBeNull();
  });
});
