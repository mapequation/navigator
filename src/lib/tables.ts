import { decompress as zstd } from "fzstd";
import { parquetMetadata, parquetRead, parquetSchema } from "hyparquet";

/**
 * Tables: a links table (`source`, `target`, optional `weight` and `layer`) and an optional nodes table
 * (`id`, optional `name`, any other columns), read from CSV, TSV or Parquet. netgamut's mirror (format 2)
 * writes them as Parquet; the user can drop their own. Column names match case-insensitively.
 */

/** A column's values: numbers (NaN where missing), or text (null where missing). */
export type ColumnValues =
  | { type: "number"; values: Float64Array }
  | { type: "string"; values: (string | null)[] };

export interface TableColumn {
  name: string;
  data: ColumnValues;
}

export interface Table {
  rows: number;
  columns: TableColumn[];
  /** Parquet key-value metadata. */
  meta?: Record<string, string>;
}

export type TableRole = "links" | "nodes";

const find = (t: Table, name: string): TableColumn | undefined =>
  t.columns.find((c) => c.name.toLowerCase() === name);

/** "links" for a table with source and target columns, "nodes" for one with an id column, else null. */
export function tableRole(columnNames: readonly string[]): TableRole | null {
  const names = new Set(columnNames.map((n) => n.toLowerCase()));
  if (names.has("source") && names.has("target")) return "links";
  if (names.has("id")) return "nodes";
  return null;
}

// --- Delimited text ---------------------------------------------------------

/**
 * Split CSV/TSV text into rows of fields (RFC 4180: a field in double quotes may hold the delimiter, line
 * breaks and "" for a quote). A byte-order mark and blank lines drop.
 */
export function splitDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  const endRow = (): void => {
    row.push(field);
    field = "";
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };
  while (i < n) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else field += c;
      i++;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") endRow();
    else if (c !== "\r") field += c;
    i++;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const INTEGER = /^[-+]?\d+$/;

/**
 * Type a text column: numbers when every present value is a decimal number, text otherwise. An empty
 * field is missing. An integer column whose values Number would change (a leading zero as in "007", or past
 * 2^53) stays text, so ids such as "007" and "7" stay two ids.
 */
export function typeColumn(raw: readonly string[]): ColumnValues {
  const present = raw.map((s) => s.trim());
  let numeric = true;
  let integer = true;
  let any = false;
  for (const s of present) {
    if (s === "") continue;
    any = true;
    if (!NUMBER.test(s)) {
      numeric = false;
      break;
    }
    if (integer && !INTEGER.test(s)) integer = false;
  }
  if (numeric && any && integer)
    numeric = present.every((s) => {
      if (s === "") return true;
      const v = Number(s);
      return Number.isSafeInteger(v) && String(v) === s.replace(/^\+/, "");
    });
  if (numeric && any) {
    const values = new Float64Array(present.length);
    present.forEach((s, i) => {
      values[i] = s === "" ? Number.NaN : Number(s);
    });
    return { type: "number", values };
  }
  return {
    type: "string",
    values: present.map((s) => (s === "" ? null : s)),
  };
}

/** The delimiter for a file name: tabs for .tsv, commas otherwise. */
export const delimiterOf = (filename: string): string =>
  /\.tsv$/i.test(filename) ? "\t" : ",";

/** Read a CSV or TSV table with a header row. */
export function readDelimited(text: string, filename = ""): Table {
  const [header, ...body] = splitDelimited(text, delimiterOf(filename));
  if (!header) throw new Error(`${filename}: no header row`);
  const names = header.map((h) => h.trim());
  return {
    rows: body.length,
    columns: names.map((name, j) => ({
      name,
      data: typeColumn(body.map((r) => r[j] ?? "")),
    })),
  };
}

