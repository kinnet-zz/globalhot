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
  console.log('══ Issue Builder ══');

  const data = loadJSON(join(ROOT, 'data', 'issue.json'));

  if (!data) {
    console.warn('⚠ data/issue.json 없음. scrape-issue.mjs 를 먼저 실행하세요.');
  }

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    scraped_at: new Date().toISOString(),
    total_items: 0,
    categories: [],
    platforms: [],
  };

  mkdirSync(DIST, { recursive: true });

  const template = readFileSync(join(ROOT, 'index.html'), 'utf-8');

  // 토큰 최적화: 임베드 시 클라이언트가 사용하는 필드만 남긴다.
  // id(=guid, Google News 불투명 토큰)는 렌더에 안 쓰이므로 제외 → payload 축소.
  const EMBED_FIELDS = ['title', 'url', 'platform', 'source', 'category', 'author', 'created_utc'];
  const embedItems = items.map((it) => {
    const out = {};
    for (const k of EMBED_FIELDS) if (it[k] !== undefined) out[k] = it[k];
    return out;
  });

  const dataScript = `<script id="issue-data" type="application/json">${JSON.stringify(embedItems)}</script>`;
  const dataBytes = Buffer.byteLength(dataScript, 'utf-8');
  const metaScript = `<script id="issue-meta" type="application/json">${JSON.stringify(meta)}</script>`;
  let html = template
    .replace(
      '<script id="issue-data" type="application/json">[]</script>',
      dataScript,
    )
    .replace(
      '<script id="issue-meta" type="application/json">{}</script>',
      metaScript,
    );

  const outPath = join(DIST, 'index.html');
  writeFileSync(outPath, html, 'utf-8');
  console.log(`✓ Built ${outPath} (${items.length} items, data ${(dataBytes / 1024).toFixed(1)}KB inline)`);

  for (const asset of ['issue.css', 'issue.js']) {
    const src = join(ROOT, asset);
    if (existsSync(src)) {
      cpSync(src, join(DIST, asset));
      console.log(`✓ Copied ${asset}`);
    }
  }

  const favSrc = join(ROOT, '..', 'favicon.svg');
  if (existsSync(favSrc)) {
    cpSync(favSrc, join(DIST, 'favicon.svg'));
  }

  console.log(
    `✓ Build complete: ${items.length} items, ${meta.platforms?.length || 0} platforms, categories=${meta.categories?.join(',') || '(없음)'}`,
  );
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
