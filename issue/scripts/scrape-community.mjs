// scrape-community.mjs — 커뮤니티 19+ 링크 수집기
// 공개 커뮤니티 보드에서 성인 테마 글의 링크만 모아 issue/data/community.json 을 만든다.
// 원문·저작권은 각 사이트 소유. 이미지 복사 없이 링크만 수집.
// 익명 GET 만 사용: 차단/로그인 필요 소스는 자동 건너뛴다.
// 수집 기준: 제목에 키워드(19금·ㅎㅂ·ㅎㅇ 등) 1개 이상 AND 안전차단(미성년 등) 없음.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const RATE_LIMIT_MS = 900;
const MAX_PER_SOURCE = 50;
const MAX_TOTAL = 300; // 병합 후 보드 최대 보관 건수 (최신순 유지)

// 성인 테마 키워드 — 제목에 이 중 하나가 포함되면 수집 (한글/CJK 는 부분일치)
const ADULT_KEYWORDS = [
  '19금', 'ㅎㅂ', 'ㅎㅇ', '19',
  '화보', '그라비아', '속옷', '란제리', '비키니', '수영복',
  '글래머', '섹시', '노출', '가슴', '몸매', '성인', '야한',
  'nude', 'naked', 'bikini', 'lingerie', 'glamour', 'fansly', 'onlyfans',
];

// 안전 차단 — 미성년/비동의 관련 제목은 절대 수집하지 않는다.
const SAFETY_KEYWORDS = [
  '미성년', '청소년', '초등', '중학생', '고등학생', '고딩',
  'loli', 'shota', 'lolicon', 'shotacon', 'child', 'underage', 'teen', 'minor',
];