/** The header row of a CSV or TSV file, for its role. */
export function delimitedHeader(text: string, filename = ""): string[] {
  const end = text.search(/\r?\n/);
  const first = end < 0 ? text : text.slice(0, end);
  return (splitDelimited(first, delimiterOf(filename))[0] ?? []).map((h) =>
    h.trim(),
  );
}

// --- Parquet ----------------------------------------------------------------

const compressors = { ZSTD: (input: Uint8Array) => zstd(input) };

const bufferOf = (bytes: Uint8Array): ArrayBuffer =>
  bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? (bytes.buffer as ArrayBuffer)
    : (bytes.slice().buffer as ArrayBuffer);

/** The top-level column names of a Parquet file, for its role. */
export function parquetColumns(bytes: Uint8Array): string[] {
  const schema = parquetSchema(parquetMetadata(bufferOf(bytes)));
  return schema.children.map((c) => c.element.name);
}

/** A value hyparquet decoded, as a number column would hold it; undefined when it isn't one. */
function numberOf(v: unknown): number | undefined {
  if (v === null || v === undefined) return Number.NaN;
  if (typeof v === "number") return v;
  if (typeof v === "bigint")
    return v <= BigInt(Number.MAX_SAFE_INTEGER) &&
      v >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(v)
      : undefined;
  if (v instanceof Date) return v.getTime();
  return undefined;
}

/**
 * A Parquet column's values. Numbers (int32, int64, float, double, timestamps as ms) become a number column,
 * unless an int64 is past 2^53: then the column is text, so every id stays exact. Strings and booleans are
 * text. Missing values are NaN or null.
 */
export function parquetValues(values: ArrayLike<unknown>): ColumnValues {
  const n = values.length;
  const numbers = new Float64Array(n);
  let numeric = true;
  let any = false;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const x = numberOf(v);
    if (x === undefined) {
      numeric = false;
      break;
    }
    if (v !== null && v !== undefined) any = true;
    numbers[i] = x;
  }
  if (numeric && any) return { type: "number", values: numbers };
  const strings = new Array<string | null>(n);
  for (let i = 0; i < n; i++) {
    const v = values[i];
    strings[i] = v === null || v === undefined ? null : String(v);
  }
  return { type: "string", values: strings };
}

/** Read a Parquet table: every top-level column, with the file's key-value metadata. */
export async function readParquet(bytes: Uint8Array): Promise<Table> {
  const file = bufferOf(bytes);
  const metadata = parquetMetadata(file);
  const rows = Number(metadata.num_rows);
  const names = parquetSchema(metadata).children.map((c) => c.element.name);
  const raw = new Map<string, unknown[]>(
    names.map((n) => [n, new Array<unknown>(rows)]),
  );
  await parquetRead({
    file,
    metadata,
    compressors,
    onChunk: ({ columnName, columnData, rowStart }) => {
      const out = raw.get(columnName);
      if (!out) return;
      for (let i = 0; i < columnData.length; i++)
        out[rowStart + i] = columnData[i];
    },
  });
  const meta: Record<string, string> = {};
  for (const kv of metadata.key_value_metadata ?? [])
    if (kv.value !== undefined) meta[kv.key] = kv.value;
  return {
    rows,
    columns: names.map((name) => ({
      name,
      data: parquetValues(raw.get(name) ?? []),
    })),
    meta,
  };
}

// --- Tables to a network ------------------------------------------------------

/**
 * A node column for colouring, per dense node: numbers (NaN where missing), or a category code per node
 * (-1 where missing) into `categories`, most frequent first.
 */
export type NodeColumn =
  | { name: string; type: "number"; values: Float64Array }
  | {
      name: string;
      type: "category";
      codes: Int32Array;
      categories: string[];
      counts: number[];
    };

export interface TableNetwork {
  /** The network as Pajek, or Infomap's multilayer format when the links have layers. */
  text: string;
  /** The nodes table's columns for colouring, per nodes-table row (see nodeColumnsFor). */
  columns: TableColumn[];
  /** The nodes-table row of each vertex number, for nodes that have one. */
  rowOfVertex: Map<number, number>;
  /** Layer names by layer number, when the layers are named. */
  layerNames?: string[];
}

