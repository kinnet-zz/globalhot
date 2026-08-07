import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPages } from '../scripts/build-pages.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load the real portal.js source and the reconciled dist data (exactly what
// production serves after prepare-data runs). This test exists because the
// original "Failed to load model profiles" crash was a createModelCard throw
// that no unit test exercised — schema tests passed while rendering exploded.
const script = await readFile(path.join(projectRoot, 'portal.js'), 'utf8');
await buildPages();
const modelsData = JSON.parse(
  await readFile(path.join(projectRoot, 'dist', 'data', 'models.json'), 'utf8'),
);

// Minimal DOM shim. createModelCard only uses a small surface (createElement,
// createTextNode, setAttribute, appendChild, querySelector by tag/class,
// dataset, addEventListener). This is NOT a full DOM — just enough to drive
// createModelCard deterministically and inspect what it built.
function createShimNode(tagName) {
  const children = [];
  const listeners = {};
  const attributes = {};
  const node = {
    tagName: String(tagName || '').toUpperCase(),
    nodeType: 1,
    className: '',
    dataset: {},
    textContent: '',
    src: '',
    alt: '',
    value: '',
    disabled: false,
    hidden: false,
    type: '',
    parentNode: null,
    children,
    listeners,
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; },
    removeAttribute(name) { delete attributes[name]; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name); },
    appendChild(child) { child.parentNode = node; children.push(child); return child; },
    append(...nodes) { nodes.forEach((child) => { child.parentNode = node; children.push(child); }); },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index !== -1) children.splice(index, 1);
      child.parentNode = null;
      return child;
    },
    remove() { if (node.parentNode) node.parentNode.removeChild(node); },
    addEventListener(type, handler) { (listeners[type] = listeners[type] || []).push(handler); },
    removeEventListener() {},
    querySelector(selector) { return queryShim(node, selector)[0] || null; },
    querySelectorAll(selector) { return queryShim(node, selector); },
  };
  return node;
}

function matchesShim(node, selector) {
  const trimmed = selector.trim();
  if (trimmed.startsWith('.')) {
    return String(node.className || '').split(/\s+/).includes(trimmed.slice(1));
  }
  if (trimmed.startsWith('#')) return false; // not used by createModelCard
  return node.tagName === trimmed.toUpperCase();
}

function queryShim(root, selector) {
  // createModelCard only uses single selectors (tag or .class). Match the last
  // token so descendant combinators are tolerated but not relied upon.
  const tokens = selector.trim().split(/\s+/);
  const last = tokens[tokens.length - 1];
  const out = [];
  (function walk(n) {
    for (const child of n.children) {
      if (matchesShim(child, last)) out.push(child);
      walk(child);
    }
  })(root);
  return out;
}

function loadPortalDynamic() {
  // Expose the dynamic-IIFE helpers onto globalThis so tests can drive them
  // directly. The injection sits right before initDynamicModels so all the
  // helpers above it are already declared in the IIFE scope.
  const instrumented = script.replace(
    '  function initDynamicModels() {',
    '  globalThis.__portalDynamic = { createModelCard, isValidModel, renderCards, buildMonogram, selectPublishedModels };\n\n  function initDynamicModels() {',
  );
  const context = {
    document: {
      readyState: 'complete',
      createElement: createShimNode,
      createTextNode(text) { const node = createShimNode('#text'); node.nodeType = 3; node.textContent = String(text); return node; },
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
    },
    console: { warn: () => {}, error: () => {}, debug: () => {}, log: () => {} },
    window: {},
  };
  new vm.Script(instrumented).runInNewContext(context);
  assert.ok(context.__portalDynamic, 'portal helpers must be exposed for testing');
  return context.__portalDynamic;
}

const dyn = loadPortalDynamic();
const allModels = modelsData.models;

test('createModelCard renders every production model without throwing', () => {
  // This is the regression that caused "Failed to load model profiles": one bad
  // model threw inside createModelCard, the whole fetch chain rejected, and the
  // page showed a load failure. Every real model must now render an <article>.
  for (const model of allModels) {
    const card = dyn.createModelCard(model, 0);
    assert.ok(card, `${model.id}: createModelCard must return a node`);
    assert.equal(card.tagName, 'ARTICLE', `${model.id}: card must be an <article>`);
    assert.equal(card.dataset.modelId, model.id, `${model.id}: dataset.modelId must match`);
  }
});

