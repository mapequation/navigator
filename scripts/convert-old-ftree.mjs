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
  if (/^\*Modules/i.test(line)) {
    section = "modules";
    continue;
  }
  if (/^\*Nodes/i.test(line)) {
    section = "nodes";
    continue;
  }
  const dir = line.match(/^\*Links\s+(directed|undirected)\s*$/i);
  if (dir) {
    directed = dir[1].toLowerCase() === "directed";
    section = "links";
    continue;
  }
  const header = line.match(/^\*Links\s+(\S+)\s+([\d.eE+-]+)\s+(\d+)\s+(\d+)/);
  if (header) {
    current = {
      path: header[1],
      exitFlow: header[2],
      numEdges: header[3],
      numChildren: header[4],
      rows: [],
    };
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
  ...linkSections.flatMap((s) => [
    `*Links ${s.path} 0 ${s.exitFlow} ${s.numEdges} ${s.numChildren}`,
    ...s.rows,
  ]),
].join("\n");

fs.writeFileSync(outFtree, `${out}\n`);
fs.writeFileSync(outNames, `${JSON.stringify(moduleNames, null, 2)}\n`);
console.log(
  `nodes: ${nodeLines.length}, link sections: ${linkSections.length}, module names: ${Object.keys(moduleNames).length}, directed: ${directed}`,
);
