import {
  detectFormat,
  type ParsedPajek,
  parseEdgeList,
  parsePajek,
} from "@mapequation/d3gl/network";
import { withClustering } from "./apply-ftree";
import { degreeExitFlow, degreeFlow } from "./degree-flow";
import {
  type FileKind,
  fileKind,
  isMultilayerText,
  isStatesText,
} from "./file-kinds";
import { ftreeToNetwork } from "./ftree-graph";
import { buildInfomapArgs, infomapArgString } from "./infomap-args";
import { byteLength, computeStats } from "./network-stats";
import { type ParsedMultilayer, parseMultilayer } from "./parse-multilayer";
import { type ParsedStates, parseStates } from "./parse-states";
import { runInfomap } from "./run-infomap";
import {
  nodeColumnsFor,
  readDelimited,
  readParquet,
  type Table,
  tablesToNetwork,
} from "./tables";
import type { ClusterOptions, LoadedNetwork, SourceFile } from "./types";

export interface NamedText {
  name: string;
  text: string;
  /** Byte size when known (File.size); computed from `text` otherwise. */
  size?: number;
  /** Kind as staged (a restaged metadata .txt); from the extension otherwise. */
  kind?: FileKind;
  /** A binary file's bytes (Parquet); `text` is then empty. */
  bytes?: Uint8Array;
}

const kindOf = (f: NamedText): FileKind => f.kind ?? fileKind(f.name);

/**
 * Parse a raw network file (Pajek, edge list, *States, or multilayer) into a
 * LoadedNetwork. `directedOverride: true` forces directed links (mirroring
 * Infomap's `-d` flag); undefined defers to the file format (Pajek *Arcs
 * directed, *Edges undirected, states directed, multilayer undirected, as
 * Infomap reads them).
 */
export function networkToLoaded(
  text: string,
  filename: string,
  directedOverride?: boolean,
  size = byteLength(text),
): LoadedNetwork {
  const sources: SourceFile[] = [
    { name: filename, size, text, kind: "network" },
  ];
  if (isMultilayerText(text))
    return stateNetwork(
      parseMultilayer(text, filename, directedOverride ?? false),
      text,
      filename,
      sources,
    );
  if (isStatesText(text))
    return stateNetwork(
      parseStates(text, filename, directedOverride ?? true),
      text,
      filename,
      sources,
    );
  const { parsed, physicalIds, edgeList } = parseWithIds(text, filename);
  const directed = directedOverride ?? parsed.directed;
  // Until Infomap runs. Read as undirected, the flow enters each node as it
  // leaves it.
  const exit = degreeExitFlow(
    parsed.nodeCount,
    parsed.source,
    parsed.target,
    parsed.weight,
  );
  return {
    kind: "raw",
    filename,
    sources,
    stats: computeStats(
      parsed.nodeCount,
      parsed.source,
      parsed.target,
      parsed.weight,
    ),
    directed,
    isStates: false,
    graph: {
      nodeCount: parsed.nodeCount,
      source: parsed.source,
      target: parsed.target,
      weight: parsed.weight,
      directed,
      // Until Infomap runs.
      nodeFlow: degreeFlow(
        parsed.nodeCount,
        parsed.source,
        parsed.target,
        parsed.weight,
      ),
    },
    names: [...parsed.labels],
    physicalIds,
    edgeList,
    networkText: text,
    boundaryFlow: exit,
    boundaryEnterFlow: exit,
  };
}

/**
 * A state network as loaded: a *States file, or a multilayer one, whose state
 * nodes are its physical nodes in each layer, known by layer, not by state id.
 */
