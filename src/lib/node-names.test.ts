import { describe, expect, it } from "vitest";
import { parseNodeNames } from "./node-names";

describe("parseNodeNames", () => {
  it("takes the first CSV column and unwraps quotes", () => {
    expect(parseNodeNames('alpha,1\n"beta",2\n  delta  \n', "a.csv")).toEqual([
      "alpha",
      "beta",
      "delta",
    ]);
    expect(parseNodeNames('"x y",3\r\n\r\nz\r\n', "a.csv")).toEqual([
      "x y",
      "z",
    ]);
  });

  it("splits .tsv files on tabs", () => {
    expect(parseNodeNames("a, b\t1\nc\t2\n", "set.TSV")).toEqual(["a, b", "c"]);
  });

  it("strips a byte-order mark", () => {
    expect(parseNodeNames("﻿first\nsecond", "a.csv")).toEqual([
      "first",
      "second",
    ]);
  });
});
