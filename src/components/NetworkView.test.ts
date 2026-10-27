import { describe, expect, it } from "vitest";
import { networkToLoaded } from "../lib/load-files";
import { computeStats } from "../lib/network-stats";
import type { LoadedNetwork } from "../lib/types";
import { NetworkStore } from "../stores/network-store";
import { SettingsStore } from "../stores/settings-store";
import { buildLod, buildStyle, relayoutOf } from "./NetworkView";

const clustered = (): LoadedNetwork => ({
  kind: "clustered",
  filename: "toy.ftree",
  sources: [{ name: "toy.ftree", size: 0, text: "", kind: "ftree" }],
  stats: computeStats(4, [0, 1, 2], [1, 2, 3], [1, 2, 0.5]),
  directed: false,
  isStates: false,
  graph: {
    nodeCount: 4,
    source: [0, 1, 2],
    target: [1, 2, 3],
    weight: [1, 2, 0.5],
    nodeFlow: new Float32Array([0.4, 0.3, 0.2, 0.1]),
    directed: false,
  },
  names: ["alpha", "beta", "gamma", "delta"],
  physicalIds: [1, 2, 3, 4],
  modules: [
    { id: 0, path: [1, 1] },
    { id: 1, path: [1, 2] },
    { id: 2, path: [2, 1] },
    { id: 3, path: [2, 2] },
  ],
});

describe("buildLod module rings", () => {
  const setup = (nestedLayout: boolean) => {
    const store = new NetworkStore();
    store.setNetwork(clustered());
    const settings = new SettingsStore();
    settings.set("nestedLayout", nestedLayout);
    return { store, settings };
  };

  it("rings the modules once a nested map of them has landed, even with Nested layout since switched off", () => {
    const { store, settings } = setup(false);
    expect(buildLod(store, settings, true)).toMatchObject({
      source: "modules",
      moduleBoundary: expect.anything(),
    });
  });

  it("rings nothing over any other layout, even with Nested layout on", () => {
    const { store, settings } = setup(true);
    const lod = buildLod(store, settings, false);
    expect(lod).toMatchObject({ source: "modules" });
    expect(lod).not.toHaveProperty("moduleBoundary");
  });

  it("rings each open module in its fill, as wide as its enter flow on the ring scale", () => {
    const store = new NetworkStore();
    store.setNetwork({
      ...clustered(),
      moduleFlow: new Map([
        ["1", { enterFlow: 0.4, exitFlow: 0.1 }],
        ["2", { enterFlow: 0.001, exitFlow: 0.001 }],
      ]),
    });
    const settings = new SettingsStore();
    settings.set("nodeScale", "linear");
    const lod = buildLod(store, settings, true);
    const boundary = lod ? lod.moduleBoundary : undefined;
    expect(boundary?.color).toBe("fill");
    const width = boundary?.width;
    expect(typeof width).toBe("function");
    if (typeof width !== "function") return;
    // No node rings: the scale tops out at the largest node flow, 0.4.
    expect(width([1])).toBeCloseTo(4);
    expect(width([2])).toBe(1); // never thinner than the plain line
    expect(width([9])).toBeUndefined(); // no flow: d3gl's constant width
  });

  it("draws the plain line, in the module fill, without module flow", () => {
    const { store, settings } = setup(true);
    const lod = buildLod(store, settings, true);
    expect(lod ? lod.moduleBoundary : undefined).toEqual({
      width: 1,
      color: "fill",
      opacity: 0.8,
    });
  });

  it("rings nothing when the LOD doesn't cut the modules", () => {
    const { store, settings } = setup(true);
    settings.set("lodMode", "spatial");
    const lod = buildLod(store, settings, true);
    expect(lod).toMatchObject({ source: "spatial" });
    expect(lod).not.toHaveProperty("moduleBoundary");
  });
});

