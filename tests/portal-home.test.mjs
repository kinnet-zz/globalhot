import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const [html, css, script] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('portal.css', 'utf8'),
  readFile('portal.js', 'utf8')
]);

const attributes = (source, name) => Array.from(
  source.matchAll(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'gi')),
  (match) => match[2]
);

test('homepage loads portal assets', () => {
  assert.match(html, /<link\b[^>]*\bhref\s*=\s*["'][^"']*portal\.css(?:[?#][^"']*)?["']/i);
  assert.match(html, /<script\b[^>]*\bsrc\s*=\s*["'][^"']*portal\.js(?:[?#][^"']*)?["']/i);
  assert.doesNotMatch(html, /(?:href|src)\s*=\s*["'][^"']*(?:style\.css|app\.js)(?:[?#][^"']*)?["']/i);
  assert.ok(css.trim().length > 0);
});

test('homepage keeps the portal controls and structured search metadata', () => {
  for (const id of ['portalSearch', 'sortSelect', 'resultsCount', 'modelGrid', 'rankingList', 'emptyState', 'clearSearch']) {
    assert.match(html, new RegExp(`\\bid\\s*=\\s*["']${id}["']`, 'i'));
  }
  assert.match(html, /data-category\s*=\s*["'](?:all|model|cosplay|gravure)["']/i);
  assert.match(html, /"@type"\s*:\s*"SearchAction"/i);
  assert.match(html, /추천 API 연결 시 전역 집계하며, 연결 전에는 이 기기에서만 반영됩니다/);
  assert.doesNotMatch(html, /DEVICE-LOCAL DEMO/);
});

test('homepage keeps local-only media and ad structure', () => {
  assert.equal((html.match(/\bdata-ad-slot\b/gi) || []).length, 2);
  assert.doesNotMatch(html, /(?:id|class)\s*=\s*(["'])[^"']*comment[^"']*\1/i);
  assert.doesNotMatch(html, /<textarea\b/i);
  for (const source of attributes(html, 'src')) {
    assert.ok(!/^https?:\/\//i.test(source), `remote source is not allowed: ${source}`);
    assert.ok(!/^data:image\//i.test(source), 'data:image is not allowed');
  }
  assert.doesNotMatch(html, /<img\b[^>]*\bsrc\s*=\s*["']https?:\/\//i);
  assert.doesNotMatch(html, /<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)/i);
  assert.doesNotMatch(html, /<link\b[^>]*\brel\s*=\s*["'][^"']*stylesheet[^"']*["'][^>]*\bhref\s*=\s*["']https?:\/\//i);
  assert.doesNotMatch(html, /<svg\b/i);
  assert.doesNotMatch(html, /data:image\//i);
});

test('six cards have unique IDs and matching recommendation buttons', () => {
  const ids = attributes(html, 'data-model-id');
  const recommendationIds = attributes(html, 'data-recommend-model');
  assert.equal(ids.length, 6);
  assert.equal(new Set(ids).size, 6);
  assert.deepEqual(new Set(recommendationIds), new Set(ids));
});

test('portal script parses and retains persistence and URL safeguards', () => {
  assert.doesNotThrow(() => new vm.Script(script));
  assert.match(script, /globalhot-demo-recommendations-v1/);
  assert.match(script, /globalhot-recommendations-v2/);
  assert.match(script, /URLSearchParams/);
  assert.match(script, /history\.replaceState/);
  assert.match(script, /localStorage/);
  assert.doesNotMatch(script, /\beval\s*\(/);
  assert.doesNotMatch(script, /innerHTML/);
});

test('portal script keeps filters, ranking, and accessible recommendation state in sync', () => {
  assert.match(script, /classList\.toggle\(\s*['"]is-active['"]\s*,\s*isActive\s*\)/);
  assert.match(script, /button\.dataset\.category\s*===\s*state\.category/);
  assert.match(script, /rank\.className\s*=\s*['"]rank-number['"]/);
  assert.match(script, /name\.className\s*=\s*['"]rank-name['"]/);
  assert.match(script, /score\.className\s*=\s*['"]rank-count['"]/);
  assert.match(script, /var rankedCards\s*=\s*displayedCards\.slice\(\)\.sort\(/);
  assert.match(script, /cardCount\(second\)\s*-\s*cardCount\(first\).*localeCompare/s);
  assert.match(script, /button\.textContent\s*=\s*['"]처리 중…['"]/);
  assert.match(script, /button\.textContent\s*=\s*['"]추천 완료['"]/);
});

test('portal recommendation API has safe server mode and local fallback', () => {
  assert.match(script, /var\s+serverMode\s*=\s*false/);
  assert.match(script, /window\.fetch\(\s*['"]\/api\/recommendations['"]\s*,\s*\{[\s\S]*credentials:\s*['"]same-origin['"][\s\S]*cache:\s*['"]no-store['"]/);
  assert.match(script, /headers:\s*\{\s*Accept:\s*['"]application\/json['"]\s*\}/);
  assert.match(script, /window\.fetch\(\s*['"]\/api\/recommendations\/['"]\s*\+\s*encodeURIComponent\(id\)\s*,\s*requestOptions\s*\)/);
  assert.match(script, /var requestOptions\s*=\s*\{[\s\S]*method:\s*['"]POST['"][\s\S]*credentials:\s*['"]same-origin['"][\s\S]*cache:\s*['"]no-store['"]/);
  assert.match(script, /Object\.keys\(nextCounts\)\.length\s*===\s*0/);
  assert.match(script, /pendingRecommendations\[id\]\s*=\s*true/);
  assert.match(script, /response\.status\s*===\s*201/);
  assert.match(script, /response\.status\s*===\s*409[\s\S]*already_recommended/);
  assert.match(script, /response\.status\s*===\s*429/);
  assert.match(script, /response\.status\s*===\s*403/);
  assert.match(script, /serverRecommendations\[id\]\s*=\s*true/);
  assert.match(script, /saveRecommendations\(SERVER_STORAGE_KEY/);
  assert.match(script, /demoRecommendations\[id\]\s*=\s*true/);
  assert.match(script, /render\(\{ sync: false \}\)/);
  assert.match(script, /if \(serverMode\) return hasOwn\(serverCounts, id\) \? serverCounts\[id\] : \(Number\.isFinite\(base\) \? base : 0\);/);
  assert.match(script, /return \(Number\.isFinite\(base\) \? base : 0\) \+ \(demoRecommendations\[id\] \? 1 : 0\);/);
  assert.match(script, /window\.AbortController/);
  assert.match(script, /controller\.abort\(\).*8000/s);
  assert.match(script, /window\.clearTimeout\(timeoutId\)/);
});
