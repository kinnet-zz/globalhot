import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Build-time model data preparation. Two jobs:
//   1. Validate every model's schema. A malformed entry FAILS THE BUILD here so a
//      bad model can never silently ship and crash the page (turns a quiet
//      production crash into a loud CI failure).
//   2. Reconcile `photoAvailable` against the real files in assets/profiles.
//      The source models.json is human-maintained and frequently drifts (90
//      entries marked true, only 5 photos exist). The dist copy is rewritten so
//      photoAvailable reflects the truth, which prevents 85 broken-image 404s.
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
  });
  if (errors.length) {
    throw new Error(`data/models.json validation failed:\n  - ${errors.join("\n  - ")}`);
  }

  // 2. Reconcile photoAvailable against the files that actually exist.
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
    if (model.photoAvailable !== fileExists) reconciledCount += 1;
    return { ...model, photoAvailable: fileExists };
  });

  if (reconciledCount > 0) {
    console.warn(
      `[prepare-data] Reconciled ${reconciledCount} photoAvailable flag(s) to match files in assets/profiles.`,
    );
  }

  const reconciled = { ...data, models: reconciledModels };
  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, `${JSON.stringify(reconciled, null, 2)}\n`, "utf8");

  const photoCount = reconciledModels.filter((model) => model.photoAvailable).length;
  console.warn(`[prepare-data] ${reconciledModels.length} models, ${photoCount} with a real photo.`);
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
