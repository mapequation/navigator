import { describe, expect, it } from "vitest";
import {
  COLUMN_PALETTE,
  columnColor,
  columnColorOf,
  defaultScale,
  MISSING_COLOR,
  numberCategories,
  quantile,
  rampDomain,
  scaleOf,
} from "./column-colors";
import type { NodeColumn } from "./tables";

const numbers = (...values: number[]): NodeColumn => ({
  name: "n",
  type: "number",
  values: Float64Array.from(values),
});

describe("columnColor", () => {
  it("colours text values in turn, most frequent first, missing grey", () => {
    const categories = ["a", "b", "c", "d", "e", "f"];
    const { fill, legend } = columnColor({
      name: "kind",
      type: "category",
      codes: Int32Array.from([0, 1, -1, 5]),
      categories,
      counts: [3, 2, 1, 1, 1, 1],
    });
    expect(fill(0)).toBe(COLUMN_PALETTE[0]);
    expect(fill(1)).toBe(COLUMN_PALETTE[1]);
    expect(fill(2)).toBe(MISSING_COLOR);
    // The palette repeats past five values, as cosmograph's does.
    expect(fill(3)).toBe(COLUMN_PALETTE[0]);
    expect(legend.type === "category" && legend.missing).toBe(1);
  });

  it("ramps numbers over the 5th to 95th percentile, clamped", () => {
    const values = Float64Array.from([
      ...Array.from({ length: 101 }, (_, i) => i),
      Number.NaN,
    ]);
    const { fill, legend } = columnColor({
      name: "x",
      type: "number",
      values,
    });
    if (legend.type !== "number") throw new Error("legend");
    expect(legend.domain).toEqual([5, 95]);
    expect(legend.extent).toEqual([0, 100]);
    expect(legend.missing).toBe(1);
    expect(fill(0)).toBe(fill(5));
    expect(fill(100)).toBe(fill(95));
    expect(fill(0)).not.toBe(fill(50));
    expect(fill(101)).toBe(MISSING_COLOR);
    // The ramp starts and ends at the palette's ends.
    expect(legend.stops[0]).toBe("rgb(43, 85, 168)");
    expect(legend.stops.at(-1)).toBe("rgb(254, 224, 139)");
  });
});

describe("rampDomain", () => {
  it("uses the extent when the percentiles meet, and is never empty", () => {
    expect(
      rampDomain([
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 9,
      ]),
    ).toEqual([1, 9]);
    expect(rampDomain([2, 2])).toEqual([2, 2 + 1e-6]);
    expect(quantile([0, 10], 0.5)).toBe(5);
  });
});

describe("number columns as categories", () => {
  it("starts integer columns as categories, fractional ones as a scale", () => {
    expect(defaultScale(numbers(1, 2, Number.NaN, 2))).toBe("categories");
    expect(defaultScale(numbers(1, 2.5))).toBe("scale");
    const text: NodeColumn = {
      name: "t",
      type: "category",
      codes: Int32Array.from([0]),
      categories: ["a"],
      counts: [1],
    };
    // A chosen scale applies where the column allows it.
    expect(scaleOf(numbers(1.5), "categories")).toBe("categories");
    expect(scaleOf(numbers(1, 2), "scale")).toBe("scale");
    expect(scaleOf(text, "scale")).toBe("categories");
    expect(scaleOf(numbers(1.5), null)).toBe("scale");
  });

  it("codes each value, most frequent first, ties ascending", () => {
    const column = numbers(3, 1, 2, 3, Number.NaN, 2, 10);
    const c = numberCategories(
      column as Extract<NodeColumn, { type: "number" }>,
    );
    expect(c.categories).toEqual(["2", "3", "1", "10"]);
    expect(c.counts).toEqual([2, 2, 1, 1]);
    expect(Array.from(c.codes)).toEqual([1, 2, 0, 1, -1, 0, 3]);
    const { fill, legend } = columnColorOf(column, "categories");
    expect(fill(2)).toBe(COLUMN_PALETTE[0]);
    expect(fill(4)).toBe(MISSING_COLOR);
    expect(legend.type).toBe("category");
    expect(columnColorOf(column, "scale").legend.type).toBe("number");
  });
});
