// Wikimedia Commons -> direct upload URL resolver.
//
// A models.json creditUrl is a `File:` page (https://commons.wikimedia.org/wiki/File:...).
// The profile photo is served from upload.wikimedia.org, and the build's
// photoAvailable reconcile + the renderers accept that direct URL in `photoUrl`.
// This script queries the Commons API for the direct (thumb) URL of every model
// that carries a creditUrl File: page, and rewrites the SOURCE data so the model
// is publishable from a hosted image without a vendored local file.
//
// Usage:
//   node scripts/commons-link.mjs            # resolve new photoUrl (dry-run)
//   node scripts/commons-link.mjs --write     # persist photoUrl updates
//   node scripts/commons-link.mjs --width=1200 # thumb width (default 900)

import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const MODELS_PATH = path.join(projectRoot, "data", "models.json");
const THUMB_WIDTH = 1200;

// The last path segment of a File: page URL is the encoded file title.
export function fileTitleFromCreditUrl(creditUrl) {
  if (typeof creditUrl !== "string" || !creditUrl.startsWith("https://commons.wikimedia.org/wiki/File:")) {
    return null;
  }
  const segment = creditUrl.split("/wiki/File:").pop() || "";
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// Ask the Commons API for the direct (thumbnailed) image URL of one file.
export async function resolveFileUrl(fileTitle, { width = THUMB_WIDTH, fetcher = fetch } = {}) {
  if (!fileTitle) return null;
  const apiUrl =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2" +
    "&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=" + width +
    "&titles=" + encodeURIComponent("File:" + fileTitle);
  const response = await fetcher(apiUrl, { headers: { "User-Agent": "globalhot-pipeline/1.0 (static directory; admin@globalhot.net)" } });
  if (!response.ok) return null;
  const json = await response.json();
  const page = json && json.query && json.query.pages && json.query.pages[0];
  const info = page && page.imageinfo && page.imageinfo[0];
  if (!info || !info.thumburl) return null;
  const thumbUrl = info.thumburl.split("?")[0];
  return { thumbUrl, mime: info.mime || "", license: (info.extmetadata && info.extmetadata.LicenseShortName && info.extmetadata.LicenseShortName.value) || "" };
}

// Seed photoUrl for every model that has a File: creditUrl but no hosted photoUrl.
export function planPhotoLinks(models) {
  const updates = [];
  for (const model of models) {
    if (model.photoUrl && /^https:\/\/upload\.wikimedia\.org\//.test(model.photoUrl)) continue;
    const title = fileTitleFromCreditUrl(model.creditUrl);
    if (!title) continue;
    updates.push({ id: model.id, fileTitle: title, creditUrl: model.creditUrl });
  }
  return updates;
}

async function resolveAll(models, { width, fetcher, onError }) {
  const plan = planPhotoLinks(models);
  const updates = [];
  for (const item of plan) {
    try {
      const info = await resolveFileUrl(item.fileTitle, { width, fetcher });
      if (!info) throw new Error("no thumburl from API");
      updates.push({ id: item.id, photoUrl: info.thumbUrl, creditUrl: item.creditUrl });
      console.log(`[commons-link] ${item.id} -> ${info.thumbUrl.slice(0, 110)}`);
    } catch (error) {
      onError?.(item.id, error.message || String(error));
    }
  }
  return updates;
}

function applyUpdates(models, updates) {
  const byId = new Map(updates.map((u) => [u.id, u]));
  return models.map((model) => {
    const update = byId.get(model.id);
    if (!update) return model;
    return { ...model, photoUrl: update.photoUrl };
  });
}

export async function run({ write = false, width = THUMB_WIDTH, projectRoot: root = projectRoot } = {}) {
  const modelsData = JSON.parse(await readFile(MODELS_PATH, "utf8"));
  const updates = [];
  let errors = 0;
  const onError = (id, message) => {
    errors++;
    console.error(`[commons-link] ! ${id}: ${message}`);
  };
  const resolved = await resolveAll(modelsData.models, { width, onError });
  updates.push(...resolved);

  if (write) {
    const nextModels = applyUpdates(modelsData.models, updates);
    const nextData = { ...modelsData, models: nextModels };
    const tmp = `${MODELS_PATH}.tmp`;
    await writeFile(tmp, `${JSON.stringify(nextData, null, 2)}\n`);
    await rename(tmp, MODELS_PATH);
  }

  const summary = {
    planned: (planPhotoLinks(modelsData.models)).length,
    resolved: updates.length,
    errors,
    written: write,
  };
  console.log(`[commons-link] planned ${summary.planned} | resolved ${summary.resolved} | errors ${errors} | written ${write}`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const widthArg = args.find((f) => f.startsWith("--width="));
  const width = widthArg ? Number(widthArg.slice(8)) || THUMB_WIDTH : THUMB_WIDTH;
  await run({ write, width });
}