import { Alert, Button, Modal, Tabs } from "@heroui/react";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { fileKind } from "../../lib/file-kinds";
import { loadInfomapOnline } from "../../lib/infomap-online";
import type { CurrentLoad, StagedFile } from "../../lib/load-plan";
import { restage } from "../../lib/load-plan";
import type { LoadedNetwork } from "../../lib/types";
import { useStores } from "../../stores";
import type { LoadTab } from "../../stores/library-store";
import { nextPaint } from "../../stores/ui-store";
import { ConsoleButton, InfomapProgressBar } from "../InfomapConsole";
import { BrowseTab } from "./BrowseTab";
import { ExamplesTab } from "./ExamplesTab";
import { FilesTab } from "./FilesTab";
import { CatalogIcon, FileIcon, SparkIcon, UploadIcon } from "./icons";
import { LoadProgress } from "./LoadProgress";

/** The options the user's files load with. */
export interface FileOptions {
  directed: boolean;
  twoLevel: boolean;
  noInfomap: boolean;
}

const NO_OPTIONS: FileOptions = {
  directed: false,
  twoLevel: false,
  noInfomap: false,
};

/** What the tabs share: the staged files, and how a load finishes or fails. */
export interface LoadContext {
  files: StagedFile[];
  setFiles: React.Dispatch<React.SetStateAction<StagedFile[]>>;
  options: FileOptions;
  setOptions: (patch: Partial<FileOptions>) => void;
  /** Open the file picker. */
  pickFiles: () => void;
  /** A load or its Infomap run is in flight. */
  loading: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  ranInfomap: boolean;
  setRanInfomap: (ran: boolean) => void;
  /** Show `net`, then match the staged metadata files against it. */
  finish: (
    net: LoadedNetwork,
    metadata?: readonly StagedFile[],
    ranInfomap?: boolean,
  ) => Promise<void>;
  fail: (err: unknown) => void;
  /** Forget the staged files and options. */
  reset: () => void;
  close: () => void;
  onlineAvailable: boolean;
  /** Bumped by each drop or pick: the Files tab then moves the focus to Load. */
  drops: number;
}

async function stage(accepted: File[]): Promise<StagedFile[]> {
  return Promise.all(
    accepted.map(async (f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      text: await f.text(),
      kind: fileKind(f.name),
    })),
  );
}

