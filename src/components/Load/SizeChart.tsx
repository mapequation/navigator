import { scaleLog } from "d3-scale";
import { observer } from "mobx-react-lite";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogEntry, SizeRange } from "../../lib/netgamut-catalog";
import { compact, domainColor } from "./format";

const W = 360;
const M = { top: 18, right: 12, bottom: 28, left: 36 };
const TICKS = [1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7];
const label = (v: number): string => compact(v);

/**
 * A log-scale domain around `values`: a factor of two wider on each side, and at least three decades wide,
 * centred on them, so a handful of networks keep their neighbours in view.
 */
function around(values: number[]): [number, number] {
  const finite = values.filter((v) => v > 0);
  if (finite.length === 0) return [1, 1000];
  let low = Math.log10(Math.min(...finite) / 2);
  let high = Math.log10(Math.max(...finite) * 2);
  const short = 3 - (high - low);
  if (short > 0) {
    low -= short / 2;
    high += short / 2;
  }
  return [10 ** Math.max(0, low), 10 ** high];
}

/**
 * Networks by nodes and links, on log scales, framed on the ones the search and filters leave (in their
 * domain's colour); the others in that frame are faint. A click selects the nearest network. The row under the
 * pointer in the list, the selection and the network loaded now are marked.
 */
export const SizeChart = observer(function SizeChart({
  entries,
  shown,
  domains,
  selectedKey,
  hoverKey,
  loadedKey,
  onSelect,
  onBrush,
  range,
  height = 280,
}: {
  entries: readonly CatalogEntry[];
  shown: ReadonlySet<string>;
  domains: readonly string[];
  selectedKey: string | null;
  /** The list row under the pointer. */
  hoverKey: string | null;
  loadedKey: string | null;
  onSelect: (key: string) => void;
  /** A rectangle dragged on the chart: the node and link counts it spans. */
  onBrush: (range: SizeRange) => void;
  /** The range drawn last, kept as a box until it is cleared. */
  range: SizeRange | null;
  /** In the chart's own units; the width is 360. */
  height?: number;
}) {
  const H = height;
  const svg = useRef<SVGSVGElement>(null);
  /** Where a drag started, and where it is now, in chart units; null when the pointer is not down. */
  const [drag, setDrag] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const [hover, setHover] = useState<CatalogEntry | null>(null);
  // A search or filter can take the hovered network out: its tooltip goes with it.
  useEffect(() => {
    setHover((h) => (h && shown.has(h.key) ? h : null));
  }, [shown]);

  const bright = useMemo(
    () => entries.filter((e) => shown.has(e.key)),
    [entries, shown],
  );
  // Framed on the results, so a few of them are not lost among hundreds.
  const framed = bright.length > 0 ? bright : entries;
  const { x, y } = useMemo(
    () => ({
      x: scaleLog()
        .domain(around(framed.map((e) => e.nodes)))
        .range([M.left, W - M.right]),
      y: scaleLog()
        .domain(around(framed.map((e) => e.links)))
        .range([H - M.bottom, M.top]),
    }),
    [framed, H],
  );
  const [x0, x1] = x.domain();
  const [y0, y1] = y.domain();
  const inside = (e: CatalogEntry): boolean =>
    e.nodes >= x0 && e.nodes <= x1 && e.links >= y0 && e.links <= y1;
  // Draw the faint ones first, so the shown ones sit on top.
  const faint = entries.filter((e) => !shown.has(e.key) && inside(e));
  const byKey = (key: string | null) =>
    key ? bright.find((e) => e.key === key) : undefined;
  const selected = byKey(selectedKey);
  const rowHover = byKey(hoverKey);
  const loaded = byKey(loadedKey);
  const zoomed = bright.length > 0 && bright.length < entries.length;

  /** The pointer in chart units. */
  const at = (ev: React.PointerEvent): [number, number] => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return [0, 0];
    return [
      ((ev.clientX - box.left) / box.width) * W,
      ((ev.clientY - box.top) / box.height) * H,
    ];
  };
  /** A drag counts once the pointer has moved this far; less is a click. */
  const dragged = (d: NonNullable<typeof drag>): boolean =>
    Math.abs(d.x1 - d.x0) > 4 || Math.abs(d.y1 - d.y0) > 4;

  /** The shown network nearest the pointer, within 10 px. */
  const nearest = (ev: React.PointerEvent): CatalogEntry | null => {
    const [px, py] = at(ev);
    let best: CatalogEntry | null = null;
    let bestD = 100;
    for (const e of bright) {
      const d = (x(e.nodes) - px) ** 2 + (y(e.links) - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  };

  return (
    <figure className="relative">
      {/* Pointer only: the list and the facets beside the chart are the keyboard way to the same networks. */}
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full cursor-crosshair select-none"
        role="img"
        aria-label={`Sizes of ${bright.length} networks: nodes against links, log scales`}
        onPointerDown={(ev) => {
          if (ev.button !== 0) return;
          ev.currentTarget.setPointerCapture(ev.pointerId);
          const [px, py] = at(ev);
          setDrag({ x0: px, y0: py, x1: px, y1: py });
        }}
        onPointerMove={(ev) => {
          if (drag) {
            const [px, py] = at(ev);
            setDrag({ ...drag, x1: px, y1: py });
            if (dragged(drag)) setHover(null);
            return;
          }
          setHover(nearest(ev));
        }}
        onPointerUp={(ev) => {
          const d = drag;
          setDrag(null);
          if (!d) return;
          if (dragged(d)) {
            const n = [x.invert(d.x0), x.invert(d.x1)].sort((a, b) => a - b);
            const l = [y.invert(d.y0), y.invert(d.y1)].sort((a, b) => a - b);
            onBrush({
              nodes: [Math.ceil(n[0]), Math.floor(n[1])],
              links: [Math.ceil(l[0]), Math.floor(l[1])],
            });
            return;
          }
          const e = nearest(ev);
          if (e) onSelect(e.key);
          setHover(null);
        }}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => {
          if (!drag) setHover(null);
        }}
      >
        {TICKS.filter((t) => t >= x0 && t <= x1).map((t) => (
          <g key={`x${t}`}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={M.top}
              y2={H - M.bottom}
              className="stroke-neutral-100"
            />
            <text
              x={x(t)}
              y={H - M.bottom + 12}
              textAnchor="middle"
              className="fill-neutral-500 text-[11px]"
            >
              {label(t)}
            </text>
          </g>
        ))}
        {TICKS.filter((t) => t >= y0 && t <= y1).map((t) => (
          <g key={`y${t}`}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-neutral-100"
            />
            <text
              x={M.left - 5}
              y={y(t) + 3}
              textAnchor="end"
              className="fill-neutral-500 text-[11px]"
            >
              {label(t)}
            </text>
          </g>
        ))}
        <text
          x={W - M.right}
          y={H - 3}
          textAnchor="end"
          className="fill-neutral-500 text-[11px]"
        >
          nodes →
        </text>
        <text x={2} y={M.top - 7} className="fill-neutral-500 text-[11px]">
          links ↑
        </text>
        {faint.map((e) => (
          <circle
            key={e.key}
            cx={x(e.nodes)}
            cy={y(e.links)}
            r={1.6}
            className="fill-neutral-200"
          />
        ))}
        {bright.map((e) => (
          <circle
            key={e.key}
            cx={x(e.nodes)}
            cy={y(e.links)}
            r={3}
            fill={domainColor(e.domains[0], domains)}
            fillOpacity={0.75}
            stroke="white"
            strokeWidth={0.6}
          />
        ))}
        {[hover, rowHover].map(
          (h, i) =>
            h &&
            h.key !== selectedKey && (
              <circle
                // biome-ignore lint/suspicious/noArrayIndexKey: two fixed slots
                key={i}
                cx={x(h.nodes)}
                cy={y(h.links)}
                r={6}
                fill="none"
                className="stroke-neutral-500"
                strokeWidth={1.5}
              />
            ),
        )}
        {loaded && (
          <g transform={`translate(${x(loaded.nodes)} ${y(loaded.links)})`}>
            <circle
              r={4}
              className="fill-white stroke-emerald-600"
              strokeWidth={2}
            />
            <circle r={1.6} className="fill-emerald-600" />
          </g>
        )}
        {selected && (
          <circle
            cx={x(selected.nodes)}
            cy={y(selected.links)}
            r={8}
            fill="none"
            className="stroke-neutral-900"
            strokeWidth={2.5}
          />
        )}
        {zoomed && (
          <text
            x={W - M.right}
            y={M.top - 7}
            textAnchor="end"
            className="fill-neutral-500 text-[11px]"
          >
            {bright.length === 1
              ? "framed on the result"
              : `framed on the ${bright.length.toLocaleString("en")} results`}
          </text>
        )}
        {range && !drag && (
          <rect
            x={Math.max(M.left, x(range.nodes[0]))}
            y={Math.max(M.top, y(range.links[1]))}
            width={Math.max(
              0,
              Math.min(W - M.right, x(range.nodes[1])) -
                Math.max(M.left, x(range.nodes[0])),
            )}
            height={Math.max(
              0,
              Math.min(H - M.bottom, y(range.links[0])) -
                Math.max(M.top, y(range.links[1])),
            )}
            className="pointer-events-none fill-blue-500/5 stroke-blue-500"
            strokeWidth={1}
            strokeDasharray="3 2"
          />
        )}
        {drag && dragged(drag) && (
          <rect
            x={Math.min(drag.x0, drag.x1)}
            y={Math.min(drag.y0, drag.y1)}
            width={Math.abs(drag.x1 - drag.x0)}
            height={Math.abs(drag.y1 - drag.y0)}
            className="fill-blue-500/10 stroke-blue-600"
            strokeWidth={1}
            strokeDasharray="3 2"
          />
        )}
      </svg>
      {hover && hover.key !== selectedKey && (
        <div
          className="pointer-events-none absolute z-10 max-w-56 rounded-md bg-neutral-900 px-2 py-1 text-[11px] text-white shadow"
          style={{
            left: `${(x(hover.nodes) / W) * 100}%`,
            top: `${(y(hover.links) / H) * 100}%`,
            // Away from the point, toward the emptier side: the dense diagonal runs to the top right.
            transform: `translate(${x(hover.nodes) > W * 0.55 ? "calc(-100% - 10px)" : "10px"}, ${y(hover.links) < H * 0.45 ? "10px" : "calc(-100% - 10px)"})`,
          }}
        >
          <span className="font-medium">{hover.name}</span>
          <span className="block tabular-nums text-neutral-300">
            {compact(hover.nodes)} nodes · {compact(hover.links)} links
          </span>
        </div>
      )}
    </figure>
  );
});
