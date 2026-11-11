import type { FileKind } from "./file-kinds";
import type { NamedText } from "./load-files";

/**
 * netgamut (mapequation/netgamut) catalogs network datasets across sources. Their hosts don't let web pages
 * read the files, so `netgamut export-networks` re-hosts them on the `mirror` branch of
 * mapequation/netgamut-networks, listed in an index.json manifest. Format 1 writes gzipped Pajek, which
 * raw.githubusercontent.com serves with CORS but without a Content-Encoding: the browser gunzips it.
 * Format 2 writes a links table and, where the source has one, a nodes table in Parquet per network
 * (`files`), as netgamut's docs/guide/operations.md, "The mirror's files", describes.
 */
export const NETGAMUT_MIRROR: string =
  import.meta.env.VITE_NETGAMUT_MIRROR ||
  "https://raw.githubusercontent.com/mapequation/netgamut-networks/mirror/index.json";

export interface NetgamutDataset {
  /** `<source>/<name>`, as in `?netgamut=<key>`. */
  key: string;
  title: string;
  /** Format 1: the gzipped Pajek file, relative to the manifest URL. */
  file?: string;
  /**
   * Format 2: the links table and, where the source has a node table, the nodes table, in Parquet,
   * relative to the manifest URL.
   */
  files?: { links: string; nodes?: string };
  /** Size of the file (format 1) or of both files (format 2). */
  bytes: number;
  /** Distinct node ids (format 2: across both files). */
  nodes: number;
  /** Format 1: the links in the Pajek file. */
  edges?: number;
  /** Format 2: the rows in the links table. */
  links?: number;
  /** Format 2: the layers, where the network has them. */
  layers?: number;
  /** Format 2: free-text columns left out of the tables. */
  dropped?: { nodes?: string[]; links?: string[] };
  /** Format 2: a note on the network, such as why one tagged multilayer has no layers. */
  note?: string;
  directed: boolean;
  /** The source's page for the dataset. */
  url?: string;
  citations?: { text: string; url?: string }[];
  fingerprint?: string;
  /**
   * The kinds of network, as the source's own catalog says: yes, no, or null where it does not say. A
   * manifest built before netgamut added them has none. They describe the source's dataset, not the file:
   * a multilayer dataset can reach the mirror with its layers merged (mapequation/netgamut#28).
   */
  weighted?: boolean | null;
  bipartite?: boolean | null;
  temporal?: boolean | null;
  multilayer?: boolean | null;
  signed?: boolean | null;
  multigraph?: boolean | null;
}

export interface NetgamutManifest {
  /** 2: Parquet tables per network (`files`); missing: format 1, gzipped Pajek (`file`). */
  format?: number;
  /** The netgamut version that built the mirror. */
  netgamut: string;
  /** ISO-8601 build time. */
  built: string;
  bytes: number;
  datasets: NetgamutDataset[];
  /** Catalog datasets the mirror left out, and why. */
  skipped?: { key: string; reason: string }[];
  /** Catalog datasets the export failed on, and why. */
  failed?: { key: string; reason: string }[];
}

export interface NetgamutNetwork {
  dataset: NetgamutDataset;
  /**
   * The files for the loader: a Pajek file named by the dataset title (format 1), or the links table and the
   * nodes table, as bytes (format 2).
   */
  files: NamedText[];
}

/** The dataset `key` names in `manifest`; an error that says why when it has none. */
export function findDataset(
  manifest: NetgamutManifest,
  key: string,
): NetgamutDataset {
  const dataset = manifest.datasets.find((d) => d.key === key);
  if (dataset) return dataset;
  const skipped = [
    ...(manifest.skipped ?? []),
    ...(manifest.failed ?? []),
  ].find((s) => s.key === key);
  throw new Error(
    skipped
      ? `The netgamut mirror leaves out "${key}": ${skipped.reason}`
      : `No network "${key}" in the netgamut mirror`,
  );
}

/**
 * Gunzip a byte stream into text as it arrives. Bytes without the gzip magic number pass through as text:
 * a server that sends the file with `Content-Encoding: gzip` (Vite's dev server does, for .gz) has the
 * browser gunzip it already. `onBytes` gets the count of bytes read so far, once per chunk.
 */
export async function gunzipText(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  onBytes?: (read: number) => void,
): Promise<string> {
  const reader = body.getReader();
  let head: ReadableStreamReadResult<Uint8Array<ArrayBuffer>> | undefined =
    await reader.read();
  const gzipped =
    !head.done && head.value[0] === 0x1f && head.value[1] === 0x8b;
  let read = 0;
  const counted = new ReadableStream<Uint8Array<ArrayBuffer>>({
    async pull(controller) {
      const { done, value } = head ?? (await reader.read());
      head = undefined;
      if (done) {
        controller.close();
        return;
      }
      read += value.byteLength;
      onBytes?.(read);
      controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  // Read the stream here, not with Response.text(): that turns a gunzip error into "Failed to fetch".
  const text = (
    gzipped ? counted.pipeThrough(new DecompressionStream("gzip")) : counted
  )
    .pipeThrough(new TextDecoderStream())
    .getReader();
  const parts: string[] = [];
  for (let r = await text.read(); !r.done; r = await text.read())
    parts.push(r.value);
  return parts.join("");
}

const megabytes = (bytes: number): string =>
  bytes < 1e6
    ? `${Math.ceil(bytes / 1e3)} kB`
    : `${Math.round(bytes / 1e6)} MB`;

async function fetchOk(url: string, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());
  return res;
}

const reason = (err: unknown): string =>
  err instanceof Error ? err.message || err.name : String(err);

export interface FetchOptions {
  manifestUrl?: string;
  signal?: AbortSignal;
  /** What the download is doing, with its percentage, each time that changes. */
  onPhase?: (phase: string) => void;
  /**
   * Bytes of the gzipped file read so far, of `total`, each time the percentage changes; null while it looks
   * the network up.
   */
  onProgress?: (read: number | null, total: number) => void;
}

/** Fetch the dataset `key` from the netgamut mirror, gunzipped. */
export async function fetchNetgamut(
  key: string,
  options: FetchOptions = {},
): Promise<NetgamutNetwork> {
  const {
    manifestUrl = NETGAMUT_MIRROR,
    signal,
    onPhase,
    onProgress,
  } = options;
  // A relative URL (VITE_NETGAMUT_MIRROR on the dev server) resolves against the page.
  const base = new URL(manifestUrl, globalThis.location?.href);
  onPhase?.("Looking up the network in the netgamut mirror…");
  onProgress?.(null, 0);
  let manifest: NetgamutManifest;
  try {
    manifest = await (await fetchOk(base.href, signal)).json();
  } catch (err) {
    throw new Error(
      `Could not load the netgamut mirror manifest ${base.href}: ${reason(err)}`,
    );
  }
  return downloadDataset(findDataset(manifest, key), options);
}

/** Download `dataset`, listed in the manifest at `manifestUrl`: gunzipped (format 1), or its tables (format 2). */
export async function downloadDataset(
  dataset: NetgamutDataset,
  {
    manifestUrl = NETGAMUT_MIRROR,
    signal,
    onPhase,
    onProgress,
  }: FetchOptions = {},
): Promise<NetgamutNetwork> {
  const base = new URL(manifestUrl, globalThis.location?.href);
  const label = `Downloading ${dataset.title} (${megabytes(dataset.bytes)})…`;
  onPhase?.(label);
  onProgress?.(0, dataset.bytes);
  let percent = 0;
  // Bytes read of every file so far.
  let done = 0;
  const progress = (read: number): void => {
    const total = done + read;
    const p = Math.min(100, Math.floor((100 * total) / dataset.bytes));
    if (p === percent) return;
    percent = p;
    onPhase?.(`${label} ${p}%`);
    onProgress?.(total, dataset.bytes);
  };
  const urlOf = (file: string): string => new URL(file, base).href;
  let url = "";
  try {
    if (dataset.files) {
      const { links, nodes } = dataset.files;
      const files: NamedText[] = [];
      const tables: [string, FileKind][] = [[links, "links"]];
      if (nodes) tables.push([nodes, "nodes"]);
      for (const [path, kind] of tables) {
        url = urlOf(path);
        const res = await fetchOk(url, signal);
        const bytes = await readBytes(res, progress);
        done += bytes.byteLength;
        files.push({
          name: path.split("/").pop() ?? path,
          text: "",
          bytes,
          size: bytes.byteLength,
          kind,
        });
      }
      return { dataset, files };
    }
    if (!dataset.file)
      throw new Error("the mirror lists no file for it (file or files)");
    url = urlOf(dataset.file);
    const res = await fetchOk(url, signal);
    if (!res.body) throw new Error("empty response");
    const text = await gunzipText(res.body, progress);
    return {
      dataset,
      files: [
        {
          name: `${dataset.title.replace(/[/\\]/g, "_")}.net`,
          text,
          kind: "network",
        },
      ],
    };
  } catch (err) {
    throw new Error(
      `Could not load ${dataset.title}${url ? ` from ${url}` : ""}: ${reason(err)}`,
    );
  }
}

/** A response's bytes, with the count read so far once per chunk. */
async function readBytes(
  res: Response,
  onBytes: (read: number) => void,
): Promise<Uint8Array> {
  if (!res.body) throw new Error("empty response");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    chunks.push(r.value);
    read += r.value.byteLength;
    onBytes(read);
  }
  const out = new Uint8Array(read);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}
