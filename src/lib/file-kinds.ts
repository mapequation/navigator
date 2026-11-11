import { tableRole } from "./tables";

export type FileKind =
  | "ftree"
  | "tree"
  | "clu"
  | "network"
  | "metadata"
  /** A table of links (source, target, …) in CSV, TSV or Parquet. */
  | "links"
  /** A table of nodes (id, name, …) for a links table, in CSV, TSV or Parquet. */
  | "nodes"
  | "unknown";

export function fileKind(filename: string): FileKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "ftree") return "ftree";
  if (ext === "tree" || ext === "stree") return "tree";
  if (ext === "clu") return "clu";
  if (["net", "paj", "txt", "edges", "edgelist"].includes(ext))
    return "network";
  // Node-name lists for metadata overlap; .txt stays a network (edge list).
  if (ext === "csv" || ext === "tsv") return "metadata";
  return "unknown";
}

/** Whether a file is read as bytes (Parquet) rather than as text. */
export const isBinaryFile = (filename: string): boolean =>
  /\.parquet$/i.test(filename);

/**
 * The kind of a file, from its name and, for a table, its columns: a CSV or TSV file whose header has
 * source and target columns is a links table, one with an id column a nodes table, any other a list of
 * node names (metadata). A Parquet file is a links or a nodes table by the same rule.
 */
export function tableFileKind(
  filename: string,
  columns: () => readonly string[],
): FileKind {
  const kind = fileKind(filename);
  if (kind !== "metadata" && !isBinaryFile(filename)) return kind;
  const role = tableRole(columns());
  if (role) return role;
  if (isBinaryFile(filename))
    throw new Error(
      `${filename}: a Parquet table needs source and target columns (links) or an id column (nodes)`,
    );
  return "metadata";
}

export function isStatesText(text: string): boolean {
  return /^\*states\b/im.test(text);
}

/** Infomap's multilayer format: its links in *Intra, *Inter or *Multilayer sections. */
export function isMultilayerText(text: string): boolean {
  return /^\*(intra|inter|multilayer)\b/im.test(text);
}
