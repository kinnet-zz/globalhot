// Wikimedia Commons publish discovery worker.
//
// Scans models.json for entries with photoAvailable !== true (drafts), searches
// Wikimedia Commons for a CC-licensed photo matching the model's name, verifies
// it with a two-layer cross-check, and downloads a valid JPEG into
// assets/profiles/<id>.jpg. The build's photoAvailable reconcile publishes the
// model from the local file (renderer prefers the vendored file and the grid
// never depends on a remote URL that can 404 or rate-limit).
//
// Results are written back to models.json (published entries only) plus a report
// file (data/publish-report.json) listing pass/fail + reason for every
// candidate, so the operator can review failures later and decide manually.
//
// Two-layer cross-check (per entry):
//   1. Name match: the Commons file title must contain the model's latin name
//      (or altName). This avoids pairing an unrelated photo with a profile.
//   2. License: imageinfo.extmetadata.LicenseShortName must be a Creative
//      Commons license (CC BY / CC BY-SA / CC0). Non-CC, NC/ND variants and
//      "no known license" are rejected so every published photo is reusable
//      for a commercial static directory.
// Both checks must pass for publication.
//
// Never publishes without a successfully downloaded, valid JPEG (same rule as
// gravure-add). Failed entries stay drafts and are recorded in the report.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const SEARCH_LIMIT = 12;
const DOWNLOAD_LIMIT = 20;
const MIN_PHOTO_BYTES = 2048;
const MAX_PHOTO_BYTES = 6_291_456; // 6 MiB (Cloudflare Pages 25 MiB/file cap guard)
const THUMB_WIDTH = 800;

// Commercial-safe Creative Commons set only. NC (non-commercial) and ND
// (no-derivatives) are excluded: this site monetizes, so a photo that forbids
// commercial use cannot be published here.
export const CC_PATTERN = /^CC(?: BY| BY-SA|0)?(?:\s+\d\.\d)?$/i;
export const PUBLIC_DOMAIN_PATTERN = /^Public domain$/i;

const DEFAULT_CREDIT_TEXT = "Wikimedia Commons";
const DEFAULT_CREDIT_URL = "https://commons.wikimedia.org/";

export function isJpeg(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length > MIN_PHOTO_BYTES &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

export function isCcLicense(licenseShortName) {
  const license = String(licenseShortName || "").trim();
  return CC_PATTERN.test(license) || PUBLIC_DOMAIN_PATTERN.test(license);
}

// Build search queries: latin name first, then altName (often the native name
// Commons files are titled with), then the name's final token for files that
// use "Surname, Given" or suffix-heavy titles. Returned in confidence order.
export function searchQueriesFor(model) {
  const queries = [];
  const primary = typeof model.name === "string" ? model.name.trim() : "";
  const alt = typeof model.altName === "string" ? model.altName.trim() : "";
  if (primary) {
    queries.push(primary + " filetype:bitmap");
    const tokens = primary.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) queries.push(tokens[tokens.length - 1] + " filetype:bitmap");
  }
  if (alt && alt !== primary) queries.push(alt + " filetype:bitmap");
  // De-duplicate preserving order.
  return queries.filter((q, i) => queries.indexOf(q) === i);
}

