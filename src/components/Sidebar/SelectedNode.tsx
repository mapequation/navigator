import { Button, Tooltip } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { Fragment } from "react";
import { useStores } from "../../stores";
import type { SelectionKind } from "../../stores/network-store";

const percent = (share: number): string =>
  share > 0 && share < 0.005 ? "<1%" : `${Math.round(share * 100)}%`;

const KIND: Record<SelectionKind, string> = {
  node: "Node",
  "state node": "State node",
  "physical node": "Physical node",
  lump: "Lumped state nodes",
  module: "Module",
  aggregate: "Aggregate",
};

const UNDIRECTED_NOTE =
  "Until Infomap runs, the flow is the network's degree flow, read as undirected: each link carries as much flow one way as the other.";
const LINKS_ONLY_NOTE =
  "The flow along links only. This Infomap run also moves flow between modules without a link (as regularization and recorded teleportation do). Infomap reports that flow for whole modules, not per node, so these values don't add up to the module's enter and exit flow.";

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v4" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** An info button whose tooltip says more about a row's value. */
function Note({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip delay={200}>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={`About ${label}`}
        className="ml-0.5 size-4 min-w-0 align-[-2px] text-neutral-400"
      >
        <InfoIcon />
      </Button>
      <Tooltip.Content className="max-w-64 text-xs break-normal">
        {text}
      </Tooltip.Content>
    </Tooltip>
  );
}

type Row = { label: string; value: string; note?: string };

export const SelectedNode = observer(function SelectedNode() {
  const { network: store } = useStores();
  const sel = store.selection;
  if (!sel)
    return (
      <p className="text-xs text-neutral-400">
        Click a node or module in the network
      </p>
    );

  const cur = store.current;
  const states = !!cur?.isStates;
  const rows: Row[] = [
    { label: "Type", value: KIND[sel.kind] },
    { label: "Name", value: sel.name },
  ];
  const push = (label: string, value: string, note?: string) =>
    rows.push({ label, value, note });
  if (sel.aggregate)
    push(states ? "State nodes" : "Nodes", sel.ids.length.toLocaleString());
  // A physical node whose state nodes split over modules lists them, under
  // the module they share if any.
  if (sel.path && (sel.path.length || !sel.modules))
    push("Module", sel.path.join(":") || "root");
  if (sel.modules)
    push(
      `${sel.path?.length ? "Submodules" : "Modules"} (${sel.modules.length})`,
      sel.modules
        .map(({ path, share }) => `${path.join(":")} ${percent(share)}`)
        .join(", "),
    );
  if (sel.treePath) push("Tree path", sel.treePath.join(":"));
  // Until Infomap runs, a raw network's flow is its degree flow: a directed
  // network's read as undirected.
  const undirected = cur?.kind === "raw" && cur.directed;
  const proxy = undirected ? " (undirected)" : "";
  const proxyNote = undirected ? UNDIRECTED_NOTE : undefined;
  if (sel.flow !== null)
    push(`Flow${proxy}`, sel.flow.toExponential(2), proxyNote);
  // Short of all of it, a node's enter and exit flow along links only.
  const [flowSuffix, flowNote] = sel.linksOnly
    ? [" (links only)", LINKS_ONLY_NOTE]
    : [proxy, proxyNote];
  if (sel.enterFlow !== null)
    push(`Enter flow${flowSuffix}`, sel.enterFlow.toExponential(2), flowNote);
  if (sel.exitFlow !== null)
    push(`Exit flow${flowSuffix}`, sel.exitFlow.toExponential(2), flowNote);
  if (sel.degree !== null) push("Degree", sel.degree.toLocaleString());
  if (sel.inDegree !== null) push("In-degree", sel.inDegree.toLocaleString());
  if (sel.outDegree !== null)
    push("Out-degree", sel.outDegree.toLocaleString());
  if (sel.stateId !== null) push("State id", String(sel.stateId));
  if (sel.layerId !== null) push("Layer", String(sel.layerId));
  // As Infomap's output names them: a state node's physical node is its node.
  if (sel.physicalId !== null) push("Node id", String(sel.physicalId));

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map(({ label, value, note }) => (
        <Fragment key={label}>
          <dt className="text-neutral-500">
            {label}
            {note && <Note label={label} text={note} />}
          </dt>
          <dd className="truncate" title={value}>
            {value}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
});
