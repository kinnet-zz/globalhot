import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Build-time data preparation. Two jobs:
//   1. Validate every model's schema. A malformed entry FAILS THE BUILD here so a
//      bad model can never silently ship and crash the page (turns a quiet
//      production crash into a loud CI failure).
//   2. Reconcile `photoAvailable` against a real photo source. A model is
//      publishable when it has a local file in assets/profiles/<id>.jpg OR a
//      valid remote `photoUrl` (a CC-licensed Wikimedia Commons image). The dist
//      copy is rewritten so photoAvailable reflects the truth, which prevents
//      broken-image 404s without forcing every published profile to vendor a
//      local file.
// The source data/models.json is NEVER modified — only the dist copy.
export async function prepareModelsData({ projectRoot, distDir }) {
  const sourcePath = path.join(projectRoot, "data", "models.json");
  const destPath = path.join(distDir, "data", "models.json");
  const assetsDir = path.join(projectRoot, "assets", "profiles");

  const raw = await readFile(sourcePath, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`data/models.json is not valid JSON: ${error.message}`);
  }
  if (!data || !Array.isArray(data.models)) {
    throw new Error("data/models.json must contain a top-level 'models' array.");
  }

  // 1. Schema validation — loud failure on any malformed entry.
  const errors = [];
  const seenIds = new Set();
  data.models.forEach((model, index) => {
    const label = model && typeof model.id === "string" ? model.id : `index ${index}`;
    const loc = `models[${index}] (${label})`;
    if (!model || typeof model !== "object" || Array.isArray(model)) {
      errors.push(`${loc}: must be an object`);
      return;
    }
    if (typeof model.id !== "string" || !model.id) errors.push(`${loc}: id must be a non-empty string`);
    else if (seenIds.has(model.id)) errors.push(`${loc}: duplicate id "${model.id}"`);
    else seenIds.add(model.id);
    if (typeof model.name !== "string" || !model.name) errors.push(`${loc}: name must be a non-empty string`);
    if (typeof model.country !== "string" || !model.country) errors.push(`${loc}: country must be a non-empty string`);
    if (typeof model.tags !== "string" && !Array.isArray(model.tags)) errors.push(`${loc}: tags must be a string or array`);
    if (typeof model.photoAvailable !== "boolean") errors.push(`${loc}: photoAvailable must be a boolean`);
    if (typeof model.sns !== "object" || model.sns === null || Array.isArray(model.sns)) {
      errors.push(`${loc}: sns must be an object`);
    }
    if (model.photoUrl !== undefined && typeof model.photoUrl !== "string") {
      errors.push(`${loc}: photoUrl must be a string when present`);
    } else if (
      typeof model.photoUrl === "string" &&
      model.photoUrl.length > 0 &&
      !/^https:\/\/upload\.wikimedia\.org\//.test(model.photoUrl)
    ) {
      errors.push(`${loc}: photoUrl must be an https upload.wikimedia.org image URL when present`);
    }
  });
  if (errors.length) {
    throw new Error(`data/models.json validation failed:\n  - ${errors.join("\n  - ")}`);
  }

  // 2. Reconcile photoAvailable against a real photo source: a local file in
  // assets/profiles/<id>.jpg OR a remote photoUrl (CC-licensed Wikimedia image).
  let availableFiles = [];
  try {
    availableFiles = await readdir(assetsDir);
  } catch (error) {
    throw new Error(`Cannot read assets/profiles directory: ${error.message}`);
  }
  const available = new Set(availableFiles);
  let reconciledCount = 0;
  const reconciledModels = data.models.map((model) => {
    const fileExists = available.has(`${model.id}.jpg`);
    const hasRemotePhoto =
      typeof model.photoUrl === "string" &&
      model.photoUrl.length > 0 &&
      /^https:\/\/upload\.wikimedia\.org\//.test(model.photoUrl);
    const publishable = fileExists || hasRemotePhoto;
    if (model.photoAvailable !== publishable) reconciledCount += 1;
    return { ...model, photoAvailable: publishable };
  });

  if (reconciledCount > 0) {
    console.warn(
      `[prepare-data] Reconciled ${reconciledCount} photoAvailable flag(s) to match local files + remote photoUrl.`,
    );
  }

  const reconciled = { ...data, models: reconciledModels };
  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, `${JSON.stringify(reconciled, null, 2)}\n`, "utf8");

  const photoCount = reconciledModels.filter((model) => model.photoAvailable).length;
  console.warn(
    `[prepare-data] ${reconciledModels.length} models, ${photoCount} with a real photo source (local file or remote photoUrl).`,
  );
  return { modelCount: reconciledModels.length, photoCount, reconciledCount };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const result = await prepareModelsData({
    projectRoot: path.resolve(scriptDir, ".."),
    distDir: path.resolve(scriptDir, "..", "dist"),
  });
  console.log(`Prepared ${result.modelCount} models.`);
}
