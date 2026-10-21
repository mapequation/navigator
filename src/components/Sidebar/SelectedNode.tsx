import { observer } from "mobx-react-lite";
import { Fragment } from "react";
import { useStores } from "../../stores";

const percent = (share: number): string =>
  share > 0 && share < 0.005 ? "<1%" : `${Math.round(share * 100)}%`;

export const SelectedNode = observer(function SelectedNode() {
  const { network: store } = useStores();
  const sel = store.selection;
  if (!sel)
    return (
      <p className="text-xs text-neutral-400">
        Click a node or module in the network
      </p>
    );

  const rows: [string, string][] = [["Name", sel.name]];
  if (sel.aggregate)
    rows.push([
      sel.physical ? "State nodes" : "Nodes",
      sel.ids.length.toLocaleString(),
    ]);
  // A physical node whose state nodes split over modules lists them, under
  // the module they share if any.
  if (sel.path && (sel.path.length || !sel.modules))
    rows.push(["Module", sel.path.join(":") || "root"]);
  if (sel.modules)
    rows.push([
      `${sel.path?.length ? "Submodules" : "Modules"} (${sel.modules.length})`,
      sel.modules
        .map(({ path, share }) => `${path.join(":")} ${percent(share)}`)
        .join(", "),
    ]);
  // Until Infomap runs, a raw network's flow is its degree flow: a directed
  // network's read as undirected.
  const cur = store.current;
  const proxy = cur?.kind === "raw" && cur.directed ? " (undirected)" : "";
  if (sel.flow !== null) rows.push([`Flow${proxy}`, sel.flow.toExponential(2)]);
  if (sel.exitFlow !== null)
    rows.push([`Exit flow${proxy}`, sel.exitFlow.toExponential(2)]);
  if (sel.degree !== null) rows.push(["Degree", sel.degree.toLocaleString()]);
  if (sel.physicalId !== null) rows.push(["Node id", String(sel.physicalId)]);

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt className="text-neutral-500">{label}</dt>
          <dd className="truncate" title={value}>
            {value}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
});
