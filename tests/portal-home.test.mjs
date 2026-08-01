import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const [html, css, script] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('portal.css', 'utf8'),
  readFile('portal.js', 'utf8')
]);

const IDS = ['enako', 'umi-shinonome', 'nashiko-momotsuki', 'ai-shinozaki', 'kiko-mizuhara', 'elaiza-ikeda'];
const attributes = (source, name) => Array.from(
  source.matchAll(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'gi')),
  (match) => match[2]
);

test('homepage loads portal assets and excludes the legacy stylesheet and app', () => {
  assert.match(html, /<link\b[^>]*\bhref\s*=\s*["'][^"']*portal\.css(?:[?#][^"']*)?["']/i);
  assert.match(html, /<script\b[^>]*\bsrc\s*=\s*["'][^"']*portal\.js(?:[?#][^"']*)?["']/i);
  assert.doesNotMatch(html, /(?:href|src)\s*=\s*["'][^"']*(?:style\.css|app\.js)(?:[?#][^"']*)?["']/i);
  assert.ok(css.trim().length > 0);
});

test('homepage retains discovery controls and structured search metadata', () => {
  for (const id of ['portalSearch', 'sortSelect', 'resultsCount', 'modelGrid', 'rankingList', 'emptyState', 'clearSearch']) {
    assert.match(html, new RegExp(`\\bid\\s*=\\s*["']${id}["']`, 'i'));
  }
  assert.match(html, /data-category\s*=\s*["'](?:all|model|cosplay|gravure)["']/i);
  assert.match(html, /"@type"\s*:\s*"SearchAction"/i);
  assert.match(html, /<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*\bhref\s*=\s*["']https:\/\/globalhot\.net\/["']/i);
});

test('homepage has exactly two ad slots, no comments UI, and only local media assets', () => {
  assert.equal((html.match(/\bdata-ad-slot\b/gi) || []).length, 2);
  assert.doesNotMatch(html, /(?:id|class)\s*=\s*(["'])[^"']*comment[^"']*\1/i);
  assert.doesNotMatch(html, /<textarea\b/i);
  for (const source of attributes(html, 'src')) {
    assert.ok(!/^https?:\/\//i.test(source), `remote source is not allowed: ${source}`);
    assert.ok(!/^data:image\//i.test(source), 'data:image is not allowed');
  }
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(html, /<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)/i);
  assert.doesNotMatch(html, /<link\b[^>]*\brel\s*=\s*["'][^"']*stylesheet[^"']*["'][^>]*\bhref\s*=\s*["']https?:\/\//i);
  assert.doesNotMatch(html, /data:image\//i);
});

test('the six profile IDs are unique and every card has its matching recommendation button', () => {
  const ids = attributes(html, 'data-model-id');
  const recommendationIds = attributes(html, 'data-recommend-model');
  assert.deepEqual(ids, IDS);
  assert.equal(new Set(ids).size, 6);
  assert.deepEqual(new Set(recommendationIds), new Set(ids));
});

test('real profiles start at zero and have official-source links with safe new-tab attributes', () => {
  for (const [id, name] of IDS.map((id, index) => [id, ['Enako', 'Umi Shinonome', 'Nashiko Momotsuki', 'Ai Shinozaki', 'Kiko Mizuhara', 'Elaiza Ikeda'][index]])) {
    assert.match(html, new RegExp(`data-model-id="${id}"[\\s\\S]*?data-base-recommendations="0"`));
    assert.match(html, new RegExp(name));
  }
  for (const match of html.matchAll(/<a\s+[^>]*href="https?:\/\/[^>]+>/g)) {
    assert.match(match[0], /target="_blank"/);
    assert.match(match[0], /rel="noopener noreferrer"/);
  }
});

test('portal script keeps storage, URL, and DOM-safety safeguards', () => {
  assert.doesNotThrow(() => new vm.Script(script));
  assert.match(script, /globalhot-local-recommendations-v1/);
  assert.match(script, /globalhot-recommendations-v2/);
  assert.match(script, /URLSearchParams/);
  assert.match(script, /history\.replaceState/);
  assert.match(script, /localStorage/);
  assert.doesNotMatch(script, /\beval\s*\(/);
  assert.doesNotMatch(script, /innerHTML/);
});

test('portal script retains filtering, sorting, ranking, and accessible recommendation state', () => {
  assert.match(script, /VALID_CATEGORIES\s*=\s*\['all', 'model', 'cosplay', 'gravure'\]/);
  assert.match(script, /VALID_SORTS\s*=\s*\['popular', 'latest', 'name'\]/);
  assert.match(script, /button\.dataset\.category\s*===\s*state\.category/);
  assert.match(script, /classList\.toggle\(\s*['"]is-active['"]\s*,\s*isActive\s*\)/);
  assert.match(script, /state\.query\.trim\(\)\.toLocaleLowerCase\(\)/);
  assert.match(script, /state\.sort\s*===\s*['"]latest['"]/);
  assert.match(script, /state\.sort\s*===\s*['"]name['"]/);
  assert.match(script, /rankedCards\s*=\s*displayedCards\.slice\(\)\.sort/);
  for (const className of ['rank-number', 'rank-name', 'rank-count']) assert.match(script, new RegExp(className));
  assert.match(script, /search\.focus\(\)/);
});

test('URL state is normalized and query, category, and sort changes are synchronized', () => {
  assert.match(script, /parameters\.get\('q'\)\s*\|\|\s*''/);
  assert.match(script, /isValid\(parameters\.get\('category'\)\s*\|\|\s*'all'/);
  assert.match(script, /isValid\(parameters\.get\('sort'\)\s*\|\|\s*'popular'/);
  assert.match(script, /next\.set\('q', state\.query\)/);
  assert.match(script, /next\.set\('category', state\.category\)/);
  assert.match(script, /next\.set\('sort', state\.sort\)/);
  assert.match(script, /search\.addEventListener\('input'/);
  assert.match(script, /sortSelect\.addEventListener\('change'/);
});

test('local recommendation persistence rejects malformed storage and ignores unknown IDs at runtime', () => {
  const values = new Map([
    ['broken', '{not json'],
    ['mixed', JSON.stringify(['enako', 'unknown', 7, 'enako'])]
  ]);
  const context = {
    window: {
      localStorage: {
        getItem(key) { return values.get(key) ?? null; },
        setItem(key, value) { values.set(key, value); }
      }
    },
    document: { readyState: 'loading', addEventListener() {} }
  };
  const instrumented = script.replace(
    'function initialisePortal() {',
    'globalThis.__portalHelpers = { getStoredRecommendations, saveRecommendations, isValid, isSafeCount };\n\n  function initialisePortal() {'
  );
  new vm.Script(instrumented).runInNewContext(context);
  const helpers = context.__portalHelpers;
  assert.deepEqual(Object.keys(helpers.getStoredRecommendations('broken', { enako: true })), []);
  assert.deepEqual(Object.keys(helpers.getStoredRecommendations('mixed', { enako: true })), ['enako']);
  assert.equal(helpers.saveRecommendations('saved', { enako: true }), true);
  assert.equal(values.get('saved'), '["enako"]');
});

test('server recommendation mode validates payloads and leaves local fallback intact on errors', () => {
  assert.match(script, /var\s+serverMode\s*=\s*false/);
  assert.match(script, /window\.fetch\('\/api\/recommendations',\s*\{[\s\S]*credentials:\s*'same-origin'[\s\S]*cache:\s*'no-store'/);
  assert.match(script, /headers:\s*\{\s*Accept:\s*'application\/json'\s*\}/);
  assert.match(script, /!payload \|\| payload\.ok !== true \|\| !Array\.isArray\(payload\.models\)/);
  assert.match(script, /Object\.keys\(nextCounts\)\.length\s*===\s*0/);
  assert.match(script, /validModelIds\[model\.modelId\] && isSafeCount\(model\.count\)/);
  assert.match(script, /Leave the immediate device-local recommendation mode active/);
});

test('server recommendation requests handle success, duplicate, rate-limit, timeout, and errors safely', () => {
  assert.match(script, /window\.fetch\('\/api\/recommendations\/' \+ encodeURIComponent\(id\), requestOptions\)/);
  assert.match(script, /pendingRecommendations\[id\]\s*=\s*true/);
  assert.match(script, /response\.status === 201/);
  assert.match(script, /response\.status === 409[\s\S]*already_recommended/);
  assert.match(script, /response\.status === 429 \|\| response\.status === 403 \|\| response\.status >= 500/);
  assert.match(script, /serverRecommendations\[id\]\s*=\s*true/);
  assert.match(script, /saveRecommendations\(SERVER_STORAGE_KEY/);
  assert.match(script, /window\.AbortController/);
  assert.match(script, /controller\.abort\(\).*8000/s);
  assert.match(script, /window\.clearTimeout\(timeoutId\)/);
  assert.match(script, /delete pendingRecommendations\[id\]/);
  assert.match(script, /recommendationErrors\[id\]/);
});

test('mobile layout allows navigation, cards, and linked update rows to shrink without page overflow', () => {
  assert.match(css, /@media\(max-width:640px\)\{[\s\S]*?\.primary-nav\{flex:1;min-width:0;/);
  assert.match(css, /\.model-card\{grid-template-columns:108px minmax\(0,1fr\)\}/);
  assert.match(css, /\.model-card>\*,\.release-list article>\*,\.update-list li>\*\{min-width:0\}/);
  assert.match(css, /\.source-links a,\.release-list>article>a,\.update-list a\{overflow-wrap:anywhere\}/);
  assert.match(css, /\.release-list article\{grid-template-columns:57px minmax\(0,1fr\)\}/);
  assert.match(css, /\.release-list>article>a\{grid-column:2;grid-row:2;justify-self:start/);
});

test('filtered cards using hidden are removed from the grid layout', () => {
  assert.match(css, /\[hidden\]\{display:none!important\}/);
});