test('isValidModel accepts every production model and rejects malformed entries', () => {
  for (const model of allModels) {
    assert.equal(dyn.isValidModel(model), true, `${model.id}: real data must be valid`);
  }
  assert.equal(dyn.isValidModel(null), false);
  assert.equal(dyn.isValidModel(undefined), false);
  assert.equal(dyn.isValidModel({}), false, 'empty object is invalid');
  assert.equal(dyn.isValidModel({ id: '', name: 'X', country: 'Y', tags: 'z', sns: {} }), false, 'empty id invalid');
  assert.equal(dyn.isValidModel({ id: 'x', name: 'X', country: 'Y', tags: 5, sns: {} }), false, 'numeric tags invalid');
  assert.equal(dyn.isValidModel({ id: 'x', name: 'X', country: 'Y', tags: 'z', sns: 'no' }), false, 'string sns invalid');
  assert.equal(dyn.isValidModel({ id: 'x', name: 'X', country: 'Y', tags: 'z', sns: null }), false, 'null sns invalid');
});

test('selectPublishedModels keeps only photo-bearing models and orders gravure first', () => {
  // The directory must not flood with photo-less monogram cards. This gate is
  // what hides the ~170 entries that have no real profile photo after reconcile.
  const expected = allModels.filter((model) => model.photoAvailable === true);
  assert.ok(expected.length >= 1, 'fixture must include photo-bearing models');

  const published = dyn.selectPublishedModels(allModels);
  assert.equal(published.length, expected.length, 'only photoAvailable models are published');
  assert.deepEqual(
    published.map((model) => model.id).slice().sort(),
    expected.map((model) => model.id).slice().sort(),
    'no models are added or dropped by the gravure-first ordering',
  );
  for (const model of published) {
    assert.equal(model.photoAvailable, true, `${model.id}: every published model has a photo`);
  }

  // Directory priority: every gravure/cosplay/bikini model leads the feed ahead
  // of any general model or actor with a photo. `priorityOf` classifies by
  // tag containment, and the set is sorted with gravure-class entries first.
  const priorityTags = ['gravure', 'cosplay', 'bikini', 'swimsuit', 'racing'];
  function isPriority(tags) {
    const hay = String(tags || '').toLowerCase();
    return priorityTags.some(function (t) { return hay.indexOf(t) !== -1; });
  }
  const firstGeneralIndex = published.findIndex(function (model) {
    return !isPriority(model.tags);
  });
  if (firstGeneralIndex !== -1) {
    for (let i = 0; i < firstGeneralIndex; i += 1) {
      assert.ok(isPriority(published[i].tags), `${published[i].id}: gravure-class model leads the feed`);
    }
  }

  // Edge cases: non-array and empty input never throw. Compare by length
  // (a primitive) rather than deepEqual against a [] literal — the helper runs
  // inside a vm sandbox, so its returned array lives in a different realm and
  // assert/strict rejects a cross-realm deepStrictEqual against a host [].
  assert.equal(dyn.selectPublishedModels(undefined).length, 0);
  assert.equal(dyn.selectPublishedModels([]).length, 0);
  assert.equal(dyn.selectPublishedModels([{ id: 'a', photoAvailable: false }]).length, 0);
});

test('renderCards isolates failures so one broken model never kills the batch', () => {
  // A poison model that PASSES isValidModel (tags is an array) but THROWS inside
  // createModelCard (a null tag has no .charAt). renderCards must skip it and
  // keep rendering the good neighbours on both sides.
  const grid = createShimNode('div');
  const goodBefore = { id: 'good-1', name: 'Good Before', country: 'JAPAN', tags: 'model gravure', sns: {} };
  const poison = { id: 'poison', name: 'Poison', country: 'JAPAN', tags: [null], sns: {} };
  const goodAfter = { id: 'good-2', name: 'Good After', country: 'KOREA', tags: 'model', sns: {} };
  assert.equal(dyn.isValidModel(poison), true, 'poison must pass validation (so the try/catch is what saves us)');

  dyn.renderCards([goodBefore, poison, goodAfter], grid, 0);

  const renderedIds = grid.children.map((card) => card.dataset.modelId);
  assert.deepEqual(renderedIds, ['good-1', 'good-2'], 'both good models render, poison is skipped');
});

