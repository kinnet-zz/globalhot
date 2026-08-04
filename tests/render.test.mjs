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
    '  globalThis.__portalDynamic = { createModelCard, isValidModel, renderCards, buildMonogram };\n\n  function initDynamicModels() {',
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

test('models with empty source data fall back to honest search links', () => {
  const bare = allModels.find((model) => !model.officialUrl && !(model.sns && model.sns.x));
  assert.ok(bare, 'fixture must include a model with no source data');
  const card = dyn.createModelCard(bare, 0);
  const sourceLinks = card.querySelector('.source-links');
  assert.ok(sourceLinks);
  const labels = sourceLinks.children.map((anchor) => anchor.textContent);
  assert.deepEqual(labels, ['Search', 'Find on X', 'Find on Instagram', 'Find on YouTube']);
  for (const anchor of sourceLinks.children) {
    assert.equal(anchor.target, '_blank');
    assert.match(anchor.rel, /nofollow/, 'generated search links are nofollow');
    assert.match(anchor.href, /^https?:\/\//, 'search href is absolute');
  }
});
