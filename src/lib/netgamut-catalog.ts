/**
 * The netgamut catalog as the load dialog browses it: the networks of the web mirror (what a browser can open),
 * described by the catalog index that netgamut's documentation serves (description, domains, citations). The
 * mirror's figures describe the file the Navigator opens, so they win over the index's where both have one.
 */
import {
  NETGAMUT_MIRROR,
  type NetgamutDataset,
  type NetgamutManifest,
} from "./netgamut";

/** The catalog index `netgamut export-index` writes, as far as the browser uses it. */
export const NETGAMUT_CATALOG: string =
  import.meta.env.VITE_NETGAMUT_CATALOG ||
  "https://mapequation.org/netgamut/_static/explorer/catalog.json";

/** The netgamut documentation's catalog explorer, which lists every source, mirrored or not. */
export const NETGAMUT_EXPLORER =
  "https://mapequation.org/netgamut/explorer.html";

/** The explorer opened on the dataset `key`. */
export const explorerUrl = (key: string): string =>
  `${NETGAMUT_EXPLORER}#dataset=${encodeURIComponent(key)}`;

interface IndexDataset {
  key: string;
  source: string;
  name: string;
  domains: string[];
  description: string;
  citations: { text: string; url?: string }[];
  url: string;
  subgraph_count: number;
}

export interface CatalogIndex {
  netgamut: string;
  domains: string[];
  sources: { name: string; summary: string; retrieved: string }[];
  datasets: IndexDataset[];
}

/** The kinds of network the mirror's manifest says yes, no or unknown to, in the netgamut explorer's order. */
export const KINDS = [
  ["weighted", "Weighted"],
  ["bipartite", "Bipartite"],
  ["temporal", "Temporal"],
  ["multilayer", "Multilayer"],
  ["signed", "Signed"],
  ["multigraph", "Multigraph"],
] as const;

export type Kind = (typeof KINDS)[number][0];

/**
 * An entry's kinds in words: the ones its source says it is ("Weighted, multilayer", or "None"), and the ones
 * the source does not answer. Null when it answers none, as in a manifest built before the kinds.
 */
export function describeKinds(
  kinds: Record<Kind, boolean | null>,
): { is: string; unstated: string[] } | null {
  const is = KINDS.filter(([k]) => kinds[k] === true).map(([, l]) => l);
  const unstated = KINDS.filter(([k]) => kinds[k] === null).map(([, l]) =>
    l.toLowerCase(),
  );
  if (unstated.length === KINDS.length) return null;
  const words = is.map((l, i) => (i === 0 ? l : l.toLowerCase())).join(", ");
  return { is: words || "None", unstated };
}

export interface CatalogEntry {
  /** `<source>/<name>`, as in `?netgamut=<key>`. */
  key: string;
  source: string;
  name: string;
  /** Markdown. Empty where the index has no entry for a mirrored network. */
  description: string;
  domains: string[];
  nodes: number;
  links: number;
  directed: boolean;
  /** Per kind: yes, no, or null where the source does not say (or the manifest predates the kinds). */
  kinds: Record<Kind, boolean | null>;
  /** The download: the gzipped Pajek file (format 1), or the Parquet tables (format 2). */
  bytes: number;
  url?: string;
  citations: { text: string; url?: string }[];
  /** How many networks the source lists under this name; the mirror holds one. */
  subgraphCount: number;
  /** The mirror's entry, which the download reads. */
  dataset: NetgamutDataset;
}

export interface Catalog {
  entries: CatalogEntry[];
  /** The index's domain order. */
  domains: string[];
  /** Sources in the index's order, those with a mirrored network only. */
  sources: string[];
  netgamut: string;
  /** When the mirror was built (ISO-8601). */
  built: string;
  /** Datasets the whole catalog lists, copies left out. */
  catalogSize: number;
  /** False when the index failed to load: the entries have no descriptions or domains. */
  described: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  snap: "SNAP",
  netzschleuder: "Netzschleuder",
  konect: "KONECT",
  ogb: "OGB",
  pyg: "PyG",
  paths: "paths",
  ahorn: "AHORN",
};

