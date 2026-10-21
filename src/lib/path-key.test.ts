import { describe, expect, it } from "vitest";
import { normalizeModulePath, parseNodePath, pathKey } from "./path-key";

describe("pathKey", () => {
  it("joins with colons", () => {
    expect(pathKey([1, 2, 3])).toBe("1:2:3");
    expect(pathKey([])).toBe("");
  });
});

describe("normalizeModulePath", () => {
  it("maps the parser's root path [0] to []", () => {
    expect(normalizeModulePath([0])).toEqual([]);
  });
  it("passes real paths through", () => {
    expect(normalizeModulePath([1, 4])).toEqual([1, 4]);
  });
});

describe("parseNodePath", () => {
  it("splits string paths from tree files", () => {
    expect(parseNodePath("1:2:3")).toEqual([1, 2, 3]);
  });
  it("passes arrays through", () => {
    expect(parseNodePath([1, 2])).toEqual([1, 2]);
  });
});
