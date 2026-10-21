# Network Navigator 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Infomap Network Navigator as a Vite + React 19 + TypeScript app on `@mapequation/d3gl`'s network module, with raw-network rendering, in-browser Infomap clustering (incl. `.clu`/`.tree` partitions and state networks), and an alluvial-style sidebar.

**Architecture:** MobX stores hold the loaded network (typed-array graph + Infomap module hierarchy) and all d3gl settings; a single `NetworkView` component wraps the imperative `network()` engine and applies store changes via MobX reactions. Parsing is upstream (`@mapequation/infomap-parser`, d3gl `parseNetwork`); the only app-side data code is the ftree→graph reconstruction, a small states-file parser, and the Infomap runner.

**Tech Stack:** pnpm, Vite 8, React 19, TypeScript, `@heroui/react` 3 + Tailwind CSS 4, `@mapequation/d3gl` ^0.8.0, `@mapequation/infomap` ^2.14, `@mapequation/infomap-parser`, MobX 6 + `mobx-react-lite`, recharts 3, localforage, react-dropzone, d3-scale, Biome, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-03-network-navigator-2-design.md` (approved).

**Verified API facts this plan relies on** (extracted from d3gl 0.8.0 sources, alluvial's node_modules `.d.ts`, and live tests — do not re-derive):

- `network(host, { backend? })` — chainable: `.data(graph)`, `.stateNetwork(sg, { modules, view })`, `.view(v)`, `.style(s)`, `.lod(opts|false)`, `.layout({ backend, iterations?, positions? })`, `.stopLayout()`, `.labels(opts|false)`, `.interactive(opts|false)`, `.pickLinks(bool)`, `.enableZoom([min,max])`, `.setTransform({k,x,y})`, `.pick(x,y)`, `.select("nodes", ids|predicate|null)`, `.selection()`, `.on("hover"|"click"|"select", cb)`, `.toSVG()`, `.toPNG()`, `.destroy()`. Omitting width/height = responsive (ResizeObserver).
- `buildGraph({ nodeCount, source, target, weight?, nodeFlow?, directed? })` → `NetworkGraph` with `positions` (filled in place by layout), `csr`, `flow`, `strength`. `buildStateGraph({ stateCount, stateToPhysical, source, target, weight?, nodeFlow?, directed?, physicalCount? })` → `StateNetworkGraph { state, physical, ... }`.
- `parseNetwork(text, filename)` → `{ nodeCount, source, target, weight, labels, directed, positions? }` (Pajek + edge list; NOT `*States` files).
- LOD: `lod({ modules, expandPx, maxAggregateRadius, declutter, superEdges, crossFade })`; `modules: {id: denseIndex, path: number[]}[]` (1-based Infomap paths). `moduleColors(modules)` → per-node color array. Aggregate hits: `hit.datum.aggregate === true`, `hit.members?.()` → leaf ids (lazy).
- `import { version } from "@mapequation/d3gl"` exists (root subpath only). `import Infomap from "@mapequation/infomap"`; `Infomap.__version__`; `new Infomap().on("progress"|"data"|"error", cb).runAsync({ network, filename, args, files })` → `Result` with `ftree`/`ftree_states` strings when `args.output` includes `"ftree"`. Cluster data: put text in `files` under a name and set `args.clusterData` to that name; `args.noInfomap: true` evaluates the given partition.
- `parseTree(text, undefined, true, false)` (lenient) → `{ nodes: {path: number[], flow?, name?, id, stateId?}[], modules?: {path, enterFlow, exitFlow, links?: {source,target,flow}[]}[], directed? }`. `*Links` headers MUST have 5 values (`path enterFlow exitFlow numEdges numChildren`) — 4-value legacy headers mis-parse (verified live).
- v1's `public/citation_data.ftree` is LEGACY format (`*Modules`/`*Nodes` sections) — `parseTree` rejects it; Task 4 converts it.
- HeroUI v3: install `@heroui/react @heroui/styles`; CSS = `@import "tailwindcss";` then `@import "@heroui/styles";`; no Provider. Compound components: `Modal.Backdrop/Container/Dialog/Header/Heading/Body/Footer/CloseTrigger` (`isOpen`/`onOpenChange` on Backdrop), `Popover` + `Popover.Content/Dialog/Heading` (Button child = trigger). **When implementing any other HeroUI component (Switch, Select, Slider, NumberField, Kbd, Alert, ProgressBar, Tooltip), check its page at `https://heroui.com/docs/react/components/<name>` first — v3 is React-Aria-based and prop names may differ from what you assume (e.g. `isSelected`, not `checked`).**

**d3gl gaps (confirmed) driving Task 2's issues:** no React `<Network>` component; no zoom-to-module/fit-to-nodes helper or viewport-module query (breadcrumbs); no `*States` file parser; no LOD support for module-level links from ftree-only input (leaf cross-module links must be synthesized app-side).

---

## File structure

```
scripts/convert-old-ftree.mjs        — one-off legacy-ftree converter (Task 4)
public/citation_data.ftree           — example network, CONVERTED to modern ftree (Task 4)
public/citation_module_names.json    — curated module names extracted from legacy file (Task 4)
public/favicon.ico                   — kept from v1
index.html, vite.config.ts, tsconfig.json, tsconfig.node.json, biome.json
.github/workflows/pages.yml          — pnpm + Vite deploy (Task 20)
src/
  main.tsx, App.tsx, index.css
  assets/mapequation-icon.svg
  lib/
    types.ts          — LoadedNetwork + shared types
    path-key.ts       — pathKey / normalizeModulePath
    file-kinds.ts     — extension→kind, states detection
    download.ts       — native downloads (text + data URL)
    ftree-graph.ts    — ftree text → LoadedNetwork (leaf-edge reconstruction)
    parse-states.ts   — *States file → LoadedNetwork pieces
    apply-ftree.ts    — withClustering(raw LoadedNetwork, ftree) → clustered
    infomap-args.ts   — options → Infomap Arguments
    run-infomap.ts    — promise wrapper over Infomap worker → ftree text
    load-files.ts     — classify dropped files → LoadedNetwork (may run Infomap)
    infomap-online.ts — localforage handover from Infomap Online
    fit-transform.ts  — bbox → ViewTransform (zoom-to-fit)
    occurrence-colors.ts — 10-color palette
  stores/
    index.ts          — RootStore, StoreContext, useStores
    network-store.ts  — LoadedNetwork, built graphs, selection, search, occurrences, breadcrumb
    settings-store.ts — every d3gl option exposed in the UI
    ui-store.ts       — modal state, Infomap progress/log, errors
  components/
    NetworkView.tsx   — d3gl engine wrapper (reactions)
    Breadcrumb.tsx    — module path overlay + zoom-to-root
    EmptyState.tsx    — background when nothing loaded
    LoadModal.tsx     — dropzone, options, example / Infomap Online / files
    HelpModal.tsx     — placeholder documentation dialog
    Sidebar/
      Sidebar.tsx     — frame + section list
      Header.tsx      — logo, versions line, Load / How to cite / Help
      Cite.tsx        — BibTeX popover
      Search.tsx
      SelectedNode.tsx
      Distributions.tsx — recharts flow/degree charts
      Occurrences.tsx
      SettingsPanel.tsx — d3gl options UI + Cluster with Infomap
      Export.tsx
  test/               — vitest unit tests for src/lib (colocated as *.test.ts under src/lib)
```

---

### Task 1: Branch + repo reset

**Files:** delete v1 app files; keep `LICENSE`, `README.md` (rewritten in Task 20), `docs/`, `public/citation_data.ftree`, `public/favicon.ico`, `.git`.

- [ ] **Step 1: Create the working branch**

```bash
cd /Users/daniel/dev/projects/icelab/code/web/network-navigator
git checkout -b v2
```

- [ ] **Step 2: Delete v1 files**

```bash
git rm -r -q src test public/index.html public/manifest.json public/papaparse.min.js package.json package-lock.json CHANGELOG.md
git rm -q .github/workflows/pages.yml
ls  # expect: LICENSE README.md docs public (citation_data.ftree favicon.ico)
```

(If `.env`, `.prettierrc`, or similar v1 stragglers exist — check with `git ls-files` — remove them too. Do NOT touch `docs/` or `LICENSE`.)

- [ ] **Step 3: Write a fresh `.gitignore`**

```gitignore
node_modules
dist
*.local
.DS_Store
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Remove v1 app (CRA, semantic-ui, custom renderer)"
```

---

### Task 2: File upstream d3gl issues + app tracking issues

Per `../d3gl/AGENTS.md` (library-first + issue workflow). Issue bodies use the d3gl template. After creating each d3gl issue, add it to the project board; if `gh` lacks project scopes (`gh auth refresh -s project,read:project` to fix), skip the board add and note it in the final report.

- [ ] **Step 1: d3gl issue — React `<Network>` component**

```bash
gh issue create -R mapequation/d3gl \
  --title 'network: React <Network> component in @mapequation/d3gl/react' \
  --body '## Context
`/react` ships only `<D3GL>` for maps. The network engine is imperative-only, so every React consumer (first client: Network Navigator 2.0, mapequation/network-navigator) hand-rolls ref + useEffect + prop-diffing + destroy() — exactly the per-consumer ceremony AGENTS.md says to lift into the library.

## Goal
A React component (or generalized `<D3GL>`) that owns the network() lifecycle and applies prop changes through the fluent API without re-creating the engine.

## Scope
- `<Network>` in the `/react` subpath: props for data/stateNetwork+view, style, lod, labels, interactive, layout, pickLinks; imperative handle (ref) exposing select/setTransform/pick/toSVG/toPNG.
- Engine recreated only when host/backend changes; everything else diffed onto the existing instance.

## Files / pointers
`packages/d3gl/src/react/`, `packages/d3gl/src/network/network.ts`; consumer interim wrapper: mapequation/network-navigator `src/components/NetworkView.tsx`.

## Acceptance criteria
Navigator can replace its wrapper with `<Network>` with no behavior change; a website example demonstrates it.

## Dependencies
None.

## Non-goals
Charts/plot React wrappers.

## Effort
Medium'
gh project item-add 4 --owner mapequation --url <issue-url-from-previous-command>
```

- [ ] **Step 2: d3gl issue — navigation helpers**

```bash
gh issue create -R mapequation/d3gl \
  --title 'network: navigation helpers — fitToNodes/zoomToModule + viewport-module query for breadcrumbs' \
  --body '## Context
Navigator 2.0 implements "drill" navigation: double-click a module to zoom to its extent, breadcrumb of the module dominating the viewport, zoom-to-root. The engine only exposes raw setTransform/enableZoom/pick, so the app computes bounding boxes from graph.positions and can only update breadcrumbs on click — not while zooming.

## Goal
Engine-level navigation helpers so consumers do not reach into positions arrays.

## Scope
- `fitToNodes(ids, opts?)` / `zoomToModule(path)` animating setTransform to the extent.
- A cheap query or event for the module currently dominating the viewport (LOD cut already knows the frontier) to drive breadcrumbs during zoom.

## Files / pointers
`packages/d3gl/src/network/network.ts`, `lod.ts`, `map/base-engine.ts` (zoom); consumer placeholder: mapequation/network-navigator `src/lib/fit-transform.ts` + `src/components/Breadcrumb.tsx`.

## Acceptance criteria
Navigator deletes fit-transform.ts; breadcrumb updates on zoom without app-side per-frame work.

## Dependencies
None.

## Non-goals
Camera animation framework.

## Effort
Medium'
gh project item-add 4 --owner mapequation --url <issue-url>
```

- [ ] **Step 3: d3gl issue — `parseStates`**

```bash
gh issue create -R mapequation/d3gl \
  --title 'network: parseStates — parse Infomap state-network files' \
  --body '## Context
The network module ships parseNetwork (Pajek/edge list) and buildStateGraph, but no parser for Infomap *States files — a consumer loading state networks from disk must hand-parse *Vertices/*States/*Links (Navigator 2.0 does, in src/lib/parse-states.ts).

## Goal
`parseStates(text)` next to parsePajek, returning BuildStateGraphInput + state/physical names.

## Scope
Sections *Vertices (id "name"), *States (stateId physicalId "name"?), *Links (stateId stateId weight). detectFormat should recognize it.

## Files / pointers
`packages/d3gl/src/network/pajek.ts`, `state-graph.ts`; reference implementation: mapequation/network-navigator `src/lib/parse-states.ts`.

## Acceptance criteria
Navigator deletes parse-states.ts; a website example loads a states file.

## Dependencies
None.

## Non-goals
Multilayer *Intra/*Inter formats.

## Effort
Small'
gh project item-add 4 --owner mapequation --url <issue-url>
```

- [ ] **Step 4: d3gl issue — LOD from ftree module-level links**

```bash
gh issue create -R mapequation/d3gl \
  --title 'network: LOD map from Infomap ftree without full leaf network (module-level links)' \
  --body '## Context
An .ftree carries leaf links only inside bottom modules; cross-module links exist only aggregated per level. lod({modules}) derives super-edges from leaf edges, so ftree-only consumers must synthesize fake leaf edges (Navigator 2.0 injects one representative-leaf edge per module-level link — flow-preserving but a workaround). buildModuleLODTree already accepts edges, but only leaf edges.

## Goal
First-class support for supplying module-level links (the ftree *Links sections) as the super-edge source.

## Scope
- lod({ modules, moduleLinks }) or similar: per-module-path link lists with flow, used for aggregate↔aggregate (and crossLevelEdges) rendering when leaf edges are absent/partial.

## Files / pointers
`packages/d3gl/src/network/modules.ts` (buildSuperEdges), `lod.ts`; consumer workaround: mapequation/network-navigator `src/lib/ftree-graph.ts` (representative-leaf injection).

## Acceptance criteria
Navigator removes the injection and passes ftree module links directly; super-edge flows match the ftree aggregates exactly.

## Dependencies
None.

## Non-goals
Changing how leaf-edge super-edges are derived.

## Effort
Medium'
gh project item-add 4 --owner mapequation --url <issue-url>
```

- [ ] **Step 5: App tracking issues on the fork**

For each d3gl issue created above (numbers known from Steps 1–4), create a linked tracking issue:

