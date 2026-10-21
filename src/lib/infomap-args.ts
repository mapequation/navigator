import argumentsToString from "@mapequation/infomap/arguments";
import type { ClusterOptions } from "./types";

// The Arguments type lives in @mapequation/infomap; keep the subset we use
// structural so the exact type-export path never bites us. output stays a
// literal type so the whole object is assignable to the library's Arguments.
// No --silent: the stdout lines feed the console and the progress stage.
export interface InfomapArguments {
  output: ("json" | "flow")[];
  directed?: boolean;
  twoLevel?: boolean;
  noInfomap?: boolean;
  regularized?: boolean;
  clusterData?: string;
}

export function buildInfomapArgs(o: ClusterOptions): InfomapArguments {
  // flow: the links' flow, for the nodes' flow-border rings (boundaryFlow).
  const args: InfomapArguments = { output: ["json", "flow"] };
  if (o.directed) args.directed = true;
  if (o.twoLevel) args.twoLevel = true;
  if (o.noInfomap) args.noInfomap = true;
  if (o.regularized) args.regularized = true;
  if (o.clusterFilename) args.clusterData = o.clusterFilename;
  return args;
}

/**
 * Infomap command-line string: structured args plus free-text CLI flags
 * (e.g. "-N 5"), passed verbatim to the worker. JSON and flow
 * output are always requested by the structured part.
 */
export function infomapArgString(args: InfomapArguments, flags = ""): string {
  return `${argumentsToString(args)} ${flags}`.replace(/\s+/g, " ").trim();
}
