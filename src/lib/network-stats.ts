import type { ModuleNode } from "@mapequation/d3gl/network";

export interface NetworkStats {
  nodes: number;
  /** Links counted in the stats below (for ftree loads: leaf-level links only). */
  links: number;
  /** Module-level links in an ftree (aggregated leaf links; not counted in `links`). */
  moduleLinks?: number;
  /** Distinct physical nodes, when it differs from `nodes` (state/memory networks). */
  physicalNodes?: number;
  /** Mean total degree (in + out for directed networks). */
  meanDegree: number;
  maxDegree: number;
  /** Null when every link weight is 1. */
  weight: { mean: number; max: number } | null;
  /** True when the weights are Infomap link flows (ftree) rather than file weights. */
  weightIsFlow: boolean;
}

export function computeStats(
  nodeCount: number,
  source: ArrayLike<number>,
  target: ArrayLike<number>,
  weight: ArrayLike<number> | undefined,
  opts: { weightIsFlow?: boolean; physicalIds?: readonly number[] } = {},
): NetworkStats {
  const links = source.length;
  const degree = new Uint32Array(nodeCount);
  let sum = 0;
  let max = 0;
  let weighted = false;
  for (let e = 0; e < links; e++) {
    degree[source[e]]++;
    degree[target[e]]++;
    const w = weight?.[e] ?? 1;
    sum += w;
    if (w > max) max = w;
    if (w !== 1) weighted = true;
  }
  let maxDegree = 0;
  for (const d of degree) if (d > maxDegree) maxDegree = d;
  const stats: NetworkStats = {
    nodes: nodeCount,
    links,
    meanDegree: nodeCount ? (2 * links) / nodeCount : 0,
    maxDegree,
    weight: weighted && links ? { mean: sum / links, max } : null,
    weightIsFlow: opts.weightIsFlow ?? false,
  };
  if (opts.physicalIds) {
    const physical = new Set(opts.physicalIds).size;
    if (physical !== nodeCount) stats.physicalNodes = physical;
  }
  return stats;
}

export interface ModuleStats {
  topModules: number;
  /** Number of levels including the leaf level, as Infomap reports it (two-level = 2). */
  levels: number;
  /** Modules that directly contain leaf nodes. */
  leafModules: number;
  codelength: number | null;
}

/**
 * `codelength` (an in-app Infomap run's JSON header) wins over the header of a
 * loaded `ftree`.
 */
export function computeModuleStats(
  modules: readonly ModuleNode[],
  source: { codelength?: number; ftree?: string } = {},
): ModuleStats {
  const top = new Set<number>();
  const leafModules = new Set<string>();
  let levels = 0;
  for (const m of modules) {
    const p = m.path;
    if (!p.length) continue;
    top.add(p[0]);
    if (p.length > levels) levels = p.length;
    leafModules.add(Array.prototype.slice.call(p, 0, -1).join(":"));
  }
  const match = source.ftree?.slice(0, 2000).match(/^# codelength (\S+) bits/m);
  return {
    topModules: top.size,
    levels,
    leafModules: leafModules.size,
    codelength: source.codelength ?? (match ? Number(match[1]) : null),
  };
}

/** UTF-8 byte length without allocating an encoded copy. */
export function byteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c < 0xdc00) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["kB", "MB", "GB"];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[u]}`;
}

/** Compact number for stat rows: 3 significant digits, no exponent for normal ranges. */
export function formatNumber(v: number): string {
  if (Number.isInteger(v)) return v.toLocaleString();
  if (v !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e6))
    return v.toExponential(2);
  return v.toLocaleString(undefined, { maximumSignificantDigits: 3 });
}
