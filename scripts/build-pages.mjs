import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_FILES = [
  "index.html",
  "about.html",
  "privacy.html",
  "terms.html",
  "404.html",
  "portal.css",
  "info.css",
  "portal.js",
  "analytics.js",
  "ads.txt",
  "robots.txt",
  "sitemap.xml",
  "_headers",
  "_redirects",
];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const distDir = path.resolve(projectRoot, "dist");

function assertDistPath() {
  if (path.dirname(distDir) !== projectRoot || path.basename(distDir) !== "dist") {
    throw new Error(`Refusing to modify unexpected output directory: ${distDir}`);
  }
}

export async function buildPages() {
  assertDistPath();
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const fileName of PUBLIC_FILES) {
    const sourcePath = path.resolve(projectRoot, fileName);
    const sourceInfo = await stat(sourcePath);
    if (!sourceInfo.isFile()) {
      throw new Error(`Public source must be a regular file: ${fileName}`);
    }
    await copyFile(sourcePath, path.join(distDir, fileName));
  }

  const outputEntries = await readdir(distDir, { withFileTypes: true });
  const outputFiles = outputEntries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const expectedFiles = [...PUBLIC_FILES].sort();
  const hasUnexpectedEntries = outputEntries.some((entry) => !entry.isFile() || !PUBLIC_FILES.includes(entry.name));
  if (hasUnexpectedEntries || outputFiles.join("\n") !== expectedFiles.join("\n")) {
    throw new Error("Pages output does not match the public-file allowlist.");
  }

  return outputFiles;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await buildPages();
  console.log(`Built ${files.length} public files.`);
}
