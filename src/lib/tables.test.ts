import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tableFileKind } from "./file-kinds";
import { loadFiles, type NamedText } from "./load-files";
import {
  parquetColumns,
  readDelimited,
  readParquet,
  splitDelimited,
  tablesToNetwork,
  typeColumn,
} from "./tables";

const bytesOf = (name: string): Uint8Array =>
  new Uint8Array(
    readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)),
  );

const fixture = (name: string): NamedText => {
  const bytes = new Uint8Array(
    readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)),
  );
  return {
    name,
    text: "",
    bytes,
    kind: tableFileKind(name, () => parquetColumns(bytes)),
  };
};

const OPTIONS = { directed: false, twoLevel: false, noInfomap: true };

describe("splitDelimited", () => {
  it("reads quoted fields with delimiters, quotes and line breaks", () => {
    expect(
      splitDelimited('﻿a,b\n"x, y","say ""hi"""\r\n\n"two\nlines",3\n', ","),
    ).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["two\nlines", "3"],
    ]);
  });
});

describe("typeColumn", () => {
  it("types numbers, with empty fields missing", () => {
    const c = typeColumn(["1", "", "2.5", "-3e2"]);
    expect(c).toEqual({
      type: "number",
      values: Float64Array.from([1, Number.NaN, 2.5, -300]),
    });
  });
  it("keeps text, with empty fields missing", () => {
    expect(typeColumn(["a", "", "1"])).toEqual({
      type: "string",
      values: ["a", null, "1"],
    });
  });
  it("keeps integers that Number would change as text", () => {
    expect(typeColumn(["007", "7"]).type).toBe("string");
    expect(typeColumn(["9007199254740993"]).type).toBe("string");
  });
});

describe("tableFileKind", () => {
  it("tells links, nodes and metadata tables by their columns", () => {
    expect(tableFileKind("a.csv", () => ["Source", "Target", "w"])).toBe(
      "links",
    );
    expect(tableFileKind("a.tsv", () => ["id", "name"])).toBe("nodes");
    expect(tableFileKind("a.csv", () => ["alice"])).toBe("metadata");
    expect(tableFileKind("a.net", () => [])).toBe("network");
    expect(() => tableFileKind("a.parquet", () => ["x"])).toThrow(
      /source and target/,
    );
  });
});

describe("readParquet", () => {
  it("reads netgamut's format 2 with its types, nulls and metadata", async () => {
    const nodes = await readParquet(bytesOf("toy.nodes.parquet"));
    expect(nodes.rows).toBe(7);
    const col = (name: string) =>
      nodes.columns.find((c) => c.name === name)?.data;
    expect(col("id")).toEqual({
      type: "number",
      values: Float64Array.from([1, 2, 3, 4, 5, 6, 9]),
    });
    expect(col("group")).toEqual({
      type: "string",
      values: ["a", "a", "b", null, "b", "b", "c"],
    });
    // int64 reads as BigInt; it fits, so numbers.
    expect(col("size")).toEqual({
      type: "number",
      values: Float64Array.from([10, 20, 30, 40, Number.NaN, 60, 90]),
    });
    expect(nodes.meta?.["netgamut:key"]).toBe("test/toy");
    expect(nodes.meta?.["netgamut:directed"]).toBe("false");
  });

  it("reads a timestamp column (milliseconds, UTC) as milliseconds since 1970", async () => {
    const links = await readParquet(bytesOf("toy.links.parquet"));
    expect(links.columns.find((c) => c.name === "time")?.data).toEqual({
      type: "number",
      values: Float64Array.from({ length: 8 }, (_, d) =>
        Date.UTC(2020, 0, d + 1),
      ),
    });
  });

  it("keeps int64 ids past 2^53 exact, as text", async () => {
    const links = await readParquet(bytesOf("wide.links.parquet"));
    expect(links.columns[0].data).toEqual({
      type: "string",
      values: [`${2 ** 40}`, `${2 ** 40 + 1}`, "4611686018427387904"],
    });
  });
});

