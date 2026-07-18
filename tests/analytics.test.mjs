import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function findHtml(dir) {
  const entries = await readdir(dir);
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const info = await stat(path);
    if (info.isDirectory()) files.push(...await findHtml(path));
    else if (path.endsWith('.html')) files.push(path);
  }

  return files;
}

async function publishedHtmlFiles() {
  const rootEntries = await readdir(root);
  const rootHtml = [];
  for (const entry of rootEntries) {
    const path = join(root, entry);
    if (path.endsWith('.html') && (await stat(path)).isFile()) rootHtml.push(path);
  }
  return [
    ...rootHtml,
    ...await findHtml(join(root, 'posts')),
    ...await findHtml(join(root, 'quiz'))
  ];
}

function dataLayerEntries(window) {
  return window.dataLayer.map((entry) => Array.from(entry));
}

function runLoader(source, pathname, options = {}) {
  const appended = [];
  const listeners = new Map();
  const stored = new Map();
  if (options.choice) stored.set('gh-consent-v1', options.choice);
  let cookie = options.cookie || '';
  let reloadCount = 0;
  const search = options.search || '';
  const pageType = options.pageType || null;
  const window = {
    location: {
      pathname,
      origin: 'https://globalhot.net',
      hostname: 'globalhot.net',
      href: `https://globalhot.net${pathname}${search}`,
      search,
      reload: () => { reloadCount += 1; }
    },
    dataLayer: [],
    localStorage: {
      getItem: (key) => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, value),
      removeItem: (key) => stored.delete(key)
    }
  };
  const document = {
    title: options.title || '',
    readyState: 'loading',
    currentScript: {
      getAttribute: (name) => name === 'data-page-type' ? pageType : null
    },
    head: { appendChild: (node) => appended.push(node) },
    body: { appendChild() {} },
    createElement: () => ({}),
    getElementById: () => null,
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    get cookie() { return cookie; },
    set cookie(value) { cookie = value; }
  };

  vm.runInNewContext(source, { window, document, Date, encodeURIComponent });
  return {
    window,
    document,
    appended,
    stored,
    get reloadCount() { return reloadCount; },
    finishParsing(title = 'Parsed GlobalHot title') {
      document.title = title;
      document.readyState = 'complete';
      for (const callback of listeners.get('DOMContentLoaded') || []) {
        if (callback.name === 'loadAnalytics') callback();
      }
    }
  };
}

test('every published HTML page loads the blocking consent loader exactly once', async () => {
  const htmlFiles = await publishedHtmlFiles();
  assert.ok(htmlFiles.length >= 28);

  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    assert.equal((html.match(/<script src="\/analytics\.js"(?: data-page-type="not_found")?><\/script>/g) || []).length, 1, file);
    assert.doesNotMatch(html, /analytics\.js" defer/, file);
    assert.doesNotMatch(html, /googletagmanager\.com\/gtag\/js\?id=G-C8MS3D3NTV/, file);
    assert.doesNotMatch(html, /id="cookieBanner"|id="cookieAccept"/, file);
  }

  const notFound = await readFile(join(root, '404.html'), 'utf8');
  assert.match(notFound, /<script src="\/analytics\.js" data-page-type="not_found"><\/script>/);
});

