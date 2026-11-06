import Infomap from "@mapequation/infomap";
import { type InfomapArguments, infomapArgString } from "./infomap-args";
import type { InfomapTree } from "./types";

export interface RunInfomapOptions {
  network: string;
  filename: string;
  args: InfomapArguments;
  /** Extra command-line flags appended to `args`. */
  flags?: string;
  /** Virtual files (e.g. cluster data) — keys must match args.clusterData. */
  files?: Record<string, string>;
  /** One call per stdout line (no trailing newline; blank lines included). */
  onLog?: (line: string) => void;
  /** Aborting it stops the worker; the run then rejects with an AbortError. */
  signal?: AbortSignal;
}

export interface InfomapRun {
  /** The JSON tree (the states variant when there is one). */
  tree: InfomapTree;
  /**
   * The flow output (-o flow): the nodes' and links' flow. A states network
   * leaves `flow` empty and writes `flow_as_physical`, its state nodes as the
   * nodes, keyed by state id.
   */
  flow?: string;
}

/** Run Infomap in its web worker; resolve with its JSON tree and flow text. */
export async function runInfomap(opts: RunInfomapOptions): Promise<InfomapRun> {
  const { signal } = opts;
  signal?.throwIfAborted();
  const infomap = new Infomap();
  if (opts.onLog) infomap.on("data", opts.onLog);
  const run = infomap.runAsync({
    network: opts.network,
    filename: opts.filename,
    args: infomapArgString(opts.args, opts.flags),
    files: opts.files,
  });
  // A stopped worker never answers: the abort settles the run instead.
  const stopped = new Promise<never>((_, reject) => {
    signal?.addEventListener(
      "abort",
      () => {
        void infomap.terminateAll();
        reject(signal.reason);
      },
      { once: true },
    );
  });
  const result = await Promise.race([run, stopped]);
  const tree: InfomapTree | undefined = result.json_states ?? result.json;
  if (!tree) throw new Error("Infomap finished without JSON output");
  return { tree, flow: result.flow || result.flow_as_physical };
}
