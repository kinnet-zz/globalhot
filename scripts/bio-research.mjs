// Research all published models: resolve best Wikipedia article (ja for JAPAN,
// en otherwise) and extract infobox fields (birth_date, birth_place,
// occupation, years_active, agency, notable works) plus the lead intro into
// data/bio-report.json. This tool does NOT modify models.json. The report is
// the source material for expanding the short 1-2 sentence bios into readable
// 2-4 sentence profiles (birth, origin, debut, flagship work, recent activity).
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const UA = { "User-Agent": "globalhot-pipeline/1.0 (static site directory; bot@globalhot.net)" };

async function api(host, params) {
  const q = new URLSearchParams({ action: "query", format: "json", ...params });
  const url = `https://${host}/w/api.php?` + q.toString();
  const r = await fetch(url, { headers: UA });
  return r.json();
}

async function bestTitle(host, terms) {
  for (const term of terms) {
    if (!term) continue;
    const d = await api(host, { list: "search", srsearch: term, srlimit: 3 });
    for (const s of d.query?.search || []) {
      const t = s.title || "";
      if (/\((gravi|av|sex|gravure)\)$/i.test(t)) continue;
      return t;
    }
  }
  return "";
}

async function wikitext(host, title) {
  const d = await api(host, { prop: "revisions", rvprop: "content", rvslots: "main", titles: title });
  const page = Object.values(d.query?.pages || {})[0];
  if (!page || page.missing) return "";
  return page.revisions?.[0]?.slots?.main?.["*"] || "";
}

