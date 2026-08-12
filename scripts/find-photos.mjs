import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync('data/models.json', 'utf8'));
const drafts = d.models.filter(m => !m.photoAvailable);

const UA = { 'User-Agent': 'globalhot/1.0' };

async function search(name, altName) {
  const q = name + ' ' + (altName || '');
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=3&srsearch=' + encodeURIComponent(q) + '&format=json';
  const r = await fetch(url, { headers: UA });
  const text = await r.text();
  if (text.startsWith('You are making')) {
    throw new Error('Rate limited');
  }
  const j = JSON.parse(text);
  return (j.query.search || []).length;
}

const results = [];
for (let i = 0; i < drafts.length; i++) {
  const m = drafts[i];
  try {
    const c = await search(m.name, m.altName);
    if (c > 0) results.push({ id: m.id, name: m.name, count: c });
    console.log(`[${i+1}/${drafts.length}] ${m.id}: ${c} results`);
  } catch(e) {
    console.log(`[${i+1}/${drafts.length}] ${m.id}: ${e.message}`);
  }
  
  // Rate limiting - Wikimedia API allows ~50 requests/10min
  if (i < drafts.length - 1) {
    await new Promise(r => setTimeout(r, 5000));
  }
}

console.log('\n=== Results ===');
console.log(JSON.stringify(results, null, 2));