describe("tablesToNetwork", () => {
  it("writes Pajek with the ids kept, names from the nodes table, and weights", () => {
    const links = readDelimited("source,target,weight\n1,2,0.5\n2,3,\n3,1,2");
    const nodes = readDelimited("id,name,kind\n1,one,x\n2,,y\n4,four,x");
    const net = tablesToNetwork(links, nodes, { directed: true, name: "e" });
    expect(net.text).toBe(
      [
        "*Vertices 4",
        '1 "one"',
        '2 "2"',
        '4 "four"',
        '3 "3"',
        "*Arcs",
        "1 2 0.5",
        "2 3",
        "3 1 2",
        "",
      ].join("\n"),
    );
    expect(net.columns.map((c) => c.name)).toEqual(["kind"]);
    expect([...net.rowOfVertex]).toEqual([
      [1, 0],
      [2, 1],
      [4, 2],
    ]);
  });

  it("numbers ids that aren't plain integers", () => {
    const links = readDelimited("source,target\na,b\nb,-1");
    const net = tablesToNetwork(links, undefined, {
      directed: false,
      name: "e",
    });
    expect(net.text).toBe(
      '*Vertices 3\n1 "a"\n2 "b"\n3 "-1"\n*Edges\n1 2\n2 3\n',
    );
  });

  it("writes layers as *Intra links, numbering named layers", () => {
    const links = readDelimited(
      "source,target,layer\n1,2,bus\n2,3,tram\n1,3,bus",
    );
    const net = tablesToNetwork(links, undefined, {
      directed: false,
      name: "e",
    });
    expect(net.layerNames).toEqual(["bus", "tram"]);
    expect(net.text).toBe(
      [
        "# undirected links",
        "# layer 1 = bus",
        "# layer 2 = tram",
        "*Vertices 3",
        '1 "1"',
        '2 "2"',
        '3 "3"',
        "*Intra",
        "1 1 2",
        "2 2 3",
        "1 1 3",
        "",
      ].join("\n"),
    );
  });

  it("refuses a links table without source and target", () => {
    expect(() =>
      tablesToNetwork(readDelimited("a,b\n1,2"), undefined, {
        directed: false,
        name: "e.csv",
      }),
    ).toThrow(/source and target/);
  });
});

describe("loadFiles with tables", () => {
  it("loads netgamut's links and nodes tables, with node columns per node", async () => {
    const net = await loadFiles(
      [fixture("toy.links.parquet"), fixture("toy.nodes.parquet")],
      OPTIONS,
    );
    expect(net.filename).toBe("toy.net");
    expect(net.graph.nodeCount).toBe(8);
    expect(net.graph.source.length).toBe(8);
    expect(net.directed).toBe(false);
    expect(net.sources.map((f) => f.kind)).toEqual(["links", "nodes"]);
    const at = (id: number) => net.physicalIds?.indexOf(id) ?? -1;
    expect(net.names[at(3)]).toBe("three");
    expect(net.names[at(7)]).toBe("7");
    const group = net.nodeColumns?.find((c) => c.name === "group");
    const score = net.nodeColumns?.find((c) => c.name === "score");
    expect(net.nodeColumns?.map((c) => [c.name, c.type])).toEqual([
      ["group", "category"],
      ["size", "number"],
      ["score", "number"],
    ]);
    if (group?.type !== "category" || score?.type !== "number")
      throw new Error("column types");
    expect(group.categories).toEqual(["b", "a", "c"]);
    expect(group.counts).toEqual([3, 2, 1]);
    expect(group.categories[group.codes[at(9)]]).toBe("c");
    // 4 has a row with no group; 7 has no row.
    expect(group.codes[at(4)]).toBe(-1);
    expect(group.codes[at(7)]).toBe(-1);
    expect(score.values[at(6)]).toBe(4.5);
    expect(score.values[at(2)]).toBeNaN();
  });

  it("loads layers as a multilayer state network, colouring physical nodes", async () => {
    const net = await loadFiles(
      [fixture("layers.links.parquet"), fixture("layers.nodes.parquet")],
      OPTIONS,
    );
    expect(net.isStates).toBe(true);
    expect(net.stateGraph?.stateCount).toBe(6);
    expect(net.physicalNames).toEqual(["A", "B", "C"]);
    expect(net.layerNames).toEqual(["bus", "tram"]);
    const zone = net.nodeColumns?.[0];
    if (zone?.type !== "number") throw new Error("zone");
    expect(Array.from(zone.values)).toEqual([1, 1, 2]);
  });

  it("numbers string and wide ids, directed as the file says", async () => {
    // netgamut:directed is "true": directed without being asked.
    const named = await loadFiles([fixture("named.links.parquet")], OPTIONS);
    expect(named.directed).toBe(true);
    expect(named.names).toEqual(["a", "b", "c"]);
    expect(named.nodeColumns).toBeUndefined();
    const wide = await loadFiles([fixture("wide.links.parquet")], OPTIONS);
    expect(wide.directed).toBe(false);
    expect(wide.names).toEqual([
      `${2 ** 40}`,
      `${2 ** 40 + 1}`,
      "4611686018427387904",
    ]);
  });

  it("loads CSV tables", async () => {
    const net = await loadFiles(
      [
        { name: "e.csv", text: "Source,Target\n1,2\n2,3\n", kind: "links" },
        { name: "n.csv", text: "Id,Name,role\n1,a,x\n3,c,y\n", kind: "nodes" },
      ],
      OPTIONS,
    );
    expect(net.names).toEqual(["a", "2", "c"]);
    expect(net.nodeColumns?.[0].name).toBe("role");
  });

  it("needs a links table for a nodes table", async () => {
    await expect(
      loadFiles([fixture("toy.nodes.parquet")], OPTIONS),
    ).rejects.toThrow(/needs its links table/);
  });
});
