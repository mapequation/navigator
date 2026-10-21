# Network Navigator 2.0 — Design

Date: 2026-07-03
Status: approved pending final review

## Goal

Rewrite the Infomap Network Navigator as a modern web app built on the
`@mapequation/d3gl` network module: same core functionality as v1, plus raw
network rendering, in-browser Infomap clustering, partition-file input, and
state-network support.

## Context

- This repo is a fork of `mapequation/navigator` (remote `upstream`). All v1
  files are deleted and replaced by a fresh scaffold at the repo root. The app
  publishes under `/navigator2` so v1 and v2 can coexist; later a PR from this
  fork replaces the old navigator upstream.
- v1 is a CRA app (React 16, semantic-ui, custom SVG rendering in `src/lib`,
  hand-rolled ftree parsers in `src/io`). All of that is replaced.
- `@mapequation/d3gl@0.8.0` (npm, ESM, React 19 peer) provides the network
  engine: `network(host)` with WebGL/Canvas/SVG backends, `buildGraph` /
  `buildStateGraph`, Pajek/edge-list parsing, force layout (worker/GPU),
  zoom/pan, hover/click/select/drag interaction, HTML label overlay,
  `lod({ modules })` for Infomap-hierarchy-driven adaptive level of detail
  ("map of networks"), `lod(false)` for raw rendering, `toSVG()`/`toPNG()`.
- The sidebar header replicates the alluvial generator pattern (Chakra there,
  HeroUI here): logo + version, "Powered by …" line, Load button, How to cite,
  Help.

## Stack

| Concern       | Choice                                                          |
| ------------- | --------------------------------------------------------------- |
| Tooling       | pnpm, Vite 8, TypeScript, Vitest                                 |
| UI            | React 19, `@heroui/react` 3.x, Tailwind CSS 4                    |
| Rendering     | `@mapequation/d3gl` ^0.8.0 (network module)                      |
| Clustering    | `@mapequation/infomap` ^2.14 (web worker), `@mapequation/infomap-react` (`useInfomap`) |
| Parsing       | `@mapequation/infomap-parser` (ftree/tree/clu); d3gl `parseNetwork` (net/edge list) |
| State         | MobX 6 + `mobx-react-lite`                                       |
| Charts        | recharts 3.x (exact version verified against npm at install)     |
| Infomap Online handover | `localforage`                                          |
| Format/lint   | Biome (dev)                                                      |

Removed from v1: `lodash`, `semantic-ui-react`/`semantic-ui-css`, `prop-types`,
`prettier`, `standard-version`, `react-scripts`, `file-saver` (native
`URL.createObjectURL` downloads), `d3` v5, all of `src/lib` (custom rendering)
and `src/io` (custom parsers).

## Architecture

```
src/
  main.tsx
  App.tsx                    — modal/dialog open state, view switch
  components/
    LoadModal/               — initial dialog: example, Infomap Online, files, Infomap options
    NetworkView/             — React wrapper around d3gl network() (local, until upstream <Network>)
    Sidebar/                 — header + sections (Search, Selected, Occurrences, Settings, Export)
    Documentation/           — Help dialog (placeholder content)
  stores/                    — MobX: NetworkStore, SettingsStore, UiStore
  lib/                       — ftree→modules transform, infomap args builder, file-type detection, downloads
public/
  citation_data.ftree        — example network (from v1)
```

MobX stores:

- **NetworkStore** — loaded network: source ftree text (if any), parsed tree,
  raw graph (typed arrays via `buildGraph`/`buildStateGraph`), node names,
  modules for LOD, directed flag, state-network flag, filename, selection.
- **SettingsStore** — every d3gl option exposed in the UI (see Settings), each
  change applied to the engine via MobX `reaction`s.
- **UiStore** — load-modal/help open state, Infomap run progress/log.

The `NetworkView` wrapper instantiates `network(host, { backend })` in an
effect, applies config fluently, wires events back into stores, sets up
`reaction`s for settings, and calls `destroy()` on cleanup. It registers style
and label accessors once per config change — never per frame (d3gl core value:
no per-frame app work).

## Load flow

The load modal opens on start and reopens from the sidebar **Load** button
(keyboard `L`). Sources:

1. **Example network** — `citation_data.ftree` fetched from `public/`.
2. **Infomap Online** — localforage db `infomap`, key `network`
   (prefer `ftree_states` over `ftree`), auto-loaded when the `?infomap` URL
   param is present (v1 behavior).
3. **Files** — dropzone + picker accepting:
   - `.ftree` → parse with `infomap-parser` → module map directly.
   - `.net` / edge list (incl. `*states` state networks) → parse with d3gl →
     render **raw** immediately.
   - `.tree` / `.clu` **paired with a network file** → run Infomap with the
     partition as cluster data: full run seeded by it, or `--no-infomap` to
     only compute flow for the given partition. Options row in the modal:
     directed, two-level, no-infomap.

In-browser Infomap runs in its worker (`useInfomap`), always with ftree output
requested; progress and log stream into the modal. Output ftree text is parsed
with `infomap-parser` and drives `lod({ modules })`.

