import { normalizeModulePath, pathKey } from "./path-key";
import type { InfomapTree } from "./types";

/**
 * Infomap's link list from its `flow` output (-o flow): one row per link
 * Infomap holds (duplicate input links merged), keyed by Infomap node id.
 */
export interface FlowLinks {
  count: number;
  source: Float64Array;
  target: Float64Array;
  flow: Float64Array;
  /**
   * The rows came from an `*Edges` section (an undirected flow model): a
   * row's flow is the flow along the link in both directions together. In an
   * `*Arcs` section it runs from source to target only.
   */
  undirected: boolean;
}

/** A module's enter and exit flow, as Infomap's JSON tree reports them. */
export interface ModuleFlow {
  enterFlow: number;
  exitFlow: number;
}

/**
 * Parse the link rows of Infomap's flow text: the `*Arcs`, `*Edges` or
 * `*Links` section's `source target flow` rows. `*Vertices` rows and `#`
 * comments are skipped. O(text), one pass.
 */
export function parseFlowLinks(text: string): FlowLinks {
  let cap = 1024;
  let source = new Float64Array(cap);
  let target = new Float64Array(cap);
  let flow = new Float64Array(cap);
  let count = 0;
  let inLinks = false;
  let undirected = false;
  const len = text.length;
  let pos = 0;
  while (pos < len) {
    let end = text.indexOf("\n", pos);
    if (end < 0) end = len;
    const c = text.charCodeAt(pos);
    if (c === 42 /* * */) {
      const head = text.slice(pos, Math.min(end, pos + 8)).toLowerCase();
      inLinks =
        head.startsWith("*arcs") ||
        head.startsWith("*edges") ||
        head.startsWith("*links");
      if (head.startsWith("*edges")) undirected = true;
    } else if (inLinks && c !== 35 /* # */ && end > pos) {
      // "s t f": two integer ids, then the flow (may be in e-notation).
      let i = pos;
      let s = 0;
      while (i < end && text.charCodeAt(i) === 32) i++;
      let d = text.charCodeAt(i);
      while (d >= 48 && d <= 57) {
        s = s * 10 + (d - 48);
        d = text.charCodeAt(++i);
      }
      while (i < end && text.charCodeAt(i) === 32) i++;
      let t = 0;
      const tStart = i;
      d = text.charCodeAt(i);
      while (d >= 48 && d <= 57) {
        t = t * 10 + (d - 48);
        d = text.charCodeAt(++i);
      }
      const f = Number(text.slice(i, end));
      if (i === tStart || !Number.isFinite(f)) {
        throw new Error(
          `Infomap flow output: unreadable link row "${text.slice(pos, end)}"`,
        );
      }
      if (count === cap) {
        cap *= 2;
        const grow = (a: Float64Array) => {
          const b = new Float64Array(cap);
          b.set(a);
          return b;
        };
        source = grow(source);
        target = grow(target);
        flow = grow(flow);
      }
      source[count] = s;
      target[count] = t;
      flow[count] = f;
      count++;
    }
    pos = end + 1;
  }
  return { count, source, target, flow, undirected };
}

/** Every module's enter/exit flow from the JSON tree, by pathKey (root: ""). */
export function moduleFlowOf(tree: InfomapTree): Map<string, ModuleFlow> {
  const out = new Map<string, ModuleFlow>();
  for (const m of tree.modules ?? []) {
    out.set(pathKey(normalizeModulePath(m.path)), {
      enterFlow: m.enterFlow,
      exitFlow: m.exitFlow,
    });
  }
  return out;
}

// Infomap writes flows with 6 significant digits, in the flow text and in
// the JSON alike: each value is off by at most 5e-6 of itself, and a sum of
// non-negative values by at most 5e-6 of the sum.
const REL_TOL = 2e-5;
const ABS_TOL = 1e-12;

export type BoundaryFlowResult =
  | {
      ok: true;
      /** The flow leaving each node's bottom module from it: its exit flow. */
      node: Float32Array;
      /** The flow entering each node's bottom module at it: its enter flow. */
      enter: Float32Array;
      /** The largest of `node`. */
      max: number;
      /** With `groups`: the link flow leaving each group (see boundaryFlow). */
      group?: Float32Array;
      /** With `groups`: the link flow entering each group. */
      groupEnter?: Float32Array;
    }
  | { ok: false; reason: string };

/**
 * Per node: the Infomap link flow leaving its bottom module from it (the
 * node's exit flow), and entering it at it (its enter flow). For every link
 * whose endpoints sit in different bottom modules: an arc s→t with flow f
 * adds f to s's exit and t's enter flow; an undirected edge, whose f is the
 * flow both ways, adds f/2 to each end's exit and enter flow. Summed over a
 * bottom module's leaves those are the flow leaving and entering it, which the
 * JSON tree reports as exitFlow and enterFlow; the result is checked against
 * both for every bottom module and refused (ok: false) on any mismatch — as
 * with recorded teleportation or regularization, whose teleportation flow
 * crosses module boundaries without a link.
 *
 * `denseOf` maps an Infomap node id to the node's dense index; `keyOf` gives
 * a tree node's Infomap id as the flow links name it (a state node's state
 * id), as withClustering matches them.
 *
 * With `groups` (a state network's physical nodes: `of` maps a dense node to
 * its group), also the link flow leaving and entering each group, by the same
 * rule over the links whose ends are in different groups, whatever their
 * modules. A group may span modules, so these have no module flow to check
 * against.
 */