test('every post generator includes the consent loader in post and archive templates', async () => {
  for (const name of ['generate-daily-post.mjs', 'generate-weekly-post.mjs', 'generate-backfill.mjs']) {
    const source = await readFile(join(root, 'scripts', name), 'utf8');
    assert.equal((source.match(/<script src="\/analytics\.js"><\/script>/g) || []).length, 2, name);
    assert.doesNotMatch(source, /analytics\.js" defer/, name);
  }
});

test('GA4 stays unloaded until explicit consent and supports reject or withdrawal', async () => {
  const source = await readFile(join(root, 'analytics.js'), 'utf8');
  const runtime = runLoader(source, '/vix-guide.html', {
    search: '?email=victim@example.com#fragment'
  });

  let entries = dataLayerEntries(runtime.window);
  assert.equal(runtime.appended.length, 0);
  assert.equal(runtime.window.adsbygoogle.pauseAdRequests, 1);
  assert.equal(runtime.window['ga-disable-G-C8MS3D3NTV'], undefined);
  assert.ok(entries.some((entry) => entry[0] === 'consent' && entry[1] === 'default' && entry[2].analytics_storage === 'denied'));
  assert.ok(entries.some((entry) => entry[0] === 'consent' && entry[1] === 'default' && entry[2].ad_personalization === 'denied'));
  assert.equal(entries.some((entry) => entry[0] === 'config'), false);

  runtime.window.gtag('event', 'quiz_start', { quiz_id: 'private-before-consent' });
  assert.equal(dataLayerEntries(runtime.window).some((entry) => entry[0] === 'event'), false);

  runtime.window.globalhotConsent.setChoice('accepted');
  assert.equal(runtime.appended.length, 0, 'head-time consent must wait for the parsed title');
  runtime.finishParsing('VIX parsed title');
  entries = dataLayerEntries(runtime.window);
  const config = entries.find((entry) => entry[0] === 'config');
  assert.equal(runtime.appended.length, 1);
  assert.equal(runtime.stored.get('gh-consent-v1'), 'accepted');
  assert.equal(config[2].page_location, 'https://globalhot.net/vix-guide.html');
  assert.equal(config[2].page_path, '/vix-guide.html');
  assert.equal(config[2].content_group, 'evergreen_guide');
  assert.equal(config[2].page_title, 'VIX parsed title');
  assert.doesNotMatch(JSON.stringify(config), /victim|email|fragment/);
  const acceptedUpdate = entries.find((entry) => entry[0] === 'consent' && entry[1] === 'update' && entry[2].analytics_storage === 'granted');
  assert.equal(acceptedUpdate[2].ad_storage, undefined, 'custom analytics consent must not grant ad consent');

  runtime.window.gtag('event', 'quiz_start', { quiz_id: 'allowed' });
  assert.equal(dataLayerEntries(runtime.window).filter((entry) => entry[0] === 'event').length, 1);

  runtime.window.globalhotConsent.setChoice('accepted');
  assert.equal(runtime.appended.length, 1, 'GA script must not be appended twice');

  runtime.window.globalhotConsent.setChoice('rejected');
  assert.equal(runtime.window.globalhotConsent.hasAnalyticsConsent(), false);
  assert.equal(runtime.window['ga-disable-G-C8MS3D3NTV'], true);
  assert.equal(runtime.reloadCount, 1, 'withdrawal reloads to tear down the active GA runtime');
  assert.equal(runtime.stored.get('gh-consent-v1'), 'rejected');
  runtime.window.gtag('event', 'quiz_finish', { quiz_id: 'blocked-after-withdrawal' });
  assert.equal(dataLayerEntries(runtime.window).filter((entry) => entry[0] === 'event').length, 1);
});

test('returning consent choices are applied before analytics can load', async () => {
  const source = await readFile(join(root, 'analytics.js'), 'utf8');
  const accepted = runLoader(source, '/', { choice: 'accepted' });
  const rejected = runLoader(source, '/', { choice: 'rejected' });

  assert.equal(accepted.appended.length, 0);
  assert.equal(dataLayerEntries(accepted.window).some((entry) => entry[0] === 'config'), false);
  accepted.finishParsing('Home title after parsing');
  assert.equal(accepted.appended.length, 1);
  const acceptedConfig = dataLayerEntries(accepted.window).find((entry) => entry[0] === 'config');
  assert.equal(acceptedConfig[2].page_title, 'Home title after parsing');
  assert.equal(rejected.appended.length, 0);
  assert.equal(dataLayerEntries(rejected.window).some((entry) => entry[0] === 'config'), false);
  assert.equal(rejected.window.adsbygoogle.pauseAdRequests, 1);
});

test('shared loader assigns bounded revenue groups and isolates 404 traffic', async () => {
  const source = await readFile(join(root, 'analytics.js'), 'utf8');
  const cases = [
    ['/', 'home'],
    ['/index.html', 'home'],
    ['/quiz/', 'quiz'],
    ['/quiz/index.html', 'quiz'],
    ['/posts/', 'daily_briefing'],
    ['/posts/2026-07-18.html', 'daily_briefing'],
    ['/analysis-fed-delay.html', 'analysis'],
    ['/guide.html', 'evergreen_guide'],
    ['/vix-guide.html', 'evergreen_guide'],
    ['/future-topic-guide.html', 'evergreen_guide'],
    ['/market-indicators.html', 'evergreen_guide'],
    ['/about.html', 'trust_policy'],
    ['/posts-spam', 'other'],
    ['/quiz-anything', 'other'],
    ['/new-topic.html', 'other']
  ];

  for (const [pathname, expected] of cases) {
    const runtime = runLoader(source, pathname, { choice: 'accepted' });
    runtime.finishParsing();
    const config = dataLayerEntries(runtime.window).find((entry) => entry[0] === 'config');
    assert.equal(config[2].content_group, expected, pathname);
  }

  for (const pathname of ['/fake-guide.html', '/posts-spam', '/quiz-anything']) {
    const runtime = runLoader(source, pathname, { choice: 'accepted', pageType: 'not_found' });
    runtime.finishParsing();
    const config = dataLayerEntries(runtime.window).find((entry) => entry[0] === 'config');
    assert.equal(config[2].content_group, 'not_found', pathname);
  }
});

test('VIX guide is indexable, sourced, and connected to the quiz', async () => {
  const html = await readFile(join(root, 'vix-guide.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/globalhot\.net\/vix-guide\.html"/);
  assert.match(html, /www\.cboe\.com\/tradable_products\/vix/);
  assert.match(html, /tradable-products\/vix\/faqs\//);
  assert.match(html, /href="\/quiz\/"/);
  assert.match(html, /매수·매도를 권유하지 않습니다/);

  for (const path of ['index.html', 'guide.html', join('quiz', 'index.html')]) {
    const source = await readFile(join(root, path), 'utf8');
    assert.match(source, /href="\/vix-guide\.html"/, path);
  }

  const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
  assert.equal((sitemap.match(/https:\/\/globalhot\.net\/vix-guide\.html/g) || []).length, 1);

  const generator = await readFile(join(root, 'scripts', 'generate-daily-post.mjs'), 'utf8');
  assert.equal((generator.match(/\$\{SITE_URL\}\/vix-guide\.html/g) || []).length, 1);
});
