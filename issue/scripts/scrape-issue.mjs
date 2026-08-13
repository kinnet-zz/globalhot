// scrape-issue.mjs — 글로벌 이슈 수집기
// RSS/Atom(Flickr·DeviantArt·Mastodon·YouTube) + Booru JSON(Safebooru·yande.re) 를
// 통합 파싱해 issue/data/issue.json 을 만든다. 링크만 수집(이미지 복사 없음).
// 익명 GET 만 사용: 차단/로그인 필요 소스는 자동 건너뛴다.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const RATE_LIMIT_MS = 900; // 소스 간 요청 간격
const MAX_PER_SOURCE = 20;

// 안전 필터: 타이틀/태그에 이 키워드가 있으면 제외 (비동의/미성년/노골적)
const EXCLUDE_KEYWORDS = [
  'loli', 'shota', 'lolicon', 'shotacon', 'toddler',
  'child', 'underage', 'preteen', 'minor',
  'areola', 'nipple', 'nipples', 'topless', 'genitalia', 'penis',
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadSources() {
  const raw = readFileSync(join(import.meta.dirname, '..', 'config', 'sources.json'), 'utf-8');
  return JSON.parse(raw).sources;
}

// --- 텍스트 정제 유틸 ---
function decodeCdata(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}
function stripTags(s) {
  return s.replace(/<[^>]*>/g, '');
}
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
function clean(s) {
  if (!s) return '';
  // CDATA → 엔티티 디코딩 → 태그 제거 → 공백 정리 순서로 HTML-인코딩 본문도 평문화
  return stripTags(decodeEntities(decodeCdata(s))).replace(/\s+/g, ' ').trim();
}

function titleFromDesc(desc) {
  if (!desc) return '';
  const t = desc.replace(/\s+/g, ' ').trim();
  return t.length > 120 ? t.slice(0, 120) + '…' : t;
}
function firstMatch(xml, regex) {
  const m = xml.match(regex);
  return m ? m[1] : '';
}
function prettifyTags(tags) {
  return tags.slice(0, 6).map((t) => t.replace(/_/g, ' ')).join(', ');
}

// --- RSS 2.0 / Atom 파서 ---
function parseRss(xml) {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return items.map((item) => {
    const title = clean(firstMatch(item, /<title\b[^>]*>([\s\S]*?)<\/title>/i));
    let link = clean(firstMatch(item, /<link\b[^>]*>([\s\S]*?)<\/link>/i));
    if (!link) {
      const lm = item.match(/<link\b[^>]*href="([^"]+)"/i);
      if (lm) link = lm[1];
    }
    const pub =
      clean(firstMatch(item, /<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i)) ||
      clean(firstMatch(item, /<dc:date\b[^>]*>([\s\S]*?)<\/dc:date>/i));
    const author =
      clean(firstMatch(item, /<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/i)) ||
      clean(firstMatch(item, /<author\b[^>]*>([\s\S]*?)<\/author>/i));
    const guid =
      clean(firstMatch(item, /<guid\b[^>]*>([\s\S]*?)<\/guid>/i)) || link;
    const desc = clean(firstMatch(item, /<description\b[^>]*>([\s\S]*?)<\/description>/i));
    return { title, link, pub, author, guid, desc };
  });
}

function parseAtom(xml) {
  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return entries.map((entry) => {
    const title = clean(firstMatch(entry, /<title\b[^>]*>([\s\S]*?)<\/title>/i));
    let link = '';
    const links = [...entry.matchAll(/<link\b[^>]*>/gi)];
    for (const lm of links) {
      const href = (lm[0].match(/href="([^"]+)"/) || [])[1];
      const rel = (lm[0].match(/rel="([^"]+)"/) || [])[1];
      if (href && (!rel || rel === 'alternate')) {
        link = href;
        break;
      }
    }
    if (!link && links.length) {
      link = (links[0][0].match(/href="([^"]+)"/) || [])[1] || '';
    }
    const pub =
      clean(firstMatch(entry, /<published\b[^>]*>([\s\S]*?)<\/published>/i)) ||
      clean(firstMatch(entry, /<updated\b[^>]*>([\s\S]*?)<\/updated>/i));
    const author = clean(firstMatch(entry, /<name\b[^>]*>([\s\S]*?)<\/name>/i));
    const guid =
      clean(firstMatch(entry, /<id\b[^>]*>([\s\S]*?)<\/id>/i)) || link;
    const desc = clean(firstMatch(entry, /<summary\b[^>]*>([\s\S]*?)<\/summary>/i)) ||
      clean(firstMatch(entry, /<content\b[^>]*>([\s\S]*?)<\/content>/i));
    return { title, link, pub, author, guid, desc };
  });
}

