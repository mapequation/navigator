export interface ViewTransform {
  k: number;
  x: number;
  y: number;
}

/**
 * Compute the zoom transform that fits the given nodes (all when indices is
 * null) into a width×height viewport. Placeholder for d3gl fitToNodes()
 * (mapequation/d3gl#197).
 */
export function fitTransform(
  positions: Float32Array,
  indices: ArrayLike<number> | null,
  width: number,
  height: number,
  padding = 0.9,
  extent: readonly [number, number] = [0, Infinity],
): ViewTransform | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (i: number): void => {
    const x = positions[2 * i];
    const y = positions[2 * i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  if (indices) {
    for (let j = 0; j < indices.length; j++) consider(indices[j]);
  } else {
    for (let i = 0; i < positions.length / 2; i++) consider(i);
  }
  if (!Number.isFinite(minX)) return null;

  const w = Math.max(maxX - minX, 1e-9);
  const h = Math.max(maxY - minY, 1e-9);
  // Clamped to the zoom extent: a single node (or nodes on one spot) has no
  // extent to fit, and would otherwise zoom in without bound.
  const k = Math.min(
    extent[1],
    Math.max(extent[0], padding * Math.min(width / w, height / h)),
  );
  return {
    k,
    x: width / 2 - ((minX + maxX) / 2) * k,
    y: height / 2 - ((minY + maxY) / 2) * k,
  };
}
