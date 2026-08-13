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

  const dataScript = `<script id="issue-data" type="application/json">${JSON.stringify(items)}</script>`;
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
  console.log(`✓ Built ${outPath} (${items.length} items)`);

  for (const asset of ['issue.css', 'issue.js']) {
    const src = join(ROOT, asset);
    if (existsSync(src)) {
      cpSync(src, join(DIST, asset));
      console.log(`✓ Copied ${asset}`);
    }
  }

  // 19+ 커뮤니티 링크 보드 (community.html)
  const communityData = loadJSON(join(ROOT, 'data', 'community.json'));
  const communityItems = (communityData?.items ?? []).filter((it) => it.url);
  const commMeta = communityData?.meta ?? {
    scraped_at: new Date().toISOString(),
    total_items: communityItems.length,
    source_count: 0,
    categories: [],
    platforms: [],
  };

  const commTemplate = readFileSync(join(ROOT, 'community.html'), 'utf-8');
  const commHtml = commTemplate
    .replace(
      '<script id="community-data" type="application/json">[]</script>',
      `<script id="community-data" type="application/json">${JSON.stringify(communityItems)}</script>`,
    )
    .replace(
      '<script id="community-meta" type="application/json">{}</script>',
      `<script id="community-meta" type="application/json">${JSON.stringify(commMeta)}</script>`,
    );
  const commOutPath = join(DIST, 'community.html');
  writeFileSync(commOutPath, commHtml, 'utf-8');
  console.log(`✓ Built ${commOutPath} (${communityItems.length} community links)`);

  for (const asset of ['community.css', 'community.js']) {
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
