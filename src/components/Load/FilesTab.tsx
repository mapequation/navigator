import { Button, Chip, Switch } from "@heroui/react";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { ftreeToNetwork } from "../../lib/ftree-graph";
import { loadInfomapOnline } from "../../lib/infomap-online";
import { loadFiles } from "../../lib/load-files";
import { planLoad } from "../../lib/load-plan";
import { formatBytes } from "../../lib/network-stats";
import { useStores } from "../../stores";
import { nextPaint } from "../../stores/ui-store";
import { ArrowIcon, CloudIcon, UploadIcon } from "./icons";
import type { LoadContext } from "./LoadDialog";

/** What the app reads, for the format guide. */
const FORMATS: readonly [string, string][] = [
  [".ftree", "An Infomap result: the network with its module hierarchy."],
  [".net", "A Pajek network: *Vertices with names, then *Edges or *Arcs."],
  ["edge list", "One link per line: source, target and an optional weight."],
  ["states", "A state network: *Vertices, *States and *Links."],
  [
    "multilayer",
    "Infomap's multilayer format: *Vertices, then *Intra, *Inter or *Multilayer links.",
  ],
  [".tree / .clu", "A partition for the network; Infomap computes the flow."],
  [".csv / .tsv", "Lists of node names, shown as metadata overlays."],
];

function Toggle({
  label,
  isSelected,
  onChange,
  isDisabled,
}: {
  label: string;
  isSelected: boolean;
  onChange: (on: boolean) => void;
  isDisabled?: boolean;
}) {
  return (
    <Switch
      size="sm"
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={isDisabled}
    >
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        {label}
      </Switch.Content>
    </Switch>
  );
}

