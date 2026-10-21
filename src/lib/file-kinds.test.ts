import { describe, expect, it } from "vitest";
import { fileKind, isStatesText } from "./file-kinds";

describe("fileKind", () => {
  it("classifies by extension", () => {
    expect(fileKind("a.ftree")).toBe("ftree");
    expect(fileKind("a.tree")).toBe("tree");
    expect(fileKind("a.stree")).toBe("tree");
    expect(fileKind("a.clu")).toBe("clu");
    expect(fileKind("a.net")).toBe("network");
    expect(fileKind("a.paj")).toBe("network");
    expect(fileKind("a.txt")).toBe("network");
    expect(fileKind("a.edges")).toBe("network");
    expect(fileKind("a.csv")).toBe("metadata");
    expect(fileKind("a.TSV")).toBe("metadata");
    expect(fileKind("weird.xyz")).toBe("unknown");
  });
});

describe("isStatesText", () => {
  it("detects a *States section", () => {
    expect(
      isStatesText('*Vertices 2\n1 "a"\n*States\n1 1\n*Links\n1 2 1'),
    ).toBe(true);
    expect(isStatesText("*Vertices 2\n*Edges\n1 2")).toBe(false);
  });
});
