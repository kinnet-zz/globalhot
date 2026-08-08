import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareModelsData } from "./prepare-data.mjs";
import { applyCacheBust } from "./cache-bust.mjs";

export const STATIC_FILES = [
  "index.html",
  "model.html",
  "about.html",
  "privacy.html",
  "terms.html",
  "404.html",
  "portal.css",
  "app.css",
  "home.css",
  "info.css",
  "portal.js",
  "analytics.js",
  "ads.txt",
  "robots.txt",
  "sitemap.xml",
  "_headers",
  "_redirects",
];

const SCAN_DIRS = ["assets/profiles"];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const distDir = path.resolve(projectRoot, "dist");

function assertDistPath() {
  if (path.dirname(distDir) !== projectRoot || path.basename(distDir) !== "dist") {
    throw new Error(`Refusing to modify unexpected output directory: ${distDir}`);
  }
}

async function collectDistFiles(dir, base = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  const dirs = [];
  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      dirs.push(relative);
      const nested = await collectDistFiles(fullPath, relative);
      files.push(...nested.files);
      dirs.push(...nested.dirs);
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      throw new Error(`Unexpected dist entry type: ${fullPath}`);
    }
  }
  return { files, dirs };
}

async function copyDirTree(srcDir, destDir) {
  const entries = await readdir(srcDir, { withFileTypes: true });
  await mkdir(destDir, { recursive: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirTree(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    } else {
      throw new Error(`Unexpected entry in ${srcDir}: ${entry.name}`);
    }
  }
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function buildPages() {
  assertDistPath();
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const fileName of STATIC_FILES) {
    const sourcePath = path.resolve(projectRoot, fileName);
    const sourceInfo = await stat(sourcePath);
    if (!sourceInfo.isFile()) {
      throw new Error(`Public source must be a regular file: ${fileName}`);
    }
    const destPath = path.join(distDir, fileName);
    await mkdir(path.dirname(destPath), { recursive: true });
    await copyFile(sourcePath, destPath);
  }

  for (const scanDir of SCAN_DIRS) {
    await copyDirTree(path.resolve(projectRoot, scanDir), path.join(distDir, scanDir));
  }

  await prepareModelsData({ projectRoot, distDir });

  await applyCacheBust({
    projectRoot,
    distDir,
    htmlFiles: ["index.html", "model.html", "about.html", "privacy.html", "terms.html", "404.html"],
  });

  const { files: outputFiles, dirs: outputDirs } = await collectDistFiles(distDir);
  const staticSet = new Set(STATIC_FILES);
  const isAllowedOutput = (file) =>
    staticSet.has(file) ||
    file === "data/models.json" ||
    SCAN_DIRS.some((dir) => file.startsWith(`${dir}/`));
  const allowedDirRoots = new Set(["data", "assets", "assets/profiles"]);
  const isAllowedDir = (d) => allowedDirRoots.has(d) || SCAN_DIRS.some((dir) => d.startsWith(`${dir}/`));

  const unexpectedFiles = outputFiles.filter((f) => !isAllowedOutput(f));
  const missingStatic = STATIC_FILES.filter((f) => !outputFiles.includes(f));
  const unexpectedDirs = outputDirs.filter((d) => !isAllowedDir(d));
  const missingModelsJson = !outputFiles.includes("data/models.json");

  if (unexpectedFiles.length || missingStatic.length || unexpectedDirs.length || missingModelsJson) {
    throw new Error(
      "Pages output invariant violated. " +
      (unexpectedFiles.length ? `Unexpected files: ${unexpectedFiles.join(", ")}. ` : "") +
      (missingStatic.length ? `Missing static files: ${missingStatic.join(", ")}. ` : "") +
      (unexpectedDirs.length ? `Unexpected dirs: ${unexpectedDirs.join(", ")}. ` : "") +
      (missingModelsJson ? "Missing data/models.json." : ""),
    );
  }

  return outputFiles;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await buildPages();
  console.log(`Built ${files.length} public files.`);
}
