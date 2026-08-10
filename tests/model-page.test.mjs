import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(projectRoot, 'model.html'), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function shim(tag) {
  const node = {
    tagName: String(tag || '').toUpperCase(),
    children: [],
    listeners: {},
    textContent: '',
    className: '',
    attributes: {},
    nodeType: 1,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    append(...nodes) { nodes.forEach((child) => this.appendChild(child)); },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index !== -1) this.children.splice(index, 1);
      child.parentNode = null;
    },
    addEventListener(type, handler) { (this.listeners[type] = this.listeners[type] || []).push(handler); },
    removeEventListener() {},
    querySelector(selector) {
      const last = selector.trim().split(/\s+/).pop();
      const out = [];
      (function walk(n) {
        for (const child of n.children) {
          if (last.startsWith('.')
            ? String(child.className || '').split(/\s+/).includes(last.slice(1))
            : child.tagName === last.toUpperCase()) out.push(child);
          walk(child);
        }
      })(this);
      return out[0] || null;
    },
    querySelectorAll(selector) {
      const last = selector.trim().split(/\s+/).pop();
      const out = [];
      (function walk(n) {
        for (const child of n.children) {
          if (last.startsWith('.')
            ? String(child.className || '').split(/\s+/).includes(last.slice(1))
            : child.tagName === last.toUpperCase()) out.push(child);
          walk(child);
        }
      })(this);
      return out;
    },
    replaceWith(node) { this.replacedWith = node; node.parentNode = this.parentNode; },
    after(node) { this.afterNode = node; node.parentNode = this; },
    replaceChildren(...nodes) { this.children = nodes; },
  };
  return node;
}

const remoteModel = {
  id: 'enako',
  name: 'Enako',
  altName: '',
  country: 'JAPAN',
  tags: 'cosplay gravure',
  photoAvailable: true,
  photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/b/x.jpg/250px-x.jpg',
  license: 'CC BY 3.0',
  creditText: 'Some photographer',
  creditUrl: 'https://example.com',
  bio: 'Japanese cosplayer and gravure model.',
  birth: '1994-01-22',
  origin: '아이치현 나고야',
  occupation: '코스프레 모델',
  yearsActive: '2008 -',
  agency: 'PP 엔터프라이즈',
  notable: ['주간 영점프 표지', '사진집 《에나코 cosplayer》'],
  awards: ['탑커버 어워드'],
  recent: ['유튜브·Twitch 게임 방송'],
  officialUrl: '',
  sns: {},
};

function run(overrides = {}) {
  const stateEl = shim('div');
  stateEl.replaceWith = function (node) { this.replacedWith = node; };

  const metaEls = {};
  const metaFor = (attr, key) => (metaEls[`${attr}:${key}`] ||= Object.assign(shim('meta'), {
    attributes: { [attr]: key },
  }));

  const layers = {
    console: { warn() {}, error() {}, log() {} },
    window: {
      location: { search: '?id=enako' },
      fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [remoteModel] }) }),
    },
    document: {
      getElementById: () => stateEl,
      querySelector: (selector) => {
        if (selector === 'link[rel="canonical"]') return { setAttribute: () => {} };
        const m = selector.match(/meta\[(property|name)="([^"]+)"\]/);
        if (m) return metaFor(m[1], m[2]);
        return null;
      },
      querySelectorAll: () => [],
      createElement: shim,
      createTextNode: (t) => Object.assign(shim('#text'), { nodeType: 3, textContent: String(t) }),
      createElementNS: (ns, tagName) => shim(tagName),
      head: { appendChild: () => {} },
    },
    URLSearchParams,
    Promise,
    Number,
    String,
    Object,
    Array,
    Math,
    JSON,
    encodeURIComponent,
  };
  Object.assign(layers, overrides);
  layers.window.fetch = overrides.fetch || layers.window.fetch;
  vm.createContext(layers);
  const result = {};
  result.evalPromise = (async () => {
    vm.runInContext(src, layers, { filename: 'model.html' });
    return result;
  })();
  result.layers = layers;
  result.stateEl = stateEl;
  result.metaEls = metaEls;
  return result;
}

