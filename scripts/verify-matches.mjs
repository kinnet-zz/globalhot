import { readFile, writeFile, mkdir, unlink, rename } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { searchQueriesFor, normalizeName, isCcLicense } from "./publish-discovery.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptDir, "..");
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const SEARCH_LIMIT = 12;
const THUMB_WIDTH = 800;
const UA = { "User-Agent": "globalhot-verify/1.0 (static site directory; bot@globalhot.net)" };

// Full-name match: EVERY latin token of the model's name must appear in the
// file title (order-independent). This is the ONLY acceptable name gate —
// surname-only matching attached the wrong man to "Han Jae-in" and a singer to
// "Chae Sia".
export function fullTokensOf(model) {
  const name = (model.name || "").trim();
  const alt = (model.altName || "").trim();
  const sets = [];
  const n = normalizeName(name).split(" ").filter(Boolean);
  if (n.length && n.length > 1) sets.push(n);
  const a = normalizeName(alt).split(" ").filter(Boolean);
  if (a.length && a.length > 1 && a.join(" ") !== n.join(" ")) sets.push(a);
  return sets;
}

// Returns true when the Commons file title carries the model's identity:
//   1. EVERY latin name token present (order-independent) — the strict gate,
//      which is what caught Chae Sia (singer), Han Jae-in (football), etc.
//   2. OR the altName as native script appears verbatim in the title, which is
//      near-certain identity for Japanese/Korean spellings (e.g. 東雲うみ).
export function titleCarriesIdentity(title, model) {
  const raw = String(title || "");
  const alt = (model.altName || "").trim();
  if (alt && /[\u3040-\u30FF\uAC00-\uD7AF\u4E00-\u9FFF]/.test(alt) && raw.indexOf(alt) !== -1) return true;
  const t = normalizeName(raw);
  if (!t) return false;
  const sets = fullTokensOf(model);
  if (sets.length) return sets.some((tok) => tok.every((w) => t.split(" ").indexOf(w) !== -1));
  const single = normalizeName(model.name).split(" ").filter(Boolean);
  return single.length === 1 && t.split(" ").indexOf(single[0]) !== -1;
}

// Heuristic female guard for auto-publish: reject titles strongly implying a
// man or a non-person (places, artworks, vehicles). Only clearly gendered or
// object-y markers are used so event/film titles (e.g. "Ready Player One
// Premiere") never trip the female filter.
const MALE_WORDS = [
  "footballer", "soccer", "sportsman", "male", "husband", "boyfriend",
  "gentleman", "mr.", "mr ", "sir", "king", "prince", "duke", "priest",
  "monk", "soldier", "pfc", "marine", "colonel", "general", "mayor",
  "governor", "president", "minister", "senator", "ambassador", "congressman",
  "mp)", "judge", "lawyer", "coach", "manager", "principal", "u.s. army",
  "us army", "army",
];
const NON_PERSON_WORDS = [
  "city hall", "town office", "railway", "station", "highway", "bridge",
  "tunnel", "factory", "museum", "church", "temple", "shrine", "castle",
  "airport", "port", "building", "house", "plate", "signature", "song",
  "lyrics", "sheet", "almanac", "calendar", "coin", "award", "album",
  "flag", "map", "diagram", "chart", "warship", "plane", "jet", "car seat",
];
export function isFemalePlausible(title, model) {
  const raw = String(title || "");
  const alt = (model.altName || "").trim();
  if (alt && /[\u3040-\u30FF\uAC00-\uD7AF\u4E00-\u9FFF]/.test(alt) && raw.indexOf(alt) !== -1) return true;
  const t = normalizeName(raw);
  if (!t) return false;
  const words = t.split(" ");
  if (words.some((w) => NON_PERSON_WORDS.includes(w))) return false;
  if (words.some((w) => MALE_WORDS.includes(w))) return false;
  return true;
}