```bash
gh issue create -R mapequation/network-navigator --title 'Adopt d3gl <Network> React component when available' \
  --body 'Replace src/components/NetworkView.tsx internals with the upstream component. Blocked by mapequation/d3gl#<N1>.'
gh issue create -R mapequation/network-navigator --title 'Use d3gl navigation helpers for drill controls' \
  --body 'Replace src/lib/fit-transform.ts + click-driven breadcrumb with engine fitToNodes/viewport-module events; breadcrumb should then update during zoom. Blocked by mapequation/d3gl#<N2>.'
gh issue create -R mapequation/network-navigator --title 'Use d3gl parseStates for state-network files' \
  --body 'Delete src/lib/parse-states.ts. Blocked by mapequation/d3gl#<N3>.'
gh issue create -R mapequation/network-navigator --title 'Pass ftree module links to d3gl LOD directly' \
  --body 'Remove representative-leaf edge injection from src/lib/ftree-graph.ts. Blocked by mapequation/d3gl#<N4>.'
```

No commit (no repo files changed).

---

### Task 3: Scaffold toolchain

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `biome.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "network-navigator",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "homepage": "/navigator2",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "lint": "biome check .",
    "format": "biome format --write ."
  }
}
```

- [ ] **Step 2: Install dependencies (pnpm resolves latest; do NOT copy versions from memory)**

```bash
pnpm add react react-dom @heroui/react @heroui/styles @mapequation/d3gl @mapequation/infomap @mapequation/infomap-parser mobx mobx-react-lite recharts localforage react-dropzone d3-scale
pnpm add -D typescript vite @vitejs/plugin-react tailwindcss @tailwindcss/vite vitest @biomejs/biome @types/react @types/react-dom @types/d3-scale
pnpm pkg set packageManager="pnpm@$(pnpm --version)"
```

Expected: lockfile created; if pnpm prompts about build scripts (esbuild, @biomejs/biome), run `pnpm approve-builds` and approve them.

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import pkg from "./package.json";

export default defineConfig({
  base: "/navigator2/",
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },
});
```

- [ ] **Step 4: Write `tsconfig.json` and `tsconfig.node.json`**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "strict": true,
    "noEmit": false,
    "emitDeclarationOnly": true,
    "declaration": true,
    "outDir": "node_modules/.tmp",
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "scripts"]
}
```

(If `tsc -b` complains about the node config, install `@types/node` as a dev dep: `pnpm add -D @types/node`.)

- [ ] **Step 5: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "files": {
    "includes": ["src/**", "scripts/**", "*.ts", "*.json", "index.html"]
  },
  "formatter": { "enabled": true, "indentStyle": "space" },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "double" } }
}
```

(Run `pnpm exec biome migrate --write` after install if the schema version differs from the installed Biome.)

- [ ] **Step 6: Write `index.html`, `src/index.css`, `src/main.tsx`, minimal `src/App.tsx`**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Network Navigator | MapEquation</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:

```css
@import "tailwindcss";
@import "@heroui/styles";
```

`src/main.tsx` (StoreContext arrives in Task 11 — for now render App directly):

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx` (placeholder, replaced in Task 14):

```tsx
import { Button } from "@heroui/react";

export default function App() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Button>Network Navigator 2.0 scaffold</Button>
    </div>
  );
}
```

- [ ] **Step 7: Verify toolchain**

```bash
pnpm build          # expect: tsc clean + vite build to dist/
pnpm lint           # expect: no errors (fix trivial formatting with pnpm format)
pnpm dev            # open http://localhost:5173/navigator2/ — HeroUI button renders, styled
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Scaffold Vite + React 19 + TS + HeroUI/Tailwind 4 + Biome + Vitest"
```

---

### Task 4: Convert the legacy example ftree

v1's `public/citation_data.ftree` is legacy format (`*Modules` names section, `*Nodes` section, 4-value `*Links` headers). Convert in place to modern ftree + extract curated module names ("Life sciences", …) to JSON.

**Files:**
- Create: `scripts/convert-old-ftree.mjs`, `public/citation_module_names.json`
- Modify: `public/citation_data.ftree` (replaced by converted output)

- [ ] **Step 1: Write `scripts/convert-old-ftree.mjs`**

```js
// One-off: convert a legacy (pre-Infomap-1.0) ftree to the modern format.
// Usage: node scripts/convert-old-ftree.mjs <in.ftree> <out.ftree> <out-names.json>
import fs from "node:fs";

const [, , inPath, outFtree, outNames] = process.argv;
const text = fs.readFileSync(inPath, "utf8").replace(/^﻿/, "");

let section = null;
let directed = false;
let current = null;
const moduleNames = {};
const nodeLines = [];
const linkSections = [];

for (const line of text.split(/\r?\n/)) {
  if (!line.trim() || line.startsWith("#")) continue;
  if (/^\*Modules/i.test(line)) { section = "modules"; continue; }
  if (/^\*Nodes/i.test(line)) { section = "nodes"; continue; }
  const dir = line.match(/^\*Links\s+(directed|undirected)\s*$/i);
  if (dir) { directed = dir[1].toLowerCase() === "directed"; section = "links"; continue; }
  const header = line.match(/^\*Links\s+(\S+)\s+([\d.eE+-]+)\s+(\d+)\s+(\d+)/);
  if (header) {
    current = { path: header[1], exitFlow: header[2], numEdges: header[3], numChildren: header[4], rows: [] };
    linkSections.push(current);
    continue;
  }
  if (section === "modules") {
    const m = line.match(/^(\S+)\s+\S+\s+"(.*)"/);
    if (m) moduleNames[m[1]] = m[2];
  } else if (section === "nodes") {
    nodeLines.push(line.trim());
  } else if (current) {
    current.rows.push(line.trim());
  }
}

const out = [
  "# converted from legacy ftree (network-navigator v1 example)",
  "# path flow name node_id",
  ...nodeLines,
  `*Links ${directed ? "directed" : "undirected"}`,
  // Legacy headers lack enterFlow — emit 0 so the modern 5-value header parses correctly.
  ...linkSections.flatMap((s) => [`*Links ${s.path} 0 ${s.exitFlow} ${s.numEdges} ${s.numChildren}`, ...s.rows]),
].join("\n");

fs.writeFileSync(outFtree, `${out}\n`);
fs.writeFileSync(outNames, `${JSON.stringify(moduleNames, null, 2)}\n`);
console.log(
  `nodes: ${nodeLines.length}, link sections: ${linkSections.length}, module names: ${Object.keys(moduleNames).length}, directed: ${directed}`,
);
```

- [ ] **Step 2: Run the conversion**

```bash
node scripts/convert-old-ftree.mjs public/citation_data.ftree public/citation_data.converted.ftree public/citation_module_names.json
mv public/citation_data.converted.ftree public/citation_data.ftree
```

Expected output: `nodes: ~12958, link sections: <hundreds>, module names: <hundreds>, directed: true` (exact numbers printed; node lines = legacy lines 979–13936).

- [ ] **Step 3: Verify the converted file parses with infomap-parser**

Write a THROWAWAY test `src/lib/example-convert.test.ts` (deleted after this task):

```ts
import { readFileSync } from "node:fs";
import { parseTree } from "@mapequation/infomap-parser";
import { expect, it } from "vitest";

it("converted example parses", () => {
  const text = readFileSync("public/citation_data.ftree", "utf8");
  const r = parseTree(text, undefined, true, false);
  expect(r.nodes.length).toBeGreaterThan(12000);
  expect(r.modules?.length ?? 0).toBeGreaterThan(100);
  const first = r.nodes[0] as { path: number[]; flow?: number; name?: string; id: number };
  expect(Array.isArray(first.path)).toBe(true);
  expect(first.name).toBeTruthy();
  expect(first.id).toBeTypeOf("number");
});
```

Run: `pnpm vitest run src/lib/example-convert.test.ts` — expect PASS. Then `rm src/lib/example-convert.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add scripts/convert-old-ftree.mjs public/citation_data.ftree public/citation_module_names.json
git commit -m "Convert example ftree to modern format, extract curated module names"
```

---

### Task 5: lib foundations — types, path-key, file-kinds, download

**Files:**
- Create: `src/lib/types.ts`, `src/lib/path-key.ts`, `src/lib/file-kinds.ts`, `src/lib/download.ts`, `src/lib/occurrence-colors.ts`
- Test: `src/lib/path-key.test.ts`, `src/lib/file-kinds.test.ts`

- [ ] **Step 1: Write `src/lib/types.ts`**

```ts
import type { BuildGraphInput, BuildStateGraphInput, ModuleNode } from "@mapequation/d3gl/network";

/** Everything the app knows about the currently loaded network. */
export interface LoadedNetwork {
  kind: "raw" | "clustered";
  filename: string;
  directed: boolean;
  isStates: boolean;
  /** Leaf graph (state-node graph when isStates). Rendered via buildGraph(). */
  graph: BuildGraphInput;
  /** Present when isStates — enables stateNetwork()/view() once clustered. */
  stateGraph?: BuildStateGraphInput;
  /** Display name per dense node index (state names when isStates). */
  names: string[];
  /** Original node id per dense index (for states: the state's physical id). */
  physicalIds: number[];
  /** Original state id per dense index (states only). */
  stateIds?: number[];
  /** Per-node Infomap paths, dense-index keyed (kind === "clustered"). */
  modules?: ModuleNode[];
  /** Curated module names: pathKey ("1:2") → name. Only the example ships these. */
  moduleNames?: Map<string, string>;
  /** ftree text (loaded or Infomap-generated) — export source. */
  ftree?: string;
  /** Raw network file text — enables (re-)clustering with Infomap. */
  networkText?: string;
}

export interface ClusterOptions {
  directed: boolean;
  twoLevel: boolean;
  noInfomap: boolean;
  clusterFilename?: string;
}
```

- [ ] **Step 2: Write the failing tests `src/lib/path-key.test.ts`**

```ts
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
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run src/lib/path-key.test.ts` — expect FAIL with "Cannot find module './path-key'".

- [ ] **Step 4: Write `src/lib/path-key.ts`**

```ts
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
```

- [ ] **Step 5: Run to verify pass**: `pnpm vitest run src/lib/path-key.test.ts` — expect PASS.

- [ ] **Step 6: Write the failing tests `src/lib/file-kinds.test.ts`**

```ts
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
    expect(fileKind("weird.xyz")).toBe("unknown");
  });
});

describe("isStatesText", () => {
  it("detects a *States section", () => {
    expect(isStatesText('*Vertices 2\n1 "a"\n*States\n1 1\n*Links\n1 2 1')).toBe(true);
    expect(isStatesText("*Vertices 2\n*Edges\n1 2")).toBe(false);
  });
});
```

- [ ] **Step 7: Run to verify failure** (`pnpm vitest run src/lib/file-kinds.test.ts`), then write `src/lib/file-kinds.ts`

```ts
export type FileKind = "ftree" | "tree" | "clu" | "network" | "unknown";

export function fileKind(filename: string): FileKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "ftree") return "ftree";
  if (ext === "tree" || ext === "stree") return "tree";
  if (ext === "clu") return "clu";
  if (["net", "paj", "txt", "edges", "edgelist"].includes(ext)) return "network";
  return "unknown";
}

export function isStatesText(text: string): boolean {
  return /^\*states\b/im.test(text);
}
```

- [ ] **Step 8: Run to verify pass**: `pnpm vitest run src/lib/file-kinds.test.ts` — expect PASS.

- [ ] **Step 9: Write `src/lib/download.ts` and `src/lib/occurrence-colors.ts`** (no tests — thin DOM/constant code)

`src/lib/download.ts`:

```ts
function click(href: string, filename: string, revoke = false): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) URL.revokeObjectURL(href);
}

export function downloadText(filename: string, text: string, mime = "text/plain;charset=utf-8"): void {
  click(URL.createObjectURL(new Blob([text], { type: mime })), filename, true);
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  click(dataUrl, filename);
}
```

`src/lib/occurrence-colors.ts` (d3 schemeCategory10 values hardcoded — no d3 dep needed for 10 constants):

```ts
export const OCCURRENCE_COLORS = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
] as const;
```

- [ ] **Step 10: Commit**

```bash
git add src/lib
git commit -m "Add lib foundations: types, path keys, file kinds, downloads"
```

---

### Task 6: `src/lib/ftree-graph.ts` — ftree text → LoadedNetwork

The core reconstruction. An ftree's `*Links` sections hold links between the *children* of each module (1-based child indices). Bottom-module links connect leaves directly; higher-level links connect modules — inject one leaf edge per module-level link, between the highest-flow leaf of each endpoint module (flow-preserving; tracked for removal by the Task 2 d3gl issue on module-level links).

**Files:**
- Create: `src/lib/ftree-graph.ts`
- Test: `src/lib/ftree-graph.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { ftreeToNetwork } from "./ftree-graph";

const FTREE = `# path flow name id
1:1 0.25 "a" 10
1:2 0.15 "b" 20
1:3 0.10 "c" 30
2:1 0.30 "d" 40
2:2 0.20 "e" 50
*Links directed
*Links root 0 0 1 2
1 2 0.5
*Links 1 0 0.1 2 3
1 2 0.2
2 3 0.1
*Links 2 0 0.2 1 2
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

  it("uses bottom-module links directly and injects representative leaves for module-level links", () => {
    const edges = edgeList(net);
    expect(edges).toContainEqual([0, 3, 0.5]); // root link module1→module2 → a→d (highest-flow leaves)
    expect(edges).toContainEqual([0, 1, 0.2]);
    expect(edges).toContainEqual([1, 2, 0.1]);
    expect(edges).toContainEqual([3, 4, 0.3]);
    expect(edges).toHaveLength(4);
  });

  it("is directed, clustered, with per-node module paths and retained ftree text", () => {
    expect(net.directed).toBe(true);
    expect(net.kind).toBe("clustered");
    expect(net.isStates).toBe(false);
    expect(net.modules?.[0]).toEqual({ id: 0, path: [1, 1] });
    expect(net.modules?.[4]).toEqual({ id: 4, path: [2, 2] });
    expect(net.ftree).toBe(FTREE);
  });
});
```

- [ ] **Step 2: Run to verify failure**: `pnpm vitest run src/lib/ftree-graph.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Write `src/lib/ftree-graph.ts`**

