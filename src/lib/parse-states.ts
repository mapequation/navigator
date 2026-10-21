import type {
  BuildGraphInput,
  BuildStateGraphInput,
} from "@mapequation/d3gl/network";

export interface ParsedStates {
  stateGraph: BuildStateGraphInput;
  /** Flat state-level graph for raw rendering (same edges, state nodes as nodes). */
  graph: BuildGraphInput;
  names: string[];
  /** Name per dense physical node (the state graph's physical index). */
  physicalNames: string[];
  physicalIds: number[];
  stateIds: number[];
}

const unquote = (s: string | undefined): string | undefined =>
  s?.startsWith('"') ? s.slice(1, -1) : s;

/** Parse an Infomap *States network file. Upstreaming tracked by mapequation/d3gl#198. */
export function parseStates(
  text: string,
  filename: string,
  directed = true,
): ParsedStates {
  const physicalNames = new Map<number, string>();
  const stateIds: number[] = [];
  const physicalIds: number[] = [];
  const names: string[] = [];
  const stateIndex = new Map<number, number>();
  const source: number[] = [];
  const target: number[] = [];
  const weight: number[] = [];

  let section: "vertices" | "states" | "links" | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("*")) {
      const name = line.slice(1).split(/\s/)[0].toLowerCase();
      if (name === "vertices") section = "vertices";
      else if (name === "states") section = "states";
      else if (name === "links" || name === "edges" || name === "arcs")
        section = "links";
      else section = null;
      continue;
    }
    const tokens = line.match(/"[^"]*"|\S+/g) ?? [];
    if (section === "vertices") {
      physicalNames.set(
        Number(tokens[0]),
        unquote(tokens[1]) ?? tokens[0] ?? "",
      );
    } else if (section === "states") {
      const stateId = Number(tokens[0]);
      const physicalId = Number(tokens[1]);
      stateIndex.set(stateId, stateIds.length);
      stateIds.push(stateId);
      physicalIds.push(physicalId);
      names.push(
        unquote(tokens[2]) ??
          physicalNames.get(physicalId) ??
          String(physicalId),
      );
    } else if (section === "links") {
      const s = stateIndex.get(Number(tokens[0]));
      const t = stateIndex.get(Number(tokens[1]));
      if (s === undefined || t === undefined) {
        throw new Error(`${filename}: link references unknown state (${line})`);
      }
      source.push(s);
      target.push(t);
      weight.push(tokens[2] !== undefined ? Number(tokens[2]) : 1);
    }
  }

  if (!stateIds.length)
    throw new Error(`${filename}: no *States section found`);

  // Names may only be known after *Vertices — re-resolve fallbacks that used the raw id.
  physicalIds.forEach((pid, i) => {
    if (names[i] === String(pid)) {
      const name = physicalNames.get(pid);
      if (name) names[i] = name;
    }
  });

  const physicalIndex = new Map<number, number>();
  const densePhysicalNames: string[] = [];
  for (const id of physicalIds) {
    if (physicalIndex.has(id)) continue;
    physicalIndex.set(id, physicalIndex.size);
    densePhysicalNames.push(physicalNames.get(id) ?? String(id));
  }

  return {
    stateGraph: {
      stateCount: stateIds.length,
      stateToPhysical: physicalIds.map((id) => physicalIndex.get(id) ?? 0),
      source,
      target,
      weight,
      directed,
      physicalCount: physicalIndex.size,
    },
    graph: { nodeCount: stateIds.length, source, target, weight, directed },
    names,
    physicalNames: densePhysicalNames,
    physicalIds,
    stateIds,
  };
}
