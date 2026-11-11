// Copy a few networks of netgamut's mirror (format 2) into src/lib/__fixtures__/netgamut, with an index.json
// that lists only them. src/lib/netgamut.test.ts and e2e/smoke.spec.ts read them.
// Usage: node scripts/netgamut-fixtures.mjs [mirror]
// `mirror` is the mirror's URL or a folder netgamut exported to; the default is the public mirror.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const KEYS = [
  "netzschleuder/karate",
  "netzschleuder/london_transport",
  "netzschleuder/physician_trust",
  "konect/moreno_crime",
];
const MIRROR =
  "https://raw.githubusercontent.com/mapequation/netgamut-networks/mirror/";
const OUT = path.join(
  import.meta.dirname,
  "..",
  "src",
  "lib",
  "__fixtures__",
  "netgamut",
);

const from = process.argv[2] ?? MIRROR;
const isUrl = /^https?:\/\//.test(from);
const root = from.replace(/index\.json$/, "");

async function read(file) {
  if (!isUrl) return fs.readFileSync(path.join(root, file));
  const res = await fetch(new URL(file, root));
  if (!res.ok) throw new Error(`${file}: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

const manifest = JSON.parse(String(await read("index.json")));
if (manifest.format !== 2)
  throw new Error(`${from} is format ${manifest.format ?? 1}, not 2`);
const datasets = KEYS.map((key) => {
  const dataset = manifest.datasets.find((d) => d.key === key);
  if (!dataset) throw new Error(`${from} has no ${key}`);
  return dataset;
});
// Download everything before replacing the folder, so a failed download leaves it as it was.
const files = [];
for (const dataset of datasets)
  for (const file of Object.values(dataset.files))
    files.push([file, await read(file)]);

fs.rmSync(OUT, { recursive: true, force: true });
for (const [file, bytes] of files) {
  fs.mkdirSync(path.dirname(path.join(OUT, file)), { recursive: true });
  fs.writeFileSync(path.join(OUT, file), bytes);
}
// The manifest's top level without its lists of left-out datasets, which name the whole catalog.
const top = Object.fromEntries(
  Object.entries(manifest).filter(
    ([k]) => !["datasets", "skipped", "failed"].includes(k),
  ),
);
const index = path.join(OUT, "index.json");
fs.writeFileSync(index, JSON.stringify({ ...top, datasets }));
execFileSync("pnpm", ["exec", "biome", "format", "--write", index], {
  stdio: "inherit",
});
console.log(`${files.length} files from ${from} in ${OUT}`);