const SEXY_WORDS = [
  "bikini", "swimsuit", "swimwear", "lingerie", "underwear", "max", "gravure",
  "glamour", "red carpet", "photocall", "showcase", "festival", "event",
  "stage", "runway", "race", "venue", "meeting", "fan", "martial", "pr",
];
export function sexyScore(title) {
  const t = normalizeName(title);
  if (!t) return 0;
  return SEXY_WORDS.reduce((acc, w) => acc + (t.indexOf(w) !== -1 ? 1 : 0), 0);
}

async function commonsFetch(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

async function searchCandidates(model) {
  const titles = [];
  const seen = new Set();
  for (const query of searchQueriesFor(model)) {
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
    for (const t of found) {
      if (!seen.has(t)) {
        seen.add(t);
        if (titles.length < SEARCH_LIMIT * 2) titles.push(t);
      }
    }
  }
  return titles;
}

async function fileInfo(title) {
  const url =
    COMMONS_API +
    "?action=query&titles=" +
    encodeURIComponent("File:" + title) +
    "&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=" +
    THUMB_WIDTH +
    "&format=json";
  const data = await commonsFetch(url);
  const pages = data && data.query && data.query.pages ? data.query.pages : {};
  const page = Object.keys(pages)[0] ? pages[Object.keys(pages)[0]] : null;
  const info = page && page.imageinfo && page.imageinfo[0] ? page.imageinfo[0] : null;
  if (!info || !info.url) return null;
  const ext = info.extmetadata || {};
  const pick = (k) => {
    const v = ext[k];
    return v && typeof v.value === "string" ? v.value : "";
  };
  return {
    title,
    url: info.url,
    thumbUrl: info.thumburl || null,
    license: pick("LicenseShortName"),
    licenseUrl: pick("LicenseUrl"),
    artist: pick("Artist"),
  };
}

async function downloadBuffer(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return Buffer.from(await res.arrayBuffer());
}
const md5 = (b) => crypto.createHash("md5").update(b).digest("hex");

export async function verifyOne(model, vendored) {
  const titles = await searchCandidates(model);
  const valid = [];
  for (const title of titles) {
    if (!titleCarriesIdentity(title, model)) continue;
    let info;
    try {
      info = await fileInfo(title);
    } catch {
      continue;
    }
    if (!info) continue;
    if (!isCcLicense(info.license)) continue;
    const isFemale = isFemalePlausible(info.title, model);
    valid.push({ ...info, isFemale, sexy: sexyScore(info.title) });
  }
  // Protect already-published photos whose Commons filename carries the model's
  // native altName verbatim (e.g. File:市道真央１.jpg). No auto-replace, no
  // unpublish — a human-reviewed file title is the strongest identity signal.
  const existingUrl = decodeURIComponent((model.photoUrl || "").split("/").pop() || "");
  const nativeAlt = (model.altName || "").trim();
  if (
    nativeAlt &&
    /[\u3040-\u30FF\uAC00-\uD7AF\u4E00-\u9FFF]/.test(nativeAlt) &&
    existingUrl.indexOf(nativeAlt) !== -1
  ) {
    return { state: "keep", reason: "existing_native_photoUrl" };
  }

  if (!valid.length) {
    return { state: "unpublish", reason: "no_full_name_match" };
  }

  // Prefer female-plausible candidates, then highest sexy score.
  const ranked = valid.sort((a, b) => Number(b.isFemale) - Number(a.isFemale) || b.sexy - a.sexy);
  const chosen = ranked[0];
  if (!chosen.isFemale) {
    return { state: "unpublish", reason: "male_or_nonperson_photo(" + (chosen.title || "") + ")" };
  }

  let replaced = false;
  if (vendored) {
    const localHash = md5(vendored);
    let remoteHash = null;
    try {
      remoteHash = md5(await downloadBuffer(chosen.thumbUrl || chosen.url));
    } catch {
      remoteHash = null;
    }
    replaced = !remoteHash || remoteHash !== localHash;
  } else {
    replaced = true;
  }

  return {
    state: "publish",
    replaced,
    chosen,
  };
}

export async function run({ root = projectRoot, only = null } = {}) {
  const modelsPath = path.join(root, "data", "models.json");
  const reportPath = path.join(root, "data", "match-audit.json");
  const profiles = path.join(root, "assets", "profiles");
  const results = [];
  const removed = [];

  // Load accumulated decisions from a previous interrupted run so we can resume.
  let prev = [];
  try {
    prev = JSON.parse(await readFile(reportPath, "utf8")).results || [];
  } catch {
    /* no previous report */
  }
  results.push(...prev);
  const decided = new Set(results.map((r) => r.id));
  let data = JSON.parse(await readFile(modelsPath, "utf8"));

  const persist = async () => {
    await writeFile(modelsPath + ".tmp", JSON.stringify(data, null, 2) + "\n");
    await rename(modelsPath + ".tmp", modelsPath);
    const counts = {
      unpublished: results.filter((r) => r.action === "unpublish").length,
      kept: results.filter((r) => r.action === "keep").length,
      replaced: results.filter((r) => r.action === "replace").length,
    };
    await writeFile(
      reportPath,
      JSON.stringify({ generatedAt: new Date().toISOString(), ...counts, results }, null, 2) + "\n",
    );
  };

  for (const model of data.models || []) {
    if (!(model && model.photoAvailable)) continue;
    if (only && !only.includes(model.id)) continue;
    if (decided.has(model.id)) continue;
    let vendored = null;
    try {
      vendored = await readFile(path.join(profiles, model.id + ".jpg"));
    } catch {
      /* no vendored file */
    }
    let out;
    try {
      out = await verifyOne(model, vendored);
    } catch (error) {
      out = { state: "error", error };
    }
    decided.add(model.id);
    let row;
    if (out.state === "unpublish") {
      try {
        await unlink(path.join(profiles, model.id + ".jpg"));
      } catch {
        /* already gone */
      }
      const entry = data.models.find((e) => e.id === model.id);
      if (entry) {
        Object.assign(entry, {
          photoAvailable: false,
          license: "",
          licenseUrl: "",
          creditText: "",
          creditUrl: "",
        });
      }
      removed.push(model.id);
      row = { id: model.id, name: model.name, action: "unpublish", reason: out.reason || "" };
      console.log("UNPUBLISH " + model.id + " (" + (out.reason || "") + ")");
    } else if (out.state === "publish" && out.chosen && (out.replaced || !vendored)) {
      try {
        const buf = await downloadBuffer(out.chosen.thumbUrl || out.chosen.url);
        await writeFile(path.join(profiles, model.id + ".jpg"), buf);
        const entry = data.models.find((e) => e.id === model.id);
        if (entry) {
          Object.assign(entry, {
            photoAvailable: true,
            license: out.chosen.license || "",
            licenseUrl: out.chosen.licenseUrl || "",
            creditText: out.chosen.artist || "Wikimedia Commons",
            creditUrl: "https://commons.wikimedia.org/",
          });
        }
        row = { id: model.id, name: model.name, action: "replace", reason: out.chosen.title };
        console.log("REPLACE   " + model.id + " <- " + out.chosen.title);
      } catch (error) {
        row = { id: model.id, name: model.name, action: "error", reason: (error.message || error) };
        console.log("ERROR     " + model.id + " " + (error.message || error));
      }
    } else {
      row = { id: model.id, name: model.name, action: "keep", reason: "ok" };
      console.log("KEEP      " + model.id);
    }
    results.push(row);
    await persist();
  }

  console.log("summary: " + results.length + " decided, " + removed.length + " unpublished -> " + reportPath);
  return { results, removed };
}

const isMain = (() => {
  try {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  run()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      process.stderr.write("[verify-matches] fatal: " + (error.message || error) + "\n");
      process.exit(1);
    });
}