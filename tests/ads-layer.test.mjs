import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const indexHtml = await readFile(path.join(projectRoot, "index.html"), "utf8");
const adsJs = await readFile(path.join(projectRoot, "ads.js"), "utf8");

test("mobile layout keeps the sidebar visible so the sticky ad slot stays in view", () => {
  assert.doesNotMatch(indexHtml, /\.sidebar\s*\{\s*display\s*:\s*none/);
  assert.match(indexHtml, /<aside class="sidebar">/);
  assert.match(indexHtml, /class="panel ad-sticky"/);
});

test("sidebar sticky ad slot keeps its JuicyAds zone wiring", () => {
  assert.match(indexHtml, /data-ads-config[^>]*data-ad-zone="1123909"/);
});

test("interstitial uses a daily cap instead of a permanent once-ever flag", () => {
  assert.match(adsJs, /INTERSTITIAL_DAILY_CAP\s*=\s*3/);
  assert.match(adsJs, /globalhot-interstitial-count/);
  assert.doesNotMatch(adsJs, /globalhot-interstitial-shown/);
});

test("interstitial resets the count when the day changes", () => {
  assert.match(adsJs, /state\.date !== today\(\)/);
});
