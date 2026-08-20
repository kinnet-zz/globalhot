import assert from "node:assert/strict";
import test from "node:test";
import {
  addGravureModels,
  planAdd,
  entryPriority,
  buildModelObject,
  isJpeg,
  wikimediaApiHost,
  lastPathSegment,
} from '../scripts/gravure-add.mjs';

// A buffer that passes isJpeg: magic bytes FF D8 FF + enough payload to clear
// the minimum-size floor. We test logic here, not real image decoding.
function fakeJpeg() {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2100)]);
}

function entry(id, opts = {}) {
  return {
    id,
    name: opts.name || id,
    altName: '',
    country: 'JAPAN',
    tags: 'gravure model',
    bio: opts.bio === undefined ? '1995년생 도쿄 출신의 그라비어 모델로, 2015년 데뷔 후 화보와 패션지 활동을 이어가고 있습니다.' : opts.bio,
    officialUrl: '',
    sns: { x: '', instagram: '', youtube: '', tiktok: '' },
    photoUrl: opts.photoUrl || `https://example.com/${id}.jpg`,
    status: 'ready',
    license: opts.license,
    creditText: opts.creditText,
    creditUrl: opts.creditUrl,
  };
}

test('isJpeg accepts a real JPEG magic header and rejects tiny or non-JPEG buffers', () => {
  assert.equal(isJpeg(fakeJpeg()), true);
  assert.equal(isJpeg(Buffer.alloc(5000)), false, 'no magic header');
  assert.equal(isJpeg(Buffer.from([0xff, 0xd8, 0xff])), false, 'too small');
  assert.equal(isJpeg(Buffer.concat([Buffer.from([0x89, 0x50]), Buffer.alloc(3000)])), false, 'PNG rejected');
  assert.equal(isJpeg(null), false);
  assert.equal(isJpeg('not a buffer'), false);
});

test('buildModelObject applies the CC/Wikimedia default when license fields are absent', () => {
  const m = buildModelObject(entry('suzu-hirose'));
  assert.equal(m.id, 'suzu-hirose');
  assert.equal(m.photoAvailable, true);
  assert.equal(m.license, 'CC BY-SA 4.0');
  assert.equal(m.creditText, 'Wikimedia Commons');
  assert.equal(m.creditUrl, 'https://commons.wikimedia.org/');
  assert.deepEqual(m.sns, { x: '', instagram: '', youtube: '', tiktok: '' });
});

test('buildModelObject preserves an explicit copyrighted license verbatim', () => {
  const m = buildModelObject(entry('x', { license: '© 2026 Office', creditText: 'Office', creditUrl: 'https://o.com' }));
  assert.equal(m.license, '© 2026 Office');
  assert.equal(m.creditText, 'Office');
  assert.equal(m.creditUrl, 'https://o.com');
});

test('planAdd selects only ready entries up to the limit and drops already-present ids', () => {
  const queue = [
    entry('a'),                 // ready, new
    { ...entry('b'), status: 'pending' }, // not ready -> ignored
    entry('c'),                 // ready, new
    entry('d'),                 // ready, already present -> dropped from toAdd
    entry('e'),                 // ready, new but beyond limit
  ];
  const { toAdd, alreadyPresent } = planAdd(queue, ['d'], 2);
  assert.deepEqual(toAdd.map((e) => e.id), ['a', 'c']);
  assert.deepEqual(alreadyPresent.map((e) => e.id), ['d']);
});

test('entryPriority ranks Asian gravure entries above everything else', () => {
  assert.equal(entryPriority({ ...entry('x'), country: undefined }), 1);
  const asGrav = entry('g1');
  asGrav.country = 'JAPAN';
  assert.equal(entryPriority(asGrav), 0);
  const asGravArray = { ...entry('g2'), country: 'KOREA', tags: ['gravure', 'model'] };
  assert.equal(entryPriority(asGravArray), 0);
  const westernGrav = { ...entry('g3'), country: 'USA', tags: 'gravure model' };
  assert.equal(entryPriority(westernGrav), 1);
  const asianNonGrav = { ...entry('g4'), country: 'JAPAN', tags: 'fashion model' };
  assert.equal(entryPriority(asianNonGrav), 1);
});

test('planAdd drains Asian gravure entries before non-Asian ones regardless of queue order', () => {
  const queue = [
    { ...entry('usa-1'), country: 'USA' },
    entry('jp-1'),                                  // JAPAN gravure (default fixture)
    { ...entry('uk-1'), country: 'UK' },
    { ...entry('kr-1'), country: 'KOREA' },
  ];
  const { toAdd } = planAdd(queue, [], 10);
  assert.deepEqual(toAdd.map((e) => e.id), ['jp-1', 'kr-1', 'usa-1', 'uk-1']);
  // With a tight limit the Asian gravure entries still come first.
  const limited = planAdd(queue, [], 1);
  assert.deepEqual(limited.toAdd.map((e) => e.id), ['jp-1']);
});

