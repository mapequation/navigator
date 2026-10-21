/**
 * Node names from a metadata file (v1 "occurrences"): the first column of
 * each line, trimmed, with a surrounding pair of double quotes unwrapped.
 * Columns split on tabs for .tsv and on commas otherwise; blank lines drop.
 */
export function parseNodeNames(text: string, filename = ""): string[] {
  const delimiter = /\.tsv$/i.test(filename) ? "\t" : ",";
  return text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .split(delimiter)[0]
        .trim()
        .replace(/^"(.*)"$/, "$1"),
    )
    .filter(Boolean);
}