```ts
import { parseTree } from "@mapequation/infomap-parser";
import { normalizeModulePath, parseNodePath, pathKey } from "./path-key";
import type { LoadedNetwork } from "./types";

interface ParsedNode {
  path: number[] | string;
  flow?: number;
  name?: string;
  id: number;
  stateId?: number;
}

/**
 * Leaf edges come from bottom-module *Links rows. A module-level link becomes
 * ONE leaf edge between the highest-flow leaves of its endpoint modules
 * (weight = link flow) so d3gl's LOD derives super-edges with the correct
 * aggregate flow. Upstreaming tracked by the d3gl "module-level links" issue.
 */
export function ftreeToNetwork(text: string, filename: string): LoadedNetwork {
  const result = parseTree(text, undefined, true, false);
  const nodes = result.nodes as unknown as ParsedNode[];
  if (!nodes.length) throw new Error(`${filename}: no nodes found`);

  const directed = result.directed ?? /^\*Links\s+directed/im.test(text);
  const isStates = nodes[0]?.stateId !== undefined;

  const names: string[] = [];
  const physicalIds: number[] = [];
  const stateIds: number[] = [];
  const nodeFlow = new Float32Array(nodes.length);
  const leafByPath = new Map<string, number>();
  const bestLeaf = new Map<string, number>(); // module pathKey → highest-flow leaf index

  nodes.forEach((node, i) => {
    const path = parseNodePath(node.path);
    names.push(node.name ?? String(node.id));
    physicalIds.push(node.id);
    if (node.stateId !== undefined) stateIds.push(node.stateId);
    nodeFlow[i] = node.flow ?? 0;
    leafByPath.set(pathKey(path), i);
    for (let k = 1; k < path.length; k++) {
      const key = pathKey(path.slice(0, k));
      const best = bestLeaf.get(key);
      if (best === undefined || (nodes[best].flow ?? 0) < (node.flow ?? 0)) bestLeaf.set(key, i);
    }
  });

  const source: number[] = [];
  const target: number[] = [];
  const weight: number[] = [];
  for (const module of result.modules ?? []) {
    const modPath = normalizeModulePath(module.path);
    const resolve = (child: number): number => {
      const key = pathKey([...modPath, child]);
      const leaf = leafByPath.get(key) ?? bestLeaf.get(key);
      if (leaf === undefined) throw new Error(`${filename}: link endpoint ${key} not found`);
      return leaf;
    };
    for (const link of module.links ?? []) {
      source.push(resolve(link.source));
      target.push(resolve(link.target));
      weight.push(link.flow);
    }
  }

  const net: LoadedNetwork = {
    kind: "clustered",
    filename,
    directed,
    isStates,
    graph: { nodeCount: nodes.length, source, target, weight, nodeFlow, directed },
    names,
    physicalIds,
    modules: nodes.map((n, i) => ({ id: i, path: parseNodePath(n.path) })),
    ftree: text,
  };

  if (isStates) {
    net.stateIds = stateIds;
    const physicalIndex = new Map<number, number>();
    for (const id of physicalIds) {
      if (!physicalIndex.has(id)) physicalIndex.set(id, physicalIndex.size);
    }
    net.stateGraph = {
      stateCount: nodes.length,
      stateToPhysical: physicalIds.map((id) => physicalIndex.get(id) ?? 0),
      source,
      target,
      weight,
      nodeFlow,
      directed,
      physicalCount: physicalIndex.size,
    };
  }

  return net;
}
```

- [ ] **Step 4: Run to verify pass**: `pnpm vitest run src/lib/ftree-graph.test.ts` — expect PASS. (If `parseTree`'s `directed` header handling differs — the test's `directed: true` assertion fails — the regex fallback covers it; debug with a console.log of `result.directed` before changing code.)

- [ ] **Step 5: Integration test against the converted example (temporary)**

Add to `src/lib/ftree-graph.test.ts`:

```ts
import { readFileSync } from "node:fs";

it("handles the converted example network", () => {
  const text = readFileSync("public/citation_data.ftree", "utf8");
  const net = ftreeToNetwork(text, "citation_data.ftree");
  expect(net.graph.nodeCount).toBeGreaterThan(12000);
  expect((net.graph.source as number[]).length).toBeGreaterThan(50000);
  expect(net.directed).toBe(true);
  expect(net.isStates).toBe(false);
});
```

Run: `pnpm vitest run src/lib/ftree-graph.test.ts` — expect PASS. Keep this test (it is fast and guards the example asset).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ftree-graph.ts src/lib/ftree-graph.test.ts
git commit -m "Reconstruct renderable graph and modules from ftree files"
```

---

### Task 7: `src/lib/parse-states.ts` — raw `*States` files

d3gl's `parseNetwork` doesn't handle `*States` files (Task 2 issue filed). Small app-side parser: `*Vertices` (physical names), `*States` (stateId physicalId "name"?), `*Links` (stateId stateId [weight]).

**Files:**
- Create: `src/lib/parse-states.ts`
- Test: `src/lib/parse-states.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseStates } from "./parse-states";

const STATES = `# a state network
*Vertices 3
1 "alpha"
2 "beta"
3 "gamma"
*States
# state_id physical_id name
10 1 "alpha-in"
11 1 "alpha-out"
12 2
13 3 "gamma-x"
*Links
10 11 2
11 12 1
12 13 0.5
`;

