import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { searchQueriesFor, titleMatchesModel, normalizeName, isCcLicense } from "./publish-discovery.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const SEARCH_LIMIT = 12;

async function commonsFetch(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "globalhot-audit/1.0 (static site directory; bot@globalhot.net)" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

// Mirrors publish-discovery.mjs selection: same queries, same name gate, then
// walk candidates in the same preference order (CC first) collecting metadata.
// Returns the candidate file titles in descending confidence.
export async function reproduceCandidates(model) {
  const queries = searchQueriesFor(model);
  const titles = [];
  const seen = new Set();
  for (const query of queries) {
    const url =
      COMMONS_API +
      "?action=query&list=search&srnamespace=6&srlimit=" +
      SEARCH_LIMIT +
      "&srsearch=" +
      encodeURIComponent(query) +
      "&format=json";
    const data = await commonsFetch(url);
    const found = (data && data.query && data.query.search ? data.query.search : [])
      .map((r) => r.title)
      .filter((t) => typeof t === "string" && /^File:/.test(t))
      .map((t) => t.replace(/^File:/, ""));
    for (const title of found) {
      if (!seen.has(title)) {
        seen.add(title);
        if (titles.length < SEARCH_LIMIT * 2) titles.push(title);
      }
    }
    if (titles.length >= SEARCH_LIMIT) break;
  }
  return titles;
}

async function fileInfo(title) {
  const url =
    COMMONS_API +
    "?action=query&titles=" +
    encodeURIComponent("File:" + title) +
    "&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json";
  const data = await commonsFetch(url);
  const pages = data && data.query && data.query.pages ? data.query.pages : {};
  const page = Object.keys(pages)[0] ? pages[Object.keys(pages)[0]] : null;
  const info = page && page.imageinfo && page.imageinfo[0] ? page.imageinfo[0] : null;
  if (!info || !info.url) return null;
  const ext = info.extmetadata || {};
  const pick = (key) => {
    const val = ext[key];
    return val && typeof val.value === "string" ? val.value : "";
  };
  return {
    title,
    url: info.url,
    thumbUrl: info.thumburl || null,
    license: pick("LicenseShortName"),
    artist: pick("Artist"),
  };
}

// Full-name coverage: title, after normalization, must contain EVERY token of
// the model's latin name (order-independent). No length filter (drop the 2-char
// tokens like "in" in "Han Jae-in", which are the discriminator against
// lookalike files like "Han Jae-woong"). Falls back to altName when the latin
// name is a single token so reversed/suffixed filenames like "Aoi Sora" still
// match "Sora Aoi".
export function fullNameMatches(title, model) {
  const t = normalizeName(title);
  if (!t) return false;
  const candidateTokenSets = [];
  const nameTokens = normalizeName(model.name).split(" ").filter(Boolean);
  const altTokens = normalizeName(model.altName).split(" ").filter(Boolean);
  candidateTokenSets.push(nameTokens);
  if (altTokens.length && altTokens.join(" ") !== nameTokens.join(" ")) candidateTokenSets.push(altTokens);
  return candidateTokenSets.some((tokens) => tokens.length > 0 && tokens.every((tok) => t.split(" ").indexOf(tok) !== -1));
}
const fullNameCover = fullNameMatches;

async function downloadForHash(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "globalhot-audit/1.0 (static site directory; bot@globalhot.net)" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return Buffer.from(await res.arrayBuffer());
}

function md5(buf) {
  return crypto.createHash("md5").update(buf).digest("hex");
}

export async function auditOne(model, localFileBuffer) {
  const candidateTitles = await reproduceCandidates(model);
  // Restrict to files that pass the OLD pipeline gate (`titleMatchesModel`,
  // surname-only) so we reproduce exactly what the pipeline could have picked,
  // then hash-compare those few thumbs against the vendored file.
  const gated = candidateTitles.filter((t) => titleMatchesModel(t, model));
  const ccCandidates = [];
  const allCandidates = [];
  for (const title of gated) {
    const info = await fileInfo(title);
    if (!info) continue;
    allCandidates.push(info);
    if (isCcLicense(info.license)) ccCandidates.push(info);
  }
  let matched = null;
  if (localFileBuffer) {
    const localHash = md5(localFileBuffer);
    for (const info of [...ccCandidates, ...allCandidates]) {
      const target = info.thumbUrl || info.url;
      try {
        const buf = await downloadForHash(target);
        if (md5(buf) === localHash) {
          matched = info;
          break;
        }
      } catch {
        // try next
      }
    }
    if (!matched) {
      // Nothing in the surname-gated set matches the vendored bytes. Either a
      // different file or the thumbnails differ; flag it for manual review.
      matched = {
        title: "(bytes do not match any surname-gated candidate)",
        thumbUrl: null,
        url: null,
        license: "",
        artist: "",
      };
    }
  } else {
    matched = ccCandidates[0] || allCandidates[0] || null;
  }

  const strong = matched ? fullNameCover(matched.title, model) : false;
  return {
    id: model.id,
    name: model.name,
    country: model.country,
    matchedTitle: matched ? matched.title : null,
    matchedLicense: matched ? matched.license : null,
    matchedArtist: matched ? matched.artist : null,
    strong: strong,
    candidateCount: allCandidates.length,
    verdict: strong ? "ok" : matched ? "weak" : "no_match",
  };
}

export async function run({ projectRoot: root = projectRoot } = {}) {
  const modelsPath = path.join(root, "data", "models.json");
  const modelsData = JSON.parse(await readFile(modelsPath, "utf8"));
  const published = (modelsData.models || []).filter((m) => m && m.photoAvailable === true);
  const results = [];
  for (const model of published) {
    let buf = null;
    try {
      const fs = await import("node:fs/promises");
      buf = await fs.readFile(path.join(root, "assets", "profiles", model.id + ".jpg"));
    } catch {
      buf = null;
    }
    try {
      const row = await auditOne(model, buf);
      results.push(row);
      const mark = row.strong ? "OK " : "?? ";
      console.log(mark + row.id + " -> " + (row.matchedTitle || ""));
    } catch (error) {
      results.push({
        id: model.id,
        name: model.name,
        country: model.country,
        matchedTitle: null,
        strong: false,
        verdict: "error: " + (error.message || error),
      });
      console.log("ERR  " + model.id + " " + (error.message || error));
    }
  }
  const outPath = path.join(root, "data", "match-audit.json");
  const report = {
    generatedAt: new Date().toISOString(),
    audited: results.length,
    ok: results.filter((r) => r.verdict === "ok").length,
    weak: results.filter((r) => r.verdict === "weak").length,
    no_match: results.filter((r) => r.verdict === "no_match").length,
    errors: results.filter((r) => r.verdict.startsWith("error")).length,
    results,
  };
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(outPath + " written");
  return report;
}

const isMain = (() => {
  try {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  run().catch((error) => {
    process.stderr.write("[match-audit] fatal: " + (error.message || error) + "\n");
    process.exit(1);
  });
}