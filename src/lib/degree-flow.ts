/**
 * A raw network's preliminary flow until Infomap runs: each node's weighted
 * degree over the total, the stationary flow of the network read as
 * undirected. A self-link counts once, as in Infomap
 * (`sumWeightedDegree = 2 · sumLinkWeight − sumSelfLinkWeight`). All zeros
 * without link weight. O(nodes + links).
 */
export function degreeFlow(
  nodeCount: number,
  source: ArrayLike<number>,
  target: ArrayLike<number>,
  weight?: ArrayLike<number> | null,
): Float32Array {
  const degree = new Float64Array(nodeCount);
  let total = 0;
  for (let e = 0; e < source.length; e++) {
    const w = weight ? (weight[e] ?? 0) : 1;
    const s = source[e] ?? -1;
    const t = target[e] ?? -1;
    degree[s] += w;
    total += w;
    if (t !== s) {
      degree[t] += w;
      total += w;
    }
  }
  const flow = new Float32Array(nodeCount);
  if (total > 0)
    for (let i = 0; i < nodeCount; i++) flow[i] = degree[i] / total;
  return flow;
}

/**
 * A raw network's flow borders until Infomap runs: the degree flow leaving each
 * group along its links, a group being a node (`groupOf` omitted) or, by
 * `groupOf`, the physical node of a state node. Read as undirected, a link of
 * weight w carries 2w/D both ways together (D the total weighted degree, a
 * self-link once), w/D out of each end; a link inside a group carries none
 * out of it. Without self-links, a node's is its degree flow. O(links).
 */
export function degreeExitFlow(
  groupCount: number,
  source: ArrayLike<number>,
  target: ArrayLike<number>,
  weight?: ArrayLike<number> | null,
  groupOf?: ArrayLike<number>,
): Float32Array {
  let total = 0;
  for (let e = 0; e < source.length; e++) {
    const w = weight ? (weight[e] ?? 0) : 1;
    total += source[e] === target[e] ? w : 2 * w;
  }
  const exit = new Float64Array(groupCount);
  if (total > 0)
    for (let e = 0; e < source.length; e++) {
      const s = source[e] ?? -1;
      const t = target[e] ?? -1;
      const a = groupOf ? (groupOf[s] ?? -1) : s;
      const b = groupOf ? (groupOf[t] ?? -1) : t;
      if (a === b) continue;
      const f = (weight ? (weight[e] ?? 0) : 1) / total;
      exit[a] += f;
      exit[b] += f;
    }
  return Float32Array.from(exit);
}
