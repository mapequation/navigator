import { AlertDialog, Button, Chip, Popover, Tooltip } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import {
  citationText,
  explorerUrl,
  sourceLabel,
} from "../../lib/netgamut-catalog";
import { formatBytes, formatNumber } from "../../lib/network-stats";
import type { NetworkOrigin } from "../../lib/types";
import { useStores } from "../../stores";
import { Stats } from "./controls";

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.5 6.5v4.5M9.5 6.5v4.5" />
    </svg>
  );
}

/** The parts of a press a row's remove handler uses. */
interface RemovePress {
  target: Element;
  pointerType: string;
}

/** A loaded file: name, then its size, which a trash button replaces on hover/focus. */
function FileRow({
  name,
  size,
  swatch,
  removeLabel,
  isDisabled,
  onRemove,
}: {
  name: string;
  size: number;
  /** Metadata files: their overlay colour. */
  swatch?: string;
  removeLabel: string;
  isDisabled?: boolean;
  onRemove: (e: RemovePress) => void;
}) {
  return (
    <li className="group/file flex items-baseline gap-2 text-xs">
      {swatch && (
        <span
          className="h-2.5 w-2.5 shrink-0 self-center rounded-sm"
          style={{ background: swatch }}
        />
      )}
      <span
        className="min-w-0 flex-1 truncate font-medium text-neutral-800"
        title={name}
      >
        {name}
      </span>
      {/* Size and trash share one slot: the size hides on hover/focus, the
          button only fades (opacity) so it stays keyboard-focusable. */}
      <span className="relative shrink-0">
        <span className="tabular-nums text-neutral-400 group-focus-within/file:invisible group-hover/file:invisible">
          {formatBytes(size)}
        </span>
        <Tooltip delay={300}>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={removeLabel}
            isDisabled={isDisabled}
            onPress={onRemove}
            className="absolute top-1/2 right-0 size-6 -translate-y-1/2 opacity-0 group-focus-within/file:opacity-100 group-hover/file:opacity-100"
          >
            <TrashIcon />
          </Button>
          <Tooltip.Content>{removeLabel}</Tooltip.Content>
        </Tooltip>
      </span>
    </li>
  );
}

