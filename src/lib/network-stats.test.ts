import { describe, expect, it } from "vitest";
import {
  byteLength,
  computeModuleStats,
  computeStats,
  formatBytes,
} from "./network-stats";

describe("computeStats", () => {
  it("reports degrees and flags unweighted networks", () => {
    const s = computeStats(4, [0, 0, 1], [1, 2, 2], [1, 1, 1]);
    expect(s).toMatchObject({
      nodes: 4,
      links: 3,
      meanDegree: 1.5,
      maxDegree: 2,
      weight: null,
    });
  });

  it("reports mean/max weight and distinct physical nodes", () => {
    const s = computeStats(3, [0, 1], [1, 2], [2, 4], {
      physicalIds: [7, 7, 8],
    });
    expect(s.weight).toEqual({ mean: 3, max: 4 });
    expect(s.physicalNodes).toBe(2);
  });
});

describe("computeModuleStats", () => {
  it("counts top modules, levels, leaf modules and codelength", () => {
    const m = computeModuleStats(
      [
        { id: 0, path: [1, 1, 1] },
        { id: 1, path: [1, 1, 2] },
        { id: 2, path: [1, 2, 1] },
        { id: 3, path: [2, 1] },
      ],
      { ftree: "# v2\n# codelength 3.14 bits\n" },
    );
    expect(m).toEqual({
      topModules: 2,
      levels: 3,
      leafModules: 3,
      codelength: 3.14,
    });
  });
});

describe("computeModuleStats codelength", () => {
  it("prefers the stored codelength of an in-app run over an ftree header", () => {
    const modules = [{ id: 0, path: [1, 1] }];
    expect(
      computeModuleStats(modules, {
        codelength: 2.5,
        ftree: "# codelength 3.14 bits\n",
      }).codelength,
    ).toBe(2.5);
    expect(computeModuleStats(modules).codelength).toBeNull();
  });
});

describe("byte helpers", () => {
  it("counts UTF-8 bytes and formats sizes", () => {
    expect(byteLength("aå€😀")).toBe(1 + 2 + 3 + 4);
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 kB");
    expect(formatBytes(30 * 1024 * 1024)).toBe("30 MB");
  });
});
