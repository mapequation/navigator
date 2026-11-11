import { fileIds } from "./apply-ftree";
import type { LoadedNetwork } from "./types";

/** The network an Infomap run reads, and the id Infomap gives each node. */
export interface InfomapInput {
  network: string;
  filename: string;
  /**
   * Per dense node index, the id Infomap keys it by in its output. None for a
   * multilayer network, whose state ids only the run's tree says (layerStateIds).
   */
  ids?: readonly number[];
}

/**
 * What Infomap reads for a run Navigator starts. An edge list goes as Navigator
 * read it: a Pajek file with node i as vertex i + 1, named by its label. So
 * Infomap clusters the nodes on screen whatever their labels: names, and "01"
 * and "1" as two nodes, where Infomap reading the file would refuse names and
 * merge "01" with "1". Every vertex is listed, so a node whose links all weigh
 * 0 gets a module too. Pajek and state files go as they are: Infomap reads them
 * as d3gl does.
 */
export function infomapInput(net: LoadedNetwork): InfomapInput {
  return net.edgeList ? numberedPajek(net) : fileInput(net);
}

/**
 * The network file as loaded, for a run that must read the file itself: one
 * with a partition file, whose ids are the file's. Throws when the file's ids
 * can't be matched to the nodes.
 */
export function fileInput(net: LoadedNetwork): InfomapInput {
  if (net.networkText === undefined)
    throw new Error(`${net.filename} has no network text for Infomap`);
  return {
    network: net.networkText,
    filename: net.filename,
    ids: net.layerIds ? undefined : fileIds(net),
  };
}

function numberedPajek(net: LoadedNetwork): InfomapInput {
  const { nodeCount, source, target, weight } = net.graph;
  const lines = new Array<string>(nodeCount + source.length + 2);
  let k = 0;
  lines[k++] = `*Vertices ${nodeCount}`;
  // An edge-list label has no whitespace; Infomap reads the name between the
  // first and the last quote, so a quote inside a label stays.
  for (let i = 0; i < nodeCount; i++) lines[k++] = `${i + 1} "${net.names[i]}"`;
  // Infomap takes the direction from --directed, whatever the heading says.
  lines[k++] = "*Links";
  for (let e = 0; e < source.length; e++) {
    const link = `${source[e] + 1} ${target[e] + 1}`;
    // No weights: Infomap weighs each link 1, as d3gl does.
    lines[k++] = weight ? `${link} ${weightText(weight[e])}` : link;
  }
  const ids = Array.from({ length: nodeCount }, (_, i) => i + 1);
  const stem = net.filename.replace(/\.[^./]*$/, "");
  return { network: `${lines.join("\n")}\n`, filename: `${stem}.net`, ids };
}

/**
 * A weight as d3gl holds it (a 32-bit float), to 7 significant digits without
 * trailing zeros when those read back as the same float, which gives the file's
 * own number whenever it has at most 7; to 9 otherwise, which always reads back.
 * NaN (a weight that isn't a number) stays NaN, which Infomap refuses.
 */
export function weightText(w: number): string {
  if (Number.isInteger(w) || !Number.isFinite(w)) return String(w);
  const text = w.toPrecision(7);
  if (Math.fround(Number(text)) !== w) return w.toPrecision(9);
  // "0.1000000" → "0.1", "1.500000e-7" → "1.5e-7".
  return text.replace(/\.?0+(?=e|$)/, "");
}
