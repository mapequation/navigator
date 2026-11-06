import { afterEach, describe, expect, it, vi } from "vitest";
import type { NetgamutDataset, NetgamutManifest } from "./netgamut";
import {
  type CatalogIndex,
  facetCounts,
  fetchCatalog,
  joinCatalog,
  NO_FILTERS,
  plainSummary,
  searchCatalog,
  sizeBand,
} from "./netgamut-catalog";

const dataset = (
  key: string,
  nodes: number,
  edges: number,
  directed = false,
): NetgamutDataset => ({
  key,
  title: key.split("/")[1],
  file: `${key}.net.gz`,
  bytes: edges * 10,
  nodes,
  edges,
  directed,
  url: `https://example.org/${key}`,
  citations: [],
});

const MANIFEST: NetgamutManifest = {
  netgamut: "0.3.0",
  built: "2026-11-04T12:00:00Z",
  bytes: 0,
  datasets: [
    dataset("netzschleuder/karate", 34, 77),
    dataset("netzschleuder/polblogs", 1224, 19090, true),
    dataset("snap/web-Google", 875713, 5105039, true),
    dataset("snap/unindexed", 50, 60),
  ],
};

const about = (
  key: string,
  domains: string[],
  description: string,
  nodes: number,
) => ({
  key,
  source: key.split("/")[0],
  name: key.split("/")[1],
  domains,
  description,
  citations: [{ text: `${key} et al.` }],
  url: "",
  subgraph_count: 1,
  nodes,
});

const INDEX: CatalogIndex = {
  netgamut: "0.3.0",
  domains: ["Social", "Informational"],
  sources: [
    { name: "snap", summary: "", retrieved: "" },
    { name: "netzschleuder", summary: "", retrieved: "" },
    { name: "konect", summary: "", retrieved: "" },
  ],
  datasets: [
    about(
      "netzschleuder/karate",
      ["Social"],
      "Social ties among the 34 members of a **karate club**.",
      // The index's own count; the mirror's file says 34.
      35,
    ),
    about(
      "netzschleuder/polblogs",
      ["Informational"],
      "Hyperlinks among weblogs on U.S. politics.",
      1224,
    ),
    about("snap/web-Google", ["Informational"], "Web graph from Google", 1),
    about("konect/elsewhere", ["Social"], "Not mirrored", 10),
  ],
};

const catalog = joinCatalog(MANIFEST, INDEX);

describe("joinCatalog", () => {
  it("lists the mirrored networks with the mirror's figures and the index's descriptions", () => {
    expect(catalog.entries.map((e) => e.key)).toEqual(
      MANIFEST.datasets.map((d) => d.key),
    );
    const karate = catalog.entries[0];
    expect(karate.nodes).toBe(34);
    expect(karate.domains).toEqual(["Social"]);
    expect(karate.description).toContain("karate club");
    expect(karate.citations).toEqual([{ text: "netzschleuder/karate et al." }]);
    expect(karate.url).toBe("https://example.org/netzschleuder/karate");
  });

  it("keeps a network the index does not describe, named by its key", () => {
    const e = catalog.entries[3];
    expect(e).toMatchObject({
      source: "snap",
      name: "unindexed",
      description: "",
      domains: [],
    });
  });

  it("orders sources as the index does, mirrored ones only", () => {
    expect(catalog.sources).toEqual(["snap", "netzschleuder"]);
    expect(catalog.catalogSize).toBe(4);
    expect(catalog.described).toBe(true);
  });
});

