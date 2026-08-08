// Merge verified bios from data/bios.json + data/bios-west.json into models.json.
// Only writes bio for published models that currently have an empty bio.
// Also unpublishes k-inkyung: its current photo is the former ROK foreign
// minister (U.S. State Dept photo), not the art-gravure model 강인경.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

const bios = {
  ...JSON.parse(await readFile(path.join(root, "data", "bios.json"), "utf8")),
  ...JSON.parse(await readFile(path.join(root, "data", "bios-west.json"), "utf8")),
  ...JSON.parse(await readFile(path.join(root, "data", "bios-more.json"), "utf8")),
};

const data = JSON.parse(await readFile(path.join(root, "data", "models.json"), "utf8"));

let merged = 0;
for (const m of data.models || []) {
  if (m.id === "k-inkyung" && /State Department|flickr\.com\/people\/9364837@N06/i.test(m.creditText || "")) {
    m.photoAvailable = false;
    m.photoUrl = "";
    m.creditText = "";
    m.creditUrl = "";
    process.stdout.write(`unpublished ${m.id} (wrong person photo)\n`);
  }
  if (!m.photoAvailable) continue;
  if (m.bio && m.bio.trim()) continue;
  const b = bios[m.id];
  if (!b) {
    process.stdout.write(`NO BIO: ${m.id}\n`);
    continue;
  }
  m.bio = b;
  merged += 1;
}

await writeFile(path.join(root, "data", "models.json"), JSON.stringify(data, null, 2) + "\n");
process.stdout.write("bios merged: " + merged + "\n");