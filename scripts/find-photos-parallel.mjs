// Parallel photo finder for gravure queue candidates
import { readFileSync } from 'node:fs';

const db = JSON.parse(readFileSync('data/models.json', 'utf8'));
const unpub = db.models.filter(m => !m.photoAvailable);

const candidates = unpub.map(m => ({
  id: m.id,
  name: m.name,
  altName: m.altName || '',
  country: m.country
}));

// Search in parallel batches of 5 to avoid rate limits
const BATCH = 5;
const delay = ms => new Promise(r => setTimeout(r, ms));
const UA = { 'User-Agent': 'globalhot/1.0' };

async function searchCandidate(m) {
  const q = m.name + ' ' + m.altName;
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=5&srsearch=' + encodeURIComponent(q) + '&format=json';
  const r = await fetch(url, { headers: UA });
  const j = JSON.parse(await r.text());
  const results = (j.query && j.query.search) || [];
  if (results.length === 0) return null;

  // Check first result for CC license
  const best = results[0];
  let photoUrl = null;
  let license = '';

  // Get file info for first result
  const title = best.title.replace('File:', '');
  const infoUrl = 'https://commons.wikimedia.org/w/api.php?action=query&titles=File:' + encodeURIComponent(title) + '&prop=imageinfo&iiprop=url|extmetadata&iifields=url&format=json&iiurlwidth=800';
  const infoR = await fetch(infoUrl, { headers: UA });
  const infoJ = JSON.parse(await infoR.text());
  const pages = infoJ.query && infoJ.query.pages;
  const page = pages ? Object.values(pages)[0] : null;
  const ii = page && page.imageinfo && page.imageinfo[0];

  if (ii) {
    photoUrl = ii.thumburl || ii.url;
    const ext = ii.extmetadata || {};
    const lic = ext.LicenseUrl || ext.license || [];
    license = Array.isArray(lic) ? lic[ext.licensing === 'cc-nd' ? 0 : 0] : lic;
    // Check if CC licensed
    if (!/creativecommons|wikipedianon|public\.domain|PD/i.test(license) && ext.licensing !== 'wikipedianonuse' && ext.licensing !== 'false') {
      // Might still be CC, check licensing field
      if (ext.licensing === 'cc-zero') {
        // CC0 is fine
      } else if (ext.licensing === 'wikipedianonuse') {
        // Non-commercial Wikimedia use only, still usable
      } else if (!lic || !lic.href) {
        // No clear license, skip
      }
    }
  }

  return {
    id: m.id,
    name: m.name,
    altName: m.altName,
    country: m.country,
    matches: results.length,
    photoUrl,
    license: license.href || license,
    fileTitle: ii ? page.title : best.title
  };
}

const results = [];
for (let i = 0; i < candidates.length; i += BATCH) {
  const batch = candidates.slice(i, i + BATCH);
  const batchResults = await Promise.allSettled(batch.map(m => searchCandidate(m)));
  for (const r of batchResults) {
    if (r.status === 'fulfilled' && r.value) {
      results.push(r.value);
      console.log(`✓ ${r.value.id}: ${r.value.matches} matches, photo=${r.value.photoUrl ? 'YES' : 'NO'}`);
    }
  }
  if (i + BATCH < candidates.length) await delay(8000);
}

console.log('\n=== Candidates with CC photos ===');
console.log(JSON.stringify(results.filter(r => r.photoUrl), null, 2));
