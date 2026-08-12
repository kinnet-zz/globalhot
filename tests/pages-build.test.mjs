import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { STATIC_FILES, buildPages } from "../scripts/build-pages.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");

async function walkDist(dir = distDir, base = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  const dirs = [];
  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      dirs.push(relative);
      const nested = await walkDist(fullPath, relative);
      files.push(...nested.files);
      dirs.push(...nested.dirs);
    } else {
      files.push(relative);
    }
  }
  return { files, dirs };
}

test("Pages build contains the static files, every source profile photo, and models.json", async () => {
  const builtFiles = (await buildPages()).sort();
  const { files: distFiles, dirs: distDirs } = await walkDist();

  // 모든 고정 파일 + models.json 존재
  for (const f of [...STATIC_FILES, "data/models.json"]) {
    assert.ok(builtFiles.includes(f), `missing expected file: ${f}`);
  }

  // dist 의 profile 사진이 소스 디렉토리를 정확히 반영
  const srcPhotos = (await readdir(path.join(projectRoot, "assets", "profiles")))
    .filter((name) => name.endsWith(".jpg"))
    .map((name) => `assets/profiles/${name}`)
    .sort();
  const distPhotos = distFiles
    .filter((f) => f.startsWith("assets/profiles/") && f.endsWith(".jpg"))
    .sort();
  assert.deepEqual(distPhotos, srcPhotos, "dist profile photos must mirror the source directory");
  assert.ok(srcPhotos.length >= 5, "expected the seed profile photos to be present");

  // 허용되지 않은 파일/디렉토리 없음
  const allowedRoots = new Set(["data", "assets", "assets/profiles", "hotnews"]);
  for (const d of distDirs) {
    assert.ok(allowedRoots.has(d) || d.startsWith("assets/profiles/"), `unexpected dir: ${d}`);
  }
});

test("Pages build excludes development and user-owned files", async () => {
  const excluded = [
    "editor.html", "server.py", "package.json", "package-lock.json", "tests",
    "migrations", "functions", "CLOUDFLARE_SETUP.txt", "DEVELOPMENT_PROCESS.txt",
    "posts", "scripts",
  ];

  for (const name of excluded) {
    await assert.rejects(stat(path.join(distDir, name)));
  }
});

test("Pages deployment uses the allowlisted dist directory", async () => {
  for (const name of ["index.html", "portal.css", "info.css", "portal.js", "analytics.js"]) {
    assert.equal((await stat(path.join(distDir, name))).isFile(), true);
  }

  const wranglerConfig = await readFile(path.join(projectRoot, "wrangler.toml"), "utf8");
  const workflow = await readFile(path.join(projectRoot, ".github", "workflows", "deploy.yml"), "utf8");
  assert.match(wranglerConfig, /^pages_build_output_dir = "dist"$/m);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run build:pages/);
  assert.match(workflow, /command: pages deploy dist --project-name globalhot --branch master/);
});

test("Pages production D1 contract and recommendation function routes are present", async () => {
  const wranglerConfig = await readFile(path.join(projectRoot, "wrangler.toml"), "utf8");

  assert.match(wranglerConfig, /^\[\[d1_databases\]\]$/m);
  assert.match(wranglerConfig, /^binding = "DB"$/m);
  assert.match(wranglerConfig, /^database_name = "globalhot-recommendations"$/m);
  assert.match(wranglerConfig, /^database_id = "866c176d-9335-4545-b21f-2eff64c044cb"$/m);
  assert.match(wranglerConfig, /^migrations_dir = "migrations"$/m);

  for (const route of [
    "functions/api/recommendations/index.js",
    "functions/api/recommendations/[modelId].js",
  ]) {
    assert.equal((await stat(path.join(projectRoot, route))).isFile(), true, `${route} must be a regular file`);
  }
});
