import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [about, privacy, terms, notFound, infoCss, workflow, sitemap] = await Promise.all([
  readFile('about.html', 'utf8'),
  readFile('privacy.html', 'utf8'),
  readFile('terms.html', 'utf8'),
  readFile('404.html', 'utf8'),
  readFile('info.css', 'utf8'),
  readFile('.github/workflows/auto-publish.yml', 'utf8'),
  readFile('sitemap.xml', 'utf8')
]);

const infoPages = [
  ['about.html', about],
  ['privacy.html', privacy],
  ['terms.html', terms],
  ['404.html', notFound]
];

test('information pages use the GlobalHot portal surface without legacy UI', () => {
  for (const [name, page] of infoPages) {
    assert.match(page, /GlobalHot/, `${name} must identify GlobalHot`);
    assert.match(page, /(?:href|src)=["'][^"']*\/portal\.css(?:[?#][^"']*)?["']/i, `${name} must load portal.css`);
    assert.match(page, /(?:href|src)=["'][^"']*\/info\.css(?:[?#][^"']*)?["']/i, `${name} must load info.css`);
    assert.doesNotMatch(page, /Global Hot Reads/i, `${name} must not keep the old brand`);
    assert.doesNotMatch(page, /(?:href|src)=["'][^"']*style\.css(?:[?#][^"']*)?["']/i, `${name} must not load style.css`);
    assert.doesNotMatch(page, /<style\b/i, `${name} must not contain inline stylesheets`);
    assert.doesNotMatch(page, /\sstyle\s*=/i, `${name} must not use style attributes`);
    assert.doesNotMatch(page, /\/posts\//i, `${name} must not link to legacy posts`);
  }
});

test('privacy page describes only the portal storage and analytics posture', () => {
  assert.match(privacy, /gh-consent-v1/);
  assert.match(privacy, /globalhot-demo-recommendations-v1/);
  assert.match(privacy, /Cloudflare/);
  assert.match(privacy, /(?:Google Analytics|GA4)/i);
  assert.match(privacy, /(?:현재.{0,80}광고.{0,80}(?:스크립트|태그).{0,80}(?:없|사용하지|운영하지)|광고.{0,80}(?:스크립트|태그).{0,80}(?:없|사용하지|운영하지))/s);
  assert.doesNotMatch(privacy, /AdSense/i);
});

test('about page states the portal content and safety principles', () => {
  assert.match(about, /(?:가상.{0,80}(?:데모|예시)|(?:데모|예시).{0,80}가상)/s);
  assert.match(about, /출처/);
  assert.match(about, /AI.{0,80}요약/s);
  assert.match(about, /(?:이미지.{0,80}(?:권리|라이선스)|(?:권리|라이선스).{0,80}이미지)/s);
  assert.match(about, /(?:18\s*\+.{0,80}(?:제외|다루지|대상)|(?:제외|다루지|대상).{0,80}18\s*\+)/s);
  assert.match(about, /댓글.{0,80}(?:없|제공하지|운영하지)/s);
  assert.match(about, /추천 API 연결 상태.{0,80}데모 랭킹/s);
  assert.doesNotMatch(about, /기기별 데모 랭킹/);
  assert.match(about, /(?:팝언더|강제\s*리디렉션).{0,80}(?:금지|사용하지|운영하지|않)/s);
});

test('terms page covers demo data, fair recommendations, reports, and disclosure', () => {
  assert.match(terms, /가상.{0,80}(?:데이터|정보|데모)/s);
  assert.match(terms, /금지\s*행위.{0,240}추천.{0,80}(?:조작|부정)/s);
  assert.match(terms, /(?:권리\s*침해.{0,80}(?:신고|제보)|(?:신고|제보).{0,80}권리\s*침해)/s);
  assert.match(terms, /제휴.{0,80}(?:표시|고지|안내)/s);
});

test('not-found page remains out of search and returns visitors to portal discovery', () => {
  assert.match(notFound, /<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*noindex/i);
  assert.match(notFound, /href=["']\/#discover["']/);
  assert.match(notFound, /(?:href=["']\/#models["']|href=["']\/["'])/);
  assert.doesNotMatch(notFound, /\/posts\//i);
});

test('terms and not-found pages use the shared information page layout classes', () => {
  assert.match(terms, /class=["'][^"']*\binfo-main\b[^"']*["']/);
  assert.match(terms, /class=["'][^"']*\binfo-wrap\b[^"']*\blegal-copy\b[^"']*["']/);
  assert.doesNotMatch(terms, /class=["'][^"']*\binfo-page\b[^"']*["']/);

  for (const className of ['not-found-main', 'not-found-wrap', 'not-found-actions', 'info-button', 'info-button-secondary']) {
    assert.match(notFound, new RegExp(`class=["'][^"']*\\b${className}\\b[^"']*["']`), `404 must include .${className}`);
    assert.match(infoCss, new RegExp(`\\.${className}\\b`), `info.css must define .${className}`);
  }
});

test('information pages retain the shared accented brand and footer layout', () => {
  for (const [name, page] of infoPages) {
    assert.match(page, /class=["']brand["'][^>]*>[^<]*<span\b/i, `${name} brand must include its accent span`);
    assert.match(page, /class=["'][^"']*\bfooter-grid\b[^"']*["']/i, `${name} must use the shared footer grid`);
  }
});

test('legacy publisher is manual only', () => {
  assert.match(workflow, /^name:\s*Legacy News Publisher \(Manual Only\)\s*$/m);
  assert.match(workflow, /^\s*workflow_dispatch\s*:/m);
  assert.doesNotMatch(workflow, /^\s*schedule\s*:/m);
  assert.doesNotMatch(workflow, /\bcron\s*:/i);
  assert.match(workflow, /Legacy manual news:/);
});

test('sitemap exposes exactly the four portal pages', () => {
  const locations = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
  const expected = new Set([
    'https://globalhot.net/',
    'https://globalhot.net/about.html',
    'https://globalhot.net/privacy.html',
    'https://globalhot.net/terms.html'
  ]);
  assert.equal(locations.length, 4);
  assert.deepEqual(new Set(locations), expected);
  assert.doesNotMatch(sitemap, /\/posts\//i);
  assert.match(sitemap, /<loc>https:\/\/globalhot\.net\/<\/loc>\s*<lastmod>2026-08-01<\/lastmod>\s*<changefreq>daily<\/changefreq>\s*<priority>1\.0<\/priority>/s);
  assert.match(sitemap, /<loc>https:\/\/globalhot\.net\/about\.html<\/loc>\s*<lastmod>2026-08-01<\/lastmod>\s*<changefreq>monthly<\/changefreq>\s*<priority>0\.7<\/priority>/s);
  assert.match(sitemap, /<loc>https:\/\/globalhot\.net\/(?:privacy|terms)\.html<\/loc>\s*<lastmod>2026-08-01<\/lastmod>\s*<changefreq>yearly<\/changefreq>\s*<priority>0\.4<\/priority>/s);
});

test('information stylesheet provides responsive readable page rules', () => {
  assert.ok(infoCss.trim().length > 0);
  assert.match(infoCss, /@media\s*\(/i);
  assert.match(infoCss, /\.(?:info-main|info-wrap|info-kicker|info-callout|principle-grid)\b/);
});

test('privacy page discloses local fallback and pseudonymous global recommendations', () => {
  assert.match(privacy, /globalhot-demo-recommendations-v1/);
  assert.match(privacy, /globalhot-recommendations-v2/);
  assert.match(privacy, /(?:D1.{0,80}(?:미연결|오류)|(?:미연결|오류).{0,80}D1)/s);
  assert.match(privacy, /SHA-256/);
  assert.match(privacy, /(?:IP 주소.{0,80}user-agent|user-agent.{0,80}IP 주소)/s);
  assert.match(privacy, /(?:모델 ID.{0,80}가명 해시.{0,80}추천 시각|가명 해시.{0,80}추천 시각)/s);
  assert.match(privacy, /원본 IP 주소.{0,80}원본 user-agent.{0,80}(?:저장하지 않|미저장)/s);
  assert.match(privacy, /중복 추천 방지.{0,80}1시간.{0,80}속도 제한/s);
});

test('privacy keeps each recommendation storage key once without a local-only contradiction', () => {
  assert.doesNotMatch(privacy, /현재 서버로 전송되지 않습니다/);
  assert.match(privacy, /개별 추천 전송이 실패하면.{0,80}로컬 추천으로 바꾸지 않고.{0,80}재시도/s);
  for (const key of ['globalhot-demo-recommendations-v1', 'globalhot-recommendations-v2']) {
    const uses = privacy.match(new RegExp(`<code>${key}<\\/code>`, 'g')) || [];
    assert.equal(uses.length, 1, `${key} must have one code-tag disclosure`);
  }
});
