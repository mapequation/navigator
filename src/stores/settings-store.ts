import type { SchemeName, ToneName } from "@mapequation/c3";
import { makeAutoObservable } from "mobx";

export type NodeSizeBy = "flow" | "degree";
export type ScaleKind = "linear" | "root";
/**
 * Node and link colours: a categorical colour per module, or shades of flow
 * (node flow for the fill, the flow-border value for the rings, the link
 * weight for the links), as in d3gl's flow-borders example.
 */
export type ColorBy = "module" | "flow";
/** c3's hue source for the module colours: the OKLCH hue circle or a d3 colour scheme. */
export type ColorHue = "Oklch" | SchemeName;
/**
 * LOD aggregation source: the Infomap module tree (spatial for a network
 * without one), d3gl's spatial quadtree (nearby nodes), or none.
 */
export type LodMode = "modules" | "spatial" | "off";
/**
 * Where d3gl runs a layout, chosen when the layout starts. "auto" lets d3gl
 * choose for each layout and device, silently (d3gl#375; its rules are
 * d3gl's, documented on NetworkLayoutOptions.backend, and net.layoutTransport
 * reports what it chose). "gpu" asks for the GPU (the nested map's too,
 * d3gl#355) and warns when it falls back to the worker; "worker" always runs
 * off-thread on the CPU.
 */
export type LayoutBackend = "auto" | "gpu" | "worker";

/** Every d3gl option exposed in the Settings UI. */
export class SettingsStore {
  nodeSizeBy: NodeSizeBy = "flow";
  nodeScale: ScaleKind = "root";
  colorBy: ColorBy = "module";
  /**
   * Module colours from c3's hierarchy(): its tone (null = c3's default:
   * strong, or inferred from a scheme), hue source, and the offset of the
   * first colour on it in degrees (null = c3's default: 245 on the circle,
   * a scheme's start).
   */
  colorTone: ToneName | null = null;
  colorHue: ColorHue = "Oklch";
  colorOffset: number | null = null;
  /** Node radius [min, max] in the sizeMode's units (px in screen mode). */
  nodeRadiusRange: [number, number] = [4, 14];
  /** Link width [min, max] in the sizeMode's units (px in screen mode). */
  linkWidthRange: [number, number] = [0.4, 4];
  linkScale: ScaleKind = "root";
  labelsVisible = true;
  maxLabels = 50;
  simulation = true;
  lodMode: LodMode = "modules";
  /** null = d3gl's tree-adaptive default (opens a module tree as a map of modules). */
  expandPx: number | null = null;
  maxAggregateRadius = 26;
  /**
   * d3gl's `lod({ declutterSpacing })`: declutter hides a glyph whose centre is within this many times
   * the two glyphs' summed radii of a kept, more important one, so drawn nodes keep their links visible.
   */
  declutterSpacing = 2;
  declutter = true;
  superEdges = true;
  /** Keep super-edges between an expanded module and still-collapsed ones (d3gl crossLevelEdges). */
  crossLevelEdges = true;
  crossFade = 0;
  linkStyle: "line" | "half-arrow" = "half-arrow";
  sizeMode: "screen" | "world" = "screen";
  /**
   * null = auto: bend half-arrow links only. Half-arrows are always drawn as
   * 24-sample strips, so bending them is free on WebGL; plain lines go from 2
   * to 24 samples per link when bent (~12× the vertices).
   */
  bendLinks: boolean | null = null;
  // "auto" (progressive canvas→WebGL) blocks the main thread for ~10s emitting
  // canvas geometry on large graphs (mapequation/d3gl#201) — default to webgl
  // until the auto path scales; auto/canvas/svg stay selectable in Settings.
  backend: "auto" | "webgl" | "canvas" | "svg" = "webgl";
  layoutBackend: LayoutBackend = "auto";
  /**
   * Lay a network with a module hierarchy out as a nested map of modules
   * (d3gl#324), each module inside its parent's disc; false gives it the
   * force layout of a network without one. The modules still drive the LOD
   * and the colours either way.
   */
  nestedLayout = true;
  pickLinks = false;
  stateView: "physical" | "state" | "both" = "physical";

  /** Whether links are bent for the given link style, resolving auto. */
  bendFor(halfArrow: boolean): boolean {
    return this.bendLinks ?? halfArrow;
  }

  constructor() {
    makeAutoObservable(this);
  }

  set = <K extends keyof SettingsStore>(
    key: K,
    value: SettingsStore[K],
  ): void => {
    Object.assign(this, { [key]: value });
  };
}
