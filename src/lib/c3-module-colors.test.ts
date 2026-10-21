import { describe, expect, it } from "vitest";
import { c3ModuleColor } from "./c3-module-colors";

describe("c3ModuleColor", () => {
  const modules = [
    { id: 0, path: [1, 1, 1] },
    { id: 1, path: [1, 1, 2] },
    { id: 2, path: [1, 2, 1] },
    { id: 3, path: [2, 1] },
  ];

  it("colours every module of the hierarchy, each its own", () => {
    const color = c3ModuleColor(modules, [0.4, 0.2, 0.3, 0.1]);
    const paths = [[1], [2], [1, 1], [1, 2]];
    const colors = paths.map((p) => color(p));
    for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(colors).size).toBe(paths.length);
  });

  it("knows no module outside the hierarchy", () => {
    const color = c3ModuleColor(modules, undefined);
    expect(color([3])).toBeUndefined();
  });

  it("sizes modules by summed flow, or by member count without flow", () => {
    // Submodule 1:1 holds two nodes, 1:2 one: by count 1:1 is the larger, by
    // flow (0.02 against 0.5) the smaller, so their colours split differently.
    const byCount = c3ModuleColor(modules, undefined);
    const byFlow = c3ModuleColor(modules, [0.01, 0.01, 0.5, 0.48]);
    expect(byFlow([1, 1])).not.toBe(byCount([1, 1]));
  });
});
