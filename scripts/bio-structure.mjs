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
  let s = String(v || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .trim();
  // Reflow "2020年 10月 -" style Japanese activity ranges into "2020 -".
  s = s
    .replace(/(?:19|20)\d{2}年?\s*[0-9]{1,2}月/g, (m) => m.slice(0, 4))
    .replace(/年/g, "") // stray Japanese year kanji ("2021年" -> "2021")
    .replace(/\s+/g, " ")
    .trim();
  // "1994 -" kind of stray year marker is not a usable activity range.
  if (RANGE_RE.test(s)) return "";
  return s.replace(/\s?-\s?/g, " - ").replace(/\s+-\s*$/, " -").trim();
}

const TEMPLATE_BLOCK_RE = /\{\{[\s\S]*?\}\}/g;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const WIKI_JUNK_RE = /[|{}=<>]/g;

function stripWiki(value) {
  let s = String(value || "")
    .replace(HTML_COMMENT_RE, " ")
    .replace(/<ref[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^>]*\/>/gi, " ")
    .replace(/\{\{(?:flatlist|plainlist|ubil)\b[\s\S]*?\}\}/gi, " ")
    .replace(TEMPLATE_BLOCK_RE, " ")
    .replace(/\[\s*\[(?:[^\]|]*\|)?([^\]]*?)\]\]/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[,，;；\s]+|[,，;；\s]+$/g, "")
    .replace(WIKI_JUNK_RE, "")
    .replace(/\s+/g, " ")
    .trim();
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
const CLEAN_FIELDS = ["origin", "occupation", "agency"];
for (const model of data.models) {
  if (!(model && model.photoAvailable)) continue;
  // Normalize pre-existing values so previously merged rows are cleaned too.
  const yearsClean = model.yearsActive ? cleanRange(model.yearsActive) : "";
  if (model.yearsActive && yearsClean !== model.yearsActive) {
    if (!dryRun) model.yearsActive = yearsClean;
    applied += 1;
  }
  for (const f of CLEAN_FIELDS) {
    const c = model[f] ? stripWiki(model[f]) : "";
    if (model[f] && c !== model[f]) {
      if (!dryRun) model[f] = c;
      applied += 1;
    }
  }
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
    if (dst === "origin" || dst === "occupation" || dst === "agency") value = stripWiki(value);
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