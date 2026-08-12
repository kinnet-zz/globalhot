import fs from 'fs';

const SEARCHES = [
  { id: 'hina-kikuchi', queries: ['吉木日奈', 'Kikuchi Hina gravure'] },
  { id: 'yuzuha-hongo', queries: ['本郷柚子葉', 'Hongo Yuzuha gravure'] },
  { id: 'runa-toyota', queries: ['豊田ルナ', 'Toyota Runa gravure'] },
  { id: 'mizuki-yamashita', queries: ['山下瑞季 gravure', 'Mizuki Yamashita gravure'] },
  { id: 'sayaka-isoyama', queries: ['磯山沙矢香 gravure', 'Sayaka Isayama gravure'] },
  { id: 'anri-sugihara', queries: ['杉原杏璃', 'Anri Sugihara gravure'] },
  { id: 'mikie-hara', queries: ['原美貴', 'Mikie Hara gravure'] },
  { id: 'marina-nagasawa', queries: ['長澤まりん', 'Marina Nagasawa gravure'] },
  { id: 'aki-hoshino', queries: ['星野妃子 gravure', 'Aki Hoshino gravure'] },
  { id: 'saki-suzuki', queries: ['鈴木紗奇 gravure', 'Saki Suzuki gravure'] },
  { id: 'yumiko-shaku', queries: ['釈由美子', 'Yumiko Shaku gravure'] },
  { id: 'w-gisele', queries: ['Gisele Bundchen', 'Gisele Bunchen'] },
  { id: 'w-demirose', queries: ['Demi Rose'] },
  { id: 'w-hailey', queries: ['Hailey Bieber', 'Hailey Baldwin'] },
  { id: 'w-alix', queries: ['Alix Earle'] },
];

const profilesDir = 'assets/profiles';
const results = [];
const ua = { 'User-Agent': 'globalhot-pipeline/1.0 (globalhot.net)' };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function search(query, id) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query + ' +filetype:jpeg')}&srlimit=3&srnamespace=6`;
  try {
    const res = await fetch(url, { headers: ua });
    const json = await res.json();
    return (json.query && json.query.search) || [];
  } catch (e) {
    console.log(`  [ERR] ${id}/${query}: ${e.message}`);
    return [];
  }
}

async function getThumb(fileTitle) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url&iiurlwidth=960&iiurlheight=1440`;
  try {
    const res = await fetch(url, { headers: ua });
    const json = await res.json();
    const pages = json.query && json.query.pages;
    if (!pages) return null;
    const page = pages[Object.keys(pages)[0]];
    const info = page.imageinfo && page.imageinfo[0];
    if (!info) return null;
    return { thumburl: info.thumburl, url: info.url };
  } catch (e) {
    return null;
  }
}

for (const item of SEARCHES) {
  console.log(`\n[${item.id}]`);
  let found = false;
  
  for (const query of item.queries) {
    const hits = await search(query, item.id);
    
    for (const hit of hits) {
      console.log(`  [?] ${query} → ${hit.title}`);
      const info = await getThumb(hit.title);
      if (info && info.thumburl) {
        console.log(`  [OK] ${info.thumburl.substring(0, 80)}...`);
        
        // Download
        const res = await fetch(info.thumburl, { headers: ua });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(`${profilesDir}/${item.id}.jpg`, buf);
          console.log(`  → ${buf.length} bytes`);
          results.push({ id: item.id, status: 'OK', size: buf.length });
          found = true;
          break;
        }
      }
      await sleep(500);
    }
    if (found) break;
    await sleep(800);
  }
  
  if (!found) {
    console.log(`  [NO] no result for ${item.id}`);
    results.push({ id: item.id, status: 'NO_RESULT' });
  }
}

console.log('\n=== Summary ===');
results.forEach(r => console.log(`${r.id}: ${r.status}`));
console.log(`\nTotal: ${results.filter(r=>r.status==='OK').length}/${results.length} OK`);
