import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { buildPages } from '../scripts/build-pages.mjs';

const [mergedRaw, gravureRaw, worldRaw] = await Promise.all([
  readFile('data/models.json', 'utf8'),
  readFile('data/gravure-models.json', 'utf8'),
  readFile('data/world-models.json', 'utf8')
]);

const merged = JSON.parse(mergedRaw);
const gravure = JSON.parse(gravureRaw);
const world = JSON.parse(worldRaw);

const REQUIRED_FIELDS = ['id', 'name', 'altName', 'country', 'tags', 'photoAvailable', 'officialUrl', 'sns'];
// Optional fields introduced for license-aware attribution. The gravure
// auto-add pipeline sets these on every model it adds; legacy models omit them
// and fall back to the CC/Wikimedia default in createModelCard. They are
// documented in the `fields` array but not required on every model.
const OPTIONAL_FIELDS = ['license', 'creditText', 'creditUrl'];
const SNS_FIELDS = ['x', 'instagram', 'youtube', 'tiktok'];
const FEATURED_IDS = ['enako', 'umi-shinonome', 'nashiko-momotsuki', 'ai-shinozaki', 'kiko-mizuhara', 'elaiza-ikeda'];

test('merged models.json declares the standardized schema and documents its lineage', () => {
  assert.equal(merged.title, 'GlobalHot Unified Model Directory');
  assert.deepEqual(merged.fields, [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);
  assert.deepEqual(merged.snsFields, SNS_FIELDS);
  assert.equal(merged.schemaVersion, 1);
  assert.match(merged.source, /gravure-models\.json/);
  assert.match(merged.source, /world-models\.json/);
  assert.equal(merged.modelCount, merged.models.length);
});

test('merged models.json contains every gravure and world entry with no duplicate IDs', () => {
  const ids = merged.models.map((model) => model.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(merged.models.length, merged.modelCount);
  // Every gravure ID is present.
  for (const model of gravure.models) assert.ok(ids.includes(model.id), `missing gravure id ${model.id}`);
  // Every world ID is present.
  for (const model of world.models) assert.ok(ids.includes(model.id), `missing world id ${model.id}`);
});

test('every merged model has the required fields with the correct types', () => {
  for (const model of merged.models) {
    for (const field of REQUIRED_FIELDS) assert.ok(field in model, `${model.id} missing ${field}`);
    assert.equal(typeof model.id, 'string');
    assert.ok(model.id.length > 0);
    assert.equal(typeof model.name, 'string');
    assert.ok(model.name.length > 0);
    assert.equal(typeof model.altName, 'string');
    assert.equal(typeof model.country, 'string');
    assert.ok(model.country.length > 0);
    assert.equal(typeof model.tags, 'string');
    assert.equal(typeof model.photoAvailable, 'boolean');
    assert.equal(typeof model.officialUrl, 'string');
    assert.equal(typeof model.sns, 'object');
    assert.ok(model.sns !== null);
    for (const field of SNS_FIELDS) {
      assert.equal(typeof model.sns[field], 'string', `${model.id} sns.${field} must be a string`);
    }
  }
});

test('the six official-source featured profiles are present with rich source data', () => {
  const byId = new Map(merged.models.map((model) => [model.id, model]));
  for (const id of FEATURED_IDS) {
    const model = byId.get(id);
    assert.ok(model, `featured id ${id} must exist in merged data`);
    assert.equal(model.country, 'JAPAN');
    assert.match(model.officialUrl, /^https:\/\//);
  }
  // Enako carries the full SNS set used by the live card.
  const enako = byId.get('enako');
  assert.match(enako.sns.x, /twitter\.com\/enako_cos/);
  assert.match(enako.sns.instagram, /instagram\.com\/enakorin/);
  assert.match(enako.sns.youtube, /youtube\.com/);
  // Elaiza Ikeda exposes TikTok in addition to Instagram.
  const elaiza = byId.get('elaiza-ikeda');
  assert.match(elaiza.sns.instagram, /elaiza_ikd/);
  assert.match(elaiza.sns.tiktok, /tiktok\.com/);
});

test('world-models.json no longer uses j-* aliases or the named typo IDs', () => {
  const ids = world.models.map((model) => model.id);
  for (const id of ids) assert.equal(id.startsWith('j-'), false, `legacy alias id remains: ${id}`);
  assert.equal(ids.includes('w-slawshantz'), false, 'w-slawshantz typo id must be renamed');
  assert.equal(ids.includes('w-haley'), false, 'w-haley typo id must be renamed');
  // Canonical renames are present.
  for (const id of ['enako', 'umi-shinonome', 'ai-shinozaki', 'nashiko-momotsuki', 'kiko-mizuhara', 'elaiza-ikeda', 'miku-tanaka']) {
    assert.ok(ids.includes(id), `canonical id ${id} missing from world-models`);
  }
});

test('world-models.json and gravure-models.json each have unique IDs and the two new featured profiles', () => {
  const worldIds = world.models.map((model) => model.id);
  const gravureIds = gravure.models.map((model) => model.id);
  assert.equal(new Set(worldIds).size, worldIds.length);
  assert.equal(new Set(gravureIds).size, gravureIds.length);
  for (const id of ['kiko-mizuhara', 'elaiza-ikeda']) {
    assert.ok(worldIds.includes(id), `world-models must include ${id}`);
    assert.ok(gravureIds.includes(id), `gravure-models must include ${id}`);
  }
});

test('country distribution covers the documented regions and every country is non-empty', () => {
  const countries = new Set(merged.models.map((model) => model.country));
  for (const expected of ['JAPAN', 'KOREA', 'USA', 'UK', 'BRAZIL']) {
    assert.ok(countries.has(expected), `missing country ${expected}`);
  }
});

test('build reconciles photoAvailable to match real profile photos in dist', async () => {
  await buildPages();
  const distRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const built = JSON.parse(await readFile(path.join(distRoot, 'data', 'models.json'), 'utf8'));
  let available = [];
  try { available = await readdir(path.join(distRoot, 'assets', 'profiles')); } catch {}
  const set = new Set(available);
  for (const model of built.models) {
    const fileExists = set.has(`${model.id}.jpg`);
    assert.equal(model.photoAvailable, fileExists, `${model.id}: photoAvailable must match file existence`);
  }
  // photoAvailable count must equal the number of real .jpg files in
  // assets/profiles. The directory grows over time via the gravure auto-add
  // pipeline, so the count is self-consistent rather than pinned to a snapshot.
  const jpgCount = available.filter((file) => file.endsWith('.jpg')).length;
  const trueCount = built.models.filter((m) => m.photoAvailable).length;
  assert.equal(trueCount, jpgCount, 'photoAvailable count must equal the number of .jpg profile files');
});
