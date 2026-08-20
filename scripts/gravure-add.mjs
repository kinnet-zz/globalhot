// Gravure auto-add worker.
//
// Pops up to `--limit` (default 10) `status: "ready"` entries from
// data/gravure-queue.json, downloads each entry's photo, validates it is a real
// JPEG, writes it to assets/profiles/<id>.jpg, and appends the model to the
// SOURCE data/models.json. The daily cron (gravure-daily.yml) runs this, then
// commits + pushes; the push triggers deploy.yml, whose build reconciles
// photoAvailable against the new files and ships the cards.
//
// Design rules (this runs unattended and pushes to master):
//   * Never add a model without a successfully downloaded, valid photo. A
//     failed download marks the entry `status: "error"` and moves on.
//   * A model may ONLY be added with a written `bio` (real information about
//     birth date / origin / debut / flagship work, 1-2 sentences). Queue
//     entries without one are skipped, never added — detail pages must never
//     ship blank. AGENTS.md: profile bio and stats use verified values only.
//   * Idempotent: an entry whose id is already in models.json is consumed, not
//     re-added.
//   * Loud summary; atomic file writes (temp + rename) so a crash never leaves
//     a half-written models.json.
//
// The network/fetch layer is injectable (`fetcher` option) so the logic is unit
// tested without hitting the network. Pure helpers (planAdd, buildModelObject,
// isJpeg) are exported for direct testing.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

const DEFAULT_LICENSE = "CC BY-SA 4.0";
const DEFAULT_CREDIT_TEXT = "Wikimedia Commons";
const DEFAULT_CREDIT_URL = "https://commons.wikimedia.org/";
const MIN_PHOTO_BYTES = 2048;
// Cap a downloaded photo well under Cloudflare Pages' 25 MiB per-file limit.
// The worker does not resize, so an over-large original is rejected (entry is
// marked error, model not added) rather than shipped and breaking the deploy.
const MAX_PHOTO_BYTES = 6_291_456; // 6 MiB
// Target on-demand thumbnail width. Profile photos render at 160px (card) and
// ~440px (modal), so an 800px source covers retina with room to spare while
// keeping files in the tens-to-hundreds-of-KB range instead of multi-MiB.
const THUMB_WIDTH = 800;