// --- Booru JSON 어댑터 ---
function parseBooru(json, platform) {
  const arr = Array.isArray(json) ? json : [];
  return arr.map((p) => {
    const id = p.id;
    const tags = (p.tags || '').split(/\s+/).filter(Boolean);
    if (platform === 'yandere') {
      return {
        title: prettifyTags(tags),
        link: `https://yande.re/post/show/${id}`,
        pub: p.created_at ? new Date(p.created_at * 1000).toISOString() : '',
        author: p.author || 'yande.re',
        guid: `yandere-${id}`,
      };
    }
    // safebooru: 타임스탬프 미제공 → 빈 값(정렬 시 하단)
    return {
      title: prettifyTags(tags),
      link: `https://safebooru.org/index.php?page=post&s=view&id=${id}`,
      pub: '',
      author: 'safebooru',
      guid: `safebooru-${id}`,
    };
  });
}

function toUnix(pub) {
  if (!pub) return 0;
  const t = Date.parse(pub);
  return Number.isNaN(t) ? 0 : Math.floor(t / 1000);
}

function isExcluded(title) {
  const t = (title || '').toLowerCase();
  return EXCLUDE_KEYWORDS.some((k) => t.includes(k));
}

async function fetchText(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

async function fetchJson(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, */*' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function scrapeSource(src) {
  const raw = [];
  try {
    if (src.type === 'rss') {
      const xml = await fetchText(src.feed);
      const rss = parseRss(xml);
      const atom = rss.length ? [] : parseAtom(xml);
      raw.push(...(rss.length ? rss : atom));
    } else if (src.type === 'booru-json') {
      const json = await fetchJson(src.feed);
      raw.push(...parseBooru(json, src.platform));
    }
  } catch (e) {
    console.log(`    ✗ ${e.message}`);
    return [];
  }

  const items = raw
    .filter((it) => (it.title || it.desc) && it.link)
    .slice(0, MAX_PER_SOURCE)
    .map((it) => ({
      id: it.guid || it.link,
      title: (it.title || titleFromDesc(it.desc)) || '(제목 없음)',
      url: it.link,
      platform: src.platform,
      source: src.label,
      category: src.category,
      author: it.author || src.platform,
      created_utc: toUnix(it.pub),
    }))
    .filter((it) => !isExcluded(it.title) && !isExcluded(it.desc || ''));

  console.log(`    ✓ ${items.length} items`);
  return items;
}

async function main() {
  console.log('══ Issue Scraper (RSS + Booru) ══\n');
  const sources = loadSources();
  const enabled = sources.filter((s) => s.enabled);
  console.log(`활성 소스 ${enabled.length}/${sources.length}\n`);

  const all = [];
  for (const src of enabled) {
    console.log(`▶ ${src.label} [${src.platform}/${src.type}]`);
    const items = await scrapeSource(src);
    all.push(...items);
    await sleep(RATE_LIMIT_MS);
  }

  // URL 기준 중복 제거 (최신/유효 항목 우선)
  const seen = new Map();
  for (const it of all) {
    const key = it.url;
    if (!seen.has(key)) seen.set(key, it);
  }
  const unique = Array.from(seen.values());

  // 최신순 정렬 (시간 미상 항목은 하단)
  unique.sort((a, b) => {
    if (a.created_utc !== b.created_utc) return b.created_utc - a.created_utc;
    return a.source.localeCompare(b.source);
  });

  const output = {
    meta: {
      scraped_at: new Date().toISOString(),
      total_items: unique.length,
      source_count: enabled.length,
      categories: [...new Set(unique.map((i) => i.category))].sort(),
      platforms: [...new Set(unique.map((i) => i.platform))].sort(),
    },
    items: unique,
  };

  const outDir = join(import.meta.dirname, '..', 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'issue.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n✓ 저장: ${unique.length}건 → data/issue.json`);
  console.log(`  카테고리: ${output.meta.categories.join(', ') || '(없음)'}`);
  console.log(`  플랫폼: ${output.meta.platforms.join(', ') || '(없음)'}`);
}

main().catch((err) => {
  console.error('Scraper failed:', err);
  process.exit(1);
});
