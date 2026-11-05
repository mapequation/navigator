import { ftreeToNetwork } from "./ftree-graph";
import { loadFiles } from "./load-files";
import type { LoadedNetwork } from "./types";

/** An example served with the app, from public/. */
export interface BundledExample {
  kind: "bundled";
  id: string;
  title: string;
  /** The file kind, as a short tag. */
  format: string;
  /** What the example shows. */
  about: string;
  /** What to try once it is loaded. */
  hint: string;
  read: () => Promise<LoadedNetwork>;
}

/** A network from the netgamut mirror; its figures come from the catalog. */
export interface CatalogExample {
  kind: "netgamut";
  key: string;
  title: string;
  /** One line on what it is, from the catalog's description. */
  about: string;
}

export type Example = BundledExample | CatalogExample;

const base = import.meta.env.BASE_URL;

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res;
}

/** A citation network: an .ftree, with curated module names. */
async function readCitation(): Promise<LoadedNetwork> {
  const [ftree, names] = await Promise.all([
    fetchOk(`${base}citation_data.ftree`).then((r) => r.text()),
    fetchOk(`${base}citation_module_names.json`).then(
      (r) => r.json() as Promise<Record<string, string>>,
    ),
  ]);
  const net = ftreeToNetwork(ftree, "citation_data.ftree");
  net.moduleNames = new Map(Object.entries(names));
  return net;
}

/** A state network, loaded as if dropped alone: raw, until Infomap runs. */
async function readLesMiserables(): Promise<LoadedNetwork> {
  const name = "Les_Miserables.net";
  const text = await fetchOk(`${base}${name}`).then((r) => r.text());
  return loadFiles([{ name, text }], {
    directed: false,
    twoLevel: false,
    noInfomap: false,
  });
}

export const BUNDLED_EXAMPLES: readonly BundledExample[] = [
  {
    kind: "bundled",
    id: "citation",
    title: "Citation network",
    format: ".ftree",
    about:
      "An Infomap result: a hierarchy of modules, named by field and journal.",
    hint: "Double-click a module to zoom into its submodules.",
    read: readCitation,
  },
  {
    kind: "bundled",
    id: "les-miserables",
    title: "Les Misérables",
    format: ".net",
    about: "The novel's characters as a state network, without modules yet.",
    hint: "Run Infomap in the Modules panel to find its modules.",
    read: readLesMiserables,
  },
];

/** Well-known networks across domains and sizes, from small to large. */
export const CATALOG_EXAMPLES: readonly CatalogExample[] = [
  {
    kind: "netgamut",
    key: "netzschleuder/karate",
    title: "Zachary's karate club",
    about:
      "Social ties among the 34 members of a university karate club, observed by W. W. Zachary from 1970 to 1972.",
  },
  {
    kind: "netgamut",
    key: "netzschleuder/celegansneural",
    title: "C. elegans neural network",
    about:
      "The neural network of the nematode C. elegans, compiled by D. J. Watts and S. H. Strogatz.",
  },
  {
    kind: "netgamut",
    key: "netzschleuder/polblogs",
    title: "Political blogs",
    about:
      "Hyperlinks among weblogs on U.S. politics, compiled by L. A. Adamic and N. Glance.",
  },
  {
    kind: "netgamut",
    key: "netzschleuder/openflights",
    title: "OpenFlights airports",
    about:
      "Airline routes among airports worldwide, from the OpenFlights route database.",
  },
  {
    kind: "netgamut",
    key: "netzschleuder/power",
    title: "US power grid",
    about:
      "The high-voltage power grid of the Western States of the United States.",
  },
  {
    kind: "netgamut",
    key: "snap/cit-HepTh",
    title: "arXiv HEP-Th citations",
    about:
      "Citations among papers in the arXiv High Energy Physics Theory section.",
  },
];
