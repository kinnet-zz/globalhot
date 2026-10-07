import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { affiliateSection, loadAffiliateConfig } from "../scripts/build-rank-pages.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const cfg = { amazonTag: "globalhot-22", amazonDomain: "www.amazon.co.jp" };

test("loadAffiliateConfig returns null when the file is missing or the tag is empty", async () => {
  assert.equal(await loadAffiliateConfig(path.join(projectRoot, "data", "does-not-exist.json")), null);
  assert.equal(await loadAffiliateConfig(path.join(projectRoot, "data", "affiliate.json")), null);
});

test("loadAffiliateConfig returns the tag and domain when configured", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gh-aff-"));
  const p = path.join(dir, "affiliate.json");
  await writeFile(p, JSON.stringify({ amazonTag: "  globalhot-22 ", amazonDomain: "https://www.amazon.com/" }), "utf8");
  assert.deepEqual(await loadAffiliateConfig(p), { amazonTag: "globalhot-22", amazonDomain: "www.amazon.com" });
});

test("loadAffiliateConfig falls back to amazon.co.jp when the domain is absent", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gh-aff-"));
  const p = path.join(dir, "affiliate.json");
  await writeFile(p, JSON.stringify({ amazonTag: "x" }), "utf8");
  assert.deepEqual(await loadAffiliateConfig(p), { amazonTag: "x", amazonDomain: "www.amazon.co.jp" });
});

test("affiliateSection renders nothing without a configured tag", () => {
  assert.equal(affiliateSection({ name: "Enako", altName: "えなこ" }, null), "");
  assert.equal(affiliateSection(null, cfg), "");
  assert.equal(affiliateSection({ name: "", altName: "" }, cfg), "");
});

test("affiliateSection renders a disclosed sponsored Amazon link", () => {
  const html = affiliateSection({ name: "Enako", altName: "えなこ" }, cfg);
  assert.match(html, /data-i18n="shopTitle"/);
  assert.match(html, /data-i18n="shopDisclosure"/);
  assert.match(html, /rel="sponsored nofollow noopener"/);
  assert.match(html, /data-affiliate="amazon"/);
  assert.match(html, /tag=globalhot-22/);
  assert.match(html, new RegExp(encodeURIComponent("Enako えなこ")));
});

test("affiliateSection escapes model names to prevent HTML injection", () => {
  const html = affiliateSection({ name: '<img src=x onerror=alert(1)>', altName: "" }, cfg);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /onerror=alert\(1\)/);
  assert.match(html, /%3Cimg/);
});
