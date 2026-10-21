import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ftreeToNetwork } from "./ftree-graph";

const FTREE = `# path flow name node_id
1:1 0.25 "a" 10
1:2 0.15 "b" 20
1:3 0.10 "c" 30
2:1 0.30 "d" 40
2:2 0.20 "e" 50
*Links directed
*Links root 0 0 1 2
1 2 0.5
*Links 1 0.15 0.1 2 3
1 2 0.2
2 3 0.1
*Links 2 0.05 0.2 1 2
1 2 0.3
`;

const edgeList = (net: ReturnType<typeof ftreeToNetwork>): number[][] => {
  const src = net.graph.source as number[];
  const tgt = net.graph.target as number[];
  const w = net.graph.weight as number[];
  return src.map((s, i) => [s, tgt[i], w[i]]);
};

describe("ftreeToNetwork", () => {
  const net = ftreeToNetwork(FTREE, "test.ftree");

  it("indexes leaves densely in file order", () => {
    expect(net.graph.nodeCount).toBe(5);
    expect(net.names).toEqual(["a", "b", "c", "d", "e"]);
    expect(net.physicalIds).toEqual([10, 20, 30, 40, 50]);
    expect(Array.from(net.graph.nodeFlow as Float32Array)).toEqual(
      [0.25, 0.15, 0.1, 0.3, 0.2].map((v) => Math.fround(v)),
    );
  });

  it("counts only real leaf links in stats, module links separately", () => {
    expect(net.stats.links).toBe(3);
    expect(net.stats.moduleLinks).toBe(1);
    expect(net.stats.nodes).toBe(5);
    expect(net.stats.weightIsFlow).toBe(true);
  });

  it("keeps only the file's leaf links as graph edges — nothing synthesized", () => {
    expect(edgeList(net)).toEqual([
      [0, 1, 0.2],
      [1, 2, 0.1],
      [3, 4, 0.3],
    ]);
  });

  it("keeps module-level links path-addressed for d3gl data({ moduleLinks })", () => {
    expect(net.moduleLinks).toEqual([{ source: [1], target: [2], flow: 0.5 }]);
  });

  it("is directed, clustered, with per-node module paths and retained ftree text", () => {
    expect(net.directed).toBe(true);
    expect(net.kind).toBe("clustered");
    expect(net.isStates).toBe(false);
    expect(net.modules?.[0]).toEqual({ id: 0, path: [1, 1] });
    expect(net.modules?.[4]).toEqual({ id: 4, path: [2, 2] });
    expect(net.ftree).toBe(FTREE);
  });

  it("reads each module's enter/exit flow from its *Links header", () => {
    expect(net.moduleFlow).toEqual(
      new Map([
        ["", { enterFlow: 0, exitFlow: 0 }],
        ["1", { enterFlow: 0.15, exitFlow: 0.1 }],
        ["2", { enterFlow: 0.05, exitFlow: 0.2 }],
      ]),
    );
  });

  it("handles the converted example network", () => {
    const text = readFileSync("public/citation_data.ftree", "utf8");
    const example = ftreeToNetwork(text, "citation_data.ftree");
    expect(example.graph.nodeCount).toBeGreaterThan(12000);
    expect((example.graph.source as number[]).length).toBeGreaterThan(50000);
    expect(example.directed).toBe(true);
    expect(example.isStates).toBe(false);
    expect(example.moduleFlow?.get("1")).toEqual({
      enterFlow: 0.0206387,
      exitFlow: 0.0206387,
    });
  });
});
