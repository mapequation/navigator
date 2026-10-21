import type { FileKind } from "./file-kinds";
import type { ClusterOptions, SourceFile } from "./types";

/** A file in the load dialog: dropped, or restaged from what is loaded. */
export interface StagedFile {
  id: string;
  name: string;
  /** Size in bytes. */
  size: number;
  text: string;
  kind: FileKind;
  /** Restaged metadata file: the id of its loaded OccurrenceFile. */
  occurrenceId?: string;
}

/** A loaded metadata file, as the load dialog restages it. */
export interface LoadedMetadata {
  id: string;
  name: string;
  size: number;
  text: string;
}

/** What is loaded now: the network's inputs and its metadata files. */
export interface CurrentLoad {
  sources: readonly SourceFile[];
  loadOptions?: ClusterOptions;
  metadata: readonly LoadedMetadata[];
}

export type LoadPlan =
  /** Nothing staged: unload the network. */
  | { type: "clear" }
  /** Same network inputs: add/remove metadata files in place (both empty = no-op). */
  | { type: "metadata"; add: StagedFile[]; remove: string[] }
  /** Load the network from the staged files, then add the staged metadata. */
  | { type: "load" };

/** The load dialog's list for what is loaded, as if its files were dropped again. */
export function restage(cur: CurrentLoad): StagedFile[] {
  return [
    ...cur.sources.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      text: f.text,
      kind: f.kind,
    })),
    ...cur.metadata.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      text: f.text,
      kind: "metadata" as const,
      occurrenceId: f.id,
    })),
  ];
}

const NO_OPTIONS: ClusterOptions = {
  directed: false,
  twoLevel: false,
  noInfomap: false,
};

/** The options loadFiles uses for these inputs: directed for a network, the rest with a partition. */
function sameOptions(
  sources: readonly { kind: FileKind }[],
  a: ClusterOptions,
  b: ClusterOptions,
): boolean {
  const kinds = new Set(sources.map((f) => f.kind));
  if (kinds.has("network") && a.directed !== b.directed) return false;
  if (kinds.has("tree") || kinds.has("clu"))
    return a.twoLevel === b.twoLevel && a.noInfomap === b.noInfomap;
  return true;
}

/**
 * Decide what Load does with the staged files. Unchanged network inputs (same
 * files and the options that apply to them) never reload the network, so a
 * clustering from an in-app Infomap run survives restaging its raw network.
 */
export function planLoad(
  staged: readonly StagedFile[],
  cur: CurrentLoad | null,
  options: ClusterOptions,
): LoadPlan {
  if (!cur) return { type: "load" };
  if (staged.length === 0) return { type: "clear" };
  const structural = staged.filter((f) => f.kind !== "metadata");
  const unmatched = [...cur.sources];
  for (const f of structural) {
    const i = unmatched.findIndex(
      (s) => s.kind === f.kind && s.name === f.name && s.text === f.text,
    );
    if (i < 0) return { type: "load" };
    unmatched.splice(i, 1);
  }
  if (unmatched.length) return { type: "load" };
  if (!sameOptions(cur.sources, cur.loadOptions ?? NO_OPTIONS, options))
    return { type: "load" };

  const metadata = staged.filter((f) => f.kind === "metadata");
  const loaded = new Set(cur.metadata.map((f) => f.id));
  const kept = new Set(metadata.map((f) => f.occurrenceId));
  return {
    type: "metadata",
    // A restaged file removed elsewhere since (the sidebar) is added back.
    add: metadata.filter(
      (f) => f.occurrenceId === undefined || !loaded.has(f.occurrenceId),
    ),
    remove: cur.metadata.filter((f) => !kept.has(f.id)).map((f) => f.id),
  };
}
