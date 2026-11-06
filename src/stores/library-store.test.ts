import { afterEach, describe, expect, it, vi } from "vitest";
import { NETGAMUT_MIRROR, type NetgamutManifest } from "../lib/netgamut";
import { ClusterStore } from "./cluster-store";
import { LibraryStore, originOf } from "./library-store";
import { NetworkStore } from "./network-store";
import { UiStore } from "./ui-store";

const PAJEK = `*Vertices 3
1 "a"
2 "b"
3 "c"
*Edges
1 2
2 3
`;

const DATASET = {
  key: "netzschleuder/tiny",
  title: "tiny",
  file: "netzschleuder/tiny.net.gz",
  bytes: 0,
  nodes: 3,
  edges: 2,
  directed: false,
  url: "https://example.org/tiny",
  citations: [{ text: "T. Iny, A tiny network (2001)" }],
};

const gzip = async (text: string): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(
    await new Response(
      new Blob([text]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );

function stores() {
  const network = new NetworkStore();
  const ui = new UiStore();
  const cluster = new ClusterStore(network, ui);
  return {
    network,
    ui,
    cluster,
    library: new LibraryStore(network, ui, cluster),
  };
}

describe("LibraryStore", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ranks by match only while there is a query", () => {
    const { library } = stores();
    expect(library.activeSort).toEqual({ key: "name", descending: false });
    library.setQuery("karate");
    expect(library.activeSort.key).toBe("match");
    library.setSort({ key: "nodes", descending: true });
    library.setQuery("");
    expect(library.activeSort).toEqual({ key: "nodes", descending: true });
  });

  it("keeps one sort direction for every key", () => {
    const { library } = stores();
    library.setSort({ ...library.sort, descending: true });
    library.setSort({ ...library.sort, key: "nodes" });
    expect(library.activeSort).toEqual({ key: "nodes", descending: true });
    library.setSort({ ...library.sort, descending: false });
    library.setSort({ ...library.sort, key: "bytes" });
    expect(library.activeSort).toEqual({ key: "bytes", descending: false });
    // Without a query, Best match is by name, in the same direction.
    library.setSort({ key: "match", descending: true });
    expect(library.activeSort).toEqual({ key: "name", descending: true });
  });

  it("toggles facet values and keeps the query when clearing filters", () => {
    const { library } = stores();
    library.setQuery("web");
    library.toggleDomain("Social");
    library.toggleSize("< 100");
    library.toggleDomain("Social");
    expect(library.filters.domains).toEqual([]);
    expect(library.filters.sizes).toEqual(["< 100"]);
    library.setDirection("directed");
    library.clearFilters();
    expect(library.filters).toMatchObject({
      query: "web",
      sizes: [],
      direction: "any",
    });
  });

  it("opens the dialog on a tab, or where it was left", () => {
    const { library, ui } = stores();
    ui.setLoadOpen(false);
    library.open("files");
    expect(ui.loadOpen).toBe(true);
    expect(library.tab).toBe("files");
    library.browse("snap/web-Google");
    expect(library.tab).toBe("browse");
    expect(library.selectedKey).toBe("snap/web-Google");
  });

  it("loads a catalog network raw, with where it came from", async () => {
    const gz = await gzip(PAJEK);
    const manifest: NetgamutManifest = {
      netgamut: "0.3.0",
      built: "2026-11-04T00:00:00Z",
      bytes: gz.length,
      datasets: [{ ...DATASET, bytes: gz.length }],
    };
    const file = new URL(DATASET.file, NETGAMUT_MIRROR).href;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === NETGAMUT_MIRROR
          ? new Response(JSON.stringify(manifest))
          : url === file
            ? new Response(gz)
            : new Response("", { status: 404 }),
      ),
    );
    const { library, network, ui } = stores();
    await library.loadNetgamut(DATASET.key);
    expect(ui.loadError).toBeNull();
    expect(library.download).toBeNull();
    expect(network.current?.kind).toBe("raw");
    expect(network.current?.stats.nodes).toBe(3);
    expect(network.current?.origin).toEqual(originOf(manifest.datasets[0]));
    expect(network.current?.origin).toMatchObject({
      source: "netzschleuder",
      name: "tiny",
      url: "https://example.org/tiny",
    });
  });

  it("loads a catalog network without Infomap when asked", async () => {
    const gz = await gzip(PAJEK);
    const manifest: NetgamutManifest = {
      netgamut: "0.3.0",
      built: "2026-11-04T00:00:00Z",
      bytes: gz.length,
      datasets: [{ ...DATASET, bytes: gz.length }],
    };
    const file = new URL(DATASET.file, NETGAMUT_MIRROR).href;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === NETGAMUT_MIRROR
          ? new Response(JSON.stringify(manifest))
          : url === file
            ? new Response(gz)
            : new Response("", { status: 404 }),
      ),
    );
    const { library, network, cluster } = stores();
    await library.loadNetgamut(DATASET.key, { noInfomap: true });
    expect(network.current?.loadOptions?.noInfomap).toBe(true);
    expect(network.current?.modules).toBeUndefined();
    expect(cluster.running).toBe(false);
  });

  it("keeps what is loaded when a download is cancelled", async () => {
    let release: () => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            release = () => reject(new Error("never"));
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const { library, network, ui } = stores();
    const load = library.loadNetgamut(DATASET.key);
    expect(library.download?.key).toBe(DATASET.key);
    library.cancelDownload();
    await load;
    release();
    expect(library.download).toBeNull();
    expect(ui.viewPhase).toBeNull();
    expect(ui.loadError).toBeNull();
    expect(network.current).toBeNull();
  });

  it("says why a load failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503, statusText: "Busy" })),
    );
    const { library, ui } = stores();
    await library.loadNetgamut(DATASET.key);
    expect(ui.loadError).toMatch(/netgamut mirror manifest.*503/);
    expect(library.download).toBeNull();
    expect(ui.viewPhase).toBeNull();
  });
});