describe("buildStyle colours and flow borders", () => {
  const setup = (net: LoadedNetwork = clustered()) => {
    const store = new NetworkStore();
    store.setNetwork(net);
    return { store, settings: new SettingsStore() };
  };
  // Top module 1 red, 2 green, as c3ModuleColor would colour them.
  const colors = (path: readonly number[]) =>
    ({ 1: "#a00000", 2: "#00a000" })[path[0] ?? 0];
  const graph = { flow: new Float32Array([0.4, 0.3, 0.2, 0.1]) };
  const fillOf = (s: ReturnType<typeof buildStyle>, i: number) => {
    const fill = s.nodeFill;
    if (typeof fill === "function") return fill(i, graph as never);
    if (typeof fill === "object" && fill.by === "flow")
      return fill.scale(graph.flow[i] ?? 0);
    if (typeof fill === "object" && fill.by === "module")
      return (fill.color ?? s.moduleColor)?.(
        Array.from(clustered().modules?.[i]?.path ?? []).slice(0, -1),
      );
    return fill;
  };

  it("colours by module with the one module colour, for d3gl to resolve", () => {
    const { store, settings } = setup();
    const fill = buildStyle(store, settings, colors).nodeFill;
    expect(fill).toEqual({ by: "module", color: colors });
    expect(buildStyle(store, settings, null).nodeFill).toBe("#4878d0");
  });

  it("draws no flow borders without exit flow", () => {
    const { store, settings } = setup();
    expect(buildStyle(store, settings, colors).flowBorder).toBeUndefined();
  });

  it("gives every node a flow border of its exit flow's share, in a darker shade of its own fill by module", () => {
    const boundaryFlow = new Float32Array([0, 0.1, 0.1, 0.05]);
    const { store, settings } = setup({ ...clustered(), boundaryFlow });
    const style = buildStyle(store, settings, colors);
    expect(style.flowBorder?.flow).toBe(boundaryFlow);
    expect(style.flowBorder?.color).toBeUndefined(); // d3gl darkens the fill
    expect(style.flowBorder?.share).toBe(true); // exit flow over flow (d3gl#510)
    expect(fillOf(style, 2)).toBe("#00a000");
  });

  it("gives only the modules of an .ftree flow borders, by the exit flow in its headers", () => {
    const moduleFlow = new Map([["1", { enterFlow: 0.05, exitFlow: 0.07 }]]);
    const { store, settings } = setup({ ...clustered(), moduleFlow });
    const ring = buildStyle(store, settings, colors).flowBorder;
    expect(ring).toBeDefined();
    expect(ring?.flow).toBeUndefined(); // no node has a flow border
    expect(ring?.moduleFlow?.([1])).toBe(0.07);
    expect(ring?.moduleFlow?.([2])).toBeUndefined(); // d3gl draws none
    expect(ring?.share).toBe(true);
  });

  it("gives a module the flow border of Infomap's exit flow for it, not its members' sum", () => {
    const boundaryFlow = new Float32Array([0, 0.1, 0.1, 0.05]);
    const moduleFlow = new Map([
      ["1", { enterFlow: 0.05, exitFlow: 0.07 }],
      ["", { enterFlow: 0, exitFlow: 0 }],
    ]);
    const { store, settings } = setup({
      ...clustered(),
      boundaryFlow,
      moduleFlow,
    });
    const ringOf = buildStyle(store, settings, colors).flowBorder?.moduleFlow;
    expect(ringOf?.([1])).toBe(0.07);
    expect(ringOf?.([])).toBe(0);
    expect(ringOf?.([9])).toBeUndefined(); // unknown: d3gl sums the members
  });

  it("by flow, shades the fill, the rings and the links like d3gl's flow-borders example", () => {
    const boundaryFlow = new Float32Array([0, 0.1, 0.1, 0.05]);
    const { store, settings } = setup({ ...clustered(), boundaryFlow });
    settings.set("colorBy", "flow");
    const style = buildStyle(store, settings, colors);
    // { by: "flow" }: d3gl fills a module by its members' summed flow too.
    expect(style.nodeFill).toMatchObject({ by: "flow" });
    expect(fillOf(style, 0)).toBe("rgb(215, 89, 8)"); // max flow: #D75908
    expect(fillOf(style, 3)).not.toBe(fillOf(style, 0));
    const ring = style.flowBorder?.color;
    expect(typeof ring === "function" && ring(0.1, 1, graph as never)).toBe(
      "rgb(249, 163, 39)", // max boundary flow: #f9a327
    );
    const link = style.linkStroke;
    expect(typeof link === "function" && link(store.maxLinkFlow)).toBe(
      "rgb(65, 142, 199)", // max link weight: #418EC7
    );
  });

  it("by flow, falls back to the module colours on a network without flow", () => {
    const net = clustered();
    const { store, settings } = setup({
      ...net,
      graph: { ...net.graph, nodeFlow: undefined },
    });
    settings.set("colorBy", "flow");
    expect(fillOf(buildStyle(store, settings, colors), 2)).toBe("#00a000");
  });

  it("keeps metadata occurrence colours over flow colours", () => {
    const { store, settings } = setup();
    settings.set("colorBy", "flow");
    store.addOccurrenceFile({ name: "m.txt", size: 5, text: "gamma" });
    const color = store.occurrenceFiles[0]?.color;
    expect(fillOf(buildStyle(store, settings, colors), 2)).toBe(color);
  });
});