test('renderCards skips models that fail validation', () => {
  const grid = createShimNode('div');
  const good = { id: 'good', name: 'Good', country: 'JAPAN', tags: 'model', sns: {} };
  const malformed = { id: 'bad', name: 'Bad', country: 'Y', tags: 7, sns: {} };
  dyn.renderCards([good, malformed], grid, 0);
  assert.deepEqual(grid.children.map((c) => c.dataset.modelId), ['good']);
});

test('photo load failure falls back to monogram instead of a broken image', () => {
  const photoModel = allModels.find((model) => model.photoAvailable);
  assert.ok(photoModel, 'fixture must include at least one photoAvailable model');
  const card = dyn.createModelCard(photoModel, 0);
  const portrait = card.children[0];

  const img = portrait.children.find((child) => child.tagName === 'IMG');
  assert.ok(img, 'a photoAvailable model starts with an <img>');
  assert.ok(img.listeners.error && img.listeners.error.length === 1, 'img must register an error handler');

  // Simulate the 404 / decode failure that fires img.onerror in a browser.
  img.listeners.error[0]();

  assert.equal(portrait.getAttribute('data-monogram'), dyn.buildMonogram(photoModel.name), 'monogram is set');
  assert.equal(portrait.children.find((child) => child.tagName === 'IMG'), undefined, 'broken img is removed');
  assert.ok(portrait.children.find((child) => child.tagName === 'SPAN'), 'NO PHOTO span is present');
});

test('a no-photo model renders the monogram immediately', () => {
  const noPhoto = allModels.find((model) => !model.photoAvailable);
  assert.ok(noPhoto);
  const card = dyn.createModelCard(noPhoto, 0);
  const portrait = card.children[0];
  assert.equal(portrait.getAttribute('data-monogram'), dyn.buildMonogram(noPhoto.name));
  assert.equal(portrait.children.find((child) => child.tagName === 'IMG'), undefined);
  assert.ok(portrait.children.find((child) => child.tagName === 'SPAN'));
});

test('models with real source data render official links, nofollow-free', () => {
  const enako = allModels.find((model) => model.id === 'enako');
  assert.ok(enako, 'enako fixture present');
  const card = dyn.createModelCard(enako, 0);
  const sourceLinks = card.querySelector('.source-links');
  assert.ok(sourceLinks, 'source-links block exists');
  const labels = sourceLinks.children.map((anchor) => anchor.textContent);
  assert.deepEqual(labels, ['Official Profile', 'X', 'Instagram', 'YouTube']);
  for (const anchor of sourceLinks.children) {
    // Links are built via property assignment (anchor.target/rel/href), matching
    // the existing createModelCard style, so assert on the properties directly.
    assert.equal(anchor.target, '_blank');
    assert.doesNotMatch(anchor.rel, /nofollow/, 'official links are followed');
    assert.match(anchor.rel, /noopener/);
  }
});