test('detail page mounts a published profile header with a working monogram fallback', async () => {
  const { evalPromise, stateEl } = run();
  await evalPromise;
  await new Promise((resolve) => setTimeout(resolve, 30));

  const header = stateEl.replacedWith;
  assert.ok(header, 'mount must replace the loading state');
  const portrait = header.querySelector('.portrait');
  assert.ok(portrait, 'portrait present');
  const img = portrait.querySelector('img');
  assert.ok(img, 'published model renders an <img>');
  assert.match(img.src, /640px-/, 'remote thumbnails are upgraded to 640px');

  img.listeners.error[0]();
  assert.equal(portrait.getAttribute('data-monogram'), 'E', 'monogram set on error');
  assert.equal(portrait.querySelector('img'), null, 'broken img is removed');
  assert.ok(portrait.querySelector('span'), 'NO PHOTO span appears');
});

test('detail page renders the minimal profile rail without structured-field duplication', async () => {
  const { evalPromise, stateEl } = run();
  await evalPromise;
  await new Promise((resolve) => setTimeout(resolve, 30));

  const header = stateEl.replacedWith;
  const section = header.afterNode;
  assert.ok(section, 'bio section follows the header');
  assert.equal(section.className, 'profile-section');

  const rail = section.querySelector('.profile-rail');
  assert.ok(rail, 'rail present');
  const railText = (function collect(n, acc) {
    acc = acc || [];
    for (const child of n.children || []) {
      if (child.textContent) acc.push(child.textContent);
      collect(child, acc);
    }
    return acc;
  })(rail, []).join(' ');
  assert.ok(railText.includes('카테고리') && railText.includes('국가'), 'rail keeps category + country');
  // The bio already narrates birth/origin/agency; the rail must not duplicate them.
  for (const label of ['출생', '출신', '직업', '활동 기간', '소속사']) assert.ok(!railText.includes(label), `rail must not repeat ${label}`);

  assert.equal(section.afterNode, undefined, 'no highlight section rendered');
});

test('remote photoUrl produces a single-host absolute og:image', async () => {
  const { evalPromise, metaEls } = run();
  await evalPromise;
  await new Promise((resolve) => setTimeout(resolve, 30));

  const og = metaEls['property:og:image'];
  assert.ok(og, 'og:image meta appended');
  const content = og.attributes.content;
  assert.ok(/^https:\/\/[^/]+\//.test(content), `og:image is absolute: ${content}`);
  assert.doesNotMatch(content, /https:\/\/[^/]+\/https:\/\//, 'no doubled host');
  assert.match(content, /640px-/, 'og:image uses the 640px thumbnail');
});

test('a no-photo model renders the monogram immediately without throwing', async () => {
  const bare = {
    id: 'bare', name: 'Bare Test', altName: '', country: 'JAPAN', tags: 'model',
    photoAvailable: false, photoUrl: '', officialUrl: '', sns: {}, bio: 'x',
  };
  const { evalPromise, stateEl, layers } = run({
    window: {
      location: { search: '?id=bare' },
      fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [bare] }) }),
    },
  });
  await evalPromise;
  await new Promise((resolve) => setTimeout(resolve, 30));

  const header = stateEl.replacedWith;
  assert.ok(header, 'no-photo model still mounts');
  const portrait = header.querySelector('.portrait');
  assert.equal(portrait.getAttribute('data-monogram'), 'BT');
  assert.ok(portrait.querySelector('span'), 'NO PHOTO span present');
  assert.equal(portrait.querySelector('img'), null);
  void layers;
});

test('detail page renders a functional comments section per model', async () => {
  const comments = [
    { authorName: '테스터', content: '멋진 프로필이네요.', createdAt: '2026-08-11T01:00:00.000Z' },
  ];
  const fetchImpl = (url) => {
    if (String(url).includes('/api/comments/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, comments }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [remoteModel] }) });
  };
  const { evalPromise, stateEl, layers } = run({ fetch: fetchImpl });
  await evalPromise;
  await new Promise((resolve) => setTimeout(resolve, 30));

  const header = stateEl.replacedWith;
  const commentsSection = header.querySelector('.profile-comments');
  assert.ok(commentsSection, 'comments section exists');
  assert.equal(commentsSection.className, 'profile-comments');
  assert.ok(commentsSection.querySelector('.comments-form'), 'comment form present');
  assert.ok(commentsSection.querySelector('.comment-list'), 'comment list present');
  assert.ok(commentsSection.querySelector('.comment-item'), 'comment list renders an item');
  assert.equal(commentsSection.querySelector('.comment-item .comment-body').textContent, '멋진 프로필이네요.');
});