export const sourceLabel = (source: string): string =>
  SOURCE_LABELS[source] ?? source;

/** The mirrored networks, each described by its index entry. */
export function joinCatalog(
  manifest: NetgamutManifest,
  index: CatalogIndex,
): Catalog {
  const described = new Map(index.datasets.map((d) => [d.key, d]));
  const entries = manifest.datasets.map((dataset): CatalogEntry => {
    const about = described.get(dataset.key);
    const slash = dataset.key.indexOf("/");
    return {
      key: dataset.key,
      source: about?.source ?? dataset.key.slice(0, slash),
      name: about?.name ?? dataset.key.slice(slash + 1),
      description: about?.description ?? "",
      domains: about?.domains ?? [],
      nodes: dataset.nodes,
      links: dataset.links ?? dataset.edges ?? 0,
      directed: dataset.directed,
      kinds: Object.fromEntries(
        KINDS.map(([kind]) => [kind, dataset[kind] ?? null]),
      ) as Record<Kind, boolean | null>,
      bytes: dataset.bytes,
      url: dataset.url || about?.url || undefined,
      citations: dataset.citations?.length
        ? dataset.citations
        : (about?.citations ?? []),
      subgraphCount: about?.subgraph_count ?? 1,
      dataset,
    };
  });
  const mirrored = new Set(entries.map((e) => e.source));
  const sources = index.sources
    .map((s) => s.name)
    .filter((s) => mirrored.has(s));
  for (const s of mirrored) if (!sources.includes(s)) sources.push(s);
  return {
    entries,
    domains: index.domains,
    sources,
    netgamut: manifest.netgamut,
    built: manifest.built,
    catalogSize: index.datasets.filter(
      (d) => !(d as { duplicate_of?: string | null }).duplicate_of,
    ).length,
    described: true,
  };
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/** The mirror's manifest and the catalog index, joined. */
export async function fetchCatalog({
  manifestUrl = NETGAMUT_MIRROR,
  indexUrl = NETGAMUT_CATALOG,
  signal,
}: {
  manifestUrl?: string;
  indexUrl?: string;
  signal?: AbortSignal;
} = {}): Promise<Catalog> {
  const page = globalThis.location?.href;
  const [manifest, index] = await Promise.allSettled([
    fetchJson<NetgamutManifest>(new URL(manifestUrl, page).href, signal),
    fetchJson<CatalogIndex>(new URL(indexUrl, page).href, signal),
  ]);
  if (manifest.status === "rejected")
    throw new Error(
      `Could not load the netgamut mirror's list of networks: ${manifest.reason instanceof Error ? manifest.reason.message : manifest.reason}`,
    );
  // Without the index the networks still open, by name and size, undescribed.
  if (index.status === "rejected")
    return {
      ...joinCatalog(manifest.value, EMPTY_INDEX),
      described: false,
    };
  return joinCatalog(manifest.value, index.value);
}

const EMPTY_INDEX: CatalogIndex = {
  netgamut: "",
  domains: [],
  sources: [],
  datasets: [],
};

/** Node-count bands for the size filter: [label, lowest, highest + 1). */
export const SIZE_BANDS = [
  ["< 100", 0, 100],
  ["100 – 1k", 100, 1_000],
  ["1k – 10k", 1_000, 10_000],
  ["10k – 100k", 10_000, 100_000],
  ["100k – 1M", 100_000, 1_000_000],
  ["≥ 1M", 1_000_000, Number.POSITIVE_INFINITY],
] as const;

export type SizeBand = (typeof SIZE_BANDS)[number][0];

export const sizeBand = (nodes: number): SizeBand =>
  (SIZE_BANDS.find(([, low, high]) => nodes >= low && nodes < high) ??
    SIZE_BANDS[0])[0];

export type Direction = "any" | "directed" | "undirected";

/** A rectangle drawn on the size chart: node and link counts, lowest to highest, both ends included. */
export interface SizeRange {
  nodes: readonly [number, number];
  links: readonly [number, number];
}

export interface CatalogFilters {
  query: string;
  domains: readonly string[];
  sources: readonly string[];
  sizes: readonly SizeBand[];
  direction: Direction;
  /** Kinds a network must all be, as its source says; one the source does not answer leaves it out. */
  kinds: readonly Kind[];
  range: SizeRange | null;
}

export const NO_FILTERS: CatalogFilters = {
  query: "",
  domains: [],
  sources: [],
  sizes: [],
  direction: "any",
  kinds: [],
  range: null,
};

/** Filters set besides the query. */
export const countFilters = (f: CatalogFilters): number =>
  f.domains.length +
  f.sources.length +
  f.sizes.length +
  f.kinds.length +
  (f.direction === "any" ? 0 : 1) +
  (f.range ? 1 : 0);

/** Lower case, with `_` and `-` as spaces: "Les_Miserables" matches "les miserables". */
const fold = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[_-]+/g, " ");

