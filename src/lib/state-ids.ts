import type { ModuleNode, PhysicalToState } from "@mapequation/d3gl/network";

/** The views of a state network (d3gl's `view()`). */
export type StateView = "physical" | "state" | "both";

/**
 * The ids the engine draws a set of state nodes by in `view`: the state ids
 * themselves in the state and both views (both draws the state nodes, inside
 * their physical containers), their distinct physical nodes in the physical
 * view. The store keeps a state network's ids as state ids.
 */
export function viewIds(
  stateIds: readonly number[],
  view: StateView,
  stateToPhysical: ArrayLike<number>,
): readonly number[] {
  if (view !== "physical") return stateIds;
  const physical = new Set<number>();
  for (const s of stateIds) {
    const p = stateToPhysical[s];
    if (p !== undefined) physical.add(p);
  }
  return [...physical];
}

/** Physical node `p`'s state nodes. */
export function statesOf(
  physicalToState: PhysicalToState,
  p: number,
): number[] {
  const { offsets, states } = physicalToState;
  return Array.from(states.subarray(offsets[p], offsets[p + 1]));
}

/**
 * The module d3gl colours physical node `p` by with `{ by: "module" }`: the
 * top module holding most of its state nodes' flow (`flow` indexed by state
 * id; by count without flow), as its pie's largest wedge (pie level 1); a tie
 * (shares within 1e-6, as d3gl's) goes to the lower module. [] for none. `modules` is indexed by state id.
 */
export function physicalModule(
  physicalToState: PhysicalToState,
  p: number,
  modules: ArrayLike<ModuleNode>,
  flow?: ArrayLike<number> | null,
): number[] {
  const { offsets, states } = physicalToState;
  const byFlow = new Map<number, number>();
  const byCount = new Map<number, number>();
  let total = 0;
  let counted = 0;
  for (let k = offsets[p] ?? 0; k < (offsets[p + 1] ?? 0); k++) {
    const s = states[k] ?? -1;
    const m = modules[s]?.path[0];
    if (m === undefined) continue;
    const w = flow?.[s] ?? 0;
    total += w;
    counted++;
    byFlow.set(m, (byFlow.get(m) ?? 0) + w);
    byCount.set(m, (byCount.get(m) ?? 0) + 1);
  }
  // In module order, a later module wins only by more than d3gl's tie
  // margin (a share of 1e-6, its float32 rounding).
  const [by, sum] = total > 0 ? [byFlow, total] : [byCount, counted];
  let top: number | undefined;
  let most = -1;
  for (const [m, w] of [...by].sort((a, b) => a[0] - b[0]))
    if (w / sum > most + 1e-6) {
      top = m;
      most = w / sum;
    }
  return top === undefined ? [] : [top];
}