describe("searchCatalog", () => {
  const byName = { key: "name", descending: false } as const;
  const keys = (
    f = NO_FILTERS,
    sort: Parameters<typeof searchCatalog>[2] = byName,
  ) => searchCatalog(catalog.entries, f, sort).map((e) => e.key);

  it("needs every query term, in the name or the description", () => {
    expect(keys({ ...NO_FILTERS, query: "karate club" })).toEqual([
      "netzschleuder/karate",
    ]);
    expect(keys({ ...NO_FILTERS, query: "karate google" })).toEqual([]);
    // `_`, `-` and case are folded: "web google" finds web-Google.
    expect(keys({ ...NO_FILTERS, query: "WEB google" })).toEqual([
      "snap/web-Google",
    ]);
  });

  it("ranks name matches above description matches", () => {
    const sort = { key: "match", descending: false } as const;
    // "web" is web-Google's name and in polblogs' description ("weblogs").
    expect(keys({ ...NO_FILTERS, query: "web" }, sort)).toEqual([
      "snap/web-Google",
      "netzschleuder/polblogs",
    ]);
  });

  it("puts the whole query as the name first, and needs words to start in descriptions", () => {
    const twins = joinCatalog(
      {
        ...MANIFEST,
        datasets: [
          dataset("netzschleuder/google_web", 10, 10),
          dataset("snap/web-Google", 10, 10),
          dataset("netzschleuder/frogs", 10, 10),
        ],
      },
      {
        ...INDEX,
        datasets: [
          about(
            "netzschleuder/frogs",
            [],
            "Webbed feet, as seen on Google. [Notes](https://scholar.google.com/oogle).",
            10,
          ),
        ],
      },
    );
    const sort = { key: "match", descending: false } as const;
    const ranked = (query: string) =>
      searchCatalog(twins.entries, { ...NO_FILTERS, query }, sort).map(
        (e) => e.name,
      );
    expect(ranked("web-Google")).toEqual(["web-Google", "google_web", "frogs"]);
    // "oogle" starts no word, and a link's address is not searched: only the names hold it.
    expect(ranked("oogle")).toEqual(["google_web", "web-Google"]);
    expect(ranked("scholar")).toEqual([]);
  });

  it("ORs values within a facet and ANDs facets", () => {
    const f = {
      ...NO_FILTERS,
      domains: ["Social", "Informational"],
      direction: "directed" as const,
    };
    expect(keys(f)).toEqual(["netzschleuder/polblogs", "snap/web-Google"]);
    expect(keys({ ...NO_FILTERS, sizes: ["< 100"] })).toEqual([
      "netzschleuder/karate",
      "snap/unindexed",
    ]);
  });

  it("keeps the networks inside a size range, ends included", () => {
    const range = { nodes: [34, 1224], links: [77, 19090] } as const;
    expect(keys({ ...NO_FILTERS, range })).toEqual([
      "netzschleuder/karate",
      "netzschleuder/polblogs",
    ]);
  });

  it("turns every order for descending, Best match too", () => {
    const sort = { key: "match", descending: true } as const;
    expect(keys({ ...NO_FILTERS, query: "web" }, sort)).toEqual([
      "netzschleuder/polblogs",
      "snap/web-Google",
    ]);
    expect(keys(NO_FILTERS, { key: "name", descending: true })[0]).toBe(
      "snap/web-Google",
    );
  });

  it("sorts by a figure, either way, ties by name", () => {
    expect(keys(NO_FILTERS, { key: "nodes", descending: true })[0]).toBe(
      "snap/web-Google",
    );
    expect(keys(NO_FILTERS, { key: "links", descending: false })[0]).toBe(
      "snap/unindexed",
    );
  });
});

describe("facetCounts", () => {
  it("counts each value under the other filters and the query, not its own facet", () => {
    const counts = facetCounts(catalog.entries, {
      ...NO_FILTERS,
      domains: ["Social"],
    });
    // Domains ignore the domain filter itself...
    expect(counts.domains.get("Informational")).toBe(2);
    expect(counts.domains.get("Social")).toBe(1);
    // ...the other facets apply it.
    expect(counts.direction.get("directed")).toBeUndefined();
    expect(counts.direction.get("undirected")).toBe(1);
    expect(counts.sources.get("netzschleuder")).toBe(1);
  });
});

describe("sizeBand", () => {
  it("puts each node count in one band", () => {
    expect(sizeBand(0)).toBe("< 100");
    expect(sizeBand(99)).toBe("< 100");
    expect(sizeBand(100)).toBe("100 – 1k");
    expect(sizeBand(999_999)).toBe("100k – 1M");
    expect(sizeBand(5_000_000)).toBe("≥ 1M");
  });
});

describe("plainSummary", () => {
  it("drops Markdown and HTML, keeps the words", () => {
    expect(
      plainSummary(
        "A **bold** [link](https://x.org) with `code`,\n\n- a list<br/> and $x$[^1].",
      ),
    ).toBe("A bold link with code, - a list and x.");
  });

  it("writes formulas as text", () => {
    expect(plainSummary("A link $i \\to j$ weighs $w_{ij} \\geq 0$.")).toBe(
      "A link i → j weighs wij ≥ 0.",
    );
  });

  it("cuts at a word to the limit", () => {
    const s = plainSummary("one two three four five", 12);
    expect(s).toBe("one two…");
  });
});

describe("fetchCatalog", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (byUrl: Record<string, unknown>) =>
    vi.fn(async (url: string) =>
      url in byUrl
        ? new Response(JSON.stringify(byUrl[url]))
        : new Response("", { status: 404, statusText: "Not Found" }),
    );

  it("joins the manifest and the index", async () => {
    vi.stubGlobal(
      "fetch",
      respond({
        "https://m.example/index.json": MANIFEST,
        "https://c.example/catalog.json": INDEX,
      }),
    );
    const c = await fetchCatalog({
      manifestUrl: "https://m.example/index.json",
      indexUrl: "https://c.example/catalog.json",
    });
    expect(c.entries).toHaveLength(4);
    expect(c.described).toBe(true);
  });

  it("opens the mirror undescribed when the index fails", async () => {
    vi.stubGlobal(
      "fetch",
      respond({ "https://m.example/index.json": MANIFEST }),
    );
    const c = await fetchCatalog({
      manifestUrl: "https://m.example/index.json",
      indexUrl: "https://c.example/catalog.json",
    });
    expect(c.described).toBe(false);
    expect(c.entries[0].description).toBe("");
  });

  it("fails without the manifest", async () => {
    vi.stubGlobal(
      "fetch",
      respond({ "https://c.example/catalog.json": INDEX }),
    );
    await expect(
      fetchCatalog({
        manifestUrl: "https://m.example/index.json",
        indexUrl: "https://c.example/catalog.json",
      }),
    ).rejects.toThrow(/mirror's list of networks.*404/);
  });
});