For a raw network on screen, the sidebar offers **Cluster with Infomap** (same
options). A clustered network can toggle back to the raw view. The current
ftree text (loaded or generated) is retained for export.

State networks: `buildStateGraph` + `net.stateNetwork(graph, { modules })`,
with a physical/state/both view toggle in Settings when applicable.

## Network view & navigation

Continuous LOD map plus drill controls:

- One d3gl instance; `lod({ modules, …knobs })` when clustered, `lod(false)`
  raw. Zoom smoothly expands/collapses modules (engine-owned cut).
- `style`: `sizeMode: "screen"`, `nodeRadius` by flow, `nodeFill` by top-level
  module (categorical scheme), `linkStyle: "half-arrow"` for directed networks.
- `labels({ labelOf, importanceOf: flow, max })`; `layout({ backend: "worker" })`.
- `interactive({ selectable, hover, draggable })`; click/select → NetworkStore
  selection → sidebar.
- **Drill controls**: double-click a module zooms to its extent; a breadcrumb
  overlay shows the module path currently dominating the viewport (click an
  ancestor to zoom out); a zoom-to-root button resets the view. These need
  d3gl navigation helpers (see Library-first); until they land, the app ships
  placeholder UI wired to what `setTransform` allows (zoom-to-root works now).

## Sidebar (right, HeroUI)

- **Header** (alluvial pattern): MapEquation logo + "Network Navigator" + app
  version (`VITE_APP_VERSION=$npm_package_version`); line
  "Powered by Infomap v{Infomap.__version__} and d3gl v{version}" (d3gl version
  read at build time from the installed package); **Load** button (`L`);
  **How to cite** popover with the MapEquation software package BibTeX (ported
  from v1/alluvial); **Help** opening the placeholder Documentation dialog.
- **Search** — filter node names, highlight matches in the view (needs
  programmatic selection by ids — see Library-first).
- **Selected node/module** — name, flow, enter/exit, in/out links, and
  degree-distribution charts of member nodes (recharts), as v1.
- **Occurrences** — CSV upload highlighting node sets, as v1 (same d3gl
  selection dependency as Search).
- **Cluster with Infomap** — shown for raw (unclustered) networks: runs
  Infomap with the same options as the load modal, then switches to the
  module map.
- **Settings — d3gl options UI.** All engine options the user can act on get
  controls:
  - node size by flow/nodes; node radius scale (linear/root); link width scale
  - labels on/off, max labels
  - simulation on/off (`layout`/`stopLayout`)
  - LOD on/off (module map ↔ raw) and LOD knobs: `expandPx`,
    `maxAggregateRadius`, declutter, cross-fade, super-edges
  - link style (line/half-arrow), arrow size; link picking on/off
  - `sizeMode` (screen/world); backend (auto/webgl/canvas/svg, applied on
    recreate)
  - state-network view (physical/state/both) when a state network is loaded
  - v1's "node limit in modules" maps onto the LOD/declutter knobs; if no
    equivalent exists, placeholder + issues (see Library-first)
- **Export** — download `.ftree` (retained text), SVG (`toSVG()`), PNG
  (`toPNG()`), via native downloads.

## Library-first (d3gl AGENTS.md)

d3gl is the product; this app is a client. Any capability that would force
boilerplate here is filed as a `mapequation/d3gl` issue (their template +
project board) instead of being worked around. Identified so far:

1. **React `<Network>` component** in `@mapequation/d3gl/react` (confirmed
   gap — `/react` only ships `<D3GL>` for maps). File up front; the local
   `NetworkView` wrapper is the interim and gets swapped when it lands.
2. **Navigation helpers** — `zoomToModule(path)` / zoom-to-fit, and a query or
   event for the module currently dominating the viewport (breadcrumb source).
   File once confirmed missing during implementation.
3. **Programmatic selection/highlight by node ids** — needed by Search and
   Occurrences; file if `select()` can't take ids/predicate.
4. **Node-limit-style declutter knob** — only if no existing LOD knob covers
   v1 parity.

For every gap: the app ships a visible-but-disabled or reduced placeholder,
and a tracking issue is opened on `mapequation/network-navigator` linking the
d3gl issue ("wire X when mapequation/d3gl#N lands").

## Errors, testing, deployment

- Parse and Infomap errors surface inline in the load modal (v1 pattern);
  Infomap worker log is shown on failure. WebGL unavailability falls back via
  `backend: "auto"`.
- Vitest covers `lib/`: ftree→modules transform, Infomap args builder,
  file-type detection/pairing. v1's `test/` targeted the deleted parsers and
  is not ported.
- GitHub Actions workflow updated for pnpm + Vite: build with
  `base: "/navigator2/"`, deploy to GitHub Pages. `homepage`/`base` set to
  `/navigator2`.

## Non-goals

- Replacing the upstream navigator now (later PR from this fork).
- Real Help content (placeholder only).
- Multilayer networks, JSON input, dark-mode theming.
