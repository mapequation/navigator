import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
    expect(net.name).toBe("ambassador.net");
    expect(net.text).toBe(PAJEK);
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
