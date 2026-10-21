import { Alert, Button, Chip, Modal, ProgressBar, Switch } from "@heroui/react";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { fileKind } from "../lib/file-kinds";
import { ftreeToNetwork } from "../lib/ftree-graph";
import { loadInfomapOnline } from "../lib/infomap-online";
import { loadFiles } from "../lib/load-files";
import {
  type CurrentLoad,
  planLoad,
  restage,
  type StagedFile,
} from "../lib/load-plan";
import { formatBytes } from "../lib/network-stats";
import type { LoadedNetwork } from "../lib/types";
import { useStores } from "../stores";
import { nextPaint } from "../stores/ui-store";
import { ConsoleButton, InfomapProgressBar } from "./InfomapConsole";

export const LoadModal = observer(function LoadModal() {
  const { network: store, ui } = useStores();
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [directed, setDirected] = useState(false);
  const [twoLevel, setTwoLevel] = useState(false);
  const [noInfomap, setNoInfomap] = useState(false);
  const [onlineAvailable, setOnlineAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The last Load ran Infomap (network + partition); keeps its output visible after a failure. */
  const [ranInfomap, setRanInfomap] = useState(false);

  /** What is loaded now, for restaging and for diffing on Load. */
  const currentLoad = (): CurrentLoad | null =>
    store.current && {
      sources: store.current.sources,
      loadOptions: store.current.loadOptions,
      metadata: store.occurrenceFiles,
    };

  // Each time the dialog opens, stage what is loaded as if its files were
  // dropped again (edits made before a dismiss are dropped, and so are the
  // error and run output of a failed Load). Keyed on the open flag only:
  // re-staging while open would discard the user's edits.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (!ui.loadOpen) return;
    ui.setLoadError(null);
    setRanInfomap(false);
    void loadInfomapOnline()
      .then((item) => setOnlineAvailable(item !== null))
      .catch(() => setOnlineAvailable(false));
    const cur = currentLoad();
    setFiles(cur ? restage(cur) : []);
    setDirected(cur?.loadOptions?.directed ?? false);
    setTwoLevel(cur?.loadOptions?.twoLevel ?? false);
    setNoInfomap(cur?.loadOptions?.noInfomap ?? false);
  }, [ui.loadOpen]);

  const onDrop = useCallback(async (accepted: File[]) => {
    const named = await Promise.all(
      accepted.map(async (f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        size: f.size,
        text: await f.text(),
        kind: fileKind(f.name),
      })),
    );
    setFiles((prev) => [...prev, ...named]);
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
  });

  const reset = (): void => {
    ui.setLoadError(null);
    setFiles([]);
    setRanInfomap(false);
    setDirected(false);
    setTwoLevel(false);
    setNoInfomap(false);
  };
  const close = (): void => {
    ui.setLoadOpen(false);
    reset();
  };
  /**
   * Show a new network, then match the staged metadata files against it. The view then builds the graph,
   * starts the layout and, with its first frame, the link styles and tables, on the main thread: the dialog
   * says so (painted before that work starts) and stays open, busy, until the network is on screen
   * (ui.viewReady, from the view).
   */
  const finish = async (
    net: LoadedNetwork,
    metadata: readonly StagedFile[] = [],
    ranInfomap = false,
  ): Promise<void> => {
    ui.setViewPhase("Laying out and building the view…");
    await nextPaint();
    // One transaction: views react once to the network and its metadata.
    runInAction(() => {
      store.setNetwork(net);
      for (const f of metadata) store.addOccurrenceFile(f);
      // The console keeps only a run that produced this network.
      if (!ranInfomap) ui.clearInfomapRun();
    });
  };
  const fail = (err: unknown): void => {
    ui.setViewPhase(null);
    ui.setLoadError(err instanceof Error ? err.message : String(err));
  };

  const fetchOk = async (url: string): Promise<Response> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res;
  };

  const loadExample = async (): Promise<void> => {
    setBusy(true);
    try {
      const base = import.meta.env.BASE_URL;
      const [ftree, names] = await Promise.all([
        fetchOk(`${base}citation_data.ftree`).then((r) => r.text()),
        fetchOk(`${base}citation_module_names.json`).then(
          (r) => r.json() as Promise<Record<string, string>>,
        ),
      ]);
      const net = ftreeToNetwork(ftree, "citation_data.ftree");
      net.moduleNames = new Map(Object.entries(names));
      await finish(net);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const loadOnline = async (): Promise<void> => {
    setBusy(true);
    try {
      const item = await loadInfomapOnline();
      if (!item) throw new Error("No network stored by Infomap Online");
      await finish(ftreeToNetwork(item.text, item.filename));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const load = async (): Promise<void> => {
    const options = { directed, twoLevel, noInfomap };
    const plan = planLoad(files, currentLoad(), options);
    if (plan.type === "clear") {
      // Nothing to show: the dialog stays open, as at startup.
      store.clear();
      ui.clearInfomapRun();
      reset();
      return;
    }
    if (plan.type === "metadata") {
      runInAction(() => {
        for (const id of plan.remove) store.removeOccurrenceFile(id);
        for (const f of plan.add) store.addOccurrenceFile(f);
      });
      close();
      return;
    }
    setBusy(true);
    setRanInfomap(false);
    // Parsing runs on the main thread: let the label paint before it starts.
    ui.setViewPhase("Reading the network…");
    await nextPaint();
    let error: string | null = null;
    let ran = false;
    try {
      const net = await loadFiles(files, options, {
        onInfomapStart: (command) => {
          ran = true;
          setRanInfomap(true);
          ui.setViewPhase(null); // Infomap shows its own progress
          ui.startInfomap(command);
        },
        onLog: ui.onInfomapLog,
      });
      await finish(
        net,
        files.filter((f) => f.kind === "metadata"),
        ran,
      );
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      fail(err);
    } finally {
      ui.finishInfomap(error);
      setBusy(false);
    }
  };

  const hasPartition = files.some((f) => f.kind === "tree" || f.kind === "clu");
  const hasNetwork = Boolean(store.current);
  // Dismissable with or without a network (e.g. to change Settings before
  // the first load), but not while a load or its Infomap run is in flight.
  const loading = busy || ui.viewPhase !== null;
  const canDismiss = !ui.infomapRunning && !loading;

  return (
    <Modal.Backdrop
      isOpen={ui.loadOpen}
      isDismissable={canDismiss}
      isKeyboardDismissDisabled={!canDismiss}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !canDismiss) return; // load in flight — modal stays
        ui.setLoadOpen(nextOpen);
      }}
    >
      <Modal.Container size="lg">
        <Modal.Dialog>
          {canDismiss && <Modal.CloseTrigger />}
          <Modal.Header>
            <Modal.Heading>Load network</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-4">
            <div
              {...getRootProps()}
              className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${
                isDragActive
                  ? "border-blue-400 bg-blue-50"
                  : "border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
              }`}
            >
              <input {...getInputProps()} />
              {files.length === 0 ? (
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-neutral-700">
                    Click or drop files here
                  </p>
                  <p className="text-xs text-neutral-500">
                    An .ftree, or a network (.net, edge list, states) with an
                    optional .tree/.clu partition. Add .csv/.tsv lists of node
                    names as metadata.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-1 text-left">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-2">
                      <Chip size="sm">{f.kind}</Chip>
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="text-xs tabular-nums text-neutral-400">
                        {formatBytes(f.size)}
                      </span>
                      {/* Keep the remove click from reaching the dropzone (which opens the picker). */}
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: only stops propagation */}
                      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the Button handles keys */}
                      <span onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${f.name}`}
                          onPress={() =>
                            setFiles((prev) =>
                              prev.filter((p) => p.id !== f.id),
                            )
                          }
                        >
                          ✕
                        </Button>
                      </span>
                    </li>
                  ))}
                  <li className="pt-1 text-center text-xs text-neutral-400">
                    Click or drop to add more
                  </li>
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <Switch isSelected={directed} onChange={setDirected}>
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  Force directed links
                </Switch.Content>
              </Switch>
              {hasPartition && (
                <>
                  <p className="text-neutral-500 text-xs">
                    With a partition file, Infomap runs to compute flow and the
                    module hierarchy from it.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <Switch isSelected={noInfomap} onChange={setNoInfomap}>
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                        No Infomap (keep partition as is)
                      </Switch.Content>
                    </Switch>
                    <Switch
                      isSelected={twoLevel}
                      onChange={setTwoLevel}
                      isDisabled={noInfomap}
                    >
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                        Two-level
                      </Switch.Content>
                    </Switch>
                  </div>
                </>
              )}
            </div>

            {(ui.infomapRunning || ranInfomap) && (
              <div className="flex flex-col gap-1">
                {ui.infomapRunning && <InfomapProgressBar />}
                <div className="flex items-end gap-2">
                  <pre className="max-h-24 min-w-0 flex-1 overflow-y-auto text-xs text-neutral-500">
                    {ui.infomapOutput.slice(-8).join("\n")}
                  </pre>
                  <ConsoleButton />
                </div>
              </div>
            )}
            {ui.viewPhase && (
              // The bar's indeterminate animation is a CSS transform, which the browser runs on the compositor:
              // it keeps moving while the main thread is busy parsing, laying out and building the view.
              <div className="flex flex-col gap-1" role="status">
                <span className="text-xs text-neutral-500">{ui.viewPhase}</span>
                <ProgressBar
                  size="sm"
                  aria-label={ui.viewPhase}
                  isIndeterminate
                >
                  <ProgressBar.Track>
                    <ProgressBar.Fill />
                  </ProgressBar.Track>
                </ProgressBar>
              </div>
            )}
            {ui.loadError && (
              // HeroUI's Alert doesn't set an ARIA role itself (verified against
              // its source: AlertRoot spreads `rest` onto a plain div with no
              // default role) — without this, assistive tech gets no
              // notification when a load error appears.
              <Alert status="danger" role="alert">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{ui.loadError}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}
          </Modal.Body>
          <Modal.Footer className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              isPending={loading}
              isDisabled={ui.infomapRunning}
              onPress={loadExample}
            >
              Load example
            </Button>
            <Button
              variant="secondary"
              isPending={loading}
              isDisabled={!onlineAvailable || ui.infomapRunning}
              onPress={loadOnline}
            >
              Open from Infomap Online
            </Button>
            {/* Pending, not disabled, while busy: a disabled button drops
                focus to <body>, where the dialog's keys stop working. */}
            <Button
              isPending={loading}
              isDisabled={
                (files.length === 0 && !hasNetwork) ||
                (ui.infomapRunning && !loading)
              }
              onPress={load}
            >
              {files.length === 0 && hasNetwork ? "Clear network" : "Load"}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
});
