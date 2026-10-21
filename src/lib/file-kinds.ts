export type FileKind =
  | "ftree"
  | "tree"
  | "clu"
  | "network"
  | "metadata"
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

export function isStatesText(text: string): boolean {
  return /^\*states\b/im.test(text);
}