export function boundaryFlow(
  tree: InfomapTree,
  flowText: string,
  nodeCount: number,
  denseOf: (infomapId: number) => number | undefined,
  keyOf: (n: InfomapTree["nodes"][number]) => number = (n) => n.id,
  groups?: { of: ArrayLike<number>; count: number },
): BoundaryFlowResult {
  // Bottom module of each dense node, as a small integer.
  const bottomOf = new Int32Array(nodeCount).fill(-1);
  const bottomIds = new Map<string, number>();
  const bottomKeys: string[] = [];
  let maxId = 0;
  for (const n of tree.nodes) if (keyOf(n) > maxId) maxId = keyOf(n);
  // Infomap ids → dense, through a typed array when the ids are compact.
  const compact = maxId <= 4 * nodeCount + 1024;
  const lookup = compact ? new Int32Array(maxId + 1).fill(-1) : null;
  const sparse = compact ? null : new Map<number, number>();
  for (const n of tree.nodes) {
    const id = keyOf(n);
    const idx = denseOf(id);
    if (idx === undefined) continue;
    if (lookup) lookup[id] = idx;
    else sparse?.set(id, idx);
    const key = pathKey(n.path.slice(0, -1));
    let b = bottomIds.get(key);
    if (b === undefined) {
      b = bottomKeys.length;
      bottomIds.set(key, b);
      bottomKeys.push(key);
    }
    bottomOf[idx] = b;
  }
  const dense = (id: number): number =>
    lookup ? (id < lookup.length ? lookup[id] : -1) : (sparse?.get(id) ?? -1);

  const links = parseFlowLinks(flowText);
  const ring = new Float64Array(nodeCount);
  const enter = new Float64Array(nodeCount);
  const group = groups ? new Float64Array(groups.count) : null;
  const groupEnter = groups ? new Float64Array(groups.count) : null;
  for (let e = 0; e < links.count; e++) {
    const s = dense(links.source[e]);
    const t = dense(links.target[e]);
    if (s < 0 || t < 0) {
      return {
        ok: false,
        reason: `a flow link names node ${s < 0 ? links.source[e] : links.target[e]}, which the tree lacks`,
      };
    }
    const f = links.flow[e];
    if (group && groupEnter && groups) {
      const a = groups.of[s];
      const b = groups.of[t];
      if (a !== b) {
        if (links.undirected) {
          group[a] += f / 2;
          group[b] += f / 2;
          groupEnter[a] += f / 2;
          groupEnter[b] += f / 2;
        } else {
          group[a] += f;
          groupEnter[b] += f;
        }
      }
    }
    if (bottomOf[s] === bottomOf[t]) continue;
    if (links.undirected) {
      ring[s] += f / 2;
      ring[t] += f / 2;
      enter[s] += f / 2;
      enter[t] += f / 2;
    } else {
      ring[s] += f;
      enter[t] += f;
    }
  }

  const sumOut = new Float64Array(bottomKeys.length);
  const sumIn = new Float64Array(bottomKeys.length);
  for (let i = 0; i < nodeCount; i++) {
    if (bottomOf[i] < 0) continue;
    sumOut[bottomOf[i]] += ring[i];
    sumIn[bottomOf[i]] += enter[i];
  }
  const modules = moduleFlowOf(tree);
  const off = (got: number, want: number): boolean =>
    Math.abs(got - want) >
    REL_TOL * Math.max(Math.abs(got), Math.abs(want)) + ABS_TOL;
  for (let b = 0; b < bottomKeys.length; b++) {
    const m = modules.get(bottomKeys[b]);
    if (!m)
      return {
        ok: false,
        reason: `module ${bottomKeys[b]} is missing from the tree`,
      };
    if (off(sumOut[b], m.exitFlow)) {
      return {
        ok: false,
        reason: `module ${bottomKeys[b]}: its links carry ${sumOut[b]} out of it, Infomap reports exit flow ${m.exitFlow}`,
      };
    }
    if (off(sumIn[b], m.enterFlow)) {
      return {
        ok: false,
        reason: `module ${bottomKeys[b]}: its links carry ${sumIn[b]} into it, Infomap reports enter flow ${m.enterFlow}`,
      };
    }
  }

  const node = Float32Array.from(ring);
  let max = 0;
  for (const v of node) if (v > max) max = v;
  return {
    ok: true,
    node,
    enter: Float32Array.from(enter),
    max,
    ...(group && groupEnter
      ? {
          group: Float32Array.from(group),
          groupEnter: Float32Array.from(groupEnter),
        }
      : {}),
  };
}
