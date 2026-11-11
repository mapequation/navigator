import type {
  BuildGraphInput,
  BuildStateGraphInput,
  ModuleLink,
  ModuleNode,
} from "@mapequation/d3gl/network";
import type { Header, Module } from "@mapequation/infomap";
import type { TreeNode, TreeStateNode } from "@mapequation/infomap/filetypes";
import type { ModuleFlow } from "./boundary-flow";
import type { FileKind } from "./file-kinds";
import type { NetworkStats } from "./network-stats";

/** A JSON tree node row; state trees add stateId (and layerId for multilayer). */
export type InfomapTreeNode = TreeNode &
  Partial<Pick<TreeStateNode, "stateId" | "layerId">>;

/**
 * Infomap's JSON tree (-o json) as the engine writes it. The package's Tree
 * type lacks numModules and requires `modules` on every node, which the
 * physical-level tree of a higher-order run omits.
 */
export interface InfomapTree extends Header {
  /** Module count per level. */
  numModules?: number[];
  nodes: InfomapTreeNode[];
  modules: Module[];
}

/** Run summary from an Infomap JSON header. */
export type InfomapSummary = Pick<
  Header,
  "codelength" | "numLevels" | "numTopModules" | "relativeCodelengthSavings"
>;

/** An input file exactly as loaded; the load dialog restages these. */
export interface SourceFile {
  name: string;
  /** Size in bytes. */
  size: number;
  text: string;
  kind: FileKind;
}

/** A network from the netgamut catalog: where it is from and how to cite it. */
export interface NetgamutOrigin {
  kind: "netgamut";
  /** `<source>/<name>`, as in `?netgamut=<key>`. */
  key: string;
  name: string;
  source: string;
  /** The source's page for the dataset. */
  url?: string;
  citations: { text: string; url?: string }[];
}

/** Where a network that is not the user's own file came from. */
export type NetworkOrigin = NetgamutOrigin;

/** Everything the app knows about the currently loaded network. */
export interface LoadedNetwork {
  kind: "raw" | "clustered";
  filename: string;
  /** Set for a network from a catalog; absent for the user's files, the bundled examples and Infomap Online. */
  origin?: NetworkOrigin;
  /**
   * Every file the network was built from (network, partition, or ftree).
   * Bundled companions (the example's module names) are not sources.
   */
  sources: SourceFile[];
  /** Options loadFiles ran with; absent for the example and Infomap Online. */
  loadOptions?: ClusterOptions;
  /** Topology summary computed once at load time. */
  stats: NetworkStats;
  directed: boolean;
  isStates: boolean;
  /** Leaf graph (state-node graph when isStates). Rendered via buildGraph(). */
  graph: BuildGraphInput;
  /** Present when isStates: the engine shows it through stateNetwork()/view(). */
  stateGraph?: BuildStateGraphInput;
  /** Display name per dense node index (state names when isStates). */
  names: string[];
  /** States only: display name per dense physical node (stateGraph's physical index). */
  physicalNames?: string[];
  /**
   * The id Infomap keys each node by when it reads the file, per dense index
   * (for states: the state's physical id). Absent when the file has none: an
   * edge list whose labels aren't all plain integer ids, which only a partition
   * file needs (in-app runs read Navigator's numbering, see infomapInput).
   */
  physicalIds?: number[];
  /** The network file is an edge list, which Infomap reads as Navigator numbers it (infomapInput). */
  edgeList?: boolean;
  /** Original state id per dense index (states only). */
  stateIds?: number[];
  /**
   * Multilayer only: the layer per dense index. A multilayer file names no
   * state ids: Infomap numbers its state nodes itself, so its output is matched
   * by layer and physical id (layerStateIds).
   */
  layerIds?: number[];
  /** Per-node Infomap paths, dense-index keyed (kind === "clustered"). */
  modules?: ModuleNode[];
  /**
   * Module-level links from an .ftree's *Links sections (rows with a module
   * endpoint), path-addressed for d3gl's data(graph, { moduleLinks }).
   * Leaf-to-leaf rows are in `graph` instead.
   */
  moduleLinks?: ModuleLink[];
  /** Curated module names: pathKey ("1:2") → name. Only the example ships these. */
  moduleNames?: Map<string, string>;
  /** Loaded .ftree text — export source. In-app Infomap runs write no ftree. */
  ftree?: string;
  /** Header of the in-app Infomap run that produced `modules`. */
  infomap?: InfomapSummary;
  /** JSON tree of the in-app Infomap run — export source. */
  infomapJson?: InfomapTree;
  /**
   * Per dense node: the Infomap link flow leaving its bottom module from it
   * (its exit flow, the node's flow border). From an in-app Infomap run of a
   * plain network, when it adds up to Infomap's module exit flow (see
   * boundaryFlow): an .ftree has no cross-module leaf links. A raw network's
   * is its degree flow leaving each node (degreeExitFlow) until Infomap runs.
   */
  boundaryFlow?: Float32Array;
  /**
   * Per dense node: the link flow entering its bottom module at it (its enter
   * flow), with boundaryFlow and from the same source. A raw network's degree
   * flow, read as undirected, enters each node as it leaves: boundaryFlow.
   */
  boundaryEnterFlow?: Float32Array;
  /**
   * A state network's physical nodes' flow borders, for the physical view: the
   * flow leaving each to other physical nodes (a raw one's degreeExitFlow).
   */
  physicalBoundaryFlow?: Float32Array;
  /** The flow entering each physical node from other physical nodes. */
  physicalBoundaryEnterFlow?: Float32Array;
  /**
   * Set when those node flows are the flow along links only: the in-app
   * Infomap run also moved flow between modules without a link (regularization,
   * recorded teleportation), which Infomap reports for whole modules
   * (moduleFlow) but not per node. Holds where the links fall short. Flow
   * borders then draw the modules' only.
   */
  partialNodeFlow?: string;
  /** Every module's enter/exit flow, by pathKey (root ""): from the in-app Infomap run, or an .ftree's *Links headers. */
  moduleFlow?: Map<string, ModuleFlow>;
  /** Raw network file text — enables (re-)clustering with Infomap. */
  networkText?: string;
}

export interface ClusterOptions {
  directed: boolean;
  twoLevel: boolean;
  noInfomap: boolean;
  regularized?: boolean;
  clusterFilename?: string;
}