describe("parseStates", () => {
  const parsed = parseStates(STATES, "test_states.net");

  it("indexes state nodes densely and maps to dense physical ids", () => {
    expect(parsed.stateGraph.stateCount).toBe(4);
    expect(parsed.stateGraph.physicalCount).toBe(3);
    expect(Array.from(parsed.stateGraph.stateToPhysical as number[])).toEqual([0, 0, 1, 2]);
    expect(parsed.stateIds).toEqual([10, 11, 12, 13]);
    expect(parsed.physicalIds).toEqual([1, 1, 2, 3]);
  });

  it("names states, falling back to the physical name", () => {
    expect(parsed.names).toEqual(["alpha-in", "alpha-out", "beta", "gamma-x"]);
  });

  it("builds the flat state-level graph from links", () => {
    expect(parsed.graph.nodeCount).toBe(4);
    expect(Array.from(parsed.graph.source as number[])).toEqual([0, 1, 2]);
    expect(Array.from(parsed.graph.target as number[])).toEqual([1, 2, 3]);
    expect(Array.from(parsed.graph.weight as number[])).toEqual([2, 1, 0.5]);
  });

  it("throws on links referencing unknown states", () => {
    expect(() => parseStates("*States\n1 1\n*Links\n1 99 1", "bad.net")).toThrow(/unknown state/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**: `pnpm vitest run src/lib/parse-states.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Write `src/lib/parse-states.ts`**

```ts
import type { BuildGraphInput, BuildStateGraphInput } from "@mapequation/d3gl/network";

export interface ParsedStates {
  stateGraph: BuildStateGraphInput;
  /** Flat state-level graph for raw rendering (same edges, state nodes as nodes). */
  graph: BuildGraphInput;
  names: string[];
  physicalIds: number[];
  stateIds: number[];
}

const unquote = (s: string | undefined): string | undefined =>
  s?.startsWith('"') ? s.slice(1, -1) : s;

/** Parse an Infomap *States network file. Upstreaming tracked by the d3gl parseStates issue. */
export function parseStates(text: string, filename: string, directed = true): ParsedStates {
  const physicalNames = new Map<number, string>();
  const stateIds: number[] = [];
  const physicalIds: number[] = [];
  const names: string[] = [];
  const stateIndex = new Map<number, number>();
  const source: number[] = [];
  const target: number[] = [];
  const weight: number[] = [];

  let section: "vertices" | "states" | "links" | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("*")) {
      const name = line.slice(1).split(/\s/)[0].toLowerCase();
      if (name === "vertices") section = "vertices";
      else if (name === "states") section = "states";
      else if (name === "links" || name === "edges" || name === "arcs") section = "links";
      else section = null;
      continue;
    }
    const tokens = line.match(/"[^"]*"|\S+/g) ?? [];
    if (section === "vertices") {
      physicalNames.set(Number(tokens[0]), unquote(tokens[1]) ?? tokens[0]);
    } else if (section === "states") {
      const stateId = Number(tokens[0]);
      const physicalId = Number(tokens[1]);
      stateIndex.set(stateId, stateIds.length);
      stateIds.push(stateId);
      physicalIds.push(physicalId);
      names.push(unquote(tokens[2]) ?? physicalNames.get(physicalId) ?? String(physicalId));
    } else if (section === "links") {
      const s = stateIndex.get(Number(tokens[0]));
      const t = stateIndex.get(Number(tokens[1]));
      if (s === undefined || t === undefined) {
        throw new Error(`${filename}: link references unknown state (${line})`);
      }
      source.push(s);
      target.push(t);
      weight.push(tokens[2] !== undefined ? Number(tokens[2]) : 1);
    }
  }

  if (!stateIds.length) throw new Error(`${filename}: no *States section found`);

  // Names may only be known after *Vertices — re-resolve fallbacks that used the raw id.
  physicalIds.forEach((pid, i) => {
    if (names[i] === String(pid) && physicalNames.has(pid)) names[i] = physicalNames.get(pid) as string;
  });

  const physicalIndex = new Map<number, number>();
  for (const id of physicalIds) {
    if (!physicalIndex.has(id)) physicalIndex.set(id, physicalIndex.size);
  }

  return {
    stateGraph: {
      stateCount: stateIds.length,
      stateToPhysical: physicalIds.map((id) => physicalIndex.get(id) ?? 0),
      source,
      target,
      weight,
      directed,
      physicalCount: physicalIndex.size,
    },
    graph: { nodeCount: stateIds.length, source, target, weight, directed },
    names,
    physicalIds,
    stateIds,
  };
}
```

- [ ] **Step 4: Run to verify pass**: `pnpm vitest run src/lib/parse-states.test.ts` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parse-states.ts src/lib/parse-states.test.ts
git commit -m "Parse Infomap *States network files"
```

---

### Task 8: `src/lib/apply-ftree.ts` — attach clustering to a raw network

When the full network is known (loaded from `.net`/states file) and Infomap produced an ftree, do NOT rebuild the graph from the ftree (that would lose real cross-module leaf links) — keep the real edges and attach modules/flow/names by matching ftree node ids.

**Files:**
- Create: `src/lib/apply-ftree.ts`
- Test: `src/lib/apply-ftree.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { withClustering } from "./apply-ftree";
import type { LoadedNetwork } from "./types";

const raw: LoadedNetwork = {
  kind: "raw",
  filename: "toy.net",
  directed: false,
  isStates: false,
  graph: { nodeCount: 3, source: [0, 1], target: [1, 2], weight: [1, 1], directed: false },
  names: ["n1", "n2", "n3"],
  physicalIds: [1, 2, 3],
  networkText: "*Vertices 3\n...",
};

const FTREE = `# path flow name id
1:1 0.5 "n1" 1
1:2 0.3 "n2" 2
2:1 0.2 "n3" 3
*Links directed
*Links root 0 0 1 2
1 2 0.1
`;

describe("withClustering", () => {
  const clustered = withClustering(raw, FTREE);

  it("keeps the original edges and adds modules + flow by matching ids", () => {
    expect(clustered.kind).toBe("clustered");
    expect(Array.from(clustered.graph.source as number[])).toEqual([0, 1]);
    expect(clustered.modules).toEqual([
      { id: 0, path: [1, 1] },
      { id: 1, path: [1, 2] },
      { id: 2, path: [2, 1] },
    ]);
    expect(Array.from(clustered.graph.nodeFlow as Float32Array)).toEqual(
      [0.5, 0.3, 0.2].map((v) => Math.fround(v)),
    );
    expect(clustered.ftree).toBe(FTREE);
    expect(clustered.networkText).toBe(raw.networkText);
  });

  it("throws when the ftree does not cover all nodes", () => {
    expect(() => withClustering(raw, "# path flow name id\n1:1 1.0 \"n1\" 1\n")).toThrow(/missing/i);
  });

  it("does not mutate the input", () => {
    expect(raw.kind).toBe("raw");
    expect(raw.modules).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**: `pnpm vitest run src/lib/apply-ftree.test.ts` — expect FAIL.

- [ ] **Step 3: Write `src/lib/apply-ftree.ts`**

```ts
import type { ModuleNode } from "@mapequation/d3gl/network";
import { parseTree } from "@mapequation/infomap-parser";
import { parseNodePath } from "./path-key";
import type { LoadedNetwork } from "./types";

interface ParsedNode {
  path: number[] | string;
  flow?: number;
  name?: string;
  id: number;
  stateId?: number;
}

/** Attach an Infomap ftree result to a raw network, keeping the real edges. */
export function withClustering(net: LoadedNetwork, ftreeText: string): LoadedNetwork {
  const result = parseTree(ftreeText, undefined, true, false);
  const nodes = result.nodes as unknown as ParsedNode[];

  // Raw states networks are keyed by state id; plain networks by physical id.
  const keyOf = (n: ParsedNode): number => (net.isStates ? (n.stateId ?? n.id) : n.id);
  const denseIndex = new Map<number, number>();
  (net.isStates && net.stateIds ? net.stateIds : net.physicalIds).forEach((id, i) => denseIndex.set(id, i));

  const modules: ModuleNode[] = new Array(net.graph.nodeCount);
  const nodeFlow = new Float32Array(net.graph.nodeCount);
  const names = [...net.names];
  let covered = 0;
  for (const n of nodes) {
    const idx = denseIndex.get(keyOf(n));
    if (idx === undefined) continue;
    modules[idx] = { id: idx, path: parseNodePath(n.path) };
    nodeFlow[idx] = n.flow ?? 0;
    if (n.name) names[idx] = n.name;
    covered++;
  }
  if (covered < net.graph.nodeCount) {
    throw new Error(`ftree is missing ${net.graph.nodeCount - covered} of ${net.graph.nodeCount} nodes`);
  }

  return {
    ...net,
    kind: "clustered",
    graph: { ...net.graph, nodeFlow },
    stateGraph: net.stateGraph ? { ...net.stateGraph, nodeFlow } : undefined,
    names,
    modules,
    ftree: ftreeText,
  };
}
```

- [ ] **Step 4: Run to verify pass**: `pnpm vitest run src/lib/apply-ftree.test.ts` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/apply-ftree.ts src/lib/apply-ftree.test.ts
git commit -m "Attach Infomap clustering to raw networks without rebuilding edges"
```

---

### Task 9: Infomap args + runner

**Files:**
- Create: `src/lib/infomap-args.ts`, `src/lib/run-infomap.ts`
- Test: `src/lib/infomap-args.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/infomap-args.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { buildInfomapArgs } from "./infomap-args";

describe("buildInfomapArgs", () => {
  it("always requests ftree output, silently", () => {
    expect(buildInfomapArgs({ directed: false, twoLevel: false, noInfomap: false })).toEqual({
      output: ["ftree"],
      silent: true,
    });
  });

  it("maps the options", () => {
    expect(
      buildInfomapArgs({ directed: true, twoLevel: true, noInfomap: true, clusterFilename: "p.clu" }),
    ).toEqual({
      output: ["ftree"],
      silent: true,
      directed: true,
      twoLevel: true,
      noInfomap: true,
      clusterData: "p.clu",
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**, then write `src/lib/infomap-args.ts`

```ts
import type { ClusterOptions } from "./types";

// Arguments type lives in @mapequation/infomap; keep the subset we use structural
// so the exact type-export path (index vs /arguments) never bites us.
export interface InfomapArguments {
  output: string[];
  silent: boolean;
  directed?: boolean;
  twoLevel?: boolean;
  noInfomap?: boolean;
  clusterData?: string;
}

export function buildInfomapArgs(o: ClusterOptions): InfomapArguments {
  const args: InfomapArguments = { output: ["ftree"], silent: true };
  if (o.directed) args.directed = true;
  if (o.twoLevel) args.twoLevel = true;
  if (o.noInfomap) args.noInfomap = true;
  if (o.clusterFilename) args.clusterData = o.clusterFilename;
  return args;
}
```

- [ ] **Step 3: Run to verify pass**: `pnpm vitest run src/lib/infomap-args.test.ts` — expect PASS.

- [ ] **Step 4: Write `src/lib/run-infomap.ts`** (worker wrapper — no unit test; exercised in the browser in Task 13)

```ts
import Infomap from "@mapequation/infomap";
import type { InfomapArguments } from "./infomap-args";

export interface RunInfomapOptions {
  network: string;
  filename: string;
  args: InfomapArguments;
  /** Virtual files (e.g. cluster data) — keys must match args.clusterData. */
  files?: Record<string, string>;
  onProgress?: (percent: number) => void;
  onLog?: (line: string) => void;
}

/** Run Infomap in its web worker; resolve with the ftree text (states variant preferred). */
export async function runInfomap(opts: RunInfomapOptions): Promise<string> {
  const infomap = new Infomap();
  if (opts.onProgress) infomap.on("progress", opts.onProgress);
  if (opts.onLog) infomap.on("data", opts.onLog);
  const result = await infomap.runAsync({
    network: opts.network,
    filename: opts.filename,
    args: opts.args,
    files: opts.files,
  });
  const ftree = result.ftree_states ?? result.ftree;
  if (!ftree) throw new Error("Infomap finished without ftree output");
  return ftree;
}
```

Note: with `noInfomap: true` Infomap evaluates the given partition and still writes the requested outputs; if the browser test in Task 13 shows ftree missing in that mode, fall back to `output: ["ftree", "flow"]` and re-check — record what you find in the PR notes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/infomap-args.ts src/lib/infomap-args.test.ts src/lib/run-infomap.ts
git commit -m "Add Infomap args builder and worker runner"
```

---

### Task 10: `src/lib/fit-transform.ts` — zoom-to-fit math

App-side placeholder for d3gl's future `fitToNodes` (Task 2 issue). Pure function: bbox over (a subset of) positions → `{k, x, y}`.

**Files:**
- Create: `src/lib/fit-transform.ts`
- Test: `src/lib/fit-transform.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { fitTransform } from "./fit-transform";

describe("fitTransform", () => {
  //  4 points on a 10×10 world square centered at (5,5)
  const positions = new Float32Array([0, 0, 10, 0, 0, 10, 10, 10]);

  it("fits all nodes into the viewport with padding", () => {
    const t = fitTransform(positions, null, 100, 100);
    expect(t).not.toBeNull();
    expect(t?.k).toBeCloseTo(9); // 0.9 * min(100/10, 100/10)
    expect(t?.x).toBeCloseTo(50 - 5 * 9);
    expect(t?.y).toBeCloseTo(50 - 5 * 9);
  });

  it("fits a subset", () => {
    const t = fitTransform(positions, [0, 1], 100, 50); // y-extent 0 → uses x-extent
    expect(t).not.toBeNull();
    expect(t?.k).toBeCloseTo(0.9 * (100 / 10));
  });

  it("returns null for empty input", () => {
    expect(fitTransform(new Float32Array(0), null, 100, 100)).toBeNull();
    expect(fitTransform(positions, [], 100, 100)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**, then write `src/lib/fit-transform.ts`

```ts
export interface ViewTransform {
  k: number;
  x: number;
  y: number;
}

/**
 * Compute the zoom transform that fits the given nodes (all when indices is
 * null) into a width×height viewport. Placeholder for d3gl fitToNodes().
 */
export function fitTransform(
  positions: Float32Array,
  indices: ArrayLike<number> | null,
  width: number,
  height: number,
  padding = 0.9,
): ViewTransform | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (i: number): void => {
    const x = positions[2 * i];
    const y = positions[2 * i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  if (indices) {
    for (let j = 0; j < indices.length; j++) consider(indices[j]);
  } else {
    for (let i = 0; i < positions.length / 2; i++) consider(i);
  }
  if (!Number.isFinite(minX)) return null;

  const w = Math.max(maxX - minX, 1e-9);
  const h = Math.max(maxY - minY, 1e-9);
  const k = padding * Math.min(width / w, height / h);
  return { k, x: width / 2 - ((minX + maxX) / 2) * k, y: height / 2 - ((minY + maxY) / 2) * k };
}
```

- [ ] **Step 3: Run to verify pass**: `pnpm vitest run src/lib/fit-transform.test.ts` — expect PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/fit-transform.ts src/lib/fit-transform.test.ts
git commit -m "Add zoom-to-fit transform helper"
```

---

### Task 11: MobX stores

**Files:**
- Create: `src/stores/settings-store.ts`, `src/stores/ui-store.ts`, `src/stores/network-store.ts`, `src/stores/index.ts`
- Test: `src/stores/network-store.test.ts`

- [ ] **Step 1: Write `src/stores/settings-store.ts`**

```ts
import { makeAutoObservable } from "mobx";

export type NodeSizeBy = "flow" | "degree";
export type ScaleKind = "linear" | "root";

/** Every d3gl option exposed in the Settings UI. */
export class SettingsStore {
  nodeSizeBy: NodeSizeBy = "flow";
  nodeScale: ScaleKind = "root";
  linkScale: ScaleKind = "root";
  labelsVisible = true;
  maxLabels = 50;
  simulation = true;
  lodEnabled = true;
  expandPx = 48;
  maxAggregateRadius = 26;
  declutter = true;
  superEdges = true;
  crossFade = 0;
  linkStyle: "line" | "half-arrow" = "line";
  sizeMode: "screen" | "world" = "screen";
  backend: "auto" | "webgl" | "canvas" | "svg" = "auto";
  pickLinks = false;
  stateView: "physical" | "state" | "both" = "physical";

  constructor() {
    makeAutoObservable(this);
  }

  set = <K extends keyof SettingsStore>(key: K, value: SettingsStore[K]): void => {
    Object.assign(this, { [key]: value });
  };
}
```

- [ ] **Step 2: Write `src/stores/ui-store.ts`**

```ts
import { makeAutoObservable } from "mobx";

export class UiStore {
  loadOpen = true;
  helpOpen = false;
  infomapRunning = false;
  infomapProgress = 0;
  infomapLog: string[] = [];
  loadError: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  openLoad = (): void => {
    this.loadOpen = true;
    this.helpOpen = false;
  };
  setLoadOpen = (open: boolean): void => {
    this.loadOpen = open;
  };
  setHelpOpen = (open: boolean): void => {
    this.helpOpen = open;
  };
  setLoadError = (message: string | null): void => {
    this.loadError = message;
  };
  startInfomap = (): void => {
    this.infomapRunning = true;
    this.infomapProgress = 0;
    this.infomapLog = [];
    this.loadError = null;
  };
  onInfomapProgress = (percent: number): void => {
    this.infomapProgress = percent;
  };
  onInfomapLog = (line: string): void => {
    this.infomapLog.push(line);
  };
  finishInfomap = (): void => {
    this.infomapRunning = false;
  };
}
```

- [ ] **Step 3: Write the failing test `src/stores/network-store.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { LoadedNetwork } from "../lib/types";
import { NetworkStore } from "./network-store";

const toy = (): LoadedNetwork => ({
  kind: "clustered",
  filename: "toy.ftree",
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

describe("NetworkStore", () => {
  it("builds the graph and computes stats on setNetwork", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    expect(store.built?.nodeCount).toBe(4);
    expect(store.maxWeight).toBe(2);
    expect(store.maxFlow).toBeCloseTo(0.4);
    expect(store.maxDegree).toBeGreaterThan(0);
  });

  it("resolves module leaves with memoization", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    expect(store.leavesOfModule([1])).toEqual([0, 1]);
    expect(store.leavesOfModule([2])).toEqual([2, 3]);
    expect(store.leavesOfModule([1])).toBe(store.leavesOfModule([1])); // cached
  });

  it("selects leaves and aggregates with a breadcrumb path", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    store.selectFromHit(0, false, null);
    expect(store.selection).toMatchObject({ ids: [0], aggregate: false, name: "alpha", physicalId: 1 });
    expect(store.breadcrumb).toEqual([1]);

    store.selectFromHit(99, true, [2, 3]);
    expect(store.selection?.ids).toEqual([2, 3]);
    expect(store.selection?.path).toEqual([2]);
    expect(store.selection?.flow).toBeCloseTo(0.3, 5);
    expect(store.selection?.name).toBe("gamma"); // highest-flow member fallback
    expect(store.breadcrumb).toEqual([2]);
  });

  it("matches search queries case-insensitively", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    store.setSearch("AL");
    expect(store.searchHighlight).toEqual([0]);
    store.setSearch("");
    expect(store.searchHighlight).toBeNull();
  });

  it("matches occurrence values against names", () => {
    const store = new NetworkStore();
    store.setNetwork(toy());
    store.addOccurrenceFile("occ.csv", ["beta", "delta", "nope"]);
    expect(store.occurrenceFiles[0].ids).toEqual([1, 3]);
    expect(store.occurrenceFiles[0].enabled).toBe(true);
  });
});
```

- [ ] **Step 4: Run to verify failure**: `pnpm vitest run src/stores/network-store.test.ts` — expect FAIL.

- [ ] **Step 5: Write `src/stores/network-store.ts`**

```ts
import {
  buildGraph,
  buildStateGraph,
  type Network,
  type NetworkGraph,
  type StateNetworkGraph,
} from "@mapequation/d3gl/network";
import { makeAutoObservable } from "mobx";
import { withClustering } from "../lib/apply-ftree";
import { OCCURRENCE_COLORS } from "../lib/occurrence-colors";
import { pathKey } from "../lib/path-key";
import type { LoadedNetwork } from "../lib/types";

export interface SelectionInfo {
  ids: number[];
  aggregate: boolean;
  name: string;
  path: number[] | null;
  flow: number | null;
  physicalId: number | null;
}

export interface OccurrenceFile {
  name: string;
  values: string[];
  ids: number[];
  idSet: Set<number>;
  color: string;
  enabled: boolean;
}

/** Common module path shared by a set of leaf paths (excluding the leaf position). */
function commonPathPrefix(paths: ArrayLike<number>[]): number[] {
  const first = paths[0];
  if (!first) return [];
  let len = first.length - 1;
  for (const p of paths) {
    let k = 0;
    const max = Math.min(len, p.length - 1);
    while (k < max && p[k] === first[k]) k++;
    len = k;
    if (!len) break;
  }
  return Array.from({ length: len }, (_, k) => first[k]);
}

export class NetworkStore {
  current: LoadedNetwork | null = null;
  selection: SelectionInfo | null = null;
  searchHighlight: number[] | null = null;
  occurrenceFiles: OccurrenceFile[] = [];
  breadcrumb: number[] = [];
  maxFlow = 0;
  maxDegree = 0;
  maxWeight = 0;

  /** Non-observable: typed-array graphs + engine handle (imperative surface). */
  built: NetworkGraph | null = null;
  builtState: StateNetworkGraph | null = null;
  engine: Network | null = null;
  /** Set by NetworkView; null ids = fit whole network. Placeholder for d3gl fitToNodes. */
  zoomTo: ((ids: number[] | null) => void) | null = null;

  private moduleLeafCache = new Map<string, number[]>();

  constructor() {
    makeAutoObservable(this, { built: false, builtState: false, engine: false, zoomTo: false });
  }

  setNetwork(net: LoadedNetwork): void {
    this.built = buildGraph(net.graph);
    this.builtState = net.stateGraph && net.modules ? buildStateGraph(net.stateGraph) : null;
    this.moduleLeafCache.clear();
    this.current = net;
    this.selection = null;
    this.searchHighlight = null;
    this.occurrenceFiles = [];
    this.breadcrumb = [];
    let maxFlow = 0;
    let maxDegree = 0;
    let maxWeight = 0;
    const g = this.built;
    if (g.flow) for (const f of g.flow) maxFlow = Math.max(maxFlow, f);
    for (const d of g.csr.degree) maxDegree = Math.max(maxDegree, d);
    for (const w of g.weight) maxWeight = Math.max(maxWeight, w);
    this.maxFlow = maxFlow;
    this.maxDegree = maxDegree;
    this.maxWeight = maxWeight;
  }

  applyClustering(ftreeText: string): void {
    if (this.current) this.setNetwork(withClustering(this.current, ftreeText));
  }

  clearSelection(): void {
    this.selection = null;
  }

  resetView(): void {
    this.breadcrumb = [];
  }

  selectFromHit(id: number, aggregate: boolean, members: number[] | null): void {
    const cur = this.current;
    if (!cur) return;
    const nodeFlow = cur.graph.nodeFlow as Float32Array | undefined;
    if (!aggregate) {
      const path = cur.modules ? Array.from(cur.modules[id].path) : null;
      this.selection = {
        ids: [id],
        aggregate: false,
        name: cur.names[id] ?? String(id),
        path,
        flow: nodeFlow ? nodeFlow[id] : null,
        physicalId: cur.physicalIds[id] ?? null,
      };
      if (path) this.breadcrumb = path.slice(0, -1);
      return;
    }
    const ids = members ?? [];
    const path = cur.modules ? commonPathPrefix(ids.map((i) => cur.modules?.[i]?.path ?? [])) : null;
    const flow = nodeFlow ? ids.reduce((sum, i) => sum + nodeFlow[i], 0) : null;
    this.selection = { ids, aggregate: true, name: this.moduleName(path, ids), path, flow, physicalId: null };
    if (path) this.breadcrumb = path;
  }

  moduleName(path: number[] | null, memberIds: number[]): string {
    const cur = this.current;
    if (!cur) return "";
    if (path) {
      const curated = cur.moduleNames?.get(pathKey(path));
      if (curated) return curated;
    }
    const nodeFlow = cur.graph.nodeFlow as Float32Array | undefined;
    let best = memberIds[0] ?? 0;
    if (nodeFlow) for (const i of memberIds) if (nodeFlow[i] > nodeFlow[best]) best = i;
    return cur.names[best] ?? "";
  }

  leavesOfModule(path: number[]): number[] {
    const cur = this.current;
    if (!cur?.modules) return [];
    const key = pathKey(path);
    const cached = this.moduleLeafCache.get(key);
    if (cached) return cached;
    const ids: number[] = [];
    for (const m of cur.modules) {
      const p = m.path;
      if (p.length > path.length && path.every((v, k) => p[k] === v)) ids.push(m.id);
    }
    this.moduleLeafCache.set(key, ids);
    return ids;
  }

  setSearch(query: string): void {
    const cur = this.current;
    const q = query.trim().toLowerCase();
    if (!cur || !q) {
      this.searchHighlight = null;
      return;
    }
    const ids: number[] = [];
    for (let i = 0; i < cur.names.length && ids.length < 5000; i++) {
      if (cur.names[i].toLowerCase().includes(q)) ids.push(i);
    }
    this.searchHighlight = ids;
  }

  addOccurrenceFile(name: string, values: string[]): void {
    const cur = this.current;
    if (!cur) return;
    const wanted = new Set(values);
    const ids: number[] = [];
    cur.names.forEach((n, i) => {
      if (wanted.has(n)) ids.push(i);
    });
    this.occurrenceFiles.push({
      name,
      values,
      ids,
      idSet: new Set(ids),
      color: OCCURRENCE_COLORS[this.occurrenceFiles.length % OCCURRENCE_COLORS.length],
      enabled: true,
    });
  }

  toggleOccurrenceFile(index: number): void {
    const f = this.occurrenceFiles[index];
    if (f) f.enabled = !f.enabled;
  }

  removeOccurrenceFile(index: number): void {
    this.occurrenceFiles.splice(index, 1);
  }
}
```

- [ ] **Step 6: Write `src/stores/index.ts`**

```ts
import { createContext, useContext } from "react";
import { NetworkStore } from "./network-store";
import { SettingsStore } from "./settings-store";
import { UiStore } from "./ui-store";

export class RootStore {
  network = new NetworkStore();
  settings = new SettingsStore();
  ui = new UiStore();
}

export const StoreContext = createContext<RootStore | null>(null);

export function useStores(): RootStore {
  const stores = useContext(StoreContext);
  if (!stores) throw new Error("StoreContext.Provider missing");
  return stores;
}
```

- [ ] **Step 7: Run to verify pass**: `pnpm vitest run src/stores/network-store.test.ts` — expect PASS.

**Known risk:** importing `@mapequation/d3gl/network` in the vitest node environment pulls the WebGL engine module (luma.gl) transitively. The package is `sideEffects: false` and import should be inert — if vitest still fails on import (e.g. a `document`/`window` reference at module scope), switch the test environment for this file to jsdom via `// @vitest-environment jsdom` as the first line and add `pnpm add -D jsdom`.

- [ ] **Step 8: Commit**

```bash
git add src/stores
git commit -m "Add MobX stores: network, settings, ui"
```

---

### Task 12: `NetworkView` + `Breadcrumb` + `EmptyState`

The d3gl engine wrapper — interim until the upstream `<Network>` component (Task 2 issue) lands. All style/label accessors are registered per config change, never per frame (d3gl core value).

**Files:**
- Create: `src/components/NetworkView.tsx`, `src/components/Breadcrumb.tsx`, `src/components/EmptyState.tsx`

- [ ] **Step 1: Write `src/components/NetworkView.tsx`**

```tsx
import {
  moduleColors,
  network,
  type NetworkLODOptions,
  type NetworkStyle,
} from "@mapequation/d3gl/network";
import { scaleLinear, scaleSqrt } from "d3-scale";
import { reaction, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { fitTransform } from "../lib/fit-transform";
import { useStores } from "../stores";
import type { NetworkStore } from "../stores/network-store";
import type { ScaleKind, SettingsStore } from "../stores/settings-store";

const DEFAULT_NODE_FILL = "#4878d0";

const makeScale = (kind: ScaleKind) => (kind === "root" ? scaleSqrt() : scaleLinear());

function buildStyle(store: NetworkStore, settings: SettingsStore, colors: string[] | null): NetworkStyle {
  const cur = store.current;
  const occurrences = store.occurrenceFiles.filter((f) => f.enabled);
  const byFlow = settings.nodeSizeBy === "flow" && !!cur?.graph.nodeFlow;
  return {
    directed: cur?.directed,
    sizeMode: settings.sizeMode,
    linkStyle: settings.linkStyle,
    nodeBorder: { width: 1, color: "#ffffff" },
    nodeRadius: {
      by: byFlow ? "flow" : "degree",
      scale: makeScale(settings.nodeScale)
        .domain([0, (byFlow ? store.maxFlow : store.maxDegree) || 1])
        .range([2, 14]),
    },
    linkWidth: {
      by: "weight",
      scale: makeScale(settings.linkScale).domain([0, store.maxWeight || 1]).range([0.4, 4]).clamp(true),
    },
    linkStroke: "rgba(90,100,120,0.55)",
    nodeFill:
      occurrences.length || colors
        ? (i: number) => {
            for (const f of occurrences) if (f.idSet.has(i)) return f.color;
            return colors?.[i] ?? DEFAULT_NODE_FILL;
          }
        : DEFAULT_NODE_FILL,
  };
}

function buildLod(store: NetworkStore, settings: SettingsStore): NetworkLODOptions | false {
  if (!settings.lodEnabled) return false;
  const modules = store.current?.modules;
  return {
    ...(modules ? { modules } : {}),
    expandPx: settings.expandPx,
    maxAggregateRadius: settings.maxAggregateRadius,
    declutter: settings.declutter,
    superEdges: settings.superEdges,
    crossFade: settings.crossFade,
  };
}

export const NetworkView = observer(function NetworkView() {
  const { network: store, settings } = useStores();
  const hostRef = useRef<HTMLDivElement>(null);
  const current = store.current; // observed: effect re-runs when a new network loads
  const backend = settings.backend;

  useEffect(() => {
    const host = hostRef.current;
    const graph = store.built;
    if (!host || !current || !graph) return;

    const net = network(host, backend === "auto" ? {} : { backend });
    store.engine = net;
    const colors = current.modules ? moduleColors(current.modules) : null;

    net.enableZoom([0.002, 200]);
    net.interactive({
      selectable: { multi: true },
      draggable: true,
      hover: { others: { opacity: 0.5 } },
      selection: { others: { opacity: 0.3 } },
    });

    net.on("click", (hit) => {
      runInAction(() => {
        if (!hit || hit.layer !== "nodes") {
          store.clearSelection();
          return;
        }
        const aggregate = (hit.datum as { aggregate?: boolean }).aggregate === true;
        const members = hit.members ? hit.members().map(Number) : null;
        store.selectFromHit(Number(hit.id), aggregate, members);
      });
    });

    const activePositions = (): Float32Array => {
      if (current.isStates && store.builtState && current.modules) {
        return settings.stateView === "physical"
          ? store.builtState.physical.positions
          : store.builtState.state.positions;
      }
      return graph.positions;
    };

    store.zoomTo = (ids) => {
      const t = fitTransform(activePositions(), ids, host.clientWidth, host.clientHeight);
      if (t) net.setTransform(t);
    };

    const onDblClick = (ev: MouseEvent) => {
      const rect = host.getBoundingClientRect();
      const hit = net.pick(ev.clientX - rect.left, ev.clientY - rect.top);
      if (hit?.members) store.zoomTo?.(hit.members().map(Number));
    };
    host.addEventListener("dblclick", onDblClick);

    if (current.isStates && store.builtState && current.modules) {
      net.stateNetwork(store.builtState, { modules: current.modules, view: settings.stateView });
    } else {
      net.data(graph);
    }

    const disposers = [
      reaction(() => buildStyle(store, settings, colors), (s) => net.style(s), { fireImmediately: true }),
      reaction(() => buildLod(store, settings), (lod) => net.lod(lod), { fireImmediately: true }),
      reaction(
        () => ({ on: settings.labelsVisible, max: settings.maxLabels }),
        ({ on, max }) =>
          net.labels(
            on
              ? {
                  max,
                  // Aggregate glyphs are labeled by size only: labelOf(id, info) exposes no
                  // module identity for aggregates yet — raised on the d3gl navigation issue.
                  labelOf: (id, info) =>
                    info.aggregate ? `${info.count.toLocaleString()} nodes` : current.names[Number(id)],
                  importanceOf: (id, info) => (info.aggregate ? info.count : (graph.flow?.[Number(id)] ?? 0)),
                }
              : false,
          ),
        { fireImmediately: true },
      ),
      reaction(
        () => settings.simulation,
        (on) => (on ? net.layout({ backend: "worker" }) : net.stopLayout()),
      ),
      reaction(() => store.searchHighlight, (ids) => net.select("nodes", ids), { fireImmediately: true }),
      reaction(() => settings.pickLinks, (p) => net.pickLinks(p), { fireImmediately: true }),
      reaction(
        () => settings.stateView,
        (view) => {
          if (current.isStates && current.modules) net.view(view);
        },
      ),
    ];

    net.layout({ backend: "worker" });
    void net.whenSettled().then(() => store.zoomTo?.(null));

    return () => {
      for (const dispose of disposers) dispose();
      host.removeEventListener("dblclick", onDblClick);
      store.zoomTo = null;
      if (store.engine === net) store.engine = null;
      net.destroy();
    };
  }, [store, settings, current, backend]);

  return <div ref={hostRef} className="absolute inset-0" />;
});
```

- [ ] **Step 2: Write `src/components/Breadcrumb.tsx`**

```tsx
import { Button } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { pathKey } from "../lib/path-key";
import { useStores } from "../stores";

/**
 * Module path of the last selected/zoomed module. Placeholder: updates on
 * click/double-click only — live viewport tracking needs the d3gl
 * navigation-helpers issue.
 */
export const Breadcrumb = observer(function Breadcrumb() {
  const { network: store } = useStores();
  const cur = store.current;
  if (!cur?.modules) return null;

  const crumbs = store.breadcrumb.map((_, k) => store.breadcrumb.slice(0, k + 1));

  return (
    <nav className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md bg-white/85 px-2 py-1 text-sm shadow-sm backdrop-blur">
      <Button
        size="sm"
        variant="ghost"
        onPress={() => {
          store.resetView();
          store.zoomTo?.(null);
        }}
      >
        {cur.filename}
      </Button>
      {crumbs.map((path) => (
        <span key={pathKey(path)} className="flex items-center gap-1">
          <span className="text-neutral-400">›</span>
          <Button size="sm" variant="ghost" onPress={() => store.zoomTo?.(store.leavesOfModule(path))}>
            {cur.moduleNames?.get(pathKey(path)) ?? store.moduleName(path, store.leavesOfModule(path))}
          </Button>
        </span>
      ))}
    </nav>
  );
});
```

- [ ] **Step 3: Write `src/components/EmptyState.tsx`**

```tsx
export function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center bg-neutral-50">
      <p className="text-neutral-400">Load a network to get started</p>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc -b` — expect clean. Fix any signature drift against the installed d3gl (`node_modules/@mapequation/d3gl/dist/network.d.ts` is the source of truth; the API facts at the top of this plan were extracted from the 0.8.0 sources).

- [ ] **Step 5: Commit**

```bash
git add src/components/NetworkView.tsx src/components/Breadcrumb.tsx src/components/EmptyState.tsx
git commit -m "Wrap d3gl network engine with MobX reactions, breadcrumb drill overlay"
```

Note for the StrictMode double-mount in dev: the effect creates and destroys the engine twice — that must stay clean. If the second mount renders a black canvas, check that `net.destroy()` releases the host before the next `network(host)` call and report upstream if it doesn't.

---

### Task 13: File loading — `load-files.ts`, `infomap-online.ts`, `LoadModal`

**Files:**
- Create: `src/lib/load-files.ts`, `src/lib/infomap-online.ts`, `src/components/LoadModal.tsx`
- Test: `src/lib/load-files.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/load-files.test.ts`** (non-Infomap branches only — the worker needs a browser)

```ts
import { describe, expect, it } from "vitest";
import { loadFiles, networkToLoaded } from "./load-files";

const PAJEK = `*Vertices 3
1 "n1"
2 "n2"
3 "n3"
*Edges
1 2 1
2 3 2
`;

const FTREE = `# path flow name id
1:1 0.6 "n1" 1
1:2 0.4 "n2" 2
*Links undirected
*Links 1 0 0 1 2
1 2 1.0
`;

describe("networkToLoaded", () => {
  it("parses Pajek into a raw LoadedNetwork", () => {
    const net = networkToLoaded(PAJEK, "toy.net");
    expect(net.kind).toBe("raw");
    expect(net.isStates).toBe(false);
    expect(net.graph.nodeCount).toBe(3);
    expect(net.names).toEqual(["n1", "n2", "n3"]);
    expect(net.physicalIds).toEqual([1, 2, 3]);
    expect(net.networkText).toBe(PAJEK);
  });

  it("detects state networks", () => {
    const states = '*Vertices 1\n1 "a"\n*States\n1 1\n2 1\n*Links\n1 2 1\n';
    const net = networkToLoaded(states, "toy_states.net");
    expect(net.isStates).toBe(true);
    expect(net.stateGraph?.stateCount).toBe(2);
    expect(net.stateIds).toEqual([1, 2]);
  });
});

describe("loadFiles", () => {
  it("loads a single ftree", async () => {
    const net = await loadFiles([{ name: "a.ftree", text: FTREE }], {
      directed: false, twoLevel: false, noInfomap: false,
    });
    expect(net.kind).toBe("clustered");
    expect(net.graph.nodeCount).toBe(2);
  });

  it("loads a single network file raw", async () => {
    const net = await loadFiles([{ name: "toy.net", text: PAJEK }], {
      directed: false, twoLevel: false, noInfomap: false,
    });
    expect(net.kind).toBe("raw");
  });

  it("rejects a partition without a network", async () => {
    await expect(
      loadFiles([{ name: "p.clu", text: "1 1\n" }], { directed: false, twoLevel: false, noInfomap: false }),
    ).rejects.toThrow(/network/i);
  });

  it("rejects unsupported extensions", async () => {
    await expect(
      loadFiles([{ name: "a.pdf", text: "" }], { directed: false, twoLevel: false, noInfomap: false }),
    ).rejects.toThrow(/unsupported/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**: `pnpm vitest run src/lib/load-files.test.ts` — expect FAIL.

- [ ] **Step 3: Write `src/lib/load-files.ts`**

```ts
import { parseNetwork } from "@mapequation/d3gl/network";
import { withClustering } from "./apply-ftree";
import { fileKind, isStatesText } from "./file-kinds";
import { ftreeToNetwork } from "./ftree-graph";
import { buildInfomapArgs } from "./infomap-args";
import { parseStates } from "./parse-states";
import { runInfomap } from "./run-infomap";
import type { ClusterOptions, LoadedNetwork } from "./types";

export interface NamedText {
  name: string;
  text: string;
}

/** Parse a raw network file (Pajek, edge list, or *States) into a LoadedNetwork. */
export function networkToLoaded(text: string, filename: string, directedOverride?: boolean): LoadedNetwork {
  if (isStatesText(text)) {
    const parsed = parseStates(text, filename, directedOverride ?? true);
    return {
      kind: "raw",
      filename,
      directed: parsed.stateGraph.directed ?? true,
      isStates: true,
      graph: parsed.graph,
      stateGraph: parsed.stateGraph,
      names: parsed.names,
      physicalIds: parsed.physicalIds,
      stateIds: parsed.stateIds,
      networkText: text,
    };
  }
  const parsed = parseNetwork(text, filename);
  const directed = directedOverride ?? parsed.directed;
  // Infomap keys its output by the file's node ids. Pajek ids are 1..N; edge
  // lists may use arbitrary numeric ids preserved in labels — recover them so
  // withClustering can match.
  const numericLabels =
    parsed.labels.length === parsed.nodeCount && parsed.labels.every((l) => /^\d+$/.test(l));
  const physicalIds = numericLabels
    ? parsed.labels.map(Number)
    : Array.from({ length: parsed.nodeCount }, (_, i) => i + 1);
  return {
    kind: "raw",
    filename,
    directed,
    isStates: false,
    graph: {
      nodeCount: parsed.nodeCount,
      source: parsed.source,
      target: parsed.target,
      weight: parsed.weight,
      directed,
    },
    names: parsed.labels.length ? [...parsed.labels] : physicalIds.map(String),
    physicalIds,
    networkText: text,
  };
}

export interface LoadCallbacks {
  onProgress?: (percent: number) => void;
  onLog?: (line: string) => void;
}

/**
 * Turn a set of dropped files into a LoadedNetwork:
 * - one .ftree alone → clustered network
 * - one network file alone → raw network
 * - one network + one .tree/.clu → Infomap run with the partition as cluster
 *   data (full run seeded by it, or flow-only with noInfomap)
 */
export async function loadFiles(
  files: NamedText[],
  opts: ClusterOptions,
  cb: LoadCallbacks = {},
): Promise<LoadedNetwork> {
  const unsupported = files.find((f) => fileKind(f.name) === "unknown");
  if (unsupported) throw new Error(`Unsupported file type: ${unsupported.name}`);

  const ftrees = files.filter((f) => fileKind(f.name) === "ftree");
  const partitions = files.filter((f) => ["tree", "clu"].includes(fileKind(f.name)));
  const networks = files.filter((f) => fileKind(f.name) === "network");

  if (ftrees.length > 1 || networks.length > 1 || partitions.length > 1) {
    throw new Error("Load at most one network, one ftree, and one partition file");
  }
  if (ftrees.length) {
    if (networks.length || partitions.length) {
      throw new Error("Load an .ftree alone, or a network file with an optional partition");
    }
    return ftreeToNetwork(ftrees[0].text, ftrees[0].name);
  }
  if (!networks.length) {
    throw new Error(
      partitions.length ? "A partition file needs its network file" : "No files to load",
    );
  }

  const net = networkToLoaded(networks[0].text, networks[0].name, opts.directed || undefined);
  if (!partitions.length) return net;

  const partition = partitions[0];
  const ftree = await runInfomap({
    network: networks[0].text,
    filename: networks[0].name,
    args: buildInfomapArgs({ ...opts, clusterFilename: partition.name }),
    files: { [partition.name]: partition.text },
    onProgress: cb.onProgress,
    onLog: cb.onLog,
  });
  return withClustering(net, ftree);
}
```

- [ ] **Step 4: Run to verify pass**: `pnpm vitest run src/lib/load-files.test.ts` — expect PASS.

- [ ] **Step 5: Write `src/lib/infomap-online.ts`**

```ts
import localforage from "localforage";

interface StoredNetwork {
  name?: string;
  ftree?: string;
  ftree_states?: string;
}

/**
 * Infomap Online (mapequation.org/infomap) stores its full result under
 * localforage db "infomap", key "network" — ftree/ftree_states as top-level
 * string fields. States output preferred, as in v1.
 */
export async function loadInfomapOnline(): Promise<{ text: string; filename: string } | null> {
  localforage.config({ name: "infomap" });
  const item = await localforage.getItem<StoredNetwork>("network");
  const text = item?.ftree_states ?? item?.ftree;
  if (!text) return null;
  const base = item?.name ? item.name.replace(/\.[^.]+$/, "") : "infomap-online";
  return { text, filename: `${base}.ftree` };
}
```

- [ ] **Step 6: Write `src/components/LoadModal.tsx`**

```tsx
import { Alert, Button, Modal, ProgressBar, Switch } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { fileKind } from "../lib/file-kinds";
import { ftreeToNetwork } from "../lib/ftree-graph";
import { loadInfomapOnline } from "../lib/infomap-online";
import { loadFiles, type NamedText } from "../lib/load-files";
import type { LoadedNetwork } from "../lib/types";
import { useStores } from "../stores";

export const LoadModal = observer(function LoadModal() {
  const { network: store, ui } = useStores();
  const [files, setFiles] = useState<NamedText[]>([]);
  const [directed, setDirected] = useState(false);
  const [twoLevel, setTwoLevel] = useState(false);
  const [noInfomap, setNoInfomap] = useState(false);
  const [onlineAvailable, setOnlineAvailable] = useState(false);

  useEffect(() => {
    if (ui.loadOpen) void loadInfomapOnline().then((item) => setOnlineAvailable(item !== null));
  }, [ui.loadOpen]);

  const onDrop = useCallback(async (accepted: File[]) => {
    const named = await Promise.all(accepted.map(async (f) => ({ name: f.name, text: await f.text() })));
    setFiles((prev) => [...prev, ...named]);
  }, []);
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({ onDrop, noClick: true });

  const finish = (net: LoadedNetwork): void => {
    store.setNetwork(net);
    ui.setLoadOpen(false);
    ui.setLoadError(null);
    setFiles([]);
  };
  const fail = (err: unknown): void => ui.setLoadError(err instanceof Error ? err.message : String(err));

  const loadExample = async (): Promise<void> => {
    try {
      const base = import.meta.env.BASE_URL;
      const [ftree, names] = await Promise.all([
        fetch(`${base}citation_data.ftree`).then((r) => r.text()),
        fetch(`${base}citation_module_names.json`).then((r) => r.json() as Promise<Record<string, string>>),
      ]);
      const net = ftreeToNetwork(ftree, "citation_data.ftree");
      net.moduleNames = new Map(Object.entries(names));
      finish(net);
    } catch (err) {
      fail(err);
    }
  };

  const loadOnline = async (): Promise<void> => {
    try {
      const item = await loadInfomapOnline();
      if (!item) throw new Error("No network stored by Infomap Online");
      finish(ftreeToNetwork(item.text, item.filename));
    } catch (err) {
      fail(err);
    }
  };

  const loadDropped = async (): Promise<void> => {
    try {
      ui.startInfomap();
      finish(
        await loadFiles(files, { directed, twoLevel, noInfomap }, {
          onProgress: ui.onInfomapProgress,
          onLog: ui.onInfomapLog,
        }),
      );
    } catch (err) {
      fail(err);
    } finally {
      ui.finishInfomap();
    }
  };

  const hasPartition = files.some((f) => ["tree", "clu"].includes(fileKind(f.name)));

  return (
    <Modal.Backdrop
      isOpen={ui.loadOpen}
      onOpenChange={(open) => {
        if (!open && !store.current) return; // nothing loaded yet — modal stays
        ui.setLoadOpen(open);
      }}
    >
      <Modal.Container size="lg">
        <Modal.Dialog>
          {store.current && <Modal.CloseTrigger />}
          <Modal.Header>
            <Modal.Heading>Load network</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-4">
            <div
              {...getRootProps()}
              className={`rounded-lg border-2 border-dashed p-6 text-center text-sm ${
                isDragActive ? "border-blue-400 bg-blue-50" : "border-neutral-300"
              }`}
            >
              <input {...getInputProps()} />
              {files.length === 0 ? (
                <p className="text-neutral-500">
                  Drop files here — .ftree, or a network (.net, edge list, states) optionally with a
                  .tree/.clu partition
                </p>
              ) : (
                <ul className="flex flex-col gap-1 text-left">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                      <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs">{fileKind(f.name)}</span>
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => setFiles((prev) => prev.filter((_, k) => k !== i))}
                      >
                        ✕
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <Switch isSelected={directed} onChange={setDirected}>Directed</Switch>
              <Switch isSelected={twoLevel} onChange={setTwoLevel}>Two-level</Switch>
              <Switch isSelected={noInfomap} onChange={setNoInfomap} isDisabled={!hasPartition}>
                No Infomap (flow from partition only)
              </Switch>
            </div>

            {ui.infomapRunning && (
              <div className="flex flex-col gap-1">
                <ProgressBar value={ui.infomapProgress} aria-label="Infomap progress" />
                <pre className="max-h-24 overflow-y-auto text-xs text-neutral-500">
                  {ui.infomapLog.slice(-8).join("\n")}
                </pre>
              </div>
            )}
            {ui.loadError && <Alert status="danger">{ui.loadError}</Alert>}
          </Modal.Body>
          <Modal.Footer className="flex flex-wrap gap-2">
            <Button variant="secondary" onPress={loadExample}>Load example</Button>
            <Button variant="secondary" isDisabled={!onlineAvailable} onPress={loadOnline}>
              Open from Infomap Online
            </Button>
            <Button variant="secondary" onPress={open}>Add files…</Button>
            <Button isDisabled={files.length === 0 || ui.infomapRunning} onPress={loadDropped}>
              Load
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
});
```

(HeroUI check applies: verify `Switch` children/`onChange`, `Alert status`, `ProgressBar value` props against the v3 docs and adjust.)

- [ ] **Step 7: Typecheck + commit**

```bash
pnpm exec tsc -b
git add src/lib/load-files.ts src/lib/load-files.test.ts src/lib/infomap-online.ts src/components/LoadModal.tsx
git commit -m "Add load flow: files, partitions via Infomap, Infomap Online, example"
```

---

### Task 14: App shell wiring

**Files:**
- Create: `src/components/HelpModal.tsx`, `src/assets/mapequation-icon.svg`
- Modify: `src/App.tsx`, `src/main.tsx`

- [ ] **Step 1: Fetch the MapEquation icon asset**

```bash
mkdir -p src/assets
curl -sSf https://www.mapequation.org/assets/img/twocolormapicon_whiteboarder.svg -o src/assets/mapequation-icon.svg
```

- [ ] **Step 2: Write `src/components/HelpModal.tsx`** (placeholder per spec)

```tsx
import { Modal } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { useStores } from "../stores";

export const HelpModal = observer(function HelpModal() {
  const { ui } = useStores();
  return (
    <Modal.Backdrop isOpen={ui.helpOpen} onOpenChange={ui.setHelpOpen}>
      <Modal.Container size="md">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Help</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p className="text-sm text-neutral-600">
              Documentation is coming soon. Meanwhile, see{" "}
              <a className="text-blue-600 underline" href="https://www.mapequation.org" target="_blank" rel="noreferrer">
                mapequation.org
              </a>{" "}
              for Infomap and the map equation.
            </p>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
});
```

- [ ] **Step 3: Replace `src/App.tsx`**

```tsx
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { Breadcrumb } from "./components/Breadcrumb";
import { EmptyState } from "./components/EmptyState";
import { HelpModal } from "./components/HelpModal";
import { LoadModal } from "./components/LoadModal";
import { NetworkView } from "./components/NetworkView";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { ftreeToNetwork } from "./lib/ftree-graph";
import { loadInfomapOnline } from "./lib/infomap-online";
import { useStores } from "./stores";

const App = observer(function App() {
  const { network: store, ui } = useStores();

  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => {
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (ev.key === "l" && !ui.loadOpen) ui.openLoad();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui]);

  useEffect(() => {
    // v1 behavior: ?infomap in the URL auto-loads the Infomap Online handover.
    if (!new URLSearchParams(window.location.search).has("infomap")) return;
    loadInfomapOnline()
      .then((item) => {
        if (!item) return;
        store.setNetwork(ftreeToNetwork(item.text, item.filename));
        ui.setLoadOpen(false);
      })
      .catch((err) => ui.setLoadError(String(err)));
  }, [store, ui]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <main className="relative min-w-0 flex-1">
        {store.current ? (
          <>
            <NetworkView />
            <Breadcrumb />
          </>
        ) : (
          <EmptyState />
        )}
      </main>
      <Sidebar />
      <LoadModal />
      <HelpModal />
    </div>
  );
});

export default App;
```

- [ ] **Step 4: Update `src/main.tsx` with the store provider**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { RootStore, StoreContext } from "./stores";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
createRoot(root).render(
  <StrictMode>
    <StoreContext.Provider value={new RootStore()}>
      <App />
    </StoreContext.Provider>
  </StrictMode>,
);
```

- [ ] **Step 5: Create a minimal `src/components/Sidebar/Sidebar.tsx` stub so the app compiles** (fleshed out in Task 15)

```tsx
export function Sidebar() {
  return <aside className="w-80 shrink-0 border-l border-neutral-200 bg-white p-4" />;
}
```

- [ ] **Step 6: Verify in the browser**

```bash
pnpm exec tsc -b && pnpm dev
```

Open `http://localhost:5173/navigator2/`: load modal is open; **Load example** renders the citation network as a module map (LOD aggregates visible, zoom expands them); pressing `l` after closing reopens the modal; error path (drop a `.pdf`) shows the alert.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "Wire app shell: load modal, network view, keyboard, ?infomap param"
```

---

### Task 15: Sidebar frame, Header, Cite, Help hookup

**Files:**
- Create: `src/components/Sidebar/Header.tsx`, `src/components/Sidebar/Cite.tsx`
- Modify: `src/components/Sidebar/Sidebar.tsx`

- [ ] **Step 1: Write `src/components/Sidebar/Cite.tsx`**

```tsx
import { Popover, Button } from "@heroui/react";

const year = new Date().getFullYear();
const BIBTEX = `@misc{mapequation${year}software,
  title = {{The MapEquation software package}},
  author = {Edler, Daniel and Holmgren, Anton and Rosvall, Martin},
  howpublished = {\\url{https://mapequation.org}},
  year = {${year}},
}`;

export function Cite() {
  return (
    <Popover>
      <Button size="sm" variant="secondary">How to cite</Button>
      <Popover.Content className="max-w-96">
        <Popover.Dialog>
          <Popover.Heading>Please cite</Popover.Heading>
          <pre className="mt-2 overflow-x-auto rounded bg-neutral-100 p-2 text-xs">{BIBTEX}</pre>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
```

- [ ] **Step 2: Write `src/components/Sidebar/Header.tsx`** (alluvial pattern: logo + app version, powered-by line with live package versions, Load/Cite/Help)

```tsx
import { version as d3glVersion } from "@mapequation/d3gl";
import Infomap from "@mapequation/infomap";
import { Button, Kbd } from "@heroui/react";
import { observer } from "mobx-react-lite";
import icon from "../../assets/mapequation-icon.svg";
import { useStores } from "../../stores";
import { Cite } from "./Cite";

export const Header = observer(function Header() {
  const { ui } = useStores();
  return (
    <div className="flex flex-col gap-3">
      <a href="https://www.mapequation.org" className="flex items-center gap-3">
        <img src={icon} alt="MapEquation" className="h-10 w-10" />
        <div>
          <h1 className="text-lg font-semibold leading-tight">
            Network Navigator{" "}
            <span className="text-xs font-normal text-neutral-400">v{import.meta.env.VITE_APP_VERSION}</span>
          </h1>
          <p className="text-xs text-neutral-500">
            Powered by Infomap v{Infomap.__version__} and d3gl v{d3glVersion}
          </p>
        </div>
      </a>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onPress={ui.openLoad}>
          Load <Kbd>L</Kbd>
        </Button>
        <Cite />
        <Button size="sm" variant="secondary" onPress={() => ui.setHelpOpen(true)}>
          Help
        </Button>
      </div>
    </div>
  );
});
```

- [ ] **Step 3: Replace `src/components/Sidebar/Sidebar.tsx`** with the frame (sections appear as their components land in Tasks 16–19; keep not-yet-written imports commented in until then, uncommenting per task)

```tsx
import { observer } from "mobx-react-lite";
import type { ReactNode } from "react";
import { useStores } from "../../stores";
import { Header } from "./Header";
// Uncomment as Tasks 16–19 land:
// import { Search } from "./Search";
// import { SelectedNode } from "./SelectedNode";
// import { Distributions } from "./Distributions";
// import { Occurrences } from "./Occurrences";
// import { SettingsPanel } from "./SettingsPanel";
// import { Export } from "./Export";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
      <h4 className="text-sm font-semibold text-neutral-700">{title}</h4>
      {children}
    </section>
  );
}

export const Sidebar = observer(function Sidebar() {
  const { network: store } = useStores();
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-neutral-200 bg-white p-4">
      <Header />
      {store.current && (
        <>
          {/* <Section title="Search"><Search /></Section> */}
          {/* <Section title={store.selection?.aggregate ? "Selected module" : "Selected node"}>
            <SelectedNode />
            <Distributions />
          </Section> */}
          {/* <Section title="Occurrences"><Occurrences /></Section> */}
          {/* <Section title="Settings"><SettingsPanel /></Section> */}
          {/* <Section title="Export"><Export /></Section> */}
        </>
      )}
    </aside>
  );
});
```

- [ ] **Step 4: Verify in the browser** — sidebar shows logo, both version numbers real (not `undefined`), Load reopens the modal, Cite pops the BibTeX, Help opens the placeholder. If `d3glVersion` is `"0.0.0-dev"`, the npm build didn't inject the version — fall back to a build-time define in `vite.config.ts` reading `node_modules/@mapequation/d3gl/package.json` and note it on the d3gl repo as a bug.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar
git commit -m "Add sidebar header with versions, load, cite, help"
```

---

### Task 16: Search, SelectedNode, Distributions

**Files:**
- Create: `src/components/Sidebar/Search.tsx`, `src/components/Sidebar/SelectedNode.tsx`, `src/components/Sidebar/Distributions.tsx`
- Modify: `src/components/Sidebar/Sidebar.tsx` (uncomment the Search + Selected sections)

- [ ] **Step 1: Write `src/components/Sidebar/Search.tsx`** (highlight via `net.select("nodes", ids)` — the reaction in NetworkView already wires it)

```tsx
import { Input } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useStores } from "../../stores";

export const Search = observer(function Search() {
  const { network: store } = useStores();
  const [query, setQuery] = useState("");
  const update = (value: string): void => {
    setQuery(value);
    store.setSearch(value);
  };
  return (
    <div className="flex flex-col gap-1">
      <Input aria-label="Search nodes" placeholder="Find nodes…" value={query} onChange={update} />
      {store.searchHighlight && (
        <p className="text-xs text-neutral-500">{store.searchHighlight.length} matching nodes highlighted</p>
      )}
    </div>
  );
});
```

(HeroUI check: if `Input`'s `onChange` passes an event instead of the value, adapt to `(e) => update(e.target.value)`.)

- [ ] **Step 2: Write `src/components/Sidebar/SelectedNode.tsx`**

```tsx
import { observer } from "mobx-react-lite";
import { Fragment } from "react";
import { useStores } from "../../stores";

export const SelectedNode = observer(function SelectedNode() {
  const { network: store } = useStores();
  const sel = store.selection;
  if (!sel) return <p className="text-xs text-neutral-400">Click a node or module in the network</p>;

  const rows: [string, string][] = [["Name", sel.name]];
  if (sel.aggregate) rows.push(["Nodes", sel.ids.length.toLocaleString()]);
  if (sel.path) rows.push(["Module", sel.path.join(":") || "root"]);
  if (sel.flow !== null) rows.push(["Flow", sel.flow.toExponential(2)]);
  if (sel.physicalId !== null) rows.push(["Node id", String(sel.physicalId)]);

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt className="text-neutral-500">{label}</dt>
          <dd className="truncate" title={value}>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
});
```

- [ ] **Step 3: Write `src/components/Sidebar/Distributions.tsx`** (recharts; members of the selected module ranked by flow — v1 charted in/out degree distributions, this charts flow + degree of members, the equivalents available from the d3gl graph)

```tsx
import { observer } from "mobx-react-lite";
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts";
import { useStores } from "../../stores";

export const Distributions = observer(function Distributions() {
  const { network: store } = useStores();
  const sel = store.selection;
  const graph = store.built;
  if (!sel?.aggregate || !graph) return null;

  const flow = store.current?.graph.nodeFlow as Float32Array | undefined;
  const ranked = [...sel.ids]
    .sort((a, b) => (flow ? flow[b] - flow[a] : graph.csr.degree[b] - graph.csr.degree[a]))
    .slice(0, 50);
  const data = ranked.map((id) => ({
    name: store.current?.names[id] ?? String(id),
    flow: flow ? flow[id] : 0,
    degree: graph.csr.degree[id],
  }));
  const key = flow ? "flow" : "degree";

  return (
    <div className="mt-1">
      <p className="mb-1 text-xs text-neutral-500">Top members by {key}</p>
      <BarChart width={280} height={120} data={data} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
        <XAxis dataKey="name" tick={false} />
        <YAxis tick={{ fontSize: 10 }} width={48} />
        <Tooltip />
        <Bar dataKey={key} fill="#4878d0" />
      </BarChart>
    </div>
  );
});
```

- [ ] **Step 4: Uncomment the Search and Selected sections in `Sidebar.tsx`**, run `pnpm exec tsc -b`, verify in the browser: typing highlights matches (rest dims), clicking a module fills the panel + chart.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar
git commit -m "Add search, selected node/module panel, member distributions"
```

---

### Task 17: Occurrences

**Files:**
- Create: `src/components/Sidebar/Occurrences.tsx`
- Modify: `src/components/Sidebar/Sidebar.tsx` (uncomment the section)

- [ ] **Step 1: Write `src/components/Sidebar/Occurrences.tsx`** (v1 parity: CSV files → first column matched against node names → colored highlight; occurrences-vs-expected chart for the selected module; CSV export)

```tsx
import { Button, Switch } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { useRef } from "react";
import { Bar, BarChart, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { downloadText } from "../../lib/download";
import { useStores } from "../../stores";

export const Occurrences = observer(function Occurrences() {
  const { network: store } = useStores();
  const input = useRef<HTMLInputElement>(null);
  const sel = store.selection;
  const cur = store.current;

  const addFiles = async (list: FileList | null): Promise<void> => {
    for (const file of Array.from(list ?? [])) {
      const text = await file.text();
      // v1 semantics: first CSV column = node names (quoted values unwrapped)
      const values = text
        .split(/\r?\n/)
        .map((line) => line.split(",")[0].trim().replace(/^"(.*)"$/, "$1"))
        .filter(Boolean);
      store.addOccurrenceFile(file.name, values);
    }
  };

  const selSet = new Set(sel?.aggregate ? sel.ids : []);
  const enabled = store.occurrenceFiles.filter((f) => f.enabled);
  const chartData = enabled.map((f) => ({
    name: f.name,
    color: f.color,
    occurrences: f.ids.reduce((n, id) => n + (selSet.has(id) ? 1 : 0), 0),
    expected: cur ? Math.round((f.ids.length * selSet.size) / cur.graph.nodeCount) : 0,
  }));

  const downloadCsv = (): void => {
    if (!cur || !sel) return;
    const lines = enabled.map((f) => {
      const names = f.ids.filter((id) => selSet.has(id)).map((id) => cur.names[id]);
      return `"${f.name}",${names.join(",")}`;
    });
    const base = cur.filename.replace(/\.[^.]+$/, "");
    downloadText(`${base}-occurrences.csv`, lines.join("\n"), "text/csv;charset=utf-8");
  };

  return (
    <div className="flex flex-col gap-2 text-xs">
      {store.occurrenceFiles.length === 0 && <p className="text-neutral-400">No files loaded</p>}
      {store.occurrenceFiles.map((f, i) => (
        <div key={`${f.name}-${i}`} className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: f.color }} />
          <span className="min-w-0 flex-1 truncate" title={f.name}>{f.name}</span>
          <span className="text-neutral-500">{f.ids.length}</span>
          <Switch aria-label={`Enable ${f.name}`} isSelected={f.enabled} onChange={() => store.toggleOccurrenceFile(i)} />
          <Button size="sm" variant="ghost" onPress={() => store.removeOccurrenceFile(i)}>✕</Button>
        </div>
      ))}
      <input
        ref={input}
        type="file"
        multiple
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button size="sm" variant="secondary" onPress={() => input.current?.click()}>Add file…</Button>

      {sel?.aggregate && enabled.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-neutral-500">Occurrences in selected module</p>
            <Button size="sm" variant="ghost" onPress={downloadCsv}>CSV</Button>
          </div>
          <BarChart width={280} height={140} data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
            <XAxis dataKey="name" tick={false} />
            <YAxis tick={{ fontSize: 10 }} width={40} />
            <Tooltip />
            <Bar dataKey="occurrences">
              {chartData.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Bar>
            <Bar dataKey="expected" fill="#aaaaaa" />
          </BarChart>
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Uncomment the Occurrences section in `Sidebar.tsx`**, `pnpm exec tsc -b`, verify: adding a CSV with a few node names recolors those nodes; the chart appears when a module is selected; toggling/removing restores module colors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar
git commit -m "Add occurrences highlighting with per-module chart and CSV export"
```

---

### Task 18: Settings panel (d3gl options UI) + Cluster with Infomap

**Files:**
- Create: `src/components/Sidebar/SettingsPanel.tsx`
- Modify: `src/components/Sidebar/Sidebar.tsx` (uncomment the section)

- [ ] **Step 1: Write `src/components/Sidebar/SettingsPanel.tsx`**

```tsx
import { Button, NumberField, Select, Slider, Switch } from "@heroui/react";
import { observer } from "mobx-react-lite";
import type { ReactNode } from "react";
import { buildInfomapArgs } from "../../lib/infomap-args";
import { runInfomap } from "../../lib/run-infomap";
import { useStores } from "../../stores";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

export const SettingsPanel = observer(function SettingsPanel() {
  const { network: store, settings, ui } = useStores();
  const cur = store.current;

  const cluster = async (): Promise<void> => {
    if (!cur?.networkText) return;
    try {
      ui.startInfomap();
      const ftree = await runInfomap({
        network: cur.networkText,
        filename: cur.filename,
        args: buildInfomapArgs({ directed: cur.directed, twoLevel: false, noInfomap: false }),
        onProgress: ui.onInfomapProgress,
        onLog: ui.onInfomapLog,
      });
      store.applyClustering(ftree);
    } catch (err) {
      ui.setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      ui.finishInfomap();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {cur?.kind === "raw" && cur.networkText && (
        <Button size="sm" onPress={cluster} isDisabled={ui.infomapRunning}>
          {ui.infomapRunning ? `Clustering… ${Math.round(ui.infomapProgress)}%` : "Cluster with Infomap"}
        </Button>
      )}

      <Row label={`Node size by ${settings.nodeSizeBy}`}>
        <Switch
          aria-label="Node size by flow"
          isSelected={settings.nodeSizeBy === "flow"}
          onChange={(on) => settings.set("nodeSizeBy", on ? "flow" : "degree")}
        />
      </Row>
      <Row label={`Node radius scale: ${settings.nodeScale}`}>
        <Switch
          aria-label="Root node scale"
          isSelected={settings.nodeScale === "root"}
          onChange={(on) => settings.set("nodeScale", on ? "root" : "linear")}
        />
      </Row>
      <Row label={`Link width scale: ${settings.linkScale}`}>
        <Switch
          aria-label="Root link scale"
          isSelected={settings.linkScale === "root"}
          onChange={(on) => settings.set("linkScale", on ? "root" : "linear")}
        />
      </Row>
      <Row label="Show labels">
        <Switch aria-label="Show labels" isSelected={settings.labelsVisible} onChange={(on) => settings.set("labelsVisible", on)} />
      </Row>
      <Row label="Max labels">
        <NumberField aria-label="Max labels" value={settings.maxLabels} minValue={0} maxValue={500} onChange={(v) => settings.set("maxLabels", v)} className="w-24" />
      </Row>
      <Row label="Run simulation">
        <Switch aria-label="Run simulation" isSelected={settings.simulation} onChange={(on) => settings.set("simulation", on)} />
      </Row>

      <p className="mt-2 text-xs font-semibold text-neutral-700">Level of detail (d3gl)</p>
      <Row label="LOD enabled">
        <Switch aria-label="LOD" isSelected={settings.lodEnabled} onChange={(on) => settings.set("lodEnabled", on)} />
      </Row>
      <Row label={`Expand at ${settings.expandPx}px`}>
        <Slider aria-label="Expand threshold" isDisabled={!settings.lodEnabled} minValue={16} maxValue={200} step={4} value={settings.expandPx} onChange={(v) => settings.set("expandPx", v as number)} className="w-32" />
      </Row>
      <Row label={`Max aggregate radius ${settings.maxAggregateRadius}px`}>
        <Slider aria-label="Max aggregate radius" isDisabled={!settings.lodEnabled} minValue={8} maxValue={64} step={2} value={settings.maxAggregateRadius} onChange={(v) => settings.set("maxAggregateRadius", v as number)} className="w-32" />
      </Row>
      <Row label="Declutter">
        <Switch aria-label="Declutter" isDisabled={!settings.lodEnabled} isSelected={settings.declutter} onChange={(on) => settings.set("declutter", on)} />
      </Row>
      <Row label="Super-edges">
        <Switch aria-label="Super edges" isDisabled={!settings.lodEnabled} isSelected={settings.superEdges} onChange={(on) => settings.set("superEdges", on)} />
      </Row>
      <Row label={`Cross-fade ${settings.crossFade.toFixed(1)}`}>
        <Slider aria-label="Cross fade" isDisabled={!settings.lodEnabled} minValue={0} maxValue={1} step={0.1} value={settings.crossFade} onChange={(v) => settings.set("crossFade", v as number)} className="w-32" />
      </Row>

      <p className="mt-2 text-xs font-semibold text-neutral-700">Rendering (d3gl)</p>
      <Row label="Link style">
        <Select
          aria-label="Link style"
          isDisabled={!cur?.directed}
          selectedKey={settings.linkStyle}
          onSelectionChange={(k) => settings.set("linkStyle", k as "line" | "half-arrow")}
          className="w-32"
        >
          <Select.Item id="line">line</Select.Item>
          <Select.Item id="half-arrow">half-arrow</Select.Item>
        </Select>
      </Row>
      <Row label="Size mode">
        <Select aria-label="Size mode" selectedKey={settings.sizeMode} onSelectionChange={(k) => settings.set("sizeMode", k as "screen" | "world")} className="w-32">
          <Select.Item id="screen">screen</Select.Item>
          <Select.Item id="world">world</Select.Item>
        </Select>
      </Row>
      <Row label="Backend (recreates view)">
        <Select aria-label="Backend" selectedKey={settings.backend} onSelectionChange={(k) => settings.set("backend", k as typeof settings.backend)} className="w-32">
          <Select.Item id="auto">auto</Select.Item>
          <Select.Item id="webgl">webgl</Select.Item>
          <Select.Item id="canvas">canvas</Select.Item>
          <Select.Item id="svg">svg</Select.Item>
        </Select>
      </Row>
      <Row label="Pick links (WebGL)">
        <Switch aria-label="Pick links" isSelected={settings.pickLinks} onChange={(on) => settings.set("pickLinks", on)} />
      </Row>
      {cur?.isStates && cur.modules && (
        <Row label="State view">
          <Select aria-label="State view" selectedKey={settings.stateView} onSelectionChange={(k) => settings.set("stateView", k as typeof settings.stateView)} className="w-32">
            <Select.Item id="physical">physical</Select.Item>
            <Select.Item id="state">state</Select.Item>
            <Select.Item id="both">both</Select.Item>
          </Select>
        </Row>
      )}
    </div>
  );
});
```

(HeroUI check applies to `Select`/`Slider`/`NumberField` prop names. v1's "node limit in modules" is covered by the LOD knobs — expand threshold, max aggregate radius, declutter — which bound visible detail in the d3gl model.)

- [ ] **Step 2: Uncomment the Settings section in `Sidebar.tsx`**, `pnpm exec tsc -b`, verify in the browser: every control changes the view live (LOD off shows the raw network of a clustered file — the raw-view toggle from the spec); backend switch recreates the view; on a raw `.net` the Cluster button produces a module map.

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar
git commit -m "Expose d3gl options in settings, add in-app Infomap clustering"
```

---

### Task 19: Export

**Files:**
- Create: `src/components/Sidebar/Export.tsx`
- Modify: `src/components/Sidebar/Sidebar.tsx` (uncomment the section)

- [ ] **Step 1: Write `src/components/Sidebar/Export.tsx`**

```tsx
import { Button } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { downloadDataUrl, downloadText } from "../../lib/download";
import { useStores } from "../../stores";

export const Export = observer(function Export() {
  const { network: store } = useStores();
  const cur = store.current;
  if (!cur) return null;
  const base = cur.filename.replace(/\.[^.]+$/, "");

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="secondary"
        isDisabled={!cur.ftree}
        onPress={() => cur.ftree && downloadText(`${base}.ftree`, cur.ftree)}
      >
        Download .ftree
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onPress={() => {
          const svg = store.engine?.toSVG();
          if (svg) downloadText(`${base}.svg`, svg, "image/svg+xml;charset=utf-8");
        }}
      >
        Download SVG
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onPress={() => {
          const png = store.engine?.toPNG();
          if (png) downloadDataUrl(`${base}.png`, png);
        }}
      >
        Download PNG
      </Button>
    </div>
  );
});
```

- [ ] **Step 2: Uncomment the Export section**, `pnpm exec tsc -b`, verify: all three downloads produce openable files (SVG shows the current LOD view). If `toPNG()` returns a Promise in the installed d3gl (the 0.8.0 typing says string — re-check `network.d.ts`), await it.

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar
git commit -m "Add ftree/SVG/PNG export"
```

---

### Task 20: CI, README, cleanup

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `README.md`

- [ ] **Step 1: Write `.github/workflows/pages.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
      - uses: actions/configure-pages@v5
      - run: touch dist/.nojekyll
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-24.04
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Rewrite `README.md`**

```markdown
# Network Navigator

Interactive navigator for hierarchical (Infomap) networks, built on
[@mapequation/d3gl](https://www.npmjs.com/package/@mapequation/d3gl).
Published under `/navigator2`; part of [mapequation.org](https://www.mapequation.org).

## Features

- Zoomable "map of networks": the Infomap hierarchy drives an adaptive
  level-of-detail cut (d3gl); double-click a module to zoom into it.
- Loads `.ftree` files, raw networks (Pajek/edge list, `*States`), and
  `.tree`/`.clu` partitions (flow computed by Infomap, optionally `--no-infomap`).
- Runs [Infomap](https://www.mapequation.org/infomap/) in the browser to
  cluster raw networks; opens results from Infomap Online.
- Export ftree, SVG, PNG.

## Development

pnpm + Vite + React + TypeScript. `pnpm install`, then:

- `pnpm dev` — dev server at `/navigator2/`
- `pnpm test` / `pnpm lint` / `pnpm build`

Deployed to GitHub Pages by `.github/workflows/pages.yml` on push to `master`.
```

- [ ] **Step 3: Full local gate**

```bash
pnpm format && pnpm lint && pnpm test && pnpm build
git status   # nothing unexpected untracked
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add pnpm/Vite Pages workflow, rewrite README"
```

---

### Task 21: End-to-end verification

No new code — drive every flow in the running app (`pnpm dev`, `http://localhost:5173/navigator2/`). Fixtures to paste into files for the raw/partition flows:

`toy.net`:

```
*Vertices 6
1 "a"
2 "b"
3 "c"
4 "d"
5 "e"
6 "f"
*Edges
1 2 1
2 3 1
1 3 2
4 5 1
5 6 1
4 6 2
3 4 0.5
```

`toy.clu` (partition for the same network):

```
# node_id module
1 1
2 1
3 1
4 2
5 2
6 2
```

`toy_states.net`:

```
*Vertices 3
1 "alpha"
2 "beta"
3 "gamma"
*States
1 1 "alpha-1"
2 1 "alpha-2"
3 2 "beta-1"
4 3 "gamma-1"
*Links
1 3 1
3 2 1
2 4 2
4 1 1
```

- [ ] Example: Load example → module map with curated names in breadcrumb/selection ("Life sciences" etc.); zoom expands modules; labels show node names.
- [ ] Drill: double-click a module → zooms to it, breadcrumb shows the path; breadcrumb ancestors and the filename crumb zoom back out.
- [ ] Raw: `toy.net` → renders immediately (6 nodes); **Cluster with Infomap** → two modules, colors change, `.ftree` export enabled.
- [ ] Partition: `toy.net` + `toy.clu`, **No Infomap** ON → clustered into the given two modules with flow (node sizes vary). OFF → Infomap runs seeded (same result on this toy).
- [ ] States: `toy_states.net` → renders raw (4 state nodes); Cluster with Infomap → state view controls appear; physical/state/both all render.
- [ ] Infomap Online: run any network at mapequation.org/infomap (or seed localforage db `infomap` key `network` with `{ name: "x", ftree: "<toy ftree text>" }` in the console), then the modal button enables and loads it; `?infomap` URL param auto-loads.
- [ ] Sidebar: search highlights + dims; selection panel + distributions chart; occurrences CSV (`a`, `d` lines) recolors two nodes and charts within a selected module; every settings control acts; export produces 3 valid files.
- [ ] Keyboard `l` reopens the modal; parse errors (drop a `.pdf`, malformed `.net`) surface in the modal, app stays alive.
- [ ] `pnpm lint && pnpm test && pnpm build` all green.
- [ ] Fix what fails (small fixes inline; structural issues → stop and surface). Commit fixes.

Do NOT merge `v2` into `master` (push to master deploys). Hand the branch back for review — use superpowers:finishing-a-development-branch.

---

## Appendix: spec coverage

| Spec section | Tasks |
| --- | --- |
| Stack (pnpm/Vite/TS/HeroUI/Tailwind/MobX/Biome/recharts/localforage) | 3, 11 |
| Removed deps (lodash, semantic-ui, prop-types, prettier, standard-version, react-scripts, file-saver, d3 v5, src/lib, src/io) | 1, 5 (native downloads) |
| Load: example / Infomap Online (`?infomap`) / files (.ftree/.net/states/.tree/.clu) | 4, 13, 14 |
| Infomap in-browser (worker, ftree output, cluster data, --no-infomap) | 9, 13, 18 |
| Raw rendering + Cluster action + raw↔map toggle | 13 (raw load), 18 (cluster + LOD toggle) |
| State networks (files + view toggle) | 7, 12, 13, 18 |
| LOD map + drill controls (dblclick zoom, breadcrumb, zoom-to-root) | 10, 12 |
| Sidebar header (versions, Load `L`, Cite, Help placeholder) | 14 (Help), 15 |
| Search / Selected + distributions / Occurrences / Settings (d3gl UI) / Export | 16, 17, 18, 19 |
| Library-first: 4 d3gl issues + 4 app tracking issues + placeholders | 2, 12 (breadcrumb/labels notes) |
| Errors inline, WebGL fallback | 12 (backend auto), 13 (modal errors) |
| Vitest for lib | 5–11, 13 |
| Deploy `/navigator2` (Pages, pnpm) | 3 (base), 20 |

Known intentional deviations from v1, called out during implementation: distributions chart shows member flow/degree instead of v1's in/out-degree split; occurrence CSV parsing is first-column-split (v1 used papaparse the same way); aggregate glyph labels show member counts until d3gl exposes module identity to `labelOf`.