/** Ids that are integers Infomap keeps as they are: 0 to 2^31 - 1. */
const plainId = (v: number): boolean =>
  Number.isInteger(v) && v >= 0 && v <= 2 ** 31 - 1;

/** A name on one Pajek line: no line breaks; Infomap reads it between the first and the last quote. */
const pajekName = (s: string): string => `"${s.replace(/[\r\n]+/g, " ")}"`;

const weightText = (w: number): string => String(w);

/**
 * Turn a links table, and a nodes table when there is one, into the network file Infomap and d3gl read:
 * - Each `source`/`target` id is a node; a nodes-table row with that `id` names it (`name`) and gives its
 *   columns. A node in the nodes table without links is a node too (Pajek lists it).
 * - Integer ids from 0 to 2^31 - 1 stay the vertex numbers, so a partition file's ids match. Other ids are
 *   numbered 1 to N, nodes table first, then in the order the links name them; a node without a name is
 *   named by its id.
 * - `weight` weighs each link (Infomap's 1 where missing). Every row is a link, in order: repeated links
 *   stay repeated, as Infomap sums them.
 * - With a `layer` column, the network is multilayer: `*Intra` links in their layer, and no links between
 *   layers (Infomap's relax rate couples them). Integer layers from 0 to 2^31 - 1 stay; others are numbered
 *   1 to L in the order they appear.
 */
export function tablesToNetwork(
  links: Table,
  nodes: Table | undefined,
  { directed, name }: { directed: boolean; name: string },
): TableNetwork {
  const source = find(links, "source");
  const target = find(links, "target");
  if (!source || !target)
    throw new Error(`${name}: a links table needs source and target columns`);
  const weight = find(links, "weight");
  if (weight && weight.data.type !== "number")
    throw new Error(
      `${name}: the weight column has values that aren't numbers`,
    );
  const layer = find(links, "layer");
  const id = nodes && find(nodes, "id");
  if (nodes && !id)
    throw new Error(`${name}: a nodes table needs an id column`);
  const nameCol = nodes && find(nodes, "name");

  // Ids are numbers only when every id column is numbers.
  const idCols = [source, target, ...(id ? [id] : [])];
  const numeric = idCols.every((c) => c.data.type === "number");
  const keyAt = (c: TableColumn, i: number): string | number | null => {
    const v = c.data.values[i];
    if (v === null || (typeof v === "number" && Number.isNaN(v))) return null;
    return numeric ? (v as number) : String(v);
  };

  // Distinct ids: nodes table first, then the links.
  const order: (string | number)[] = [];
  const seen = new Set<string | number>();
  const add = (k: string | number | null): void => {
    if (k === null || seen.has(k)) return;
    seen.add(k);
    order.push(k);
  };
  if (id) for (let r = 0; r < id.data.values.length; r++) add(keyAt(id, r));
  for (let e = 0; e < links.rows; e++) {
    const s = keyAt(source, e);
    const t = keyAt(target, e);
    if (s === null || t === null)
      throw new Error(
        `${name}: link ${e + 1} has no ${s === null ? "source" : "target"}`,
      );
    add(s);
    add(t);
  }

  const keep = numeric && order.every((k) => plainId(k as number));
  const vertexOf = new Map<string | number, number>();
  order.forEach((k, i) => {
    vertexOf.set(k, keep ? (k as number) : i + 1);
  });
  const rowOfVertex = new Map<number, number>();
  const names = new Map<number, string>();
  if (id)
    for (let r = 0; r < id.data.values.length; r++) {
      const k = keyAt(id, r);
      if (k === null) continue;
      const v = vertexOf.get(k) as number;
      if (!rowOfVertex.has(v)) rowOfVertex.set(v, r);
      const label = nameCol?.data.values[r];
      if (label !== null && label !== undefined && !Number.isNaN(label))
        names.set(v, String(label));
    }

  // Layers.
  let layerOf: ((e: number) => number) | undefined;
  let layerNames: string[] | undefined;
  if (layer) {
    const values = layer.data.values;
    const keys: (string | number)[] = [];
    const isNum = layer.data.type === "number";
    for (let e = 0; e < links.rows; e++) {
      const v = values[e];
      if (v === null || (isNum && Number.isNaN(v as number)))
        throw new Error(`${name}: link ${e + 1} has no layer`);
      keys.push(v as string | number);
    }
    const distinct = [...new Set(keys)];
    if (isNum && distinct.every((k) => plainId(k as number))) {
      layerOf = (e) => keys[e] as number;
    } else {
      const number = new Map(distinct.map((k, i) => [k, i + 1]));
      layerOf = (e) => number.get(keys[e]) as number;
      layerNames = distinct.map(String);
    }
  }

  const w = weight?.data.values as Float64Array | undefined;
  const lines: string[] = [];
  if (layerOf) {
    lines.push(`# ${directed ? "directed" : "undirected"} links`);
    layerNames?.forEach((n, i) => {
      lines.push(`# layer ${i + 1} = ${n.replace(/[\r\n]+/g, " ")}`);
    });
  }
  lines.push(`*Vertices ${order.length}`);
  for (const k of order) {
    const v = vertexOf.get(k) as number;
    lines.push(`${v} ${pajekName(names.get(v) ?? String(k))}`);
  }
  lines.push(layerOf ? "*Intra" : directed ? "*Arcs" : "*Edges");
  for (let e = 0; e < links.rows; e++) {
    const s = vertexOf.get(keyAt(source, e) as string | number);
    const t = vertexOf.get(keyAt(target, e) as string | number);
    const link = layerOf ? `${layerOf(e)} ${s} ${t}` : `${s} ${t}`;
    const we = w?.[e];
    lines.push(
      we === undefined || Number.isNaN(we) ? link : `${link} ${weightText(we)}`,
    );
  }

  const columns = nodes
    ? nodes.columns.filter((c) => c !== id && c !== nameCol)
    : [];
  return {
    text: `${lines.join("\n")}\n`,
    columns,
    rowOfVertex,
    ...(layerNames ? { layerNames } : {}),
  };
}

