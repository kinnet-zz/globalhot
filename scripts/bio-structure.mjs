// Merge wiki-researched structured profile fields from data/bio-report.json into
// data/models.json, following the "상세 프로필 표준 규격" in AGENTS.md.
//
// Only values whose wikipedia title actually carries the model's identity are
// applied (titleCarriesIdentity, same gate as photo verification). Unverified
// or unwanted values are left empty. This tool does NOT write bio text — bios
// come from data/bios-extended.json via bio-apply.mjs --overwrite.
//
// Usage: node scripts/bio-structure.mjs [--dry-run]
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nameTokensContain, normalizeName } from "./publish-discovery.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const dryRun = process.argv.includes("--dry-run");
let writes = 0;

const REPO_FIELD = {
  birthDate: "birth",
  birthPlace: "origin",
  occupation: "occupation",
  yearsActive: "yearsActive",
  agency: "agency",
};
const SCHEMA_FIELDS = ["birth", "origin", "debut", "occupation", "yearsActive", "agency", "notable", "awards", "recent"];
const RANGE_RE = /^\s*\d{4}(-|\/|\.)\s*$/;
const BIRTH_RE = /^(?:\d{4})(?:-\d{2}-\d{2})?$/;

function titleCarriesIdentity(title, row) {
  const raw = String(title || "");
  const alt = String(row.altName || "").trim();
  if (alt && /[\u3040-\u30FF\uAC00-\uD7AF\u4E00-\u9FFF]/.test(alt) && raw.indexOf(alt) !== -1) return true;
  if (nameTokensContain(raw, row.name)) return true;
  if (alt && alt !== String(row.name || "").trim() && nameTokensContain(raw, alt)) return true;
  return false;
}

function cleanRange(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  // "1994 -" kind of stray year marker is not a usable activity range.
  if (RANGE_RE.test(s)) return "";
  return s;
}

function cleanBirth(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  return BIRTH_RE.test(s) ? s : "";
}

const data = JSON.parse(await readFile(path.join(root, "data", "models.json"), "utf8"));
const report = JSON.parse(await readFile(path.join(root, "data", "bio-report.json"), "utf8"));
const byId = new Map(report.map((r) => [r.id, r]));

const declared = Array.isArray(data.fields) ? data.fields : [];
for (const f of SCHEMA_FIELDS) {
  if (!declared.includes(f)) {
    if (!dryRun) declared.push(f);
  }
}
if (!dryRun) data.fields = declared;

let applied = 0;
for (const model of data.models) {
  if (!(model && model.photoAvailable)) continue;
  const row = byId.get(model.id);
  if (!row || !row.wiki) continue;
  if (!titleCarriesIdentity(row.wiki, row)) {
    process.stdout.write(`SKIP ${model.id} (identity not in wiki title "${row.wiki}")\n`);
    continue;
  }
  for (const [src, dst] of Object.entries(REPO_FIELD)) {
    let value = row[src] || "";
    if (dst === "yearsActive") value = cleanRange(value);
    if (dst === "birth") value = cleanBirth(value);
    if (value && String(model[dst] || "") !== value) {
      if (!dryRun) model[dst] = value;
      applied += 1;
    }
  }
  if (!dryRun && model.bio && model.bio.length < 120) writes += 1;
}

if (dryRun) {
  process.stdout.write(`dry-run: ${applied} candidate structured field updates\n`);
  process.exit(0);
}

await writeFile(path.join(root, "data", "models.json"), JSON.stringify(data, null, 2) + "\n");
process.stdout.write(`done: ${applied} structured field updates\n`);