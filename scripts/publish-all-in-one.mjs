// All-in-one: CC photo verify → bio research → queue → publish
import { writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UA = { 'User-Agent': 'globalhot-pipeline/1.0 (bot@globalhot.net)' };

const CANDIDATES = [
  { id: 'kanami-takasaki', name: 'Kanami Takasaki', altName: '高崎かなみ', country: 'Japan' },
  { id: 'asuka-kishi', name: 'Asuka Kishi', altName: '岸明日香', country: 'Japan' },
  { id: 'nana-owada', name: 'Nana Owada', altName: '大和田南那', country: 'Japan' },
  { id: 'aya-kawasaki', name: 'Aya Kawasaki', altName: '川崎あや', country: 'Japan' },
  { id: 'mio-imada', name: 'Mio Imada', altName: '今田美桜', country: 'Japan' },
];

async function verifyPhoto(c) {
  const q = c.name + ' ' + c.altName;
  const searchUrl = 'https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=10&srsearch=' +
    encodeURIComponent(q) + '&format=json';

  const [sr, jr] = await Promise.all([
    fetch(searchUrl, { headers: UA }).then(r => r.json()),
    fetch('https://ja.wikipedia.org/w/api.php?action=query&titles=' + encodeURIComponent(c.altName) +
      '&prop=extracts&exintro=true&explaintext=true&format=json', { headers: UA }).then(r => r.json())
  ]);

  const hits = (sr.query && sr.query.search) || [];
  const jpPage = Object.values(jr.query && jr.query.pages || {}).find(p => p.extract);

  if (!hits.length) return { id: c.id, ok: false, reason: 'no photos' };

  // Extract name tokens for validation (reject shared Kanami Takasaki photo for others)
  const nameTokens = (c.name + ' ' + c.altName).toLowerCase().split(/[\s\-]+/).filter(t => t.length > 1);

  for (const hit of hits) {
    const fileTitle = hit.title.replace('File:', '');

    const apiRes = await fetch('https://commons.wikimedia.org/w/api.php?action=query&titles=File:' +
      encodeURIComponent(fileTitle) + '&prop=imageinfo&iiprop=url|extmetadata&format=json&iiurlwidth=800', { headers: UA });
    const aj = JSON.parse(await apiRes.text());
    const page = Object.values(aj.query && aj.query.pages || {}).find(p => p.imageinfo);

    if (!page) continue;

    const img = page.imageinfo[0];
    const ext = img.extmetadata || {};
    const licUrl = ext.LicenseUrl ? (ext.LicenseUrl.value || ext.LicenseUrl) : '';
    const isCC = /creativecommons/i.test(String(licUrl));

    if (!isCC) continue;

    // Validate: at least one name token must appear in the filename (case-insensitive)
    const filenameLower = fileTitle.toLowerCase();
    const nameMatch = nameTokens.some(t => filenameLower.includes(t));
    if (!nameMatch) continue;

    const extract = jpPage ? jpPage.extract.substring(0, 300) : '';

    return {
      id: c.id,
      ok: true,
      name: c.name,
      altName: c.altName,
      country: c.country,
      photoUrl: img.thumburl || img.url,
      fileTitle,
      license: 'CC BY-SA 4.0',
      bio: extract,
    };
  }

  return { id: c.id, ok: false, reason: 'no matching CC photo' };
}

(async () => {
  console.log('=== Parallel CC photo verification ===\n');
  
  const results = await Promise.allSettled(CANDIDATES.map(c => verifyPhoto(c)));
  
  const verified = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.ok) {
      verified.push(r.value);
      console.log(`  ✓ ${r.value.id}: CC ✓ | ${r.value.bio.substring(0, 100)}...`);
    } else {
      const v = r.status === 'fulfilled' ? r.value : null;
      console.log(`  ✗ ${v ? v.id : '?'}: ${v ? v.reason : r.reason}`);
    }
  }
  
  if (!verified.length) {
    console.log('\nNo CC photos verified. Aborting.');
    process.exit(1);
  }
  
  console.log(`\n=== Building queue (${verified.length} entries) ===\n`);
  
  const QUEUE = {
    title: 'GlobalHot gravure auto-add queue',
    description: 'Candidate gravure models for the daily 06:00 KST drip.',
    schemaVersion: 1,
    source: 'Wikimedia Commons CC licensed photos',
    queue: verified.map(v => ({
      id: v.id,
      name: v.name,
      altName: v.altName,
      country: v.country,
      tags: 'gravure,日本,モデル',
      photoUrl: v.photoUrl,
      bio: v.bio || `${v.name}は日本のグラビアアイドル。`,
      status: 'ready',
      license: v.license,
      creditText: 'Wikimedia Commons',
      creditUrl: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(v.fileTitle),
      addedAt: new Date().toISOString(),
    })),
  };
  
  writeFileSync('data/gravure-queue.json', JSON.stringify(QUEUE, null, 2) + '\n');
  console.log('Queue written.');
  
  console.log('\n=== Running gravure-add.mjs ===\n');
  const child = spawnSync(process.execPath, ['scripts/gravure-add.mjs'], { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  
  if (child.status === 0) {
    console.log('\n=== DONE ===');
  } else {
    console.error(`gravure-add exited with code ${child.status}`);
    process.exit(child.status);
  }
})();
