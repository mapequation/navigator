import { useState } from "react";
import {
  type ColumnScale,
  columnColorOf,
  MISSING_COLOR,
} from "../../lib/column-colors";
import type { NodeColumn } from "../../lib/tables";

/** Values listed before "show all". */
const SHOWN = 10;

const number = new Intl.NumberFormat(undefined, {
  maximumSignificantDigits: 4,
});
const count = new Intl.NumberFormat();

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full border border-black/10"
      style={{ background: color }}
    />
  );
}

function Missing({ n }: { n: number }) {
  if (!n) return null;
  return (
    <li className="flex items-center gap-2 text-neutral-400">
      <Swatch color={MISSING_COLOR} />
      <span className="flex-1">missing</span>
      <span className="tabular-nums">{count.format(n)}</span>
    </li>
  );
}

/** The colours of a node column: each value with its node count, or the ramp over its numbers. */
export function ColumnLegend({
  column,
  scale,
}: {
  column: NodeColumn;
  scale: ColumnScale;
}) {
  const { legend } = columnColorOf(column, scale);
  const [all, setAll] = useState(false);

  if (legend.type === "number") {
    const [lo, hi] = legend.domain;
    const [min, max] = legend.extent;
    return (
      <div className="flex flex-col gap-1 text-xs">
        {legend.stops.length > 0 && (
          <>
            <div
              className="h-2.5 rounded-full"
              style={{
                background: `linear-gradient(to right, ${legend.stops.join(", ")})`,
              }}
            />
            <div className="flex justify-between tabular-nums text-neutral-500">
              <span>{number.format(lo)}</span>
              <span>{number.format(hi)}</span>
            </div>
          </>
        )}
        <p className="text-neutral-400">
          {legend.stops.length
            ? (lo > min || hi < max) &&
              `5th to 95th percentile; values range ${number.format(min)} to ${number.format(max)}.`
            : "No values."}
        </p>
        <ul>
          <Missing n={legend.missing} />
        </ul>
      </div>
    );
  }

  const items = all ? legend.items : legend.items.slice(0, SHOWN);
  const more = legend.items.length - items.length;
  return (
    <div className="flex flex-col gap-1 text-xs">
      <ul className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <Swatch color={item.color} />
            <span className="flex-1 truncate" title={item.label}>
              {item.label}
            </span>
            <span className="tabular-nums text-neutral-400">
              {count.format(item.count)}
            </span>
          </li>
        ))}
        <Missing n={legend.missing} />
      </ul>
      {(more > 0 || all) && legend.items.length > SHOWN && (
        <button
          type="button"
          className="self-start text-neutral-500 underline-offset-2 hover:underline"
          onClick={() => setAll(!all)}
        >
          {all
            ? "Show fewer"
            : `Show all ${count.format(legend.items.length)} values`}
        </button>
      )}
      {legend.items.length > 5 && (
        <p className="text-neutral-400">
          Five colours, in turn, most frequent value first.
        </p>
      )}
    </div>
  );
}
