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

test('homepage has no placeholder ad slots, no comments UI, and only local CC-licensed profile photos', () => {
  assert.equal((html.match(/\bdata-ad-slot\b/gi) || []).length, 0);
  assert.doesNotMatch(html, /(?:id|class)\s*=\s*(["'])[^"']*comment[^"']*\1/i);
  assert.doesNotMatch(html, /<textarea\b/i);
  for (const source of attributes(html, 'src')) {
    assert.ok(!/^https?:\/\//i.test(source), `remote source is not allowed: ${source}`);
    assert.ok(!/^data:image\//i.test(source), 'data:image is not allowed');
  }
  assert.doesNotMatch(html, /<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)/i);
  assert.doesNotMatch(html, /<link\b[^>]*\brel\s*=\s*["'][^"']*stylesheet[^"']*["'][^>]*\bhref\s*=\s*["']https?:\/\//i);
  assert.doesNotMatch(html, /data:image\//i);

  const expectedProfileSrcs = [
    '/assets/profiles/enako.jpg',
    '/assets/profiles/umi-shinonome.jpg',
    '/assets/profiles/nashiko-momotsuki.jpg',
    '/assets/profiles/ai-shinozaki.jpg',
    '/assets/profiles/kiko-mizuhara.jpg',
  ];
  const imgTags = Array.from(html.matchAll(/<img\b[^>]*>/gi), (match) => match[0]);
  assert.equal(imgTags.length, 5);
  assert.deepEqual(
    imgTags.map((tag) => attributes(tag, 'src')[0]).sort(),
    [...expectedProfileSrcs].sort(),
  );
  for (const tag of imgTags) {
    const src = attributes(tag, 'src')[0];
    assert.match(src, /^\/assets\/profiles\/[a-z-]+\.jpg$/);
    assert.match(tag, /\balt\s*=\s*["'][^"']+["']/);
    assert.match(tag, /\bloading\s*=\s*["']lazy["']/);
  }
  // Attribution is consolidated on the about page; homepage cards carry no
  // per-photo credit line, no card-footer date, and no registered-tag line.
  assert.equal((html.match(/class\s*=\s*["']photo-credit["']/g) || []).length, 0);
  assert.equal((html.match(/class\s*=\s*["']profile-line["']/g) || []).length, 0);
  assert.equal((html.match(/<time\b/g) || []).length, 1, 'only the official-news date remains on the homepage');
  assert.equal((html.match(/data-modal-updated/g) || []).length, 0, 'the modal no longer shows a verified date');
  assert.equal((html.match(/data-monogram\s*=\s*["']EI["']/g) || []).length, 1);
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

test('homepage renders the Patreon support button with safe new-tab attributes', () => {
  assert.match(html, /class=["'][^"']*\bsupport-cta\b[^"']*["']/i);
  const supportMatch = html.match(/<a\s+[^>]*class=["'][^"']*\bsupport-cta\b[^"']*["'][^>]*>/i);
  assert.ok(supportMatch, 'support-cta anchor must exist');
  assert.match(supportMatch[0], /href=["']https:\/\/patreon\.com\/[^"']+["']/i);
  assert.match(supportMatch[0], /target="_blank"/);
  assert.match(supportMatch[0], /rel="noopener noreferrer"/);
  assert.match(supportMatch[0], /aria-label=/);
});

test('homepage renders an Amazon Global affiliate placeholder with tracking hook and disclosure label', () => {
  assert.match(html, /class=["'][^"']*\bcard-affiliate\b[^"']*["']/i);
  const affiliateMatch = html.match(/<a\s+[^>]*data-affiliate=["']amazon-global["'][^>]*>/i);
  assert.ok(affiliateMatch, 'amazon-global affiliate anchor must exist');
  assert.match(affiliateMatch[0], /href=["']https:\/\/www\.amazon\.com\/[^"']*tag=globalhot-22[^"']*["']/i);
  assert.match(affiliateMatch[0], /target="_blank"/);
  assert.match(affiliateMatch[0], /rel="noopener noreferrer"/);
  // Disclosure label is visible to users (not just screen readers).
  assert.match(html, /AMAZON ASSOCIATE/i);
  assert.match(html, /PARTNER LINK/i);
});

test('portal stylesheet defines the ad-spot, card-affiliate, and support-cta surfaces', () => {
  for (const className of ['ad-spot', 'card-affiliate', 'support-cta', 'affiliate-link', 'affiliate-label']) {
    assert.match(css, new RegExp(`\\.${className}\\b`), `css must define .${className}`);
  }
  assert.match(css, /\.support-cta:hover\{/);
  assert.match(css, /\.card-affiliate a\.affiliate-link:hover\{/);
});

test('portal script wires affiliate click tracking defensively without blocking navigation', () => {
  assert.match(script, /data-affiliate/);
  assert.match(script, /setupAffiliateTracking/);
  assert.match(script, /trackAffiliateClick/);
  assert.match(script, /addEventListener\('click'/);
  // Tracking must never throw outwards.
  assert.match(script, /Tracking must never break the user journey/);
  assert.doesNotMatch(script, /\beval\s*\(/);
  assert.doesNotMatch(script, /innerHTML/);
});
