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
  ['about.html', about, 'https://globalhot.net/about.html'],
  ['privacy.html', privacy, 'https://globalhot.net/privacy.html'],
  ['terms.html', terms, 'https://globalhot.net/terms.html'],
  ['404.html', notFound, null]
];

test('information pages use the GlobalHot portal surface without the legacy UI', () => {
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

test('indexable information pages have structured SEO metadata and canonical URLs', () => {
  for (const [name, page, canonical] of infoPages.filter(([, , canonical]) => canonical)) {
    assert.match(page, /<meta\b[^>]*\bname=["']description["']/i, `${name} needs a description`);
    assert.match(page, /<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*index/i, `${name} must be indexable`);
    assert.match(page, new RegExp(`rel=["']canonical["'][^>]*href=["']${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i'));
  }
});

test('information pages retain the shared accented brand, footer, and legal links', () => {
  for (const [name, page] of infoPages) {
    assert.match(page, /class=["']brand["'][^>]*>[^<]*<span\b/i, `${name} brand must include its accent span`);
    assert.match(page, /class=["'][^"']*\bfooter-grid\b[^"']*["']/i, `${name} must use the shared footer grid`);
    for (const link of ['/about.html', '/privacy.html', '/terms.html']) {
      assert.match(page, new RegExp(`href=["']${link}["']`), `${name} must link to ${link}`);
    }
  }
});

test('about page lists the six official-source profiles and maintains a photo-free directory policy', () => {
  for (const name of ['Enako', 'Umi Shinonome', 'Nashiko Momotsuki', 'Ai Shinozaki', 'Kiko Mizuhara', 'Elaiza Ikeda']) {
    assert.match(about, new RegExp(name));
  }
  assert.match(about, /https:\/\/ppe\.jp\/talent\/enako\//);
  assert.match(about, /mailto:admin@globalhot\.net/);
  assert.doesNotMatch(about, /\/posts\//i);
});

test('terms page includes rights, recommendation integrity, reports, and disclosure contacts', () => {
  assert.match(terms, /mailto:admin@globalhot\.net/);
  assert.match(terms, /<section>/i);
  assert.match(terms, /GlobalHot/);
  assert.doesNotMatch(terms, /\/posts\//i);
});

test('privacy documents the three storage keys exactly once', () => {
  for (const key of ['gh-consent-v1', 'globalhot-local-recommendations-v1', 'globalhot-recommendations-v2']) {
    const uses = privacy.match(new RegExp(`<code>${key}<\\/code>`, 'g')) || [];
    assert.equal(uses.length, 1, `${key} must have one code-tag disclosure`);
  }
});

test('privacy describes IP-only recommendation hashing and does not promise local-only recommendations', () => {
  assert.match(privacy, /SHA-256/);
  assert.match(privacy, /IP[\s\S]{0,240}User-Agent/i);
  assert.match(privacy, /User-Agent[\s\S]{0,240}IP/i);
  assert.doesNotMatch(privacy, /현재 서버로 전송되지 않습니다/);
  assert.doesNotMatch(privacy, /원본 IP 주소.{0,80}원본 user-agent.{0,80}저장/i);
});

test('not-found page remains non-indexable and returns visitors to discovery', () => {
  assert.match(notFound, /<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*noindex/i);
  assert.match(notFound, /href=["']\/#discover["']/);
  assert.match(notFound, /href=["']\/["']/);
  assert.doesNotMatch(notFound, /\/posts\//i);
});

test('terms and not-found pages use the shared information page layout classes', () => {
  assert.match(terms, /class=["'][^"']*\binfo-main\b[^"']*["']/);
  assert.match(terms, /class=["'][^"']*\binfo-wrap\b[^"']*\blegal-copy\b[^"']*["']/);
  for (const className of ['not-found-main', 'not-found-wrap', 'not-found-actions', 'info-button', 'info-button-secondary']) {
    assert.match(notFound, new RegExp(`class=["'][^"']*\\b${className}\\b[^"']*["']`), `404 must include .${className}`);
    assert.match(infoCss, new RegExp(`\\.${className}\\b`), `info.css must define .${className}`);
  }
});

test('legacy publisher is manual only and does not schedule automatic post creation', () => {
  assert.match(workflow, /^name:\s*Legacy News Publisher \(Manual Only\)\s*$/m);
  assert.match(workflow, /^\s*workflow_dispatch\s*:/m);
  assert.doesNotMatch(workflow, /^\s*schedule\s*:/m);
  assert.doesNotMatch(workflow, /\bcron\s*:/i);
  assert.match(workflow, /Legacy manual news:/);
});

test('sitemap exposes exactly four current portal pages with their intended change frequencies', () => {
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
  assert.match(sitemap, /<loc>https:\/\/globalhot\.net\/about\.html<\/loc>[\s\S]*?<changefreq>monthly<\/changefreq>/);
  assert.equal((sitemap.match(/<changefreq>yearly<\/changefreq>/g) || []).length, 2);
});

test('information stylesheet provides responsive readable page rules', () => {
  assert.ok(infoCss.trim().length > 0);
  assert.match(infoCss, /@media\s*\(/i);
  assert.match(infoCss, /\.(?:info-main|info-wrap|info-kicker|info-callout|principle-grid)\b/);
  assert.match(infoCss, /\.not-found-actions\b/);
});