test('planAdd rejects entries with unsafe ids or missing photo urls', () => {
  const queue = [
    entry('good'),
    { ...entry('Bad_ID') },                      // uppercase / underscore -> unsafe filename
    { ...entry('nourl'), photoUrl: 'not-a-url' }, // bad url
  ];
  const { toAdd } = planAdd(queue, [], 10);
  assert.deepEqual(toAdd.map((e) => e.id), ['good']);
});

test('a model may never be added without a written bio (detail pages must not ship blank)', () => {
  const queue = [
    entry('with-bio'),
    { ...entry('no-bio'), bio: '' },
    { ...entry('blank-bio'), bio: '   ' },
    { ...entry('tiny-bio'), bio: '짧음' },
    { ...entry('real-bio'), bio: '1998년생 사이타마 출신. 2016년 데뷔 후 그라비어 화보와 다양한 미디어 활동을 이어가고 있다.' },
  ];
  const { toAdd } = planAdd(queue, [], 10);
  assert.deepEqual(toAdd.map((e) => e.id), ['with-bio', 'real-bio']);
});

test('buildModelObject carries the bio onto the model record', () => {
  const m = buildModelObject(entry('suzu-hirose', { bio: '2000년생 아이치현 출신으로 2018년 데뷔한 여성 아이돌·그라비어 모델이다.' }));
  assert.equal(m.bio, '2000년생 아이치현 출신으로 2018년 데뷔한 여성 아이돌·그라비어 모델이다.');
});

test('addGravureModels downloads, appends models, consumes entries, and updates modelCount', async () => {
  const queueData = { queue: [entry('a'), entry('b')] };
  const modelsData = { models: [{ id: 'existing', name: 'X', country: 'JAPAN', tags: 'm', photoAvailable: false, sns: {} }], modelCount: 1 };
  const fetcher = async () => fakeJpeg();

  const result = await addGravureModels({ queueData, modelsData, limit: 10, fetcher });

  assert.deepEqual(result.added, ['a', 'b']);
  assert.equal(result.downloads.length, 2);
  assert.equal(result.newModelsData.models.length, 3, 'two new models appended');
  assert.equal(result.newModelsData.modelCount, 3, 'modelCount tracks models.length');
  assert.equal(result.newQueueData.queue.length, 0, 'consumed entries removed from queue');
  assert.equal(result.newModelsData.models[1].license, 'CC BY-SA 4.0', 'CC default applied');
});

test('addGravureModels is idempotent: an already-present id is consumed, not re-added', async () => {
  const queueData = { queue: [entry('already')] };
  const modelsData = { models: [{ id: 'already', name: 'X', country: 'JAPAN', tags: 'm', photoAvailable: false, sns: {} }], modelCount: 1 };
  let calls = 0;
  const fetcher = async () => { calls += 1; return fakeJpeg(); };

  const result = await addGravureModels({ queueData, modelsData, limit: 10, fetcher });

  assert.deepEqual(result.added, []);
  assert.deepEqual(result.alreadyPresent, ['already']);
  assert.equal(calls, 0, 'fetcher never called for an already-present id');
  assert.equal(result.newModelsData.models.length, 1, 'nothing appended');
  assert.equal(result.newQueueData.queue.length, 0, 'stale entry still consumed from queue');
});

test('a failed download marks the entry errored and never adds the model', async () => {
  const queueData = { queue: [entry('will-fail', { photoUrl: 'https://example.com/fail.jpg' }), entry('ok', { photoUrl: 'https://example.com/ok.jpg' })] };
  const modelsData = { models: [], modelCount: 0 };
  const fetcher = async (url) => {
    if (url.includes('fail')) throw new Error('boom');
    return fakeJpeg();
  };

  const result = await addGravureModels({ queueData, modelsData, limit: 10, fetcher });

  assert.deepEqual(result.added, ['ok'], 'the good entry still goes through');
  assert.equal(result.errored.length, 1);
  assert.equal(result.errored[0].id, 'will-fail');
  assert.equal(result.newModelsData.models.length, 1, 'failed model not appended');

  const failed = result.newQueueData.queue.find((e) => e.id === 'will-fail');
  assert.ok(failed, 'failed entry stays in the queue');
  assert.equal(failed.status, 'error');
  assert.match(failed.errorNote, /boom/);
  assert.equal(result.newQueueData.queue.find((e) => e.id === 'ok'), undefined, 'ok entry consumed');
});

