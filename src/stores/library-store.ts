import { makeAutoObservable, observable, reaction, runInAction } from "mobx";
import { loadFiles } from "../lib/load-files";
import {
  downloadDataset,
  fetchNetgamut,
  type NetgamutDataset,
} from "../lib/netgamut";
import {
  type Catalog,
  type CatalogEntry,
  type CatalogFilters,
  type CatalogSort,
  type Direction,
  facetCounts,
  fetchCatalog,
  NO_FILTERS,
  type SizeBand,
  type SizeRange,
  searchCatalog,
  type Trait,
} from "../lib/netgamut-catalog";
import type { NetgamutOrigin } from "../lib/types";
import type { ClusterStore } from "./cluster-store";
import type { NetworkStore } from "./network-store";
import { nextPaint, type UiStore } from "./ui-store";

/** The load dialog's tabs. */
export type LoadTab = "examples" | "browse" | "files";

const TAB_KEY = "navigator:load-tab";
const TABS: readonly LoadTab[] = ["examples", "browse", "files"];

/** The tab the dialog showed last, in this browser; Examples the first time. */
function storedTab(): LoadTab {
  try {
    const tab = globalThis.localStorage?.getItem(TAB_KEY);
    return TABS.includes(tab as LoadTab) ? (tab as LoadTab) : "examples";
  } catch {
    return "examples";
  }
}

const RECENT_KEY = "navigator:recent-networks";
/** How many catalog networks the Recent row keeps. */
export const RECENT_MAX = 6;

