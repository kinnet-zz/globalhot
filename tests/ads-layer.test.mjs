import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const indexHtml = await readFile(path.join(projectRoot, "index.html"), "utf8");
const modelsHtml = await readFile(path.join(projectRoot, "models.html"), "utf8");
const adsJs = await readFile(path.join(projectRoot, "ads.js"), "utf8");
const rankBuilder = await readFile(path.join(projectRoot, "scripts/build-rank-pages.mjs"), "utf8");

test("mobile layout keeps the sidebar visible so the sticky ad slot stays in view", () => {
  assert.doesNotMatch(indexHtml, /\.sidebar\s*\{\s*display\s*:\s*none/);
  assert.match(indexHtml, /<aside class="sidebar">/);
  assert.match(indexHtml, /class="panel ad-sticky"/);
});

test("sidebar sticky ad slot uses generic wiring with no network zone IDs", () => {
  assert.match(indexHtml, /data-ads-config[^>]*data-gh-ad="home-sidebar"/);
  assert.doesNotMatch(indexHtml, /data-ad-zone=/);
});

test("in-feed and leaderboard slots use generic wiring with no network zone IDs", () => {
  assert.match(indexHtml, /data-gh-ad="home-infeed"/);
  assert.match(indexHtml, /data-gh-ad="home-leaderboard"/);
  assert.match(indexHtml, /data-gh-ad="home-mobile-banner"/);
  assert.match(rankBuilder, /data-gh-ad="rank-(leaderboard|incontent)"/);
  assert.doesNotMatch(rankBuilder, /data-ad-zone=/);
});

test("ad layer sends no third-party requests before AdSense approval", () => {
  assert.doesNotMatch(adsJs, /jads|adsbyjuicy|interstitial/i);
  assert.doesNotMatch(adsJs, /1123909|1124196|1124349|1124352/);
  assert.doesNotMatch(adsJs, /localStorage/);
});

test("ad layer exposes an AdSense client hook and a rescan API", () => {
  assert.match(adsJs, /ADSENSE_CLIENT_ID\s*=\s*['"]/);
  assert.match(adsJs, /GlobalHotAds\s*=\s*\{\s*rescan/);
});

test("unconfigured slots collapse without leaving empty boxes", () => {
  assert.match(adsJs, /data-ad-empty/);
});

test("models portal page carries no ad-network verification tags", () => {
  assert.doesNotMatch(modelsHtml, /juicyads-site-verification/i);
});