/** The query's words, folded as the searched text is. */
export const queryTerms = (query: string): string[] =>
  fold(query)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);

/** An entry's searchable text, folded once: its name, and its words with a space before each. */
const searchable = new WeakMap<CatalogEntry, { name: string; words: string }>();

function textOf(entry: CatalogEntry): { name: string; words: string } {
  let text = searchable.get(entry);
  if (!text) {
    const name = fold(entry.name);
    const words = ` ${fold(
      // Not the links' addresses: "google" would match every description citing a Google Scholar page.
      `${entry.name} ${entry.description.replace(/\(?(https?:\/\/|www\.)\S+/g, " ")} ${entry.domains.join(" ")} ${sourceLabel(entry.source)}`,
    ).replace(/[^\p{L}\p{N}]+/gu, " ")}`;
    text = { name, words };
    searchable.set(entry, text);
  }
  return text;
}

/**
 * How well `entry` matches the query terms: 0 when some term is missing. A term counts most as the name, then
 * as the start of a word in the name, then inside the name, least as the start of a word in the description,
 * domains or source. The whole query as the name, or its start, ranks first.
 */
export function matchScore(entry: CatalogEntry, terms: string[]): number {
  if (terms.length === 0) return 1;
  const { name, words } = textOf(entry);
  let score = 0;
  for (const t of terms) {
    if (name === t) score += 8;
    else if (name.startsWith(t) || name.includes(` ${t}`)) score += 6;
    else if (name.includes(t)) score += 4;
    else if (words.includes(` ${t}`)) score += 1;
    else return 0;
  }
  const query = terms.join(" ");
  if (name === query) score += 20;
  else if (name.startsWith(query)) score += 8;
  return score;
}

type Facet = "domains" | "sources" | "sizes" | "direction";

function passes(e: CatalogEntry, f: CatalogFilters, skip?: Facet): boolean {
  return (
    (skip === "domains" ||
      f.domains.length === 0 ||
      e.domains.some((d) => f.domains.includes(d))) &&
    (skip === "sources" ||
      f.sources.length === 0 ||
      f.sources.includes(e.source)) &&
    (skip === "sizes" ||
      f.sizes.length === 0 ||
      f.sizes.includes(sizeBand(e.nodes))) &&
    (skip === "direction" ||
      f.direction === "any" ||
      e.directed === (f.direction === "directed")) &&
    f.kinds.every((k) => e.kinds[k] === true) &&
    (f.range === null ||
      (e.nodes >= f.range.nodes[0] &&
        e.nodes <= f.range.nodes[1] &&
        e.links >= f.range.links[0] &&
        e.links <= f.range.links[1]))
  );
}

export type SortKey = "match" | "name" | "nodes" | "links" | "bytes";

export interface CatalogSort {
  key: SortKey;
  descending: boolean;
}

/**
 * The entries that pass every filter, sorted by `sort.key` (ties by name), ascending or descending; "match"
 * ranks by matchScore, best first when ascending.
 */
export function searchCatalog(
  entries: readonly CatalogEntry[],
  filters: CatalogFilters,
  sort: CatalogSort,
): CatalogEntry[] {
  const words = queryTerms(filters.query);
  const scored: [CatalogEntry, number][] = [];
  for (const e of entries) {
    if (!passes(e, filters)) continue;
    const score = matchScore(e, words);
    if (score > 0) scored.push([e, score]);
  }
  const sign = sort.descending ? -1 : 1;
  const byName = (a: CatalogEntry, b: CatalogEntry): number =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
    a.key.localeCompare(b.key);
  // Ascending, then turned for descending: best match first, A to Z, smallest first.
  const ascending = (
    [a, sa]: [CatalogEntry, number],
    [b, sb]: [CatalogEntry, number],
  ): number => {
    switch (sort.key) {
      case "match":
        return sb - sa || byName(a, b);
      case "name":
        return byName(a, b);
      default:
        return a[sort.key] - b[sort.key] || byName(a, b);
    }
  };
  scored.sort((x, y) => sign * ascending(x, y));
  return scored.map(([e]) => e);
}

/**
 * Per facet value, how many entries the other filters and the query leave: what the result count becomes when
 * that value is added (OR within a facet, AND across facets). Kinds AND among themselves too, so a kind counts
 * under every filter, the other kinds included.
 */
export function facetCounts(
  entries: readonly CatalogEntry[],
  filters: CatalogFilters,
): {
  domains: Map<string, number>;
  sources: Map<string, number>;
  sizes: Map<SizeBand, number>;
  direction: Map<Exclude<Direction, "any">, number>;
  kinds: Map<Kind, number>;
} {
  const words = queryTerms(filters.query);
  const matching = entries.filter((e) => matchScore(e, words) > 0);
  const count = <K>(
    facet: Facet | undefined,
    keys: (e: CatalogEntry) => readonly K[],
  ): Map<K, number> => {
    const counts = new Map<K, number>();
    for (const e of matching) {
      if (!passes(e, filters, facet)) continue;
      for (const k of keys(e)) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  };
  return {
    domains: count("domains", (e) => e.domains),
    sources: count("sources", (e) => [e.source]),
    sizes: count("sizes", (e) => [sizeBand(e.nodes)]),
    direction: count("direction", (e) => [
      e.directed ? ("directed" as const) : ("undirected" as const),
    ]),
    kinds: count(undefined, (e) =>
      KINDS.map(([k]) => k).filter((k) => e.kinds[k] === true),
    ),
  };
}

/** TeX commands a description's formulas use, as the characters they stand for. */
const TEX: Record<string, string> = {
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  leftrightarrow: "↔",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  neq: "≠",
  approx: "≈",
  sim: "~",
  times: "×",
  cdot: "·",
  pm: "±",
  in: "∈",
  infty: "∞",
  ldots: "…",
  dots: "…",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  lambda: "λ",
  mu: "μ",
  sigma: "σ",
};

/** An inline formula as plain text: `i \to j` → "i → j", `w_{ij}` → "wij"; other commands keep their name. */
function texText(tex: string): string {
  return tex
    .replace(/\\([a-zA-Z]+)/g, (_, cmd: string) => TEX[cmd] ?? cmd)
    .replace(/[{}_^]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The description as plain text on one line, for a summary the list clamps to its width. Cut at `max`
 * characters: no row shows more.
 */
export function plainSummary(markdown: string, max = 320): string {
  const plain = markdown
    .replace(/\$([^$]+)\$/g, (_, tex: string) => texText(tex))
    .replace(/\[\^[^\]]*\]/g, "") // footnote references
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
    .replace(/\*\*|[*`$]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max
    ? `${plain.slice(0, max - 1).replace(/\s+\S*$/, "")}…`
    : plain;
}

/** A citation for display and copying: TeX's dashes as the characters they stand for ("29--123" → "29–123"). */
export const citationText = (text: string): string =>
  text.replaceAll("---", "\u2014").replaceAll("--", "\u2013");