/**
 * The node columns per dense node: `vertexOfNode[i]` is node i's vertex number (its file id), whose
 * nodes-table row gives its values; a node without a row has none (missing).
 */
export function nodeColumnsFor(
  columns: readonly TableColumn[],
  rowOfVertex: ReadonlyMap<number, number>,
  vertexOfNode: ArrayLike<number>,
): NodeColumn[] {
  const n = vertexOfNode.length;
  const rowOf = new Int32Array(n);
  for (let i = 0; i < n; i++) rowOf[i] = rowOfVertex.get(vertexOfNode[i]) ?? -1;
  return columns.map((c): NodeColumn => {
    if (c.data.type === "number") {
      const src = c.data.values;
      const values = new Float64Array(n);
      for (let i = 0; i < n; i++)
        values[i] = rowOf[i] < 0 ? Number.NaN : src[rowOf[i]];
      return { name: c.name, type: "number", values };
    }
    const src = c.data.values;
    const counts = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const v = rowOf[i] < 0 ? null : src[rowOf[i]];
      if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    // Most frequent first; ties in first-seen order.
    const categories = [...counts.keys()].sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
    );
    const code = new Map(categories.map((k, i) => [k, i]));
    const codes = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const v = rowOf[i] < 0 ? null : src[rowOf[i]];
      codes[i] = v === null ? -1 : (code.get(v) as number);
    }
    return {
      name: c.name,
      type: "category",
      codes,
      categories,
      counts: categories.map((k) => counts.get(k) ?? 0),
    };
  });
}
