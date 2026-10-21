/** "1:2:3" key for a module/node path. */
export function pathKey(path: ArrayLike<number>): string {
  return Array.from(path).join(":");
}

/** infomap-parser reports the root *Links section as path [0]; the app uses [] for root. */
export function normalizeModulePath(path: ArrayLike<number>): number[] {
  const arr = Array.from(path);
  return arr.length === 1 && arr[0] === 0 ? [] : arr;
}

/**
 * infomap-parser v1 returns NODE paths as "1:2:3" strings for tree files
 * (module paths, in contrast, are number[]) — verified against the parser
 * source. Normalize before use.
 */
export function parseNodePath(path: number[] | string): number[] {
  return typeof path === "string" ? path.split(":").map(Number) : path;
}
