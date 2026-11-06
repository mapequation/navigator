import {
  Button,
  ListBox,
  SearchField,
  Select,
  Skeleton,
  Spinner,
  Tooltip,
} from "@heroui/react";
import { observer } from "mobx-react-lite";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  type CatalogEntry,
  citationText,
  countFilters,
  type Direction,
  explorerUrl,
  NETGAMUT_EXPLORER,
  plainSummary,
  SIZE_BANDS,
  type SortKey,
  sourceLabel,
} from "../../lib/netgamut-catalog";
import { useStores } from "../../stores";
import { SearchShortcutKbd } from "../Search";
import { bytes, compact, domainColor, full, LARGE_LINKS } from "./format";
import {
  ArrowIcon,
  CatalogIcon,
  ExternalIcon,
  InfoIcon,
  SortIcon,
} from "./icons";
import { LoadedBadge } from "./LoadedBadge";
import { LoadProgress } from "./LoadProgress";
import { SizeChart } from "./SizeChart";

const Description = lazy(() => import("./Description"));

const SORTS: readonly [SortKey, string][] = [
  ["match", "Best match"],
  ["name", "Name"],
  ["nodes", "Nodes"],
  ["links", "Links"],
  ["bytes", "Download size"],
];

function FacetHeading({
  children,
  hint,
}: {
  children: React.ReactNode;
  /** How picks in the group combine, beside the heading. */
  hint?: string;
}) {
  return (
    <h4 className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px] font-semibold tracking-wide text-neutral-600 uppercase">
      {children}
      {hint && (
        <span className="font-normal tracking-normal text-neutral-500 normal-case">
          {hint}
        </span>
      )}
    </h4>
  );
}