export const FilesTab = observer(function FilesTab({
  ctx,
}: {
  ctx: LoadContext;
}) {
  const { network: store, ui, cluster } = useStores();
  const { files, setFiles, options, setOptions } = ctx;

  const currentLoad = () =>
    store.current && {
      sources: store.current.sources,
      loadOptions: store.current.loadOptions,
      metadata: store.occurrenceFiles,
    };

  const load = async (): Promise<void> => {
    const plan = planLoad(files, currentLoad(), options);
    if (plan.type === "clear") {
      // Nothing to show: the dialog stays open, as at startup.
      store.clear();
      ui.clearInfomapRun();
      ctx.reset();
      return;
    }
    if (plan.type === "metadata") {
      runInAction(() => {
        for (const id of plan.remove) store.removeOccurrenceFile(id);
        for (const f of plan.add) store.addOccurrenceFile(f);
      });
      ctx.close();
      return;
    }
    // A load stops an Infomap run that clusters the network shown now.
    cluster.stop();
    ctx.setBusy(true);
    ctx.setRanInfomap(false);
    // Parsing runs on the main thread: let the label paint before it starts.
    ui.setViewPhase("Reading the network…");
    await nextPaint();
    let error: string | null = null;
    let ran = false;
    try {
      const net = await loadFiles(files, options, {
        onInfomapStart: (command) => {
          ran = true;
          ctx.setRanInfomap(true);
          ui.setViewPhase(null); // Infomap shows its own progress
          ui.startInfomap(command);
        },
        onLog: ui.onInfomapLog,
      });
      await ctx.finish(
        net,
        files.filter((f) => f.kind === "metadata"),
        ran,
      );
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      ctx.fail(err);
    } finally {
      ui.finishInfomap(error);
      ctx.setBusy(false);
    }
  };

  const loadOnline = async (): Promise<void> => {
    cluster.stop();
    ctx.setBusy(true);
    try {
      const item = await loadInfomapOnline();
      if (!item) throw new Error("No network stored by Infomap Online");
      await ctx.finish(ftreeToNetwork(item.text, item.filename));
    } catch (err) {
      ctx.fail(err);
    } finally {
      ctx.setBusy(false);
    }
  };

  const hasPartition = files.some((f) => f.kind === "tree" || f.kind === "clu");
  const hasNetworkFile = files.some((f) => f.kind === "network");
  // Files just dropped: the next step is Load, so it takes the focus (Enter loads).
  const loadButton = useRef<HTMLButtonElement>(null);
  // Also when the tab opens after a drop on another tab.
  useEffect(() => {
    if (ctx.drops > 0) loadButton.current?.focus();
  }, [ctx.drops]);
  const hasNetwork = Boolean(store.current);
  const clears = files.length === 0 && hasNetwork;

  const kinds = [...new Set(files.map((f) => f.kind))];
  // The network (or Infomap result) to load, as the file starts.
  const first = files.find((f) => f.kind === "network" || f.kind === "ftree");
  const preview = first && {
    name: first.name,
    lines: first.text.slice(0, 8000).split("\n").slice(0, 60).join("\n"),
  };
  const summary =
    files.length === 0
      ? hasNetwork
        ? "No files: this unloads the network shown now."
        : "No files yet."
      : `${files.length} ${files.length === 1 ? "file" : "files"}: ${kinds.join(", ")}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_320px] md:grid-rows-[minmax(0,1fr)]">
        <div className="flex min-h-0 min-w-0 flex-col gap-4 md:overflow-y-auto">
          {files.length === 0 ? (
            <>
              <button
                type="button"
                onClick={ctx.pickFiles}
                className="group flex min-h-64 flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 px-6 py-10 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/50 focus-visible:border-blue-500 focus-visible:outline-none"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-colors group-hover:bg-blue-100 group-hover:text-blue-600">
                  <UploadIcon className="h-6 w-6" />
                </span>
                <span className="font-medium text-neutral-800">
                  Drop files here, or click to choose
                </span>
                <span className="max-w-md text-xs text-neutral-600">
                  A network with an optional partition, an .ftree, and metadata
                  lists. Files are read in your browser and never uploaded.
                </span>
              </button>
              {hasNetwork && (
                // Pending, not disabled, while busy: a disabled button drops focus to <body>, where the
                // dialog's keys stop working.
                <div className="flex items-center gap-3">
                  <span className="text-xs text-neutral-600">{summary}</span>
                  <Button
                    ref={loadButton}
                    className="ml-auto min-w-28 data-[focused=true]:ring-2 data-[focused=true]:ring-(--accent) data-[focused=true]:ring-offset-2"
                    isPending={ctx.loading}
                    variant={clears ? "danger-soft" : "primary"}
                    onPress={load}
                  >
                    {clears ? "Clear network" : "Load"}
                    {!clears && <ArrowIcon className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Files are staged: the drop zone steps back to a strip for adding more. */}
              <button
                type="button"
                onClick={ctx.pickFiles}
                className="group flex items-center gap-3 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-3 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/50 focus-visible:border-blue-500 focus-visible:outline-none"
              >
                <UploadIcon className="h-4 w-4 shrink-0 text-neutral-500 group-hover:text-blue-600" />
                <span className="text-sm text-neutral-800">
                  Add more files: a partition or metadata
                </span>
                <span className="ml-auto text-xs text-neutral-600">
                  Drop or click
                </span>
              </button>
              <section
                aria-labelledby="staged-heading"
                className="rounded-xl border border-neutral-200 bg-white"
              >
                <h3
                  id="staged-heading"
                  className="px-4 pt-3 pb-2 text-xs font-semibold tracking-wide text-neutral-600 uppercase"
                >
                  Files to load
                </h3>
                <ul className="flex flex-col divide-y divide-neutral-100 border-y border-neutral-100">
                  {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 px-4 py-2"
                    >
                      <Chip size="sm" variant="secondary">
                        {f.kind}
                      </Chip>
                      <span
                        className="min-w-0 flex-1 truncate text-sm text-neutral-800"
                        title={f.name}
                      >
                        {f.name}
                      </span>
                      <span className="text-xs tabular-nums text-neutral-500">
                        {formatBytes(f.size)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        isIconOnly
                        aria-label={`Remove ${f.name}`}
                        onPress={() =>
                          setFiles((prev) => prev.filter((p) => p.id !== f.id))
                        }
                      >
                        ✕
                      </Button>
                    </li>
                  ))}
                </ul>
                {hasNetworkFile && (
                  <div className="flex flex-col gap-2 px-4 py-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <Toggle
                        label="Force directed links"
                        isSelected={options.directed}
                        onChange={(directed) => setOptions({ directed })}
                      />
                      <p className="pl-11 text-xs text-neutral-600">
                        Read every link as directed, also in a file that says
                        undirected or doesn’t say.
                      </p>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <Toggle
                        label={
                          hasPartition
                            ? "No Infomap (keep partition as is)"
                            : "No Infomap (load without modules)"
                        }
                        isSelected={options.noInfomap}
                        onChange={(noInfomap) => setOptions({ noInfomap })}
                      />
                      <p className="pl-11 text-xs text-neutral-600">
                        {hasPartition
                          ? "Otherwise Infomap runs to compute the flow and the module hierarchy from the partition."
                          : "Otherwise Infomap finds the modules as the network loads; Run Infomap in the Modules panel does it later."}
                      </p>
                    </div>
                    {hasPartition && (
                      <Toggle
                        label="Two-level"
                        isSelected={options.twoLevel}
                        onChange={(twoLevel) => setOptions({ twoLevel })}
                        isDisabled={options.noInfomap}
                      />
                    )}
                  </div>
                )}
                {/* Pending, not disabled, while busy: a disabled button drops focus to <body>, where the
                    dialog's keys stop working. */}
                <div className="flex items-center gap-3 rounded-b-xl border-t border-neutral-100 bg-neutral-50 px-4 py-3">
                  <span className="min-w-0 truncate text-xs text-neutral-600">
                    {summary}
                  </span>
                  <Button
                    ref={loadButton}
                    className="ml-auto min-w-28 data-[focused=true]:ring-2 data-[focused=true]:ring-(--accent) data-[focused=true]:ring-offset-2"
                    isPending={ctx.loading}
                    variant={clears ? "danger-soft" : "primary"}
                    onPress={load}
                  >
                    {clears ? "Clear network" : "Load"}
                    {!clears && <ArrowIcon className="h-4 w-4" />}
                  </Button>
                </div>
              </section>
              {preview && (
                <section
                  aria-labelledby="preview-heading"
                  className="flex min-h-0 flex-col"
                >
                  <h3
                    id="preview-heading"
                    className="mb-2 flex items-baseline justify-between gap-2 text-xs font-semibold tracking-wide text-neutral-600 uppercase"
                  >
                    First lines of {preview.name}
                    <span className="font-normal tracking-normal text-neutral-500 normal-case">
                      to check it is the file you meant
                    </span>
                  </h3>
                  <pre className="min-h-0 overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-[11px] leading-relaxed text-neutral-700">
                    {preview.lines}
                  </pre>
                </section>
              )}
            </>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border border-neutral-200 p-4">
            <h3 className="mb-3 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              What you can load
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
              {FORMATS.map(([kind, about]) => (
                <div key={kind} className="contents">
                  <dt className="font-mono text-neutral-800">{kind}</dt>
                  <dd className="text-neutral-500">{about}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-600">
              A network without a partition or modules is clustered by Infomap
              as soon as it loads, with the options in the Modules panel.
            </p>
          </section>
          <section className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-800">
              <CloudIcon className="h-4 w-4 text-neutral-500" />
              Infomap Online
            </h3>
            {ctx.onlineAvailable ? (
              <>
                <p className="text-xs text-neutral-500">
                  Open the result of your last run there, kept in this browser.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="self-start"
                  isPending={ctx.loading}
                  onPress={loadOnline}
                >
                  Open from Infomap Online
                </Button>
              </>
            ) : (
              <p className="text-xs text-neutral-500">
                No result from Infomap Online in this browser yet. Run Infomap
                at{" "}
                <a
                  href="https://www.mapequation.org/infomap/"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-600 hover:underline"
                >
                  mapequation.org/infomap
                </a>{" "}
                and its result opens here.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
});
