# Network Navigator

Interactive navigator for hierarchical (Infomap) networks, built on
[@mapequation/d3gl](https://www.npmjs.com/package/@mapequation/d3gl).
Published at [mapequation.org/navigator](https://www.mapequation.org/navigator/); part of [mapequation.org](https://www.mapequation.org).

## Features

- Zoomable "map of networks": the Infomap hierarchy drives an adaptive
  level-of-detail cut (d3gl); double-click a module to zoom into it.
- Loads `.ftree` files, raw networks (Pajek/edge list, `*States`), and
  `.tree`/`.clu` partitions (flow computed by Infomap, optionally `--no-infomap`).
- Runs [Infomap](https://www.mapequation.org/infomap/) in the browser to
  cluster raw networks; opens results from Infomap Online.
- The load dialog browses the [netgamut](https://github.com/mapequation/netgamut)
  catalog: search by name, topic or author, filter by domain, direction and
  size, and load a network; Infomap clusters it as it loads. It lists the networks of the
  catalog's web mirror, gzipped Pajek listed in
  [`index.json`](https://raw.githubusercontent.com/mapequation/netgamut-networks/mirror/index.json),
  described by the catalog index netgamut's documentation serves
  (`_static/explorer/catalog.json`). A loaded network's
  `?netgamut=<key>` (e.g. `/navigator/?netgamut=netzschleuder/karate`) stays
  in the address bar, so the link opens it again; `&noInfomap` opens it
  without running Infomap. Set `VITE_NETGAMUT_MIRROR`
  and `VITE_NETGAMUT_CATALOG` to other URLs to develop against a local mirror.
- Export ftree, SVG, PNG.

## Development

pnpm + Vite + React + TypeScript. `pnpm install`, then:

- `pnpm dev` — dev server at `/navigator/`
- `pnpm test` / `pnpm lint` / `pnpm build`

Deployed to GitHub Pages by `.github/workflows/pages.yml` on push to `master`.