async function summaryOf(host, title) {
  const url = `https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const r = await (await fetch(url, { headers: UA })).json();
    return (r.extract || "").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function clean(value) {
  return String(value || "")
    .replace(/\[\[([^\]|]*?)\]\]/g, "$1")
    .replace(/\[\[([^\]|]*?)\|([^\]]*?)\]\]/g, "$2")
    .replace(/{{[^{}]*?}}/g, " ")
    .replace(/\{\{[^{}]*?\}\}/g, " ")
    .replace(/<ref[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^>]*\/>/gi, " ")
    .replace(/'{2,}/g, "")
    .replace(/&nbsp;|&nbsp/g, " ")
    .replace(/&#91;|&#93;/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function parseDate(raw) {
  const t = String(raw || "").match(/\{\{(?:生年月日と年齢|Birth date(?: and age)?|BirthDeathAge\/B|bd)\|([^}|]+)\|([^}|]+)\|([^}|]+)/i);
  if (t) return `${t[1].trim()}-${String(t[2]).trim().padStart(2, "0")}-${String(t[3]).trim().padStart(2, "0")}`;
  const s = clean(raw);
  const m = s.match(/(\d{4})\s*(?:년|年|年)?\s*([0-9]{1,2})\s*(?:월|月|月)[^\d]{0,6}([0-9]{1,2})\s*(?:일|日)?/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  const y = s.match(/((?:18|19|20)\d{2})/);
  if (y) {
    const mm = s.match(/(?:^|\s|\|)([01]?\d)[|\s,/年.\-]([0-3]?\d)(?:$|\s|\||日|月)/);
    if (mm) return `${y[1]}-${String(mm[1]).padStart(2, "0")}-${String(mm[2]).padStart(2, "0")}`;
    return y[1];
  }
  return s;
}

function collectTemplate(input, tagName) {
  const marker = "{{" + tagName;
  const start = input.indexOf(marker);
  if (start === -1) return "";
  let depth = 0;
  for (let i = start; i < input.length; i += 1) {
    if (input[i] === "{") {
      if (input[i + 1] === "{") { depth += 1; i += 1; }
    } else if (input[i] === "}") {
      if (input[i + 1] === "}") { depth -= 1; i += 1; }
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return "";
}

function infoboxFields(text) {
  const block = collectTemplate(text, "Infobox");
  const out = {};
  const year = {};
  const lines = block.split("\n");
  for (const line of lines) {
    const kv = line.match(/^\s*\|([^=]+)=\s*(.*)$/);
    if (!kv) continue;
    const raw = (kv[2] || "").trim();
    if (!raw) continue;
    const key = kv[1].trim().toLowerCase().replace(/\s+/g, "_");
    const val = clean(kv[2]);
    if (key === "birth_date") out.birthDate = parseDate(kv[2]);
    else if (key === "生年") year.birthYear = val;
    else if (key === "生月") year.birthMonth = val;
    else if (key === "生日") year.birthDay = val;
    else if (key === "birth_place" || key === "出身地") out.birthPlace = val.replace(/^\{\{[^}]*\}\}\s*/g, "").replace(/^[,，\s]+/, "").replace(/[,，\s]+$/, "");
    else if (key === "occupation" || key === "職業") out.occupation = val.replace(/^\{\{[^}]*\}\}\s*/g, "").replace(/^\[/, "").replace(/\]$/, "");
    else if (key === "years_active" || key === "yearsactive") out.yearsActive = val;
    else if (key === "agency" || key === "事務所") out.agency = val;
    else if (key === "spouse") out.spouse = val;
  }
  if (!out.birthDate && year.birthYear) {
    out.birthDate = year.birthMonth && year.birthDay
      ? `${year.birthYear}-${String(year.birthMonth).padStart(2, "0")}-${String(year.birthDay).padStart(2, "0")}`
      : `${year.birthYear}-01-01`;
  }
  return out;
}

function recentActivity(text, limit) {
  const lines = String(text || "").split("\n");
  const hits = [];
  for (const line of lines) {
    const m = line.match(/^\*\s*((?:19|20)\d{2})[^\n]*/);
    if (!m) continue;
    const body = clean(m[0].replace(/^\*\s*/, ""));
    if (body.length > 140) hits.push({ year: m[1], text: body.slice(0, 140) });
    else if (body) hits.push({ year: m[1], text: body });
  }
  const byYear = {};
  for (const h of hits) {
    if (!byYear[h.year] || byYear[h.year].text.length < h.text.length) byYear[h.year] = h;
  }
  const years = Object.keys(byYear).sort();
  return years.slice(-(limit || 3)).map((y) => byYear[y]);
}

function headlineNotes(text) {
  // Photobook / publishing highlights are marked by "写真集" or photobook
  // mentions inside the 書籍/作品 sections. Heuristic only.
  const lead = String(text || "").slice(0, 12000);
  const notes = [];
  const m = lead.match(/(?:写真集|ラスト|フォトブック|photobook|주간지|週刊)[^\n]{0,90}/gi) || [];
  for (const raw of m.slice(0, 5)) {
    const s = clean(raw);
    if (s.length > 20) notes.push(s);
  }
  return notes;
}

async function run() {
  const data = JSON.parse(await readFile(path.join(root, "data", "models.json"), "utf8"));
  const need = data.models.filter((m) => m.photoAvailable);
  const report = [];
  for (const m of need) {
    const host = m.country === "JAPAN" ? "ja.wikipedia.org" : "en.wikipedia.org";
    const lang = m.country === "JAPAN" ? "ja" : "en";
    const primary = String(m.name || "").trim();
    const alt = String(m.altName || "").trim();
    const terms = [];
    if (alt && alt !== primary) terms.push(alt);
    terms.push(primary);
    const title = await bestTitle(host, terms);
    const text = title ? await wikitext(host, title) : "";
    const fields = text ? infoboxFields(text) : {};
    const intro = await summaryOf(host, title);
    const recent = recentActivity(text, 3);
    const notes = headlineNotes(text);
    report.push({
      id: m.id,
      name: primary,
      altName: alt,
      country: m.country,
      lang,
      wiki: title,
      matched: true,
      birthDate: fields.birthDate || "",
      birthPlace: fields.birthPlace || "",
      occupation: fields.occupation || "",
      yearsActive: fields.yearsActive || "",
      agency: fields.agency || "",
      spouse: fields.spouse || "",
      intro,
      recent,
      notes,
    });
    const hits = [m.id, title, fields.birthDate || "-", fields.birthPlace || "-", fields.yearsActive || "-"].join(" | ");
    process.stdout.write(hits + "\n");
  }
  await writeFile(path.join(root, "data", "bio-report.json"), JSON.stringify(report, null, 2) + "\n");
  process.stdout.write("done: " + need.length + " rows -> data/bio-report.json\n");
}

run().catch((e) => {
  process.stderr.write(String(e && (e.stack || e.message || e)) + "\n");
  process.exit(1);
});