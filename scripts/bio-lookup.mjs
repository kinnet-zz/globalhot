import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// One-off: build a research report for the ~88 published models that have an
// empty bio. For each, resolve the best Wikipedia article (ja.wikipedia for
// JAPAN models, en.wikipedia otherwise) via search + extract-into intro, and
// collect it into data/bio-report.json for the author to turn into a factual,
// 1-2 sentence bio. This tool does NOT modify models.json.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const UA = { "User-Agent": "globalhot-pipeline/1.0 (static site directory; bot@globalhot.net)" };

async function api(action, params) {
  const q = new URLSearchParams({ action, format: "json", ...params });
  const host = params._host || "ja.wikipedia.org";
  delete params._host;
  const url = `https://${host}/w/api.php?` + q.toString();
  const r = await fetch(url, { headers: UA });
  return r.json();
}

async function bestTitle(terms, host) {
  for (const term of terms) {
    const d = await api("query", {
      _host: host,
      list: "search",
      srsearch: term,
      srlimit: 3,
    });
    const hits = (d.query?.search || []).map((s) => s.title);
    for (const t of hits) {
      const t1 = t || "";
      if (t1.toLowerCase().indexOf("(gravi") !== -1 || t1.toLowerCase().indexOf("(av") !== -1 || t1.toLowerCase().indexOf("(sex") !== -1) continue;
      return t1;
    }
  }
  return "";
}

async function summaryOf(title, lang) {
  const host = lang === "ja" ? "ja.wikipedia.org" : "en.wikipedia.org";
  const url = `https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const r = await (await fetch(url, { headers: UA })).json();
    const t = (r.extract || "").replace(/\s+/g, " ").trim();
    return t.length > 700 ? t.slice(0, 700) + "…" : t;
  } catch (e) {
    return "ERR " + String(e.message || e);
  }
}

async function run() {
  const data = JSON.parse(await readFile(path.join(root, "data", "models.json"), "utf8"));
  const need = data.models.filter(
    (m) => m.photoAvailable && (!m.bio || m.bio.trim().length <= 10),
  );
  const report = [];
  for (const m of need) {
    const lang = m.country === "JAPAN" ? "ja" : "en";
    const host = lang === "ja" ? "ja.wikipedia.org" : "en.wikipedia.org";
    const primary = (m.name || "").trim();
    const alt = (m.altName || "").trim();
    const terms = [];
    if (alt && alt !== primary) terms.push(alt);
    terms.push(primary);
    const title = await bestTitle(terms, host);
    const intro = await summaryOf(title, lang);
    report.push({ id: m.id, name: primary, altName: alt, country: m.country, wiki: title, summary: intro });
    process.stdout.write(`[${m.id}] -> ${title || "(none)"}\n`);
  }
  await writeFile(path.join(root, "data", "bio-report.json"), JSON.stringify(report, null, 2) + "\n");
  process.stdout.write("done: " + need.length + " rows -> data/bio-report.json\n");
}

run().catch((e) => {
  process.stderr.write(String(e && (e.stack || e.message || e)) + "\n");
  process.exit(1);
});