import fs from 'fs';

const LOW_NO_URL = [
  'hina-kikuchi',
  'yuzuha-hongo',
  'runa-toyota',
  'mizuki-yamashita',
  'sayaka-isoyama',
  'anri-sugihara',
  'mikie-hara',
  'marina-nagasawa',
  'aki-hoshino',
  'saki-suzuki',
  'yumiko-shaku',
  'w-gisele',
  'w-demirose',
  'w-hailey',
  'w-alix',
];

const modelsData = JSON.parse(fs.readFileSync('data/models.json', 'utf8'));
const models = {};
modelsData.models.forEach(m => { models[m.id] = m; });

async function searchWikimedia(name, id) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=' + 
    encodeURIComponent(name + ' filetype:jpeg') + '&srprop=timestamp|snippet&srlimit=1&srnamespace=6';
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'globalhot-pipeline/1.0' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const searches = json.query && json.query.search;
    if (searches && searches.length > 0) {
      const first = searches[0];
      console.log(`[SEARCH] ${id} (${name}): found "${first.title}"`);
      return first.title;
    }
  } catch (e) {
    console.log(`[SEARCH ERR] ${id}: ${e.message}`);
  }
  return null;
}

console.log('Searching Wikimedia Commons for LOW-resolution models...\n');

const results = [];
for (const id of LOW_NO_URL) {
  const model = models[id];
  if (model) {
    const title = await searchWikimedia(model.name, id);
    results.push({ id, name: model.name, title });
  }
}

console.log('\n=== Results ===');
results.forEach(r => {
  console.log(`${r.id} | ${r.name} | ${r.title || 'NO RESULT'}`);
});

// Save results for later use
fs.writeFileSync('data/low-photo-search.json', JSON.stringify(results, null, 2) + '\n');
console.log('\nSaved to data/low-photo-search.json');