// 공개 보드 소스. fetch/parse 를 소스별로 정의해 확장 가능.
const SOURCES = [
  {
    key: 'ddanzi',
    label: '딴지일보',
    category: 'community',
    fetch: () =>
      fetchText('https://www.ddanzi.com/index.php?mid=free'),
    parse: parseDdanziList,
  },
  {
    key: 'ppomppu-star',
    label: '뽐뿌 연예',
    category: 'community',
    fetch: () =>
      fetchText('https://www.ppomppu.co.kr/zboard/zboard.php?id=star', 'euc-kr'),
    parse: parsePpomppuList,
  },
  {
    key: 'ppomppu-announcer',
    label: '뽐뿌 아나운서',
    category: 'community',
    fetch: () =>
      fetchText('https://www.ppomppu.co.kr/zboard/zboard.php?id=announcer', 'euc-kr'),
    parse: parsePpomppuList,
  },
  {
    key: '4chan-s',
    label: '4chan /s/',
    category: 'community',
    json: true,
    // 보드 자체가 19+ 테마이므로 제목 키워드 필터는 생략하고 안전차단만 적용
    filterMode: 'permissive',
    fetch: () =>
      fetchJson('https://a.4cdn.org/s/catalog.json'),
    parse: parse4chanCatalog,
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clean(s) {
  if (!s) return '';
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// 딴지일보 자유게시판 목록 (<tr> 테이블) 파서 — 제목/글쓴이/시간 추출
function parseDdanziList(html) {
  const rows = (html || '').split('<tr>').slice(1);
  const out = [];
  for (const row of rows) {
    const titleCell = row.match(/<td class="title">([\s\S]*?)<\/td>/);
    if (!titleCell) continue;
    const hrefM = titleCell[1].match(/href="(https:\/\/www\.ddanzi\.com\/(?:free\/)?\d+)"/);
    if (!hrefM) continue;
    const title = clean(titleCell[1].replace(hrefM[0], ''));
    if (!title) continue;
    const author = clean((row.match(/<td class="author[^"]*">([\s\S]*?)<\/td>/) || [])[1] || '');
    const postedAt = clean((row.match(/<td class="time">([\s\S]*?)<\/td>/) || [])[1] || '');
    out.push({ title, url: hrefM[1], author, postedAt });
  }
  return out;
}

// 뽐뿌 갤러리형 보드 목록 (<div class="gallery_list"> 셀) 파서 — 제목/작성자/날짜(YY/MM/DD) 추출
function parsePpomppuList(html) {
  const blocks = (html || '').split('<div class="gallery_list').slice(1);
  const out = [];
  for (const block of blocks) {
    const linkM = block.match(/href="(view\.php\?id=[^"]+)"/);
    if (!linkM) continue;
    const title = clean((block.match(/<span class="thumb_list_title">([\s\S]*?)<\/span>/) || [])[1] || '');
    if (!title) continue;
    const author = clean((block.match(/<span class='list_name'>[\s\S]*?<\/i>([\s\S]*?)<\/span>/) || [])[1] || '');
    const dateStr = clean((block.match(/<span class="gallery_data[^"]*">([\s\S]*?)<\/span>/) || [])[1] || '');
    const created = dateToUnix(dateStr);
    out.push({
      title,
      url: `https://www.ppomppu.co.kr/zboard/${linkM[1]}`,
      author,
      postedAt: dateStr,
      created_utc: created,
    });
  }
  return out;
}

// 4chan 카탈로그 파서 — 스레드 subject/comment 첫줄을 제목으로, 최신순 정렬
function parse4chanCatalog(json) {
  const pages = Array.isArray(json) ? json : [];
  const out = [];
  for (const page of pages) {
    for (const th of page.threads || []) {
      if (!th.no) continue;
      const sub = clean(th.sub || '');
      const com = clean(th.com || '');
      const title = sub || com.split('\n')[0];
      if (!title) continue;
      out.push({
        title,
        url: `https://boards.4chan.org/s/thread/${th.no}`,
        author: '',
        postedAt: '',
        created_utc: th.last_modified || th.time || 0,
      });
    }
  }
  out.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));
  return out;
}

// 'YY/MM/DD' → 유닉스 초 (20YY-M-DD 00:00). 파싱 실패 시 0
function dateToUnix(s) {
  const m = /(\d{2})\/(\d{1,2})\/(\d{1,2})/.exec(s || '');
  if (!m) return 0;
  const year = 2000 + Number(m[1]);
  const date = new Date(year, Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? 0 : Math.floor(date.getTime() / 1000);
}

function hasAny(title, list) {
  const t = title.toLowerCase();
  return list.some((k) => t.includes(k.toLowerCase()));
}

function isAdultOk(title) {
  if (!title) return false;
  if (hasAny(title, SAFETY_KEYWORDS)) return false;
  return hasAny(title, ADULT_KEYWORDS);
}

function isSafeOk(title) {
  return !!title && !hasAny(title, SAFETY_KEYWORDS);
}

async function fetchText(url, encoding) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  if (encoding) {
    const buf = Buffer.from(await resp.arrayBuffer());
    return new TextDecoder(encoding).decode(buf);
  }
  return resp.text();
}

async function fetchJson(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json,text/html' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function run() {
  console.log('══ Community Scraper (19+ link only) ══\n');

  const nowUnix = Math.floor(Date.now() / 1000);
  const fresh = [];

  for (const src of SOURCES) {
    console.log(`▶ ${src.label}`);
    try {
      const raw = src.parse(await src.fetch());
      const items = raw
        .filter((it) => (src.filterMode === 'permissive' ? isSafeOk(it.title) : isAdultOk(it.title)))
        .slice(0, MAX_PER_SOURCE)
        .map((it) => ({
          id: it.url,
          title: it.title,
          url: it.url,
          platform: 'community',
          source: src.label,
          category: src.category,
          author: it.author || src.label,
          posted_at: it.postedAt || '',
          created_utc: it.created_utc || nowUnix,
        }));
      fresh.push(...items);
      console.log(`    ✓ ${items.length} items (filter ${raw.length} → ${items.length})`);
    } catch (e) {
      console.log(`    ✗ ${e.message} — 기존 데이터 유지`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  const outDir = join(import.meta.dirname, '..', 'data');
  const outPath = join(outDir, 'community.json');

  // 기존 데이터와 병합 (누적 보드). URL 중복 제거 → 최신순 → 상한 캡
  const old = existsSync(outPath)
    ? JSON.parse(readFileSync(outPath, 'utf-8'))
    : null;
  const oldItems = Array.isArray(old?.items) ? old.items : [];

  const byUrl = new Map();
  for (const it of oldItems) byUrl.set(it.url, it);
  for (const it of fresh) byUrl.set(it.url, it); // fresh 우선 (newer created_utc)
  let merged = Array.from(byUrl.values());

  merged.sort((a, b) => {
    if ((b.created_utc || 0) !== (a.created_utc || 0)) return (b.created_utc || 0) - (a.created_utc || 0);
    return a.title.localeCompare(b.title);
  });
  merged = merged.slice(0, MAX_TOTAL);

  // 변화 없음 + 수집 실패(신규 0)고 기존 파일이 있으면 건드리지 않는다.
  // (첫 실행 등 파일이 없으면 빈 스켈레톤이라도 생성해 빌드/검증이 항상 통과하게 한다)
  const existBefore = existsSync(outPath);
  if (!fresh.length && existBefore && oldItems.length === merged.length &&
      oldItems.every((o, i) => o.url === merged[i].url)) {
    console.warn('\n⚠ 신규 수집 0건 + 기존 데이터 동일. 저장하지 않고 종료.');
    return;
  }

  const output = {
    meta: {
      scraped_at: new Date().toISOString(),
      total_items: merged.length,
      source_count: SOURCES.length,
      categories: [...new Set(merged.map((i) => i.category))].sort(),
      platforms: [...new Set(merged.map((i) => i.platform))].sort(),
    },
    items: merged,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n✓ 저장: ${merged.length}건 (신규 ${fresh.length}) → data/community.json`);
}

run().catch((err) => {
  console.error('Scraper failed:', err);
  process.exit(1);
});