function CopyCitation({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      className="h-6 px-2 text-xs"
      onPress={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/** Where a catalog network is from, how to cite it, and a way back to it in the load dialog. */
const Origin = observer(function Origin({ origin }: { origin: NetworkOrigin }) {
  const { library } = useStores();
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-neutral-50 px-3 py-2 text-xs">
      <p className="text-neutral-500">
        From{" "}
        {origin.url ? (
          <a
            href={origin.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-neutral-700 hover:text-blue-700 hover:underline"
          >
            {sourceLabel(origin.source)}
          </a>
        ) : (
          <span className="font-medium text-neutral-700">
            {sourceLabel(origin.source)}
          </span>
        )}{" "}
        via the{" "}
        <a
          href={explorerUrl(origin.key)}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-neutral-700 hover:text-blue-700 hover:underline"
        >
          netgamut catalog
        </a>
      </p>
      {origin.note && (
        <p className="text-neutral-500">
          {origin.note.replace(/[^.!?]$/, "$&.")}
        </p>
      )}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="secondary"
          className="h-6 px-2 text-xs"
          onPress={() => {
            library.browse(origin.key);
            library.open();
          }}
        >
          Details
        </Button>
        {origin.citations.length > 0 && (
          <Popover>
            <Button size="sm" variant="secondary" className="h-6 px-2 text-xs">
              Cite the data
            </Button>
            <Popover.Content className="max-w-96">
              <Popover.Dialog>
                <div className="flex items-center justify-between gap-3">
                  <Popover.Heading>Cite {origin.name}</Popover.Heading>
                  <CopyCitation
                    text={origin.citations
                      .map((c) => citationText(c.text))
                      .join("\n\n")}
                  />
                </div>
                <ul className="mt-2 flex flex-col gap-2 text-xs text-neutral-700">
                  {origin.citations.map((c) => (
                    <li key={citationText(c.text)}>
                      {c.url ? (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-blue-700 hover:underline"
                        >
                          {citationText(c.text)}
                        </a>
                      ) : (
                        citationText(c.text)
                      )}
                    </li>
                  ))}
                </ul>
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
        )}
      </div>
    </div>
  );
});

export const DataPanel = observer(function DataPanel() {
  const { network: store, ui, cluster } = useStores();
  const [confirmClear, setConfirmClear] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  /** Index of the remove button to focus once a removed row is gone. */
  const refocus = useRef<number | null>(null);
  // A keyboard removal unmounts the focused button: move focus to the row
  // that took its place, else the one before.
  useLayoutEffect(() => {
    const i = refocus.current;
    if (i === null) return;
    refocus.current = null;
    const buttons = list.current?.querySelectorAll("button");
    if (buttons?.length) buttons[Math.min(i, buttons.length - 1)].focus();
  });
  const cur = store.current;
  if (!cur) return null;

  const clear = (): void => {
    // Infomap may be clustering it: the run goes with it.
    cluster.stop();
    store.clear();
    ui.clearInfomapRun();
    ui.setLoadError(null);
    ui.openLoad();
  };
  const s = cur.stats;
  const fromFtree = s.moduleLinks !== undefined;

  const rows: [string, ReactNode, string?][] = [];
  rows.push([cur.isStates ? "State nodes" : "Nodes", s.nodes.toLocaleString()]);
  if (s.physicalNodes !== undefined)
    rows.push(["Physical nodes", s.physicalNodes.toLocaleString()]);
  rows.push([
    fromFtree ? "Leaf links" : "Links",
    s.links.toLocaleString(),
    fromFtree ? "Leaf-to-leaf links stored in the ftree" : undefined,
  ]);
  if (fromFtree && s.moduleLinks)
    rows.push([
      "Module links",
      s.moduleLinks.toLocaleString(),
      "Links between modules — aggregates of leaf links the ftree does not list",
    ]);
  rows.push([
    "Degree mean / max",
    `${formatNumber(s.meanDegree)} / ${s.maxDegree.toLocaleString()}`,
  ]);
  rows.push([
    s.weightIsFlow ? "Link flow mean / max" : "Weight mean / max",
    s.weight
      ? `${formatNumber(s.weight.mean)} / ${formatNumber(s.weight.max)}`
      : "unweighted",
  ]);

  return (
    <div className="flex flex-col gap-2.5">
      {cur.origin && <Origin origin={cur.origin} />}
      <ul ref={list} className="flex flex-col gap-1">
        {/* Any network input clears the whole network (after a confirm); a
            metadata file goes alone. */}
        {cur.sources.map((f) => (
          <FileRow
            key={`${f.kind}:${f.name}`}
            name={f.name}
            size={f.size}
            removeLabel="Clear network"
            isDisabled={ui.infomapRunning && !cluster.running}
            onRemove={() => setConfirmClear(true)}
          />
        ))}
        {store.occurrenceFiles.map((f) => (
          <FileRow
            key={f.id}
            name={f.name}
            size={f.size}
            swatch={f.color}
            removeLabel={`Remove ${f.name}`}
            onRemove={(e) => {
              if (e.pointerType === "keyboard" || e.pointerType === "virtual") {
                const buttons = [
                  ...(list.current?.querySelectorAll("button") ?? []),
                ];
                refocus.current = buttons.indexOf(
                  e.target as HTMLButtonElement,
                );
              }
              store.removeOccurrenceFile(f.id);
            }}
          />
        ))}
      </ul>
      <AlertDialog.Backdrop
        isOpen={confirmClear}
        onOpenChange={setConfirmClear}
      >
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Clear the network?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                This unloads {cur.filename}
                {store.occurrenceFiles.length > 0 && " and its metadata files"}.
                {cur.modules &&
                  cur.sources.every((f) =>
                    ["network", "links", "nodes"].includes(f.kind),
                  ) &&
                  " Its modules come from an Infomap run in this session: download them first to keep them."}
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                Cancel
              </Button>
              <Button slot="close" variant="danger" onPress={clear}>
                Clear network
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
      <div className="flex flex-wrap gap-1">
        <Chip size="sm" variant="secondary">
          {cur.directed ? "Directed" : "Undirected"}
        </Chip>
        <Chip size="sm" variant="secondary">
          {s.weight ? "Weighted" : "Unweighted"}
        </Chip>
        {cur.isStates && (
          <Chip size="sm" variant="secondary">
            State network
          </Chip>
        )}
      </div>
      <Stats rows={rows} />
      {fromFtree && (
        <p className="text-[11px] leading-snug text-neutral-400">
          An ftree stores leaf links only within bottom modules; degrees count
          those links.
        </p>
      )}
    </div>
  );
});
