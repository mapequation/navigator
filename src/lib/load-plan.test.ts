import { describe, expect, it } from "vitest";
import {
  type CurrentLoad,
  planLoad,
  restage,
  type StagedFile,
} from "./load-plan";
import type { ClusterOptions } from "./types";

const OPTS: ClusterOptions = {
  directed: false,
  twoLevel: false,
  noInfomap: false,
};
const NET = {
  name: "toy.net",
  size: 10,
  text: "*Edges\n1 2\n",
  kind: "network" as const,
};
const CLU = { name: "toy.clu", size: 4, text: "1 1\n", kind: "clu" as const };
const META = { id: "occ-1", name: "set.csv", size: 2, text: "a\n" };

const dropped = (
  name: string,
  text: string,
  kind: StagedFile["kind"],
): StagedFile => ({
  id: crypto.randomUUID(),
  name,
  size: text.length,
  text,
  kind,
});

describe("restage", () => {
  it("lists the network inputs, then the metadata files by occurrence id", () => {
    const staged = restage({ sources: [NET, CLU], metadata: [META] });
    expect(staged.map((f) => [f.name, f.kind, f.occurrenceId])).toEqual([
      ["toy.net", "network", undefined],
      ["toy.clu", "clu", undefined],
      ["set.csv", "metadata", "occ-1"],
    ]);
    expect(staged[0].text).toBe(NET.text);
  });
});

describe("planLoad", () => {
  const cur: CurrentLoad = {
    sources: [NET],
    loadOptions: OPTS,
    metadata: [META],
  };

  it("loads when nothing is loaded yet", () => {
    expect(planLoad([dropped("a.net", "x", "network")], null, OPTS)).toEqual({
      type: "load",
    });
  });

  it("clears when every file was removed", () => {
    expect(planLoad([], cur, OPTS)).toEqual({ type: "clear" });
  });

  it("is a no-op for an unchanged restaged list", () => {
    expect(planLoad(restage(cur), cur, OPTS)).toEqual({
      type: "metadata",
      add: [],
      remove: [],
    });
  });

  it("adds and removes metadata in place when the network inputs are unchanged", () => {
    const extra = dropped("more.tsv", "b\n", "metadata");
    const staged = [
      ...restage(cur).filter((f) => f.kind !== "metadata"),
      extra,
    ];
    expect(planLoad(staged, cur, OPTS)).toEqual({
      type: "metadata",
      add: [extra],
      remove: ["occ-1"],
    });
  });

  it("adds back a restaged file that was removed since", () => {
    const staged = restage(cur);
    const plan = planLoad(staged, { ...cur, metadata: [] }, OPTS);
    expect(plan).toEqual({ type: "metadata", add: [staged[1]], remove: [] });
  });

  it("reloads when a network input is added, removed or replaced", () => {
    const base = restage(cur);
    expect(
      planLoad([...base, dropped("toy.clu", CLU.text, "clu")], cur, OPTS).type,
    ).toBe("load");
    expect(planLoad(base.slice(1), cur, OPTS).type).toBe("load");
    expect(
      planLoad([dropped("toy.net", "*Edges\n1 3\n", "network")], cur, OPTS)
        .type,
    ).toBe("load");
  });

  it("reloads when an option that applies to the inputs changed", () => {
    expect(planLoad(restage(cur), cur, { ...OPTS, directed: true }).type).toBe(
      "load",
    );
    // Partition options only apply with a partition.
    expect(planLoad(restage(cur), cur, { ...OPTS, noInfomap: true }).type).toBe(
      "metadata",
    );
    const withClu: CurrentLoad = { ...cur, sources: [NET, CLU] };
    expect(
      planLoad(restage(withClu), withClu, { ...OPTS, noInfomap: true }).type,
    ).toBe("load");
  });

  it("ignores options for an ftree, which it does not read", () => {
    const ftree: CurrentLoad = {
      sources: [{ name: "a.ftree", size: 1, text: "x", kind: "ftree" }],
      metadata: [],
    };
    expect(
      planLoad(restage(ftree), ftree, { ...OPTS, directed: true }),
    ).toEqual({
      type: "metadata",
      add: [],
      remove: [],
    });
  });
});
