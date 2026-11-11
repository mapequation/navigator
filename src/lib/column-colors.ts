import { interpolateCubehelix, piecewise } from "d3-interpolate";
import type { NodeColumn } from "./tables";

/**
 * Node colours by a node column, as cosmograph.app colours points by a column (@cosmograph/cosmograph 2.3.2,
 * its point-color strategy and graph-utils/colors):
 * - categories: the palette's colours in turn over the values, most frequent first (the palette repeats
 *   past five values). Text is always categories; numbers can be too, as a module id is a number;
 * - scale (numbers only): a cubehelix ramp (gamma 1.5) through the palette over the 5th to 95th
 *   percentile, values outside it clamped;
 * - missing values: cosmograph's unknown colour.
 * A number column whose values are all integers starts as categories, any other as a scale.
 * cosmograph draws on a dark background, with its palette at 85% opacity; here the colours are opaque.
 */
export const COLUMN_PALETTE = [
  "#2b55a8",
  "#9952d5",
  "#f069b4",
  "#ff9583",
  "#fee08b",
] as const;
export const MISSING_COLOR = "#cdcfd5";

export type ColumnLegend =
  | {
      type: "category";
      /** Each value with its colour and node count, most frequent first. */
      items: { label: string; color: string; count: number }[];
      missing: number;
    }
  | {
      type: "number";
      /** The colour ramp's span (5th to 95th percentile), and the values' extent. */
      domain: [number, number];
      extent: [number, number];
      /** The ramp, as CSS gradient stops from domain[0] to domain[1]. */
      stops: string[];
      missing: number;
    };

export interface ColumnColor {
  /** Node i's colour (i: dense node, or dense physical node of a state network). */
  fill: (i: number) => string;
  legend: ColumnLegend;
}

/** Quantile p of ascending `sorted` (d3's R-7 rule). */
export function quantile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (!n) return Number.NaN;
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const a = sorted[lo];
  return lo + 1 < n ? a + (sorted[lo + 1] - a) * (h - lo) : a;
}

/** cosmograph's numeric domain: the 5th to 95th percentile, the extent when they meet, never empty. */
export function rampDomain(sorted: ArrayLike<number>): [number, number] {
  const lo = quantile(sorted, 0.05);
  const hi = quantile(sorted, 0.95);
  const [a, b] = lo === hi ? [sorted[0], sorted[sorted.length - 1]] : [lo, hi];
  return a === b ? [a, b + 1e-6] : [a, b];
}

const ramp = piecewise(interpolateCubehelix.gamma(1.5), [...COLUMN_PALETTE]);

export function columnColor(column: NodeColumn): ColumnColor {
  if (column.type === "category") {
    const colors = column.categories.map(
      (_, k) => COLUMN_PALETTE[k % COLUMN_PALETTE.length],
    );
    const { codes } = column;
    let missing = 0;
    for (let i = 0; i < codes.length; i++) if (codes[i] < 0) missing++;
    return {
      fill: (i) => {
        const c = codes[i];
        return c === undefined || c < 0 ? MISSING_COLOR : colors[c];
      },
      legend: {
        type: "category",
        items: column.categories.map((label, k) => ({
          label,
          color: colors[k],
          count: column.counts[k],
        })),
        missing,
      },
    };
  }
  const { values } = column;
  const present = Float64Array.from(
    Array.prototype.filter.call(values, (v: number) => !Number.isNaN(v)),
  ).sort();
  const missing = values.length - present.length;
  if (!present.length)
    return {
      fill: () => MISSING_COLOR,
      legend: {
        type: "number",
        domain: [0, 0],
        extent: [0, 0],
        stops: [],
        missing,
      },
    };
  const [lo, hi] = rampDomain(present);
  const colors = new Array<string>(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    colors[i] = Number.isNaN(v)
      ? MISSING_COLOR
      : ramp(Math.min(1, Math.max(0, (v - lo) / (hi - lo))));
  }
  return {
    fill: (i) => colors[i] ?? MISSING_COLOR,
    legend: {
      type: "number",
      domain: [lo, hi],
      extent: [present[0], present[present.length - 1]],
      stops: Array.from({ length: 9 }, (_, k) => ramp(k / 8)),
      missing,
    },
  };
}

/** How a column colours its nodes: a colour per value, or a ramp over its numbers. */
export type ColumnScale = "categories" | "scale";

/** Categories for text; for numbers, categories when every value is an integer, else a scale. */
export function defaultScale(column: NodeColumn): ColumnScale {
  if (column.type === "category") return "categories";
  for (const v of column.values)
    if (!Number.isNaN(v) && !Number.isInteger(v)) return "scale";
  return "categories";
}

/** The scale `column` colours by: `chosen` where the column allows it, else its default. */
export const scaleOf = (
  column: NodeColumn,
  chosen: ColumnScale | null,
): ColumnScale =>
  chosen === "categories" || (chosen === "scale" && column.type === "number")
    ? chosen
    : defaultScale(column);

/**
 * A number column as categories: a code per distinct value, most frequent first, ties in ascending
 * order, labelled by the value as written (String).
 */
export function numberCategories(
  column: Extract<NodeColumn, { type: "number" }>,
): Extract<NodeColumn, { type: "category" }> {
  const { values } = column;
  const counts = new Map<number, number>();
  for (const v of values)
    if (!Number.isNaN(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
  const order = [...counts.keys()].sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a - b,
  );
  const code = new Map(order.map((v, k) => [v, k]));
  const codes = new Int32Array(values.length);
  for (let i = 0; i < values.length; i++)
    codes[i] = Number.isNaN(values[i]) ? -1 : (code.get(values[i]) as number);
  return {
    name: column.name,
    type: "category",
    codes,
    categories: order.map(String),
    counts: order.map((v) => counts.get(v) ?? 0),
  };
}

const cache = new WeakMap<NodeColumn, Map<ColumnScale, ColumnColor>>();

/** columnColor of `column` as `scale` (scaleOf), computed once per column and scale. */
export function columnColorOf(
  column: NodeColumn,
  scale: ColumnScale = defaultScale(column),
): ColumnColor {
  let byScale = cache.get(column);
  if (!byScale) {
    byScale = new Map();
    cache.set(column, byScale);
  }
  let c = byScale.get(scale);
  if (!c) {
    c = columnColor(
      scale === "categories" && column.type === "number"
        ? numberCategories(column)
        : column,
    );
    byScale.set(scale, c);
  }
  return c;
}

/** The column named `name`, else the first: the one a network colours by. */
export const pickColumn = (
  columns: readonly NodeColumn[] | undefined,
  name: string | null,
): NodeColumn | undefined =>
  columns?.find((c) => c.name === name) ?? columns?.[0];
