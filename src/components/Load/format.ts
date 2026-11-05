/**
 * Categorical colours for the catalog's domains, in the index's domain order: the Okabe-Ito hues, checked for
 * colour-vision deficiency across every pair on the white surface. Each domain keeps its colour whatever the
 * filters show, and is always named in text beside it.
 */
const SLOTS = [
  "#0072B2", // blue
  "#D55E00", // vermillion
  "#009E73", // bluish green
  "#E69F00", // orange
  "#CC79A7", // reddish purple
  "#56B4E9", // sky blue
];
const OTHER = "#a3a3a3";

export function domainColor(
  domain: string | undefined,
  order: readonly string[],
): string {
  const slot = domain === undefined ? -1 : order.indexOf(domain);
  return slot >= 0 && slot < SLOTS.length ? SLOTS[slot] : OTHER;
}

const compactFormat = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** 1.2k, 35M. */
export const compact = (n: number): string => compactFormat.format(n);

/** 1,234,567. */
export const full = (n: number): string => n.toLocaleString("en");

/** A download size: 654 B, 46 kB, 1.4 MB. */
export function bytes(n: number): string {
  if (n < 1e3) return `${n} B`;
  if (n < 1e6) return `${Math.round(n / 1e3)} kB`;
  return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`;
}

/** Networks this large take a while to download, lay out and draw in a browser. */
export const LARGE_LINKS = 1_000_000;
