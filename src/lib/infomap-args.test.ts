import { describe, expect, it } from "vitest";
import { buildInfomapArgs, infomapArgString } from "./infomap-args";

describe("buildInfomapArgs", () => {
  it("always requests JSON and flow output, not silenced", () => {
    expect(
      buildInfomapArgs({ directed: false, twoLevel: false, noInfomap: false }),
    ).toEqual({
      output: ["json", "flow"],
    });
  });

  it("maps the options", () => {
    expect(
      buildInfomapArgs({
        directed: true,
        twoLevel: true,
        noInfomap: true,
        clusterFilename: "p.clu",
      }),
    ).toEqual({
      output: ["json", "flow"],
      directed: true,
      twoLevel: true,
      noInfomap: true,
      clusterData: "p.clu",
    });
  });
});

describe("infomapArgString", () => {
  it("appends free-text flags to the structured args", () => {
    expect(
      infomapArgString(
        buildInfomapArgs({
          directed: false,
          twoLevel: true,
          noInfomap: false,
          regularized: true,
        }),
        "  -N 5   --seed 7 ",
      ),
    ).toBe("--output json,flow --two-level --regularized -N 5 --seed 7");
  });
});