test('a downloaded buffer that is not a JPEG is treated as a failure', async () => {
  const queueData = { queue: [entry('png-guy')] };
  const modelsData = { models: [], modelCount: 0 };
  const fetcher = async () => Buffer.concat([Buffer.from([0x89, 0x50]), Buffer.alloc(3000)]); // PNG-ish

  const result = await addGravureModels({ queueData, modelsData, limit: 10, fetcher });

  assert.deepEqual(result.added, []);
  assert.equal(result.errored.length, 1);
  assert.equal(result.newModelsData.models.length, 0);
});

test('an oversized photo is rejected so the deploy never trips the 25 MiB per-file limit', async () => {
  const queueData = { queue: [entry('huge')] };
  const modelsData = { models: [], modelCount: 0 };
  const fetcher = async () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(7_000_000)]);

  const result = await addGravureModels({ queueData, modelsData, limit: 10, fetcher });

  assert.deepEqual(result.added, [], 'oversized model not added');
  assert.equal(result.errored.length, 1);
  assert.match(result.errored[0].error, /exceeds the .* byte cap/i);
  assert.equal(result.newModelsData.models.length, 0);
  const failed = result.newQueueData.queue.find((e) => e.id === 'huge');
  assert.equal(failed.status, 'error');
});

test('wikimediaApiHost maps Commons/en upload URLs to their API host and rejects others', () => {
  assert.equal(wikimediaApiHost('https://upload.wikimedia.org/wikipedia/commons/a/ab/F.jpg'), 'commons.wikimedia.org');
  assert.equal(wikimediaApiHost('http://upload.wikimedia.org/wikipedia/en/a/ab/F.jpg'), 'en.wikipedia.org');
  assert.equal(wikimediaApiHost('https://example.com/f.jpg'), null);
  assert.equal(wikimediaApiHost('https://commons.wikimedia.org/wiki/Special:FilePath/F.jpg'), null);
  assert.equal(wikimediaApiHost(''), null);
  assert.equal(wikimediaApiHost(null), null);
});

test('lastPathSegment URL-decodes the file title and strips any query/hash', () => {
  assert.equal(lastPathSegment('https://upload.wikimedia.org/wikipedia/commons/d/d9/Foo_%28Bar%29.jpg'), 'Foo_(Bar).jpg');
  assert.equal(lastPathSegment('https://x/y/Foo.jpg?utm=1#frag'), 'Foo.jpg');
  assert.equal(lastPathSegment('https://x/y/Foo%20Bar.jpg'), 'Foo Bar.jpg');
});

test('addGravureModels downloads the 800px Wikimedia thumbnail, never the multi-MiB original', async () => {
  const queueData = { queue: [entry('x', { photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/d9/Foo.jpg' })] };
  const modelsData = { models: [], modelCount: 0 };
  const fetcher = async (url) => {
    if (url.includes('/api.php')) {
      return Buffer.from(JSON.stringify({ query: { pages: [{ imageinfo: [{ thumburl: 'https://upload.wikimedia.org/THUMB.jpg' }] }] } }));
    }
    if (url === 'https://upload.wikimedia.org/THUMB.jpg') return fakeJpeg();
    throw new Error('unexpected fetch — the original should NOT be requested: ' + url);
  };
  const result = await addGravureModels({ queueData, modelsData, limit: 10, fetcher });
  assert.deepEqual(result.added, ['x']);
  assert.equal(result.errored.length, 0);
});

test('addGravureModels falls back to the original photo when the API returns no thumburl', async () => {
  const original = 'https://upload.wikimedia.org/wikipedia/commons/d/d9/Foo.jpg';
  const queueData = { queue: [entry('x', { photoUrl: original })] };
  const modelsData = { models: [], modelCount: 0 };
  const fetcher = async (url) => {
    if (url.includes('/api.php')) return Buffer.from(JSON.stringify({ query: { pages: [{ imageinfo: [{}] }] } }));
    if (url === original) return fakeJpeg();
    throw new Error('unexpected fetch: ' + url);
  };
  const result = await addGravureModels({ queueData, modelsData, limit: 10, fetcher });
  assert.deepEqual(result.added, ['x'], 'falls back to the original and still adds the model');
  assert.equal(result.errored.length, 0);
});

test('dry run plans the additions but writes nothing and fetches nothing', async () => {
  const queueData = { queue: [entry('a'), entry('b')] };
  const modelsData = { models: [], modelCount: 0 };
  let calls = 0;
  const fetcher = async () => { calls += 1; return fakeJpeg(); };

  const result = await addGravureModels({ queueData, modelsData, limit: 10, dryRun: true, fetcher });

  assert.deepEqual(result.added, ['a', 'b']);
  assert.equal(calls, 0, 'no fetch in dry run');
  assert.equal(result.downloads.length, 0);
  assert.equal(result.newModelsData.models.length, 0, 'models untouched');
  assert.equal(result.newQueueData.queue.length, 2, 'queue untouched');
});