/** The load dialog: examples, the netgamut catalog and the user's own files, one tab each. */
export const LoadDialog = observer(function LoadDialog() {
  const { network: store, ui, library } = useStores();
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [options, setOptionsState] = useState<FileOptions>(NO_OPTIONS);
  const [onlineAvailable, setOnlineAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The last Load ran Infomap (network + partition); keeps its output visible after a failure. */
  const [ranInfomap, setRanInfomap] = useState(false);
  const [drops, setDrops] = useState(0);

  const currentLoad = (): CurrentLoad | null =>
    store.current && {
      sources: store.current.sources,
      loadOptions: store.current.loadOptions,
      metadata: store.occurrenceFiles,
    };

  // Each time the dialog opens, stage what is loaded as if its files were dropped again (edits made before a
  // dismiss are dropped, and so are the error and run output of a failed Load). Keyed on the open flag only:
  // re-staging while open would discard the user's edits. The catalog is fetched the first time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (!ui.loadOpen) return;
    if (!ui.viewPhase) ui.setLoadError(null);
    setRanInfomap(false);
    void library.ensureCatalog();
    void loadInfomapOnline()
      .then((item) => setOnlineAvailable(item !== null))
      .catch(() => setOnlineAvailable(false));
    const cur = currentLoad();
    setFiles(cur ? restage(cur) : []);
    setOptionsState({
      directed: cur?.loadOptions?.directed ?? false,
      twoLevel: cur?.loadOptions?.twoLevel ?? false,
      noInfomap: cur?.loadOptions?.noInfomap ?? false,
    });
  }, [ui.loadOpen]);

  // Files dropped anywhere on the dialog are staged under Your files.
  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (accepted.length === 0) return;
      const named = await stage(accepted);
      setFiles((prev) => [...prev, ...named]);
      setDrops((n) => n + 1);
      library.setTab("files");
    },
    [library],
  );
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  const reset = (): void => {
    ui.setLoadError(null);
    setFiles([]);
    setRanInfomap(false);
    setOptionsState(NO_OPTIONS);
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
    ran = false,
  ): Promise<void> => {
    ui.setViewPhase("Laying out and building the view…");
    await nextPaint();
    // One transaction: views react once to the network and its metadata.
    runInAction(() => {
      store.setNetwork(net);
      for (const f of metadata) store.addOccurrenceFile(f);
      // The console keeps only a run that produced this network.
      if (!ran) ui.clearInfomapRun();
    });
  };
  const fail = (err: unknown): void => {
    ui.setViewPhase(null);
    ui.setLoadError(err instanceof Error ? err.message : String(err));
  };

  const loading = busy || ui.viewPhase !== null || library.download !== null;
  // Dismissable with or without a network (e.g. to change Settings before the first load), but not while a
  // load or its Infomap run is in flight; a download can be cancelled.
  const canDismiss = !ui.infomapRunning && !loading;

  const ctx: LoadContext = {
    files,
    setFiles,
    options,
    setOptions: (patch) => setOptionsState((o) => ({ ...o, ...patch })),
    pickFiles: open,
    loading,
    busy,
    setBusy,
    ranInfomap,
    setRanInfomap,
    finish,
    fail,
    reset,
    close,
    onlineAvailable,
    drops,
  };

  const count = library.catalog?.entries.length;

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
      <Modal.Container size="cover" className="sm:p-6">
        <Modal.Dialog className="h-[min(880px,100%)] w-[min(1240px,100%)] overflow-hidden p-0 sm:max-w-none">
          <div
            {...getRootProps({
              className: "relative flex h-full min-h-0 flex-col outline-none",
            })}
          >
            <input {...getInputProps()} aria-label="Choose files" />
            <Tabs
              selectedKey={library.tab}
              onSelectionChange={(key) => library.setTab(key as LoadTab)}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-neutral-200 py-3 pr-14 pl-5">
                <Modal.Heading className="text-base font-semibold text-neutral-900">
                  Load network
                </Modal.Heading>
                <Tabs.ListContainer>
                  <Tabs.List aria-label="Where the network comes from">
                    <Tabs.Tab
                      id="examples"
                      className="gap-1.5 px-3.5 whitespace-nowrap"
                    >
                      <SparkIcon className="h-3.5 w-3.5" />
                      Examples
                      <Tabs.Indicator />
                    </Tabs.Tab>
                    <Tabs.Tab
                      id="browse"
                      className="gap-1.5 px-3.5 whitespace-nowrap"
                    >
                      <CatalogIcon className="h-3.5 w-3.5" />
                      Browse netgamut
                      {count !== undefined && (
                        <span className="rounded-full bg-neutral-200/70 px-1.5 text-[11px] tabular-nums text-neutral-600">
                          {count.toLocaleString("en")}
                        </span>
                      )}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                    <Tabs.Tab
                      id="files"
                      className="gap-1.5 px-3.5 whitespace-nowrap"
                    >
                      <FileIcon className="h-3.5 w-3.5" />
                      Your files
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  </Tabs.List>
                </Tabs.ListContainer>
              </div>
              <Tabs.Panel
                id="examples"
                className="min-h-0 flex-1 overflow-y-auto p-0"
              >
                <ExamplesTab ctx={ctx} />
              </Tabs.Panel>
              <Tabs.Panel id="browse" className="min-h-0 flex-1 p-0">
                <BrowseTab loading={loading} />
              </Tabs.Panel>
              <Tabs.Panel id="files" className="min-h-0 flex-1 p-0">
                <FilesTab ctx={ctx} />
              </Tabs.Panel>
            </Tabs>
            <LoadStatus ranInfomap={ranInfomap} />
            {canDismiss && <Modal.CloseTrigger className="top-3.5 right-4" />}
            {isDragActive && (
              <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/90 text-blue-700">
                <UploadIcon className="h-8 w-8" />
                <p className="font-medium">Drop to add your files</p>
                <p className="text-xs text-blue-600/80">
                  They are read in your browser and never uploaded.
                </p>
              </div>
            )}
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
});

/**
 * What a load is doing, under the tabs: its progress (unless the Browse tab's detail pane shows it beside its
 * Load button), a note on the last load, an Infomap run, or an error.
 */
const LoadStatus = observer(function LoadStatus({
  ranInfomap,
}: {
  ranInfomap: boolean;
}) {
  const { ui, library } = useStores();
  const shownInDetail =
    library.tab === "browse" &&
    library.loadingKey !== null &&
    library.loadingKey === library.selectedKey;
  const showProgress =
    (library.download !== null || ui.viewPhase !== null) && !shownInDetail;
  // A note on a load shows where its progress did.
  const notice =
    library.notice &&
    !(library.tab === "browse" && library.notice.key === library.selectedKey)
      ? library.notice.text
      : null;
  const showRun = ui.infomapRunning || ranInfomap;
  if (!showProgress && !showRun && !ui.loadError && !notice) return null;
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
      {showProgress && <LoadProgress />}
      {notice && (
        <p role="status" className="text-xs text-neutral-600">
          {notice}
        </p>
      )}
      {showRun && (
        <div className="flex flex-col gap-1">
          {ui.infomapRunning && <InfomapProgressBar />}
          <div className="flex items-end gap-2">
            <pre className="max-h-20 min-w-0 flex-1 overflow-y-auto text-xs text-neutral-500">
              {ui.infomapOutput.slice(-6).join("\n")}
            </pre>
            <ConsoleButton />
          </div>
        </div>
      )}
      {ui.loadError && (
        // HeroUI's Alert sets no ARIA role itself: without one, assistive tech is not told about the error.
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description className="break-words">
              {ui.loadError}
            </Alert.Description>
          </Alert.Content>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => ui.setLoadError(null)}
          >
            Dismiss
          </Button>
        </Alert>
      )}
    </div>
  );
});