function stateNetwork(
  parsed: ParsedStates | ParsedMultilayer,
  text: string,
  filename: string,
  sources: SourceFile[],
): LoadedNetwork {
  const g = parsed.stateGraph;
  // Until Infomap runs: the state nodes' degree flow (the physical nodes'
  // is its sum), and each view's flow borders.
  const nodeFlow = degreeFlow(g.stateCount, g.source, g.target, g.weight);
  const physicalCount = g.physicalCount ?? parsed.physicalNames.length;
  // Read as undirected, the flow enters each node as it leaves it.
  const exit = degreeExitFlow(g.stateCount, g.source, g.target, g.weight);
  const physicalExit = degreeExitFlow(
    physicalCount,
    g.source,
    g.target,
    g.weight,
    g.stateToPhysical,
  );
  return {
    kind: "raw",
    filename,
    sources,
    stats: computeStats(g.stateCount, g.source, g.target, g.weight, {
      physicalIds: parsed.physicalIds,
    }),
    directed: g.directed ?? true,
    isStates: true,
    graph: { ...parsed.graph, nodeFlow },
    stateGraph: { ...g, nodeFlow },
    names: parsed.names,
    physicalNames: parsed.physicalNames,
    physicalIds: parsed.physicalIds,
    ...("layerIds" in parsed
      ? { layerIds: parsed.layerIds }
      : { stateIds: parsed.stateIds }),
    networkText: text,
    boundaryFlow: exit,
    boundaryEnterFlow: exit,
    physicalBoundaryFlow: physicalExit,
    physicalBoundaryEnterFlow: physicalExit,
  };
}

/**
 * Parse a Pajek file or an edge list together with the node ids Infomap keys
 * its output by, as d3gl returns them (`ids`): a Pajek vertex number (0 and
 * gaps allowed; the vertex labels are names, whatever they look like), or an
 * edge-list label's value when every label is a plain integer id. An edge list
 * with names, or a label Infomap writes differently ("01", "+1"), has no ids:
 * Infomap runs on Navigator's numbering of it (infomapInput), but a partition
 * file can't be matched to it. A line the parser refuses throws, naming the
 * file and the line. The dispatch repeats d3gl's parseNetwork, whose format
 * choice differs from Infomap's for some files (mapequation/d3gl#407).
 */
