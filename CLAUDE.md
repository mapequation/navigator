# CLAUDE.md

Network Navigator 2.0: Vite + React 19 + TS + HeroUI 3 + MobX, rendered with `@mapequation/d3gl`.
Scripts: `pnpm dev`, `pnpm build` (tsc + vite), `pnpm test` (vitest), `pnpm e2e` (Playwright), `pnpm lint` (biome).
Git: the repo is `mapequation/navigator` (v2 replaced v1 there; `network-navigator` is archived). Worktrees go
under `.claude/worktrees/`.

## Developing d3gl alongside the app

Most rendering, layout and LOD work belongs in **d3gl**, not in this app. The library is a separate repo at
`../d3gl` (`/Users/daniel/dev/projects/icelab/code/web/d3gl`, GitHub `mapequation/d3gl`, so pass
`-R mapequation/d3gl` to `gh`). The package itself is `../d3gl/packages/d3gl`.

- **Read `../d3gl/CLAUDE.md` in full before any d3gl work**, and the docs it points to for the task
  (`docs/agents/workflow.md` when coordinating issue → PR → release, `docs/agents/performance.md` for per-frame
  paths and perf guards, the matching `LOG.md` sections): changing it, judging its PRs or measurements, or asking
  the user about them. It is outside this working directory, so Claude Code does not load it automatically. Its
  rules apply in full: performance at ≈1M with LOD off and on, per-frame regression tests, and "uncertain means
  blocking". Every prompt that delegates d3gl work to an agent must say to read it in full, follow all of it,
  and read the docs it points to.
- **Linking a local d3gl build** into the app, instead of the published package:
  1. Work in a d3gl worktree (`../d3gl/.claude/worktrees/<name>`) and build it:
     `pnpm --filter @mapequation/d3gl build` (tsdown into `packages/d3gl/dist`). The app imports `dist`, not
     `src`, so rebuild after every library change, then reload the page.
  2. In this app: `pnpm add @mapequation/d3gl@link:<worktree>/packages/d3gl`.
  3. In `vite.config.ts`: add the worktree path to `server.fs.allow`, next to `searchForWorkspaceRoot(process.cwd())`,
     and set `optimizeDeps: { exclude: ["@mapequation/d3gl"] }` so Vite serves the rebuilt `dist` instead of a
     pre-bundled copy.
- **Back to the published package:** `master` never carries a `link:` dependency. After the d3gl changes are
  merged and released (the Version Packages PR; a release needs the user's go-ahead), run
  `pnpm add @mapequation/d3gl@^<version>`, remove the `fs.allow` entry and the `optimizeDeps` exclusion, run
  `pnpm build`, `pnpm test` and `pnpm e2e`, and then merge to `master`.
- **Data:** never fabricate links, flows or values. Render only what the input has.