/** A filter value: a toggle with how many networks it would show. */
function FacetButton({
  label,
  count,
  pressed,
  swatch,
  onPress,
}: {
  label: string;
  count: number;
  pressed: boolean;
  swatch?: string;
  onPress: () => void;
}) {
  const empty = count === 0 && !pressed;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={empty}
      onClick={onPress}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 ${
        pressed
          ? "bg-blue-50 font-medium text-blue-800 ring-1 ring-blue-200"
          : empty
            ? "text-neutral-300"
            : "text-neutral-700 hover:bg-neutral-100"
      }`}
    >
      {swatch && (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: swatch, opacity: empty ? 0.35 : 1 }}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span
        className={`tabular-nums ${pressed ? "text-blue-700" : "text-neutral-400"}`}
      >
        {full(count)}
      </span>
    </button>
  );
}

const Filters = observer(function Filters() {
  const { library } = useStores();
  const catalog = library.catalog;
  if (!catalog) return null;
  const { filters, facets } = library;
  const directions: [Exclude<Direction, "any">, string][] = [
    ["directed", "Directed"],
    ["undirected", "Undirected"],
  ];
  return (
    <nav
      aria-label="Filters"
      className="flex flex-col gap-5 overflow-y-auto border-r border-neutral-200 px-3 py-4"
    >
      {catalog.domains.length > 0 && (
        <section>
          <FacetHeading hint="any of">Domain</FacetHeading>
          {catalog.domains.map((d) => (
            <FacetButton
              key={d}
              label={d}
              swatch={domainColor(d, catalog.domains)}
              count={facets.domains.get(d) ?? 0}
              pressed={filters.domains.includes(d)}
              onPress={() => library.toggleDomain(d)}
            />
          ))}
        </section>
      )}
      <section>
        <FacetHeading>Links</FacetHeading>
        {directions.map(([d, text]) => (
          <FacetButton
            key={d}
            label={text}
            count={facets.direction.get(d) ?? 0}
            pressed={filters.direction === d}
            onPress={() =>
              library.setDirection(filters.direction === d ? "any" : d)
            }
          />
        ))}
      </section>
      <section>
        <FacetHeading hint="any of">Nodes</FacetHeading>
        {SIZE_BANDS.map(([band]) => (
          <FacetButton
            key={band}
            label={band}
            count={facets.sizes.get(band) ?? 0}
            pressed={filters.sizes.includes(band)}
            onPress={() => library.toggleSize(band)}
          />
        ))}
      </section>
      <section>
        <FacetHeading hint="any of">Source</FacetHeading>
        {catalog.sources.map((s) => (
          <FacetButton
            key={s}
            label={sourceLabel(s)}
            count={facets.sources.get(s) ?? 0}
            pressed={filters.sources.includes(s)}
            onPress={() => library.toggleSource(s)}
          />
        ))}
      </section>
    </nav>
  );
});

function Row({
  entry,
  domains,
  loaded,
}: {
  entry: CatalogEntry;
  domains: string[];
  loaded: boolean;
}) {
  const domain = entry.domains[0];
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate font-mono text-[13px] font-semibold text-neutral-900">
          {entry.name}
        </span>
        {loaded && <LoadedBadge />}
        <span className="ml-auto shrink-0 text-xs tabular-nums text-neutral-800">
          {compact(entry.nodes)}
          <span className="text-neutral-500"> nodes · </span>
          {compact(entry.links)}
          <span className="text-neutral-500"> links</span>
        </span>
      </div>
      {entry.description && (
        <p className="line-clamp-2 text-xs leading-snug text-neutral-600">
          {plainSummary(entry.description, 320)}
        </p>
      )}
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-neutral-500">
        {domain && (
          <>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: domainColor(domain, domains) }}
            />
            <span className="shrink-0">{domain}</span>
            <span className="text-neutral-300">·</span>
          </>
        )}
        <span className="shrink-0">
          {entry.directed ? "directed" : "undirected"}
        </span>
      </div>
    </div>
  );
}

/** The catalog networks loaded last in this browser, to find again in one click. */
const RecentRow = observer(function RecentRow() {
  const { library } = useStores();
  const recent = library.recent
    .map((k) => library.byKey.get(k))
    .filter((e): e is CatalogEntry => e !== undefined);
  if (recent.length === 0) return null;
  const domains = library.catalog?.domains ?? [];
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto border-b border-neutral-100 px-4 py-2 text-xs">
      <span className="shrink-0 text-neutral-500">Recently opened</span>
      {recent.map((e) => (
        <button
          key={e.key}
          type="button"
          aria-pressed={library.selectedKey === e.key}
          onClick={() => library.browse(e.key)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 ${
            library.selectedKey === e.key
              ? "border-blue-200 bg-blue-50 text-blue-800"
              : "border-neutral-200 text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: domainColor(e.domains[0], domains) }}
          />
          {e.name}
        </button>
      ))}
    </div>
  );
});

const Results = observer(function Results({
  results,
  loading,
}: {
  results: CatalogEntry[];
  loading: boolean;
}) {
  const { library, network } = useStores();
  const domains = library.catalog?.domains ?? [];
  const loadedKey = network.current?.origin?.key;
  const list = useRef<HTMLDivElement>(null);
  // A network picked elsewhere (the chart, an example's Details) scrolls into view.
  useEffect(() => {
    const key = library.selectedKey;
    // Again when the results change: a filter can move the selected row out of view. Without the selection
    // among them, the new results show from the top.
    if (results.length === 0) return;
    const scroller = list.current?.closest<HTMLElement>(".overflow-y-auto");
    if (!key || !results.some((r) => r.key === key)) {
      scroller?.scrollTo({ top: 0 });
      return;
    }
    for (const el of list.current?.querySelectorAll<HTMLElement>(
      "[data-key]",
    ) ?? [])
      if (el.dataset.key === key) el.scrollIntoView({ block: "nearest" });
  }, [library.selectedKey, results]);
  if (results.length === 0) {
    const filtered = countFilters(library.filters) > 0;
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <p className="text-sm font-medium text-neutral-700">
          No networks match
          {library.filters.query.trim() && (
            <> “{library.filters.query.trim()}”</>
          )}
        </p>
        <p className="max-w-xs text-xs text-neutral-500">
          {filtered
            ? "Clear the filters, or search with fewer words."
            : "Search with fewer or other words: names, topics and authors are all searched."}
        </p>
        <div className="mt-1 flex gap-2">
          {filtered && (
            <Button
              size="sm"
              variant="secondary"
              onPress={library.clearFilters}
            >
              Clear filters
            </Button>
          )}
          {library.filters.query && (
            <Button
              size="sm"
              variant="secondary"
              onPress={() => library.setQuery("")}
            >
              Clear search
            </Button>
          )}
        </div>
      </div>
    );
  }
  return (
    <ListBox
      ref={list}
      aria-label="Networks"
      selectionMode="single"
      selectionBehavior="replace"
      disallowEmptySelection
      selectedKeys={library.selectedKey ? [library.selectedKey] : []}
      onSelectionChange={(keys) => {
        if (keys === "all") return;
        const [k] = keys;
        if (k !== undefined) library.select(String(k));
      }}
      onAction={(key) => {
        if (!loading) void library.loadNetgamut(String(key));
      }}
      items={results}
      className="gap-0 p-1.5"
    >
      {(entry) => (
        <ListBox.Item
          id={entry.key}
          textValue={entry.name}
          onHoverStart={() => library.setHover(entry.key)}
          onHoverEnd={() => {
            if (library.hoverKey === entry.key) library.setHover(null);
          }}
          className="rounded-lg px-2.5 py-1.5 data-[selected=true]:bg-blue-50 data-[selected=true]:ring-1 data-[selected=true]:ring-blue-200"
        >
          <Row
            entry={entry}
            domains={domains}
            loaded={entry.key === loadedKey}
          />
        </ListBox.Item>
      )}
    </ListBox>
  );
});

/** Long content shown to a few lines, with a toggle for the rest. */
function Clamped({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Measured after the (lazy) description renders: short ones get no toggle.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setLong(el.scrollHeight > el.clientHeight + 4);
    check();
    const observer = new ResizeObserver(check);
    for (const child of el.children) observer.observe(child);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div>
      <div
        ref={box}
        className={
          open
            ? ""
            : `relative max-h-28 overflow-hidden ${long ? "[mask-image:linear-gradient(to_bottom,black_65%,transparent)]" : ""}`
        }
      >
        {children}
      </div>
      {(long || open) && (
        <button
          type="button"
          aria-expanded={open}
          className="mt-1 text-xs font-medium text-blue-600 hover:underline"
          onClick={() => setOpen(!open)}
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/** Copy `text` to the clipboard; the button says so for a moment. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      className="h-7 px-2.5 text-xs"
      onPress={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

const Detail = observer(function Detail({ loading }: { loading: boolean }) {
  const { library, network } = useStores();
  const catalog = library.catalog;
  const results = library.results;
  const shown = useMemo(() => new Set(results.map((r) => r.key)), [results]);
  if (!catalog) return null;
  // The pane shows the selection while the list holds it: a search or filter that hides it hides it here too,
  // and clearing them brings it back.
  const selected = library.selected;
  const e = selected && shown.has(selected.key) ? selected : null;
  const loadingThis = e !== null && library.loadingKey === e.key;
  const loadedNow = network.current?.origin?.key === e?.key;
  const citation =
    e?.citations.map((c) => citationText(c.text)).join("\n\n") ?? "";
  return (
    <aside
      aria-label="Network details"
      className="flex min-h-0 flex-col overflow-y-auto border-l border-neutral-200"
    >
      <div className="border-b border-neutral-100 px-3 pt-3 pb-1">
        <SizeChart
          entries={catalog.entries}
          shown={shown}
          domains={catalog.domains}
          selectedKey={e?.key ?? null}
          hoverKey={library.hoverKey}
          loadedKey={network.current?.origin?.key ?? null}
          onSelect={library.select}
          onBrush={library.setRange}
          range={library.filters.range}
        />
      </div>
      {e ? (
        <div className="flex flex-col gap-4 p-4">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
              {e.domains.map((d) => (
                <span key={d} className="flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: domainColor(d, catalog.domains) }}
                  />
                  {d}
                </span>
              ))}
              {e.domains.length > 0 && (
                <span className="text-neutral-300">·</span>
              )}
              <span>{sourceLabel(e.source)}</span>
            </div>
            <h3 className="flex flex-wrap items-center gap-2 font-mono text-lg font-semibold break-all text-neutral-900">
              {e.name}
              {loadedNow && <LoadedBadge />}
            </h3>
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 text-xs">
            {[
              ["Nodes", full(e.nodes)],
              ["Links", full(e.links)],
              ["Links are", e.directed ? "directed" : "undirected"],
              ["Download", `${bytes(e.bytes)} gzipped`],
            ].map(([k, v]) => (
              <div key={k} className="bg-white px-3 py-2">
                <dt className="text-[11px] text-neutral-500">{k}</dt>
                <dd className="font-medium tabular-nums text-neutral-900">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-2">
            {loadingThis ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5">
                <LoadProgress />
              </div>
            ) : (
              <Button
                className="w-full"
                variant={loadedNow ? "secondary" : "primary"}
                isDisabled={loading}
                onPress={() => void library.loadNetgamut(e.key)}
              >
                {loadedNow ? "Load again" : "Load"}
                <ArrowIcon className="h-4 w-4" />
              </Button>
            )}
            {library.notice?.key === e.key && (
              <p
                role="status"
                className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700"
              >
                <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0 text-neutral-500" />
                {library.notice.text}
              </p>
            )}
            {e.links >= LARGE_LINKS &&
              !loadingThis &&
              library.notice?.key !== e.key && (
                <p className="flex items-start gap-2 text-[11px] leading-snug text-neutral-600">
                  <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0 text-blue-600" />
                  A large network: {bytes(e.bytes)} to download, and its layout
                  in the browser takes a while.
                </p>
              )}
          </div>
          {e.citations.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <FacetHeading>Cite the data</FacetHeading>
                <CopyButton text={citation} label="Copy" />
              </div>
              <ul className="flex flex-col gap-1.5 text-[11px] leading-snug text-neutral-700">
                {e.citations.map((c) => (
                  <li key={c.text}>
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
            </section>
          )}
          <section className="flex flex-col gap-2">
            <FacetHeading>About</FacetHeading>
            {e.description ? (
              <Clamped key={e.key}>
                <Suspense
                  fallback={<Skeleton className="h-16 w-full rounded" />}
                >
                  <Description text={e.description} />
                </Suspense>
              </Clamped>
            ) : (
              <p className="text-xs text-neutral-500">
                The catalog has no description of this network.
              </p>
            )}
          </section>
          {e.subgraphCount > 1 && (
            <p className="rounded-md bg-neutral-50 px-3 py-2 text-[11px] text-neutral-600">
              The source lists {full(e.subgraphCount)} networks under this name;
              this file holds one of them.
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium">
            <a
              href={explorerUrl(e.key)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
            >
              In netgamut’s catalog
              <ExternalIcon className="h-3.5 w-3.5" />
            </a>
            {e.url && (
              <a
                href={e.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                On {sourceLabel(e.source)}
                <ExternalIcon className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-5 py-4 text-sm text-neutral-600">
          {results.length > 0 ? (
            <>
              <p className="font-medium text-neutral-800">Explore by size</p>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed">
                <li>
                  Drag across the chart to keep the networks in that range.
                </li>
                <li>
                  Click a dot, or a row in the list, to see the network and how
                  to cite it.
                </li>
                <li>
                  Double-click a row, or press Enter, to load it straight away.
                </li>
              </ul>
            </>
          ) : (
            <p className="text-xs">
              No network matches the search and filters.
            </p>
          )}
        </div>
      )}
    </aside>
  );
});

export const BrowseTab = observer(function BrowseTab({
  loading,
}: {
  loading: boolean;
}) {
  const { library } = useStores();
  const catalog = library.catalog;
  const input = useRef<HTMLInputElement>(null);
  const results = library.results;
  const sort = library.activeSort;
  const query = library.filters.query.trim();
  const active = countFilters(library.filters);
  const direction = sort.descending ? "Descending" : "Ascending";

  // The search field takes focus when the tab opens, and on the search shortcut.
  useEffect(() => {
    if (catalog && library.searchFocus >= 0) {
      input.current?.focus();
      input.current?.select();
    }
  }, [catalog, library.searchFocus]);

  if (!catalog) {
    // The tab keeps its frame while the catalog loads or when it cannot: search, filters and chart wait,
    // and the list says why.
    return (
      <div className="grid h-full min-h-0 grid-cols-[176px_minmax(0,1fr)_300px] grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_380px]">
        <div className="col-span-3 flex items-center gap-3 border-b border-neutral-200 px-5 py-3">
          <SearchField
            aria-label="Search networks"
            isDisabled
            className="flex-1"
          >
            <SearchField.Group className="h-9">
              <SearchField.SearchIcon />
              <SearchField.Input
                placeholder="Search by name, topic or author…"
                className="text-sm"
              />
            </SearchField.Group>
          </SearchField>
        </div>
        <div className="flex flex-col gap-4 border-r border-neutral-200 px-3 py-4">
          {library.catalogError
            ? ["Domain", "Links", "Nodes", "Source"].map((h) => (
                <h4
                  key={h}
                  className="text-[11px] font-semibold tracking-wide text-neutral-300 uppercase"
                >
                  {h}
                </h4>
              ))
            : [0, 1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-16 rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-3/4 rounded" />
                </div>
              ))}
        </div>
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          {library.catalogError ? (
            <>
              <p className="text-sm font-medium text-neutral-800">
                Can’t reach the netgamut catalog
              </p>
              <p className="max-w-md text-xs text-neutral-500">
                Check your connection and try again. Meanwhile the examples
                served with the Navigator and your own files still open.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onPress={() => void library.ensureCatalog()}>
                  Try again
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => library.setTab("examples")}
                >
                  Examples
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => library.setTab("files")}
                >
                  Your files
                </Button>
              </div>
              <details className="max-w-md text-[11px] text-neutral-400">
                <summary className="cursor-pointer">Details</summary>
                <p className="mt-1 break-words">{library.catalogError}</p>
              </details>
            </>
          ) : (
            <>
              <Spinner size="sm" />
              <p className="text-xs text-neutral-500">
                Loading the netgamut catalog…
              </p>
            </>
          )}
        </div>
        <div className="border-l border-neutral-200 p-4">
          {library.catalogError ? (
            <div className="h-56 rounded-lg border border-dashed border-neutral-200" />
          ) : (
            <Skeleton className="h-56 w-full rounded-lg" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[176px_minmax(0,1fr)_300px] xl:grid-cols-[200px_minmax(0,1fr)_380px] grid-rows-[auto_minmax(0,1fr)]">
      <div className="col-span-3 flex flex-wrap items-center gap-3 border-b border-neutral-200 px-5 py-3">
        <SearchField
          aria-label="Search networks"
          value={library.filters.query}
          onChange={library.setQuery}
          className="min-w-64 flex-1"
        >
          <SearchField.Group className="h-9">
            <SearchField.SearchIcon />
            <SearchField.Input
              ref={input}
              placeholder="Search by name, topic or author…"
              className="text-sm"
            />
            {library.filters.query ? (
              <SearchField.ClearButton />
            ) : (
              <SearchShortcutKbd />
            )}
          </SearchField.Group>
        </SearchField>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-neutral-500">Sort</span>
          <Select
            aria-label="Sort by"
            selectedKey={sort.key}
            onSelectionChange={(k) =>
              // The direction stays as it is: one setting for every key.
              library.setSort({ ...library.sort, key: k as SortKey })
            }
            className="w-36"
          >
            <Select.Trigger className="h-9">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {SORTS.filter(([k]) => k !== "match" || query).map(([k, t]) => (
                  <ListBox.Item key={k} id={k} textValue={t}>
                    {t}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-28 justify-start px-2.5 text-xs"
            aria-label={`Sort direction: ${direction}`}
            onPress={() =>
              library.setSort({
                ...library.sort,
                descending: !library.sort.descending,
              })
            }
          >
            <SortIcon descending={sort.descending} className="h-3.5 w-3.5" />
            {direction}
          </Button>
        </div>
      </div>
      <Filters />
      <div className="flex min-h-0 flex-col">
        <RecentRow />
        <div className="flex items-center gap-2 border-b border-neutral-100 px-4 pt-3 pb-2 text-xs text-neutral-500">
          <span aria-live="polite">
            <strong className="font-semibold text-neutral-800">
              {full(results.length)}
            </strong>{" "}
            {results.length === 1 ? "network" : "networks"}
            {query && <> matching “{query}”</>}
          </span>
          {library.filters.range && (
            <button
              type="button"
              onClick={() => library.setRange(null)}
              aria-label="Remove the size range drawn on the chart"
              className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] text-blue-800 hover:bg-blue-100"
            >
              {compact(library.filters.range.nodes[0])}–
              {compact(library.filters.range.nodes[1])} nodes ·{" "}
              {compact(library.filters.range.links[0])}–
              {compact(library.filters.range.links[1])} links
              <span aria-hidden="true">✕</span>
            </button>
          )}
          {active > 0 && (
            <button
              type="button"
              className="ml-auto font-medium text-blue-600 hover:underline"
              onClick={library.clearFilters}
            >
              Clear {active} {active === 1 ? "filter" : "filters"}
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Results results={results} loading={loading} />
        </div>
        <p className="flex items-center gap-1.5 border-t border-neutral-100 px-4 py-2 text-xs text-neutral-600">
          <CatalogIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          <span className="min-w-0 truncate">
            {catalog.described
              ? `${full(catalog.entries.length)} of ${full(catalog.catalogSize)} netgamut networks open here`
              : `${full(catalog.entries.length)} netgamut networks open here; their descriptions did not load`}
          </span>
          <Tooltip delay={200}>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Why not all of them?"
              className="size-5 min-w-5 shrink-0 text-neutral-400"
            >
              <InfoIcon className="h-3.5 w-3.5" />
            </Button>
            <Tooltip.Content className="max-w-64 text-xs">
              The others are too large for the browser, are not plain networks
              (paths, hypergraphs), or could not be mirrored from their source.
            </Tooltip.Content>
          </Tooltip>
          <a
            href={NETGAMUT_EXPLORER}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex shrink-0 items-center gap-0.5 font-medium text-neutral-500 hover:text-blue-600 hover:underline"
          >
            Full catalog <ExternalIcon className="h-3 w-3" />
          </a>
        </p>
      </div>
      <Detail loading={loading} />
    </div>
  );
});
