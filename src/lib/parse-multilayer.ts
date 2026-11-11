import type {
  BuildGraphInput,
  BuildStateGraphInput,
} from "@mapequation/d3gl/network";

export interface ParsedMultilayer {
  stateGraph: BuildStateGraphInput;
  /** Flat state-level graph for raw rendering (same links, state nodes as nodes). */
  graph: BuildGraphInput;
  /** Per state node: its physical node's name. */
  names: string[];
  /** Name per dense physical node (the state graph's physical index). */
  physicalNames: string[];
  /** Per state node: the file's id of its physical node. */
  physicalIds: number[];
  /** Per state node: its layer. */
  layerIds: number[];
}

const unquote = (s: string | undefined): string | undefined =>
  s?.startsWith('"') ? s.slice(1, -1) : s;

/** A non-negative integer id, else NaN: "1.5", "-1", "a" and "" are not ids. */
const idOf = (token: string | undefined): number =>
  token !== undefined && /^\d+$/.test(token) ? Number(token) : Number.NaN;

/**
 * Parse Infomap's multilayer format: *Vertices (`id "name"`), then links as
 * `*Intra` (`layer node node weight`), `*Inter` (`layer node layer weight`) or
 * `*Multilayer` (`layer node layer node weight`). Each link joins two state
 * nodes, a state node being a physical node in one layer, so every section is
 * the one rule `layer node layer node`: `*Intra` stays in its layer, `*Inter`
 * stays on its node. A state node exists where a link names it, in the order
 * the links name them; a vertex no link names has none. The links are the
 * file's own: no link between layers is added where the file has none, as
 * Infomap's relax rate couples the layers in its model only.
 */
export function parseMultilayer(
  text: string,
  filename: string,
  directed = false,
): ParsedMultilayer {
  const physicalNames = new Map<number, string>();
  const physicalIds: number[] = [];
  const layerIds: number[] = [];
  /** State node index by layer, then physical id. */
  const stateIndex = new Map<number, Map<number, number>>();
  const source: number[] = [];
  const target: number[] = [];
  const weight: number[] = [];

  const stateOf = (layer: number, node: number): number => {
    let inLayer = stateIndex.get(layer);
    if (!inLayer) {
      inLayer = new Map();
      stateIndex.set(layer, inLayer);
    }
    let s = inLayer.get(node);
    if (s === undefined) {
      s = physicalIds.length;
      inLayer.set(node, s);
      physicalIds.push(node);
      layerIds.push(layer);
    }
    return s;
  };

  let section: "vertices" | "intra" | "inter" | "multilayer" | null = null;
  let lineNo = 0;
  for (const raw of text.split(/\r?\n/)) {
    lineNo++;
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("*")) {
      const name = line.slice(1).split(/\s/)[0].toLowerCase();
      section =
        name === "vertices" ||
        name === "intra" ||
        name === "inter" ||
        name === "multilayer"
          ? name
          : null;
      continue;
    }
    const tokens = line.match(/"[^"]*"|\S+/g) ?? [];
    if (section === "vertices") {
      physicalNames.set(
        Number(tokens[0]),
        unquote(tokens[1]) ?? tokens[0] ?? "",
      );
      continue;
    }
    if (section === null) continue;
    // As `layer node layer node`, and the weight's position.
    const [ends, at] =
      section === "intra"
        ? [[tokens[0], tokens[1], tokens[0], tokens[2]], 3]
        : section === "inter"
          ? [[tokens[0], tokens[1], tokens[2], tokens[1]], 3]
          : [[tokens[0], tokens[1], tokens[2], tokens[3]], 4];
    const [l1, n1, l2, n2] = ends.map(idOf);
    const w = tokens[at] === undefined ? 1 : Number(tokens[at]);
    if ([l1, n1, l2, n2].some(Number.isNaN) || Number.isNaN(w)) {
      const shape =
        section === "intra"
          ? "layer node node weight"
          : section === "inter"
            ? "layer node layer weight"
            : "layer node layer node weight";
      throw new Error(
        `${filename}, line ${lineNo}: a *${section[0].toUpperCase()}${section.slice(1)} line is ${shape}, with integer layers and nodes (${line})`,
      );
    }
    source.push(stateOf(l1, n1));
    target.push(stateOf(l2, n2));
    weight.push(w);
  }

  if (!physicalIds.length)
    throw new Error(
      `${filename}: no links in an *Intra, *Inter or *Multilayer section`,
    );

  const physicalIndex = new Map<number, number>();
  const densePhysicalNames: string[] = [];
  for (const id of physicalIds) {
    if (physicalIndex.has(id)) continue;
    physicalIndex.set(id, physicalIndex.size);
    densePhysicalNames.push(physicalNames.get(id) ?? String(id));
  }
  const stateCount = physicalIds.length;
  return {
    stateGraph: {
      stateCount,
      stateToPhysical: physicalIds.map((id) => physicalIndex.get(id) ?? 0),
      source,
      target,
      weight,
      directed,
      physicalCount: physicalIndex.size,
    },
    graph: { nodeCount: stateCount, source, target, weight, directed },
    names: physicalIds.map((id) => physicalNames.get(id) ?? String(id)),
    physicalNames: densePhysicalNames,
    physicalIds,
    layerIds,
  };
}
