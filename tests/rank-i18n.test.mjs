import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rankHtml = await readFile(path.join(projectRoot, "rank.html"), "utf8");

test("rank page declares hreflang alternates for ko/en/ja and x-default", () => {
  assert.match(rankHtml, /hreflang="ko" href="https:\/\/globalhot\.net\/rank\.html\?lang=ko"/);
  assert.match(rankHtml, /hreflang="en" href="https:\/\/globalhot\.net\/rank\.html\?lang=en"/);
  assert.match(rankHtml, /hreflang="ja" href="https:\/\/globalhot\.net\/rank\.html\?lang=ja"/);
  assert.match(rankHtml, /hreflang="x-default" href="https:\/\/globalhot\.net\/rank\.html"/);
});

test("rank page language switch covers ko/en/ja", () => {
  for (const lang of ["ko", "en", "ja"]) {
    assert.match(rankHtml, new RegExp(`data-lang="${lang}"`), `missing switch button for ${lang}`);
  }
});

test("i18n dictionaries define identical key sets across languages", () => {
  // rank.html 의 I18N 객체를 추출해 키 세트 비교 (ko/en/ja 상호 일치 검증)
  const start = rankHtml.indexOf("const I18N = {");
  const end = rankHtml.indexOf("};", start) + 2;
  assert.ok(start > 0, "I18N dictionary not found");
  const dictSrc = rankHtml.slice(start, end);
  const I18N = eval(`(${dictSrc.replace("const I18N = ", "").replace(/;$/, "")})`);
  const langs = Object.keys(I18N);
  assert.deepEqual(langs.sort(), ["en", "ja", "ko"]);
  const keySets = langs.map((l) => Object.keys(I18N[l]).sort());
  for (const ks of keySets.slice(1)) assert.deepEqual(ks, keySets[0], "all languages must share the same keys");
  assert.ok(keySets[0].length >= 19, "dictionary should cover all UI strings");
});