test('source links show only real channels — no fabricated "Find on" search links', () => {
  // A profile with zero real links gets a single honest "Search" escape hatch.
  const bare = { id: 'bare-test', name: 'Bare Test', altName: '', country: 'JAPAN', tags: 'model', sns: {} };
  const bareCard = dyn.createModelCard(bare, 0);
  const bareLinks = bareCard.querySelector('.source-links');
  assert.deepEqual(bareLinks.children.map((anchor) => anchor.textContent), ['Search']);
  for (const anchor of bareLinks.children) {
    assert.equal(anchor.target, '_blank');
    assert.match(anchor.rel, /nofollow/, 'the sole Search escape hatch is nofollow');
    assert.match(anchor.href, /^https?:\/\//, 'search href is absolute');
  }

  // A profile with SOME (not all) channels shows exactly those — never a
  // "Find on YouTube" / "Find on X" placeholder for the missing ones.
  const partial = {
    id: 'partial-test', name: 'Partial', altName: '', country: 'JAPAN', tags: 'model',
    officialUrl: 'https://example.com/', sns: { x: 'https://twitter.com/partial' },
  };
  const partialCard = dyn.createModelCard(partial, 0);
  const partialLinks = partialCard.querySelector('.source-links');
  assert.deepEqual(partialLinks.children.map((anchor) => anchor.textContent), ['Official Profile', 'X']);
  for (const anchor of partialLinks.children) {
    assert.doesNotMatch(anchor.rel, /nofollow/, 'real source links are followed');
  }
});

test('a fresh card hides the zero recommend count so it never reads as an empty social feature', () => {
  // A directory card that permanently shows "0 Recommend" looks like a broken
  // social feature. The count element must exist (the handler updates it) but
  // stay hidden until it is non-zero.
  const model = allModels.find((m) => m.photoAvailable) || allModels[0];
  const card = dyn.createModelCard(model, 0);

  const count = card.querySelector('.recommend-count');
  assert.ok(count, 'card exposes a recommend count element');
  assert.equal(count.hidden, true, 'a zero count is hidden by default');
  assert.equal(count.getAttribute('data-recommendation-count'), '', 'count carries the data hook the handler updates');

  const buttons = card.querySelectorAll('.recommend-button');
  assert.equal(buttons.length, 1, 'exactly one recommend button per card');
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'false', 'button starts in the not-pressed state');
});

test('cards stay clean — no per-card photo credit, verified date, or registered-tag line', () => {
  // The card no longer advertises "Photo · CC … · Wikimedia Commons", a
  // "Verified YYYY.MM.DD" date, or "Official profile · N registered tags".
  // Attribution is consolidated once on the about page; a card keeps only its
  // photo, category, name, tag chips, official source links, and detail CTA.
  for (const model of allModels.slice(0, 12)) {
    const card = dyn.createModelCard(model, 0);
    assert.equal(card.querySelector('.photo-credit'), null, `${model.id}: no per-card photo-credit footnote`);
    assert.equal(card.querySelector('.profile-line'), null, `${model.id}: no registered-tag line`);
    assert.equal(card.querySelector('time'), null, `${model.id}: no card footer date`);
  }

  const enakoModel = allModels.find((m) => m.id === 'enako') || allModels.find((m) => m.photoAvailable) || allModels[0];
  const card = dyn.createModelCard(enakoModel, 0);
  assert.equal(card.querySelector('.photo-credit'), null, 'no per-card photo-credit footnote');
  assert.equal(card.querySelector('.source-credit'), null, 'the verbose "verified source" box is gone');
  assert.equal(card.querySelector('.rights-badge'), null, 'the old separate rights-badge is gone');
  assert.ok(card.querySelector('.source-links'), 'official source links remain on the card');
});

test('attribution is consolidated on the about page, not scattered on every card', async () => {
  // Credits move off the cards and onto the about page's "프로필 사진 출처" list,
  // generated at build time from the reconciled photo-bearing models.
  await buildPages();
  const about = await readFile(path.join(projectRoot, 'dist', 'about.html'), 'utf8');
  assert.match(about, /프로필 사진 출처/);
  assert.match(about, /credit-model/);
  assert.doesNotMatch(about, /<!-- PHOTO-CREDITS -->/, 'the placeholder must be replaced by real list items');
  const published = allModels.filter((m) => m.photoAvailable === true);
  assert.ok(published.length >= 1, 'fixture must include photo-bearing models');
  for (const model of published) {
    const display = model.altName ? `${model.name} (${model.altName})` : model.name;
    assert.match(about, new RegExp(escapeRegex(display)), `${display} is listed in the about credits`);
  }
  // The default CC/Wikimedia fallback is present for models without explicit license.
  assert.match(about, /CC BY-SA 4\.0/);
  assert.match(about, /Wikimedia Commons/);
});

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