describe("relayoutOf", () => {
  it("lays nothing out while the kind of layout is the one asked for", () => {
    expect(relayoutOf(true, true, true)).toBeNull();
    expect(relayoutOf(false, false, true)).toBeNull();
  });

  it("lays nothing out with the simulation off", () => {
    expect(relayoutOf(true, false, false)).toBeNull();
    expect(relayoutOf(false, true, false)).toBeNull();
  });

  it("goes on from where the nodes are: a nested map, framed as it goes", () => {
    // Streamed from the positions on screen (d3gl#454): warm, no transition
    // (that would solve out of sight first). It goes to its own size, about
    // a third of a force layout's width, and the camera follows it.
    expect(relayoutOf(true, false, true)).toEqual({
      nested: true,
      warm: true,
      fit: true,
    });
  });

  it("a re-clustering streams the new map the same way, but keeps the camera", () => {
    // From a nested map of the old modules the new one has the same size.
    expect(relayoutOf(true, false, true, true)).toEqual({
      nested: true,
      warm: true,
    });
    expect(relayoutOf(false, false, true, true)).toBeNull();
  });

  it("goes on from where the nodes are: the force layout, framed as it grows", () => {
    // Flat, said outright: d3gl lays a network with modules out nested by
    // default (d3gl#566).
    expect(relayoutOf(false, true, true)).toEqual({
      nested: false,
      fit: true,
      warm: true,
    });
  });
});

describe("buildStyle on a state network", () => {
  // Four state nodes over three physical nodes: alpha {0, 1}, beta {2}, gamma {3}.
  const STATES = `*Vertices 3
1 "alpha"
2 "beta"
3 "gamma"
*States
1 1
2 1
3 2
4 3
*Links
1 3 1
3 2 1
2 4 2
4 1 1
`;
  const states = (): LoadedNetwork => {
    const raw = networkToLoaded(STATES, "toy_states.net");
    const nodeFlow = new Float32Array([0.3, 0.3, 0.1, 0.3]);
    return {
      ...raw,
      kind: "clustered",
      graph: { ...raw.graph, nodeFlow },
      stateGraph: raw.stateGraph && { ...raw.stateGraph, nodeFlow },
      modules: [
        { id: 0, path: [2, 1] },
        { id: 1, path: [1, 1] },
        { id: 2, path: [1, 2] },
        { id: 3, path: [2, 2] },
      ],
    };
  };
  const colors = (path: readonly number[]) =>
    ({ 1: "#a00000", 2: "#00a000" })[path[0] ?? 0];
  const setup = (view: "physical" | "state" | "both") => {
    const store = new NetworkStore();
    store.setNetwork(states());
    const settings = new SettingsStore();
    settings.set("stateView", view);
    settings.set("colorBy", "flow");
    return { store, settings };
  };

  it("spans the physical graph's flow in the physical view, the state graph's otherwise", () => {
    // Physical flow: alpha 0.6, beta 0.1, gamma 0.3; state flow at most 0.3.
    const top = "rgb(215, 89, 8)"; // #D75908
    const scaleOf = (view: "physical" | "state" | "both") => {
      const { store, settings } = setup(view);
      const fill = buildStyle(store, settings, colors).nodeFill;
      if (typeof fill !== "object" || fill.by !== "flow") throw new Error();
      return fill.scale;
    };
    expect(scaleOf("physical")(0.6)).toBe(top);
    expect(scaleOf("physical")(0.3)).not.toBe(top);
    expect(scaleOf("state")(0.3)).toBe(top);
    expect(scaleOf("both")(0.3)).toBe(top);
  });

  it("cuts a clustered state network's modules, held by its state view, in every view", () => {
    // d3gl draws the LOD in the state view only and keeps it across switches.
    for (const view of ["physical", "state", "both"] as const) {
      const { store, settings } = setup(view);
      expect(buildLod(store, settings, true)).toMatchObject({
        source: "modules",
        moduleBoundary: expect.anything(),
      });
      expect(buildLod(store, settings, false)).not.toHaveProperty(
        "moduleBoundary",
      );
    }
    const raw = new NetworkStore();
    raw.setNetwork(networkToLoaded(STATES, "toy_states.net"));
    expect(buildLod(raw, new SettingsStore(), true)).toMatchObject({
      source: "spatial",
    });
  });

  it("colours a physical node by the metadata of its state nodes, else by its first module", () => {
    const { store, settings } = setup("physical");
    settings.set("colorBy", "module");
    store.addOccurrenceFile({ name: "m.txt", size: 4, text: "beta" });
    const color = store.occurrenceFiles[0]?.color;
    const fill = buildStyle(store, settings, colors).nodeFill;
    const physical = store.builtState?.physical;
    if (typeof fill !== "function" || !physical) throw new Error();
    expect(fill(1, physical)).toBe(color); // beta
    expect(fill(0, physical)).toBe("#a00000"); // alpha: modules 2 and 1
    expect(fill(2, physical)).toBe("#00a000"); // gamma: module 2
    const state = store.builtState?.state;
    if (!state) throw new Error();
    expect(fill(2, state)).toBe(color); // beta's state node
    expect(fill(0, state)).toBe("#00a000"); // alpha's first, in module 2
  });
});
