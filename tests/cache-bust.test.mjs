import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPages } from "../scripts/build-pages.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");

test("deployed HTML references local assets with a 10-hex content hash", async () => {
  await buildPages();
  for (const f of ["index.html", "about.html", "privacy.html", "terms.html", "404.html"]) {
    const html = await readFile(path.join(distDir, f), "utf8");
    // 각 파일이 참조하는 모든 로컬 asset 이 ?v=<10hex> 형태
    const matches = [...html.matchAll(/\/(portal\.css|info\.css|portal\.js|analytics\.js)\?v=([0-9a-f]{10})/g)];
    assert.ok(matches.length >= 1, `${f} must reference at least one versioned local asset`);
    for (const m of matches) assert.match(m[2], /^[0-9a-f]{10}$/);
  }
});

test("the same asset uses the identical hash across all pages (no drift)", async () => {
  const hashOf = async (file, asset) => {
    const html = await readFile(path.join(distDir, file), "utf8");
    const m = html.match(new RegExp("/" + asset.replace(/\./g, "\\.") + "\\?v=([0-9a-f]{10})"));
    return m ? m[1] : null;
  };
  // portal.css 는 index 와 about 모두에서 참조 — 같아야 함
  const inIndex = await hashOf("index.html", "portal.css");
  const inAbout = await hashOf("about.html", "portal.css");
  assert.ok(inIndex && inAbout, "portal.css must be referenced in both");
  assert.equal(inIndex, inAbout, "portal.css hash must match across pages");
});

test("cache-bust hash is deterministic across builds", async () => {
  await buildPages();
  const h1 = (await readFile(path.join(distDir, "index.html"), "utf8"))
    .match(/portal\.js\?v=([0-9a-f]{10})/)[1];
  await buildPages();
  const h2 = (await readFile(path.join(distDir, "index.html"), "utf8"))
    .match(/portal\.js\?v=([0-9a-f]{10})/)[1];
  assert.equal(h1, h2, "same content must yield same hash");
});

test("source HTML files are NOT modified by cache-bust", async () => {
  // source 는 여전히 수동 ?v= (예: 20260802-3) 를 유지 — dist 만 해시로 치환
  const src = await readFile(path.join(projectRoot, "index.html"), "utf8");
  assert.match(src, /portal\.css\?v=20260802-3/, "source index.html keeps its manual version");
});