// Normalize a name for fuzzy matching inside a Commons file title: lowercase,
// ASCII-folded, punctuation/hyphens/spaces collapsed to single spaces.
export function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[\s_]+/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Full-name identity gate shared by every pipeline (publish-discovery,
// verify-matches, match-audit). The name must appear in the file title as a
// CONTIGUOUS run of normalized tokens, in the stated order OR reversed
// ("Sora Aoi" files being titled "Aoi Sora"). Order/contiguity is the
// discriminator that stops a chance surname overlap ("Kang In-kyung" must not
// match "Kang Kyung-" titles that merely share the stray tokens kang/kyung/in).
export function nameTokensContain(fileTitle, fullName) {
  const title = normalizeName(fileTitle).split(" ").filter(Boolean);
  const tokens = normalizeName(fullName).split(" ").filter(Boolean);
  if (!tokens.length || tokens.length > title.length) return false;
  const sequences = [tokens, [...tokens].reverse()];
  for (const seq of sequences) {
    for (let i = 0; i + seq.length <= title.length; i++) {
      let ok = true;
      for (let k = 0; k < seq.length; k++) {
        if (title[i + k] !== seq[k]) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
  }
  return false;
}

// Cross-check layer 1: the file title must mention the model's latin name or
// altName. A full contiguous token run (order or reversed) is required, never
// a single shared surname token.
export function titleMatchesModel(fileTitle, model) {
  const name = normalizeName(model && model.name);
  if (name && nameTokensContain(fileTitle, name)) return true;
  const alt = normalizeName(model && model.altName);
  return !!alt && alt !== name && nameTokensContain(fileTitle, alt);
}

async function commonsFetch(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "globalhot-pipeline/1.0 (static site directory; bot@globalhot.net)" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

async function searchCommons(query) {
  if (!query) return [];
  const url =
    COMMONS_API +
    "?action=query&list=search&srnamespace=6&srlimit=" +
    SEARCH_LIMIT +
    "&srsearch=" +
    encodeURIComponent(query) +
    "&format=json";
  const data = await commonsFetch(url);
  const results = data && data.query && data.query.search ? data.query.search : [];
  return results
    .map((r) => r.title)
    .filter((t) => typeof t === "string" && /^File:/.test(t))
    .map((t) => t.replace(/^File:/, ""));
}

// Fetch imageinfo (URL + extmetadata with license/credit) for one file title.
async function fileInfo(title) {
  const url =
    COMMONS_API +
    "?action=query&titles=" +
    encodeURIComponent("File:" + title) +
    "&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=" +
    THUMB_WIDTH +
    "&format=json";
  const data = await commonsFetch(url);
  const pages = data && data.query && data.query.pages ? data.query.pages : null;
  const page = Array.isArray(pages) ? pages[0] : Object.keys(pages || {})[0] ? pages[Object.keys(pages)[0]] : null;
  const info = page && page.imageinfo && page.imageinfo[0] ? page.imageinfo[0] : null;
  if (!info || !info.url) return null;
  const ext = info.extmetadata || {};
  const pick = (key) => {
    const val = ext[key];
    return val && typeof val.value === "string" ? val.value : "";
  };
  const licenseShort = pick("LicenseShortName");
  const licenseUrl = pick("LicenseUrl");
  const artist = pick("Artist");
  return {
    title,
    url: info.url,
    thumbUrl: info.thumburl || null,
    license: licenseShort,
    licenseUrl: licenseUrl,
    artist: artist,
  };
}

function creditTextFor(meta) {
  if (meta.artist) {
    const stripped = meta.artist
      .replace(/<[^>]+>/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (stripped) return stripped;
  }
  return DEFAULT_CREDIT_TEXT;
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "globalhot-pipeline/1.0 (static site directory; bot@globalhot.net)" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " fetching " + url);
  return Buffer.from(await res.arrayBuffer());
}

// Find the first Commons file passing both cross-checks, download its hosted
// thumbnail (or original fallback), and return the bytes + CC metadata.
async function findAndDownload(model) {
  const queries = searchQueriesFor(model);
  if (!queries.length) throw new Error("no_search_name");

  const titles = [];
  const seenTitles = new Set();
  for (const query of queries) {
    const found = await searchCommons(query);
    for (const title of found) {
      if (!seenTitles.has(title)) {
        seenTitles.add(title);
        // Bail at a sane ceiling so the name-match pass below stays cheap.
        if (titles.length < SEARCH_LIMIT * 2) titles.push(title);
      }
    }
    if (titles.length >= SEARCH_LIMIT) break;
  }
  if (!titles.length) throw new Error("no_search_results");

  const candidates = [];
  for (const title of titles) {
    if (titleMatchesModel(title, model)) {
      const info = await fileInfo(title);
      if (!info) continue;
      candidates.push(info);
    }
  }
  if (!candidates.length) throw new Error("no_name_match");

  // Prefer candidates with a non-commercial-safe CC/public-domain license, and
  // walk them in order so a bad download (non-JPEG, oversized, network error)
  // falls through to the next candidate instead of marking the model failed.
  const candidatesByPreference = [...candidates].sort((a, b) => {
    return Number(isCcLicense(b.license)) - Number(isCcLicense(a.license));
  });
  let lastError = null;
  for (const pick of candidatesByPreference) {
    try {
      if (!isCcLicense(pick.license)) {
        throw new Error("license_not_cc (" + (pick.license || "unknown") + ")");
      }
      const target = pick.thumbUrl || pick.url;
      const buffer = await downloadImage(target);
      if (buffer.length > MAX_PHOTO_BYTES) {
        throw new Error("photo exceeds " + MAX_PHOTO_BYTES + " byte cap (" + buffer.length + " bytes)");
      }
      if (!isJpeg(buffer)) throw new Error("not_a_valid_jpeg");
      return {
        license: pick.license,
        licenseUrl: pick.licenseUrl,
        creditText: creditTextFor(pick),
        creditUrl: DEFAULT_CREDIT_URL,
        buffer,
      };
    } catch (error) {
      lastError = error;
      // try the next candidate
    }
  }
  throw lastError || new Error("no_usable_candidate");
}

export function buildPublishedModel(model, meta) {
  return {
    ...model,
    photoAvailable: true,
    license: meta.license,
    licenseUrl: meta.licenseUrl,
    creditText: meta.creditText,
    creditUrl: meta.creditUrl,
  };
}

export async function discoverModels({ modelsData, limit = DOWNLOAD_LIMIT }) {
  const drafts = (Array.isArray(modelsData.models) ? modelsData.models : []).filter(
    (m) => !(m && m.photoAvailable === true),
  );
  const work = drafts.slice(0, limit);
  const published = [];
  const failed = [];
  const downloads = [];

  for (const model of work) {
    try {
      const meta = await findAndDownload(model);
      published.push({ model, meta });
      downloads.push({ id: model.id, buffer: meta.buffer });
    } catch (error) {
      failed.push({
        id: model.id,
        name: model.name,
        country: model.country,
        reason: String(error.message || error),
      });
    }
  }

  const newModels = (modelsData.models || []).map((m) => {
    const found = published.find((p) => p.model.id === m.id);
    return found ? buildPublishedModel(found.model, found.meta) : m;
  });

  return {
    newModelsData: { ...modelsData, models: newModels, modelCount: newModels.length },
    downloads,
    published: published.map((p) => p.model.id),
    failed,
  };
}

async function writeFileAtomic(filePath, contents) {
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, contents);
  await rename(tmp, filePath);
}

export async function run({ projectRoot: root = projectRoot, limit = DOWNLOAD_LIMIT } = {}) {
  const modelsPath = path.join(root, "data", "models.json");
  const reportPath = path.join(root, "data", "publish-report.json");
  const profilesDir = path.join(root, "assets", "profiles");

  const modelsData = JSON.parse(await readFile(modelsPath, "utf8"));
  const result = await discoverModels({ modelsData, limit });

  await mkdir(profilesDir, { recursive: true });
  for (const { id, buffer } of result.downloads) {
    await writeFileAtomic(path.join(profilesDir, `${id}.jpg`), buffer);
  }

  await writeFileAtomic(modelsPath, `${JSON.stringify(result.newModelsData, null, 2)}\n`);
  const report = {
    generatedAt: new Date().toISOString(),
    candidatesExamined: result.published.length + result.failed.length,
    published: result.published,
    failed: result.failed,
  };
  await writeFileAtomic(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  process.stdout.write(
    `[publish-discovery] published ${result.published.length} | failed ${result.failed.length}\n` +
      result.published.map((id) => "  + " + id).join("\n") +
      (result.published.length ? "\n" : "") +
      result.failed.map((f) => "  ! " + f.id + ": " + f.reason).join("\n") +
      (result.failed.length ? "\n" : "") +
      "report -> data/publish-report.json\n",
  );
  return result;
}

const isMain = (() => {
  try {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  const limitArg = process.argv.indexOf("--limit");
  const limit =
    limitArg !== -1 ? Number(process.argv[limitArg + 1]) || DOWNLOAD_LIMIT : DOWNLOAD_LIMIT;
  run({ limit }).catch((error) => {
    process.stderr.write(`[publish-discovery] fatal: ${error.message || error}\n`);
    process.exit(1);
  });
}