// Map a Wikimedia upload URL to the API host that describes it, or null when
// the URL is not a Wikimedia upload (downloaded as-is, no thumbnail lookup).
export function wikimediaApiHost(photoUrl) {
  if (typeof photoUrl !== "string" || !photoUrl) return null;
  if (/^https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//i.test(photoUrl)) return "commons.wikimedia.org";
  if (/^https?:\/\/upload\.wikimedia\.org\/wikipedia\/en\//i.test(photoUrl)) return "en.wikipedia.org";
  return null;
}

// The File: title is the last path segment of the upload URL, URL-decoded and
// stripped of any query/hash.
export function lastPathSegment(url) {
  const clean = String(url).split("?")[0].split("#")[0];
  const seg = clean.split("/").pop() || "";
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

// A model id must be safe as a filename component: lowercase ascii letters,
// digits, hyphens. Anything else would create a file that build reconciliation
// (which keys on `${id}.jpg`) cannot match, silently hiding the model.
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isJpeg(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length > MIN_PHOTO_BYTES &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

// Asian-gravure-first registration priority (site content policy). Countries
// whose gravure scenes the site targets; matched case-insensitively.
const ASIAN_COUNTRIES = [
  "japan", "korea", "taiwan", "china", "hong kong", "hong_kong", "vietnam",
  "thailand", "philippines", "singapore", "malaysia", "indonesia",
];

function hasGravureTag(entry) {
  if (Array.isArray(entry.tags)) return entry.tags.some((t) => String(t).toLowerCase().includes("gravure"));
  return String(entry.tags || "").toLowerCase().includes("gravure");
}

// 0 = Asian gravure (highest priority), 1 = everything else. planAdd consumes
// lower numbers first; ties keep queue order (stable sort).
export function entryPriority(entry) {
  const country = String((entry && entry.country) || "").toLowerCase();
  if (hasGravureTag(entry) && ASIAN_COUNTRIES.includes(country)) return 0;
  return 1;
}

// Decide which ready entries to process. Asian gravure entries are consumed
// before others (stable within each priority tier), so a mixed queue always
// drains Asian gravure models first. Entries already present in the directory
// are dropped (idempotent) rather than re-added. Returns only `ready`
// candidates up to `limit`.
export function planAdd(queue, existingIds, limit) {
  const existing = new Set(existingIds);
  const ready = Array.isArray(queue) ? queue.filter((e) => e && e.status === "ready") : [];
  const ordered = ready
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => entryPriority(a.entry) - entryPriority(b.entry) || a.index - b.index)
    .map(({ entry }) => entry);
  const toAdd = [];
  const alreadyPresent = [];
  for (const entry of ordered) {
    if (!isValidEntry(entry)) continue;
    // Already-present ids are stale queue entries: collect them for consumption
    // regardless of the limit, so the queue does not accumulate dupes. Only NEW
    // additions are capped at `limit`.
    if (existing.has(entry.id)) {
      alreadyPresent.push(entry);
    } else if (toAdd.length < limit) {
      toAdd.push(entry);
    }
  }
  return { toAdd, alreadyPresent };
}

// Decide which a queue entry is addable. `bio` is mandatory: a published model
// must have a written, substantive profile (self-authoring an empty detail page
// never happens). non-Bio entries are dropped from the run; they stay `ready`
// in the queue until an author fills the bio in.
const MIN_BIO_LENGTH = 20;
export function isValidEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (typeof entry.id !== "string" || !SAFE_ID.test(entry.id)) return false;
  if (typeof entry.name !== "string" || !entry.name) return false;
  if (typeof entry.country !== "string" || !entry.country) return false;
  if (typeof entry.tags !== "string" && !Array.isArray(entry.tags)) return false;
  if (typeof entry.photoUrl !== "string" || !/^https?:\/\//.test(entry.photoUrl)) return false;
  if (typeof entry.bio !== "string" || entry.bio.trim().length < MIN_BIO_LENGTH) return false;
  return true;
}

function normalizeSns(sns) {
  const src = sns && typeof sns === "object" ? sns : {};
  return {
    x: typeof src.x === "string" ? src.x : "",
    instagram: typeof src.instagram === "string" ? src.instagram : "",
    youtube: typeof src.youtube === "string" ? src.youtube : "",
    tiktok: typeof src.tiktok === "string" ? src.tiktok : "",
  };
}

// Build the model object appended to models.json. License/credit fall back to
// the CC/Wikimedia default so a queue entry authored without them still renders
// an accurate CC attribution (and never a false © or vice versa).
export function buildModelObject(entry) {
  return {
    id: entry.id,
    name: entry.name,
    altName: typeof entry.altName === "string" ? entry.altName : "",
    country: entry.country,
    tags: entry.tags,
    photoAvailable: true,
    bio: typeof entry.bio === "string" ? entry.bio.trim() : "",
    officialUrl: typeof entry.officialUrl === "string" ? entry.officialUrl : "",
    sns: normalizeSns(entry.sns),
    license: entry.license || DEFAULT_LICENSE,
    creditText: entry.creditText || DEFAULT_CREDIT_TEXT,
    creditUrl: entry.creditUrl || DEFAULT_CREDIT_URL,
  };
}

async function defaultFetcher(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "globalhot-pipeline/1.0 (static site directory; bot@globalhot.net)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Best-effort: ask Wikimedia for an 800px thumbnail of the entry's photo and
// download that instead of the (often multi-MiB) original, so profile photos
// land in the KB range at the source. Any failure (non-Wikimedia host, API
// error, missing thumburl) falls back to the original photoUrl; the
// MAX_PHOTO_BYTES cap is the final guard. Covered via the addGravureModels
// integration tests below with a stubbed fetcher.
async function fetchPhotoBuffer(entry, fetcher) {
  const original = entry.photoUrl;
  const host = wikimediaApiHost(original);
  if (host) {
    try {
      const apiUrl =
        "https://" + host + "/w/api.php?action=query&format=json&formatversion=2" +
        "&titles=" + encodeURIComponent("File:" + lastPathSegment(original)) +
        "&prop=imageinfo&iiprop=url&iiurlwidth=" + THUMB_WIDTH;
      const json = JSON.parse((await fetcher(apiUrl)).toString("utf8"));
      const page = json && json.query && json.query.pages && json.query.pages[0];
      const thumb = page && page.imageinfo && page.imageinfo[0] && page.imageinfo[0].thumburl;
      if (thumb) {
        const buf = await fetcher(thumb);
        if (buf && buf.length) return buf;
      }
    } catch (_e) {
      // fall back to the original below
    }
  }
  return fetcher(original);
}

// Core logic. Pure with respect to the filesystem: it reads parsed data and an
// injectable fetcher, and returns the new models/queue plus the buffers to
// persist. The CLI wrapper (run) does the actual writes.
export async function addGravureModels({
  queueData,
  modelsData,
  limit = 10,
  dryRun = false,
  fetcher = defaultFetcher,
  now = () => new Date().toISOString(),
}) {
  const existingIds = (modelsData.models || []).map((m) => m && m.id).filter(Boolean);
  const { toAdd, alreadyPresent } = planAdd(queueData.queue || [], existingIds, limit);

  const added = [];
  const errored = [];
  const downloads = []; // { id, buffer }

  for (const entry of toAdd) {
    if (dryRun) {
      added.push(entry);
      continue;
    }
    try {
      const buffer = await fetchPhotoBuffer(entry, fetcher);
      if (buffer.length > MAX_PHOTO_BYTES) {
        throw new Error(
          "photo is " + buffer.length + " bytes, exceeds the " + MAX_PHOTO_BYTES +
            " byte cap (reject an over-large original so the deploy never trips " +
            "Cloudflare Pages' 25 MiB per-file limit)",
        );
      }
      if (!isJpeg(buffer)) {
        throw new Error("downloaded photo is not a valid JPEG or is too small");
      }
      downloads.push({ id: entry.id, buffer });
      added.push(entry);
    } catch (error) {
      errored.push({ id: entry.id, error: String(error.message || error) });
    }
  }

  const consumedIds = new Set([
    ...added.map((e) => e.id),
    ...alreadyPresent.map((e) => e.id),
  ]);

  // New queue: drop consumed entries, mark errored entries for visibility,
  // leave pending/other entries untouched.
  const stamp = now();
  const newQueue = (queueData.queue || [])
    .filter((e) => e && e.id && !consumedIds.has(e.id))
    .map((e) => {
      const err = errored.find((x) => x.id === e.id);
      return err ? { ...e, status: "error", errorNote: err.error, erroredAt: stamp } : e;
    });

  const newModelsData = dryRun
    ? modelsData
    : {
        ...modelsData,
        models: [...(modelsData.models || []), ...added.map(buildModelObject)],
      };
  if (!dryRun) newModelsData.modelCount = newModelsData.models.length;

  const newQueueData = dryRun ? queueData : { ...queueData, queue: newQueue };

  return {
    newModelsData,
    newQueueData,
    downloads,
    added: added.map((e) => e.id),
    alreadyPresent: alreadyPresent.map((e) => e.id),
    errored,
    dryRun,
  };
}

async function writeFileAtomic(filePath, contents) {
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, contents);
  await rename(tmp, filePath);
}

function parseArgs(argv) {
  const args = { limit: 10, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") args.limit = Number(argv[i + 1]) || 10;
    else if (a.startsWith("--limit=")) args.limit = Number(a.slice(8)) || 10;
  }
  return args;
}

export async function run({ limit, dryRun, projectRoot: root = projectRoot, fetcher } = {}) {
  const queuePath = path.join(root, "data", "gravure-queue.json");
  const modelsPath = path.join(root, "data", "models.json");
  const profilesDir = path.join(root, "assets", "profiles");

  const [queueRaw, modelsRaw] = await Promise.all([
    readFile(queuePath, "utf8"),
    readFile(modelsPath, "utf8"),
  ]);
  const queueData = JSON.parse(queueRaw);
  const modelsData = JSON.parse(modelsRaw);

  const result = await addGravureModels({
    queueData,
    modelsData,
    limit,
    dryRun,
    fetcher,
  });

  if (dryRun) {
    process.stdout.write(
      `[gravure-add] dry run: would add ${result.added.length}, ` +
        `already-present ${result.alreadyPresent.length}, ` +
        `limit ${limit}\n` +
        result.added.map((id) => `  + ${id}`).join("\n") +
        (result.added.length ? "\n" : ""),
    );
    return result;
  }

  // Persist photos first. If a write fails here we abort before touching
  // models.json, so the data file never references a photo that isn't on disk.
  await mkdir(profilesDir, { recursive: true });
  for (const { id, buffer } of result.downloads) {
    await writeFileAtomic(path.join(profilesDir, `${id}.jpg`), buffer);
  }

  // models.json and the queue are written atomically.
  await writeFileAtomic(modelsPath, `${JSON.stringify(result.newModelsData, null, 2)}\n`);
  await writeFileAtomic(queuePath, `${JSON.stringify(result.newQueueData, null, 2)}\n`);

  process.stdout.write(
    `[gravure-add] added ${result.added.length} | ` +
      `already-present ${result.alreadyPresent.length} | ` +
      `errored ${result.errored.length} | ` +
      `models now ${result.newModelsData.models.length}\n`,
  );
  if (result.errored.length) {
    process.stdout.write(
      result.errored.map((e) => `  ! ${e.id}: ${e.error}`).join("\n") + "\n",
    );
  }
  return result;
}

// Self-invoke when run directly (not when imported by tests).
const isMain = (() => {
  try {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  run({ limit: args.limit, dryRun: args.dryRun }).catch((error) => {
    process.stderr.write(`[gravure-add] fatal: ${error.message || error}\n`);
    process.exit(1);
  });
}