function parseWithIds(
  text: string,
  filename: string,
): { parsed: ParsedPajek; physicalIds?: number[]; edgeList: boolean } {
  const edgeList = detectFormat(text, filename) !== "pajek";
  let parsed: ParsedPajek;
  try {
    parsed = edgeList
      ? { ...parseEdgeList(text), directed: false }
      : parsePajek(text);
  } catch (err) {
    throw new Error(
      `${filename}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return {
    parsed,
    physicalIds: parsed.ids && Array.from(parsed.ids),
    edgeList,
  };
}

export interface LoadCallbacks {
  /** Infomap is about to run (partition loads only), with its command line. */
  onInfomapStart?: (command: string) => void;
  onLog?: (line: string) => void;
}

/**
 * Turn a set of dropped files into a LoadedNetwork:
 * - one .ftree alone → clustered network
 * - one network file alone → raw network
 * - one network + one .tree/.clu → Infomap runs with the partition as cluster
 *   data (full run seeded by it, or flow-only with noInfomap)
 * Metadata files (.csv/.tsv) are skipped: the caller adds them to the store
 * once the network is set.
 */
export async function loadFiles(
  files: NamedText[],
  opts: ClusterOptions,
  cb: LoadCallbacks = {},
): Promise<LoadedNetwork> {
  const unsupported = files.find((f) => kindOf(f) === "unknown");
  if (unsupported)
    throw new Error(`Unsupported file type: ${unsupported.name}`);
  const net = await loadStructure(files, opts, cb);
  net.loadOptions = opts;
  return net;
}

async function loadStructure(
  files: NamedText[],
  opts: ClusterOptions,
  cb: LoadCallbacks,
): Promise<LoadedNetwork> {
  const ftrees = files.filter((f) => kindOf(f) === "ftree");
  const partitions = files.filter((f) => ["tree", "clu"].includes(kindOf(f)));
  const linkTables = files.filter((f) => kindOf(f) === "links");
  const nodeTables = files.filter((f) => kindOf(f) === "nodes");
  const networks = files.filter((f) => kindOf(f) === "network");

  if (
    ftrees.length > 1 ||
    networks.length + linkTables.length > 1 ||
    partitions.length > 1 ||
    nodeTables.length > 1
  ) {
    throw new Error(
      "Load at most one network or links table, one nodes table, one ftree, and one partition file",
    );
  }
  if (nodeTables.length && !linkTables.length)
    throw new Error("A nodes table needs its links table");
  if (ftrees.length) {
    if (networks.length || linkTables.length || partitions.length) {
      throw new Error(
        "Load an .ftree alone, or a network file with an optional partition",
      );
    }
    return ftreeToNetwork(ftrees[0].text, ftrees[0].name, ftrees[0].size);
  }
  if (!networks.length && !linkTables.length) {
    throw new Error(
      partitions.length
        ? "A partition file needs its network file"
        : files.some((f) => kindOf(f) === "metadata")
          ? "Metadata files need a network or .ftree file"
          : "No files to load",
    );
  }

  const tables = linkTables.length
    ? await tablesToLoaded(linkTables[0], nodeTables[0], opts.directed)
    : undefined;
  const network = tables?.network ?? networks[0];
  const net =
    tables?.net ??
    networkToLoaded(
      network.text,
      network.name,
      opts.directed || undefined,
      network.size,
    );
  if (!partitions.length) return net;

  const partition = partitions[0];
  const args = buildInfomapArgs({ ...opts, clusterFilename: partition.name });
  cb.onInfomapStart?.(`infomap ${infomapArgString(args)}`);
  const { tree, flow } = await runInfomap({
    network: network.text,
    filename: network.name,
    args,
    files: { [partition.name]: partition.text },
    onLog: cb.onLog,
  });
  // The partition's ids are the file's, so Infomap reads the file with it.
  const clustered = withClustering(net, tree, flow);
  clustered.sources = [
    ...net.sources,
    {
      name: partition.name,
      size: partition.size ?? byteLength(partition.text),
      text: partition.text,
      kind: kindOf(partition),
    },
  ];
  return clustered;
}

const sourceOf = (f: NamedText): SourceFile => ({
  name: f.name,
  size: f.size ?? f.bytes?.byteLength ?? byteLength(f.text),
  text: f.text,
  kind: kindOf(f),
  ...(f.bytes ? { bytes: f.bytes } : {}),
});

/** Read a CSV, TSV or Parquet table. */
export async function readTable(f: NamedText): Promise<Table> {
  try {
    return f.bytes ? await readParquet(f.bytes) : readDelimited(f.text, f.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      message.startsWith(f.name) ? message : `${f.name}: ${message}`,
    );
  }
}

/** The network name for a links table: its file name without the table's extensions. */
export const tableStem = (filename: string): string =>
  filename.replace(/(\.links)?\.(csv|tsv|parquet)$/i, "");

/**
 * Load a links table, and its nodes table, as the network they make (tablesToNetwork): its file text is
 * what Infomap reads, and the nodes table's other columns colour the nodes (`nodeColumns`).
 */
export async function tablesToLoaded(
  linksFile: NamedText,
  nodesFile: NamedText | undefined,
  directed: boolean,
): Promise<{ net: LoadedNetwork; network: NamedText }> {
  const [links, nodes] = await Promise.all([
    readTable(linksFile),
    nodesFile ? readTable(nodesFile) : undefined,
  ]);
  // Directed when asked, or when the file says so, as netgamut's tables do in their metadata (as *Arcs
  // makes a Pajek file directed).
  const isDirected = directed || links.meta?.["netgamut:directed"] === "true";
  const name = `${tableStem(linksFile.name)}.net`;
  const table = tablesToNetwork(links, nodes, {
    directed: isDirected,
    name: linksFile.name,
  });
  const network = { name, text: table.text };
  const net = networkToLoaded(table.text, name, isDirected || undefined);
  net.sources = [linksFile, ...(nodesFile ? [nodesFile] : [])].map(sourceOf);
  // The nodes' file ids: per node, or per physical node of a state network.
  const vertexOfNode = net.isStates
    ? physicalVertices(net)
    : (net.physicalIds ?? []);
  if (table.columns.length)
    net.nodeColumns = nodeColumnsFor(
      table.columns,
      table.rowOfVertex,
      vertexOfNode,
    );
  if (table.layerNames) net.layerNames = table.layerNames;
  return { net, network };
}

/** A state network's file id per dense physical node. */
function physicalVertices(net: LoadedNetwork): number[] {
  const toPhysical = net.stateGraph?.stateToPhysical ?? [];
  const ids = net.physicalIds ?? [];
  const out = new Array<number>(net.physicalNames?.length ?? 0).fill(-1);
  for (let s = 0; s < toPhysical.length; s++) out[toPhysical[s]] = ids[s];
  return out;
}
