/**
 * netgamut (mapequation/netgamut) catalogs network datasets across sources. Their hosts don't let web pages
 * read the files, so `netgamut export-networks` re-hosts them as gzipped Pajek on the `mirror` branch of
 * mapequation/netgamut-networks, listed in an index.json manifest. raw.githubusercontent.com serves them
 * with CORS but without a Content-Encoding: the browser gunzips them.
 */
export const NETGAMUT_MIRROR: string =
  import.meta.env.VITE_NETGAMUT_MIRROR ||
  "https://raw.githubusercontent.com/mapequation/netgamut-networks/mirror/index.json";

export interface NetgamutDataset {
  /** `<source>/<name>`, as in `?netgamut=<key>`. */
  key: string;
  title: string;
  /** The gzipped Pajek file, relative to the manifest URL. */
  file: string;
  /** Size of the gzipped file. */
  bytes: number;
  nodes: number;
  edges: number;
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
  /** The netgamut version that built the mirror. */
  netgamut: string;
  /** ISO-8601 build time. */
  built: string;
  bytes: number;
  datasets: NetgamutDataset[];
  /** Catalog datasets the mirror left out, and why. */
  skipped?: { key: string; reason: string }[];
}

export interface NetgamutNetwork {
  dataset: NetgamutDataset;
  /** A file name for the loader: the dataset title, as a Pajek file. */
  name: string;
  text: string;
}

/** The dataset `key` names in `manifest`; an error that says why when it has none. */
export function findDataset(
  manifest: NetgamutManifest,
  key: string,
): NetgamutDataset {
  const dataset = manifest.datasets.find((d) => d.key === key);
  if (dataset) return dataset;
  const skipped = manifest.skipped?.find((s) => s.key === key);
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

/** Download `dataset`, listed in the manifest at `manifestUrl`, gunzipped. */
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
  const url = new URL(dataset.file, base).href;
  const label = `Downloading ${dataset.title} (${megabytes(dataset.bytes)})…`;
  onPhase?.(label);
  onProgress?.(0, dataset.bytes);
  let percent = 0;
  try {
    const res = await fetchOk(url, signal);
    if (!res.body) throw new Error("empty response");
    const text = await gunzipText(res.body, (read) => {
      const p = Math.min(100, Math.floor((100 * read) / dataset.bytes));
      if (p === percent) return;
      percent = p;
      onPhase?.(`${label} ${p}%`);
      onProgress?.(read, dataset.bytes);
    });
    return {
      dataset,
      name: `${dataset.title.replace(/[/\\]/g, "_")}.net`,
      text,
    };
  } catch (err) {
    throw new Error(
      `Could not load ${dataset.title} from ${url}: ${reason(err)}`,
    );
  }
}
