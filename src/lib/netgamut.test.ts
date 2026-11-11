import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFiles } from "./load-files";
import {
  type FetchOptions,
  fetchNetgamut,
  findDataset,
  gunzipText,
  type NetgamutManifest,
} from "./netgamut";

const MANIFEST_URL = "https://mirror.example.org/networks/index.json";

const PAJEK = `# ambassador
# Source: https://example.org/ambassador
*Vertices 3
1 "Sävström"
2 "b"
3 "c"
*Edges
1 2
2 3 2.5
`;

const MANIFEST: NetgamutManifest = {
  netgamut: "0.4.0",
  built: "2026-11-01T12:00:00Z",
  bytes: 382,
  datasets: [
    {
      key: "netzschleuder/ambassador",
      title: "ambassador",
      file: "netzschleuder/ambassador.net.gz",
      bytes: 382,
      nodes: 3,
      edges: 2,
      directed: false,
      url: "https://example.org/ambassador",
      citations: [{ text: "A. Uthor, The ambassadors (2001)" }],
      fingerprint: "abc",
    },
  ],
  skipped: [{ key: "konect/huge", reason: "larger than 95 MB gzipped" }],
};

const gzip = async (text: string): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(
    await new Response(
      new Blob([text]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );

/** A stream of `bytes` in chunks of `size`. */
const chunked = (
  bytes: Uint8Array<ArrayBuffer>,
  size: number,
): ReadableStream<Uint8Array<ArrayBuffer>> =>
  new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size)
        controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });

describe("findDataset", () => {
  it("finds the dataset by its key", () => {
    expect(findDataset(MANIFEST, "netzschleuder/ambassador")).toBe(
      MANIFEST.datasets[0],
    );
  });

  it("says why the mirror skipped a dataset", () => {
    expect(() => findDataset(MANIFEST, "konect/huge")).toThrow(
      'The netgamut mirror leaves out "konect/huge": larger than 95 MB gzipped',
    );
  });

  it("rejects a key the mirror doesn't list", () => {
    expect(() => findDataset(MANIFEST, "snap/nope")).toThrow(
      'No network "snap/nope" in the netgamut mirror',
    );
  });
});

describe("gunzipText", () => {
  it("round-trips gzipped text, counting the compressed bytes", async () => {
    const gz = await gzip(PAJEK);
    const counts: number[] = [];
    const text = await gunzipText(chunked(gz, 16), (read) => counts.push(read));
    expect(text).toBe(PAJEK);
    expect(counts.length).toBe(Math.ceil(gz.length / 16));
    expect(counts.at(-1)).toBe(gz.length);
  });

  it("passes text through that the browser gunzipped already", async () => {
    const plain = new Uint8Array(new TextEncoder().encode(PAJEK));
    expect(await gunzipText(chunked(plain, 16))).toBe(PAJEK);
  });

  it("rejects corrupt gzip", async () => {
    const gz = await gzip(PAJEK);
    gz.fill(0, 10, 30);
    // Chrome says why ("The compressed data was not valid: …"); Node's message is empty.
    await expect(gunzipText(chunked(gz, 16))).rejects.toThrow(TypeError);
  });
});

describe("fetchNetgamut", () => {
  afterEach(() => vi.unstubAllGlobals());

  const serve = (files: Record<string, BodyInit>) => {
    const fetch = vi.fn(async (url: string) =>
      url in files
        ? new Response(files[url])
        : new Response("", { status: 404, statusText: "Not Found" }),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  };

  it("fetches the file next to the manifest and gunzips it", async () => {
    const gz = await gzip(PAJEK);
    const [entry] = MANIFEST.datasets;
    const manifest = {
      ...MANIFEST,
      datasets: [{ ...entry, bytes: gz.length }],
    };
    const fetch = serve({
      [MANIFEST_URL]: JSON.stringify(manifest),
      "https://mirror.example.org/networks/netzschleuder/ambassador.net.gz": gz,
    });
    const phases: string[] = [];
    const net = await fetchNetgamut("netzschleuder/ambassador", {
      manifestUrl: MANIFEST_URL,
      onPhase: (p) => phases.push(p),
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(net.dataset.title).toBe("ambassador");
    expect(net.files).toEqual([
      { name: "ambassador.net", text: PAJEK, kind: "network" },
    ]);
    expect(phases.at(-1)).toBe("Downloading ambassador (1 kB)… 100%");
  });

  it("says which network failed to load", async () => {
    serve({ [MANIFEST_URL]: JSON.stringify(MANIFEST) });
    await expect(
      fetchNetgamut("netzschleuder/ambassador", { manifestUrl: MANIFEST_URL }),
    ).rejects.toThrow(
      "Could not load ambassador from https://mirror.example.org/networks/netzschleuder/ambassador.net.gz: 404 Not Found",
    );
  });

  it("says when the manifest can't be read", async () => {
    serve({});
    await expect(
      fetchNetgamut("netzschleuder/ambassador", { manifestUrl: MANIFEST_URL }),
    ).rejects.toThrow(
      `Could not load the netgamut mirror manifest ${MANIFEST_URL}: 404 Not Found`,
    );
  });
});

/**
 * Format 2: the small tables scripts/parquet-fixtures.py writes, served as a mirror whose index.json lists
 * them.
 */
describe("the mirror's format 2", () => {
  afterEach(() => vi.unstubAllGlobals());

  const ROOT = new URL("./__fixtures__/", import.meta.url);
  const MIRROR = "https://mirror.example.org/networks/";
  const options = { directed: false, twoLevel: false, noInfomap: true };
  const size = (file: string): number =>
    readFileSync(new URL(file, ROOT)).byteLength;
  const MANIFEST: NetgamutManifest = {
    format: 2,
    netgamut: "test",
    built: "2026-11-11T00:00:00+00:00",
    bytes: 0,
    datasets: [
      {
        key: "test/toy",
        title: "toy",
        files: { links: "toy.links.parquet", nodes: "toy.nodes.parquet" },
        bytes: size("toy.links.parquet") + size("toy.nodes.parquet"),
        nodes: 8,
        links: 8,
        directed: false,
      },
      {
        key: "test/wide",
        title: "wide",
        files: { links: "wide.links.parquet" },
        bytes: size("wide.links.parquet"),
        nodes: 3,
        directed: true,
        note: "A links table with no nodes table",
      },
    ],
    failed: [{ key: "test/broken", reason: "the source's file is empty" }],
  };

  /** Serve the mirror; return the fetched paths. */
  const serveMirror = (): string[] => {
    const fetched: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = url.slice(MIRROR.length);
        fetched.push(path);
        return path === "index.json"
          ? Response.json(MANIFEST)
          : new Response(readFileSync(new URL(path, ROOT)));
      }),
    );
    return fetched;
  };

  const load = async (key: string, onProgress?: FetchOptions["onProgress"]) => {
    const { dataset, files } = await fetchNetgamut(key, {
      manifestUrl: `${MIRROR}index.json`,
      onProgress,
    });
    return {
      dataset,
      files,
      net: await loadFiles(files, { ...options, directed: dataset.directed }),
    };
  };

  it("downloads a network's links and nodes tables, counting both in the progress", async () => {
    const fetched = serveMirror();
    const read: (number | null)[] = [];
    const { files, net } = await load("test/toy", (r) => read.push(r));
    expect(fetched).toEqual([
      "index.json",
      "toy.links.parquet",
      "toy.nodes.parquet",
    ]);
    expect(read.at(-1)).toBe(MANIFEST.datasets[0].bytes);
    expect(files.map((f) => [f.name, f.kind])).toEqual([
      ["toy.links.parquet", "links"],
      ["toy.nodes.parquet", "nodes"],
    ]);
    expect(net.graph.nodeCount).toBe(8);
    expect(net.graph.source.length).toBe(8);
    expect(net.nodeColumns?.map((c) => c.name)).toEqual([
      "group",
      "size",
      "score",
    ]);
  });

  it("reads a links table alone, directed as the entry says, with its note", async () => {
    const fetched = serveMirror();
    const { dataset, net } = await load("test/wide");
    expect(fetched).toEqual(["index.json", "wide.links.parquet"]);
    expect(dataset.note).toBe("A links table with no nodes table");
    // The file's own metadata says undirected; the entry decides.
    expect(net.directed).toBe(true);
    expect(net.nodeColumns).toBeUndefined();
  });

  it("says why the export failed on a network", () => {
    expect(() => findDataset(MANIFEST, "test/broken")).toThrow(
      /leaves out "test\/broken": the source's file is empty/,
    );
  });
});
