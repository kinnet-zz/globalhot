import { readFileSync, writeFileSync, existsSync, cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');

function loadJSON(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

async function build() {
  console.log('══ Hot News Builder ══');
  
  const data = loadJSON(join(ROOT, 'data', 'hotnews.json'));
  
  if (!data) {
    console.warn('⚠ No data found! Run "node scripts/scrape-hotnews.mjs" first.');
    data = {
      meta: { scraped_at: new Date().toISOString(), total_posts: 0, subreddits: [], keywords: [] },
      posts: []
    };
  }
  
  mkdirSync(DIST, { recursive: true });
  
  // Read template
  const template = readFileSync(join(ROOT, 'index.html'), 'utf-8');
  
  // Embed data as inline JSON
  const dataScript = `<script id="hotnews-data" type="application/json">${JSON.stringify(data.posts)}</script>`;
  let html = template.replace('<script id="hotnews-data" type="application/json">[]</script>', dataScript);
  
  // Write output
  const outPath = join(DIST, 'index.html');
  writeFileSync(outPath, html, 'utf-8');
  console.log(`✓ Built ${outPath} with ${data.posts.length} posts`);
  
  // Copy CSS/JS
  const cssSrc = join(ROOT, 'hotnews.css');
  if (existsSync(cssSrc)) {
    cpSync(cssSrc, join(DIST, 'hotnews.css'));
    console.log('✓ Copied hotnews.css');
  }
  
  const jsSrc = join(ROOT, 'hotnews.js');
  if (existsSync(jsSrc)) {
    cpSync(jsSrc, join(DIST, 'hotnews.js'));
    console.log('✓ Copied hotnews.js');
  }
  
  // Copy favicon
  const favSrc = join(ROOT, '..', 'favicon.svg');
  if (existsSync(favSrc)) {
    cpSync(favSrc, join(DIST, 'favicon.svg'));
  }
  
  console.log(`✓ Build complete! ${data.posts.length} posts from ${data.meta.queries?.length || 0} sources (${data.meta.source || 'RSS'})`);
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
