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
  "assets/profiles/enako.jpg",
  "assets/profiles/umi-shinonome.jpg",
  "assets/profiles/nashiko-momotsuki.jpg",
  "assets/profiles/ai-shinozaki.jpg",
  "assets/profiles/kiko-mizuhara.jpg",
];

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
    const destPath = path.join(distDir, fileName);
    await mkdir(path.dirname(destPath), { recursive: true });
    await copyFile(sourcePath, destPath);
  }

  const { files: outputFiles, dirs: outputDirs } = await collectDistFiles(distDir);
  const expectedFiles = [...PUBLIC_FILES].sort();
  const unexpectedDirs = outputDirs.filter(
    (dir) => !PUBLIC_FILES.some((file) => file.startsWith(`${dir}/`)),
  );
  if (outputFiles.sort().join("\n") !== expectedFiles.join("\n") || unexpectedDirs.length > 0) {
    throw new Error("Pages output does not match the public-file allowlist.");
  }

  return outputFiles;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await buildPages();
  console.log(`Built ${files.length} public files.`);
}
