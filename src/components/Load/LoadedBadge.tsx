/** Marks the network loaded now: in the Browse list and detail pane, on its example card (a green dot in the chart). */
export function LoadedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
      Loaded
    </span>
  );
}