/** The catalog networks loaded last in this browser, newest first. */
function storedRecent(): string[] {
  try {
    const keys = JSON.parse(
      globalThis.localStorage?.getItem(RECENT_KEY) ?? "[]",
    );
    return Array.isArray(keys)
      ? keys
          .filter((k): k is string => typeof k === "string")
          .slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

function storeRecent(keys: readonly string[]): void {
  try {
    globalThis.localStorage?.setItem(RECENT_KEY, JSON.stringify(keys));
  } catch {
    // Storage blocked: the Recent row lasts this visit only.
  }
}

function storeTab(tab: LoadTab): void {
  try {
    globalThis.localStorage?.setItem(TAB_KEY, tab);
  } catch {
    // Storage blocked: the dialog opens on Examples next time.
  }
}

/** Where a mirrored network is from and how to cite it, from its manifest entry. */
export function originOf(dataset: NetgamutDataset): NetgamutOrigin {
  const slash = dataset.key.indexOf("/");
  return {
    kind: "netgamut",
    key: dataset.key,
    source: dataset.key.slice(0, slash),
    name: dataset.key.slice(slash + 1),
    url: dataset.url,
    citations: dataset.citations ?? [],
    ...(dataset.note ? { note: dataset.note } : {}),
  };
}

/**
 * The URL names the loaded network's catalog key, and noInfomap when it loaded without Infomap, so a reload or
 * a shared link opens it again the same way.
 */
function syncUrl(key: string | null, noInfomap: boolean): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (key) url.searchParams.set("netgamut", key);
  else url.searchParams.delete("netgamut");
  if (key && noInfomap) url.searchParams.set("noInfomap", "");
  else url.searchParams.delete("noInfomap");
  // Keep the key's slash readable, and a flag without "=": `?netgamut=snap/web-Google&noInfomap`.
  const search = url.searchParams
    .toString()
    .replaceAll("%2F", "/")
    .replace(/=(?=&|$)/g, "");
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${search ? `?${search}` : ""}${url.hash}`,
  );
}

/**
 * The load dialog's library: which tab it shows, the netgamut catalog and the search over it, and the one
 * path every catalog network loads by (the Browse tab, the examples and `?netgamut=<key>`). Kept while the
 * dialog is closed, so it reopens where it was left.
 */
export class LibraryStore {
  tab: LoadTab = storedTab();
  catalog: Catalog | null = null;
  catalogError: string | null = null;
  catalogLoading = false;
  filters: CatalogFilters = NO_FILTERS;
  /**
   * "match" ranks by the query; without one the list is by name. The direction is one setting for every key:
   * switching the key keeps it.
   */
  sort: CatalogSort = { key: "match", descending: false };
  selectedKey: string | null = null;
  /** The list row under the pointer, marked in the chart. */
  hoverKey: string | null = null;
  /** Bumped to move the focus to the catalog search (the search shortcut). */
  searchFocus = 0;
  /** The catalog network downloading now; null once its file is read, or when none is. */
  download: {
    key: string;
    name: string;
    /** Bytes read so far, of `total` (gzipped); null while the network is looked up. */
    read: number | null;
    total: number;
  } | null = null;
  /** The catalog network loading now, from its download until it is on screen; null when none is. */
  loadingKey: string | null = null;
  /** A short note on the last load of `key`, shown for a few seconds ("Download cancelled."). */
  notice: { key: string | null; text: string } | null = null;
  /** Catalog networks loaded in this browser, newest first. */
  recent: string[] = storedRecent();
  private abort: AbortController | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private network: NetworkStore,
    private ui: UiStore,
    private cluster: ClusterStore,
  ) {
    makeAutoObservable<
      this,
      "network" | "ui" | "cluster" | "abort" | "noticeTimer"
    >(this, {
      network: false,
      ui: false,
      cluster: false,
      abort: false,
      noticeTimer: false,
      catalog: observable.ref, // replaced whole, never mutated
    });
    reaction(
      () => {
        const cur = this.network.current;
        return [
          cur?.origin?.key ?? null,
          cur?.loadOptions?.noInfomap ?? false,
        ] as const;
      },
      ([key, noInfomap]) => syncUrl(key, noInfomap),
      { equals: (a, b) => a[0] === b[0] && a[1] === b[1] },
    );
    // A load ends when its network is on screen (the view clears the phase), or when it fails.
    reaction(
      () => this.ui.viewPhase,
      (phase) => {
        if (phase === null && !this.download) this.loadingKey = null;
      },
    );
  }

  get entries(): readonly CatalogEntry[] {
    return this.catalog?.entries ?? [];
  }

  get byKey(): ReadonlyMap<string, CatalogEntry> {
    return new Map(this.entries.map((e) => [e.key, e]));
  }

  /** The sort in effect: "match" means by name while there is no query, in the same direction. */
  get activeSort(): CatalogSort {
    return this.sort.key === "match" && !this.filters.query.trim()
      ? { ...this.sort, key: "name" }
      : this.sort;
  }

  get results(): CatalogEntry[] {
    return searchCatalog(this.entries, this.filters, this.activeSort);
  }

  get facets(): ReturnType<typeof facetCounts> {
    return facetCounts(this.entries, this.filters);
  }

  get selected(): CatalogEntry | null {
    return (this.selectedKey && this.byKey.get(this.selectedKey)) || null;
  }

  setTab = (tab: LoadTab): void => {
    this.tab = tab;
    storeTab(tab);
  };

  /** Open the load dialog, on `tab` if given, else where it was left. */
  open = (tab?: LoadTab): void => {
    if (tab) this.setTab(tab);
    this.ui.openLoad();
  };

  /** Show `key` in the Browse tab; a search or filters that would hide it are cleared. */
  browse = (key: string): void => {
    const entry = this.byKey.get(key);
    if (entry && !this.results.includes(entry)) this.filters = NO_FILTERS;
    this.selectedKey = key;
    this.setTab("browse");
  };

  setQuery = (query: string): void => {
    this.filters = { ...this.filters, query };
  };

  private toggle<K extends "domains" | "sources" | "sizes" | "traits">(
    facet: K,
    value: CatalogFilters[K][number],
  ): void {
    const values = this.filters[facet] as readonly string[];
    this.filters = {
      ...this.filters,
      [facet]: values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value],
    };
  }

  toggleDomain = (domain: string): void => this.toggle("domains", domain);
  toggleSource = (source: string): void => this.toggle("sources", source);
  toggleSize = (band: SizeBand): void => this.toggle("sizes", band);
  toggleTrait = (trait: Trait): void => this.toggle("traits", trait);
  setDirection = (direction: Direction): void => {
    this.filters = { ...this.filters, direction };
  };
  /** Keep the networks inside a rectangle drawn on the size chart; null drops it. */
  setRange = (range: SizeRange | null): void => {
    this.filters = { ...this.filters, range };
  };
  clearFilters = (): void => {
    this.filters = { ...NO_FILTERS, query: this.filters.query };
  };
  setSort = (sort: CatalogSort): void => {
    this.sort = sort;
  };
  select = (key: string | null): void => {
    this.selectedKey = key;
  };
  /** Show the Browse tab with the focus in its search. */
  focusSearch = (): void => {
    this.setTab("browse");
    this.searchFocus++;
  };
  setHover = (key: string | null): void => {
    this.hoverKey = key;
  };

  /** Fetch the catalog once; again after a failure. */
  ensureCatalog = async (): Promise<void> => {
    if (this.catalog || this.catalogLoading) return;
    this.catalogLoading = true;
    this.catalogError = null;
    try {
      const catalog = await fetchCatalog();
      runInAction(() => {
        this.catalog = catalog;
      });
    } catch (err) {
      runInAction(() => {
        this.catalogError = err instanceof Error ? err.message : String(err);
      });
    } finally {
      runInAction(() => {
        this.catalogLoading = false;
      });
    }
  };

  /**
   * Load the catalog network `key`, as if its file were dropped alone: Infomap clusters it as it loads. The load
   * dialog shows the progress and stays open, busy, until the network is on screen (ui.viewReady); a
   * download can be cancelled.
   */
  loadNetgamut = async (
    key: string,
    { noInfomap = false }: { noInfomap?: boolean } = {},
  ): Promise<void> => {
    const { network, ui } = this;
    // A new network replaces the one Infomap may be clustering now.
    this.cluster.stop();
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const { signal } = abort;
    const known = this.byKey.get(key)?.dataset;
    ui.setLoadError(null);
    this.setNotice(null);
    this.loadingKey = key;
    this.download = {
      key,
      name: known?.title ?? key,
      read: null,
      total: known?.bytes ?? 0,
    };
    const options = {
      signal,
      // The percentage is in `download`: the phase stays one string while the bytes arrive, so the dialog
      // around the progress bar does not re-render with each step.
      onPhase: (phase: string) => ui.setViewPhase(phase.replace(/ \d+%$/, "")),
      onProgress: (read: number | null, total: number) =>
        runInAction(() => {
          if (this.download?.key !== key) return;
          this.download.read = read;
          this.download.total = total;
        }),
    };
    try {
      const { dataset, files } = known
        ? await downloadDataset(known, options)
        : await fetchNetgamut(key, options);
      if (signal.aborted) return;
      runInAction(() => {
        this.download = null;
      });
      ui.setViewPhase("Reading the network…");
      await nextPaint();
      // noInfomap: the network stays without modules (Infomap otherwise clusters it as it loads).
      const net = await loadFiles(files, {
        directed: dataset.directed,
        twoLevel: false,
        noInfomap,
      });
      if (signal.aborted) return;
      net.origin = originOf(dataset);
      ui.setViewPhase("Laying out and building the view…");
      await nextPaint();
      runInAction(() => {
        network.setNetwork(net);
        ui.clearInfomapRun();
        this.recent = [key, ...this.recent.filter((k) => k !== key)].slice(
          0,
          RECENT_MAX,
        );
        storeRecent(this.recent);
      });
    } catch (err) {
      if (signal.aborted) return;
      runInAction(() => {
        this.download = null;
        this.loadingKey = null;
      });
      ui.setViewPhase(null);
      ui.setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      if (this.abort === abort) this.abort = null;
    }
  };

  /** Stop the download in flight; what is loaded stays. */
  cancelDownload = (): void => {
    if (!this.abort) return;
    const key = this.download?.key ?? null;
    this.abort.abort();
    this.abort = null;
    this.download = null;
    this.loadingKey = null;
    this.ui.setViewPhase(null);
    this.setNotice({
      key,
      text: "Download cancelled. What was loaded before stays.",
    });
  };

  setNotice = (notice: { key: string | null; text: string } | null): void => {
    clearTimeout(this.noticeTimer);
    this.notice = notice;
    if (notice)
      this.noticeTimer = setTimeout(
        () => runInAction(() => (this.notice = null)),
        5000,
      );
  };
}
