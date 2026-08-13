// scrape-issue.mjs — 글로벌 이슈 뉴스 수집기
// Google News RSS 검색을 성인테마(그라비아·비키니·글래머·OnlyFans 등) 쿼리로 모아
// issue/data/issue.json 을 만든다. 링크만 수집(이미지 복사 없음).
// 익명 GET 만 사용: 차단/로그인 필요 소스는 자동 건너뛴다.
// 수집 기준: 타이틀에 테마어(TIER_A)가 반드시 1개 이상 + 안전차단/오프토픽(SAFETY·OFF_TOPIC) 없음.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const RATE_LIMIT_MS = 900; // 소스 간 요청 간격
const MAX_PER_SOURCE = 20;
const MAX_TOTAL = 150; // 게시판 최대 보관 건수 (최신순 유지)

// 안전 필터 (전 플랫폼): 미성년/비동의 관련 내용은 절대 수집하지 않는다.
const SAFETY_KEYWORDS = [
  'loli', 'shota', 'lolicon', 'shotacon', 'toddler',
  'child', 'underage', 'preteen', 'minor',
  'teen', 'teens', 'teenage', 'schoolgirl', 'school girl', 'high school girl',
  'junior', 'elementary', 'sixteen', 'seventeen',
];

// 뉴스 전용: 이 도메인의 리다이렉트/스팸은 제외
const NEWS_EXCLUDE_DOMAINS = ['packman.in', 'foodsspectrum.com', 'plastindia'];

// 뉴스 전용 테마어(Tier A) — 타이틀에 이 중 하나가 있으면 본 테마(성인/그라비아)로 판정.
const NEWS_MUST_KEYWORDS = [
  'gravure', 'gravura', '그라비아', 'グラビア',
  'photo book', 'photobook', '写真集', '화보',
  'bikini', '비키니', 'swimsuit', '수영복',
  'lingerie', '란제리', '잠옷',
  'glamour', '글래머', 'boudoir',
  'pinup', 'pin-up',
  'maxim model', 'maxim magazine',
  'nude', '누드', 'naked', 'topless', 'nipple', 'areola', '나체',
  'strips down', 'strips off', 'strip down', 'bares',
  'onlyfans', 'fansly', 'adult model', 'adult star', 'adult idol',
  'cosplay model', 'cosplayer',
  '노출 사진', '노출 화보', '수영복 화보', '비키니 화보',
];

// 뉴스 전용 오프토픽 필터 — 이 키워드가 있으면(테마어와는 무관하게) 제외.
// 정치·범죄·사망·돈/리스트·AI/IT·패션/연예·종교·학술·컨벤션·잡지식류.
const NEWS_EXCLUDE_KEYWORDS = [
  // 정치
  'lawmaker', 'lawmakers', 'election', 'politician', 'politicians',
  'parliament', 'senate', 'party chief', 'party leader', 'candidacy',
  'presidency', 'presidential', 'slams', 'iran', 'sanction',
  '국회', '총선', '정계', '출마', '당선', '낙선', '국회의원',
  // 범죄/법조/사망
  'arrest', 'arrested', 'police', 'stab', 'stabb', 'dismembered', 'murder', 'murdered',
  'manslaughter', 'lawsuit', 'court', 'trial', 'sentenced', 'jail', 'prison',
  'cartel', 'drug', 'cocaine', 'smuggling', 'found dead', 'passed away', 'dead',
  'death', 'obituary', '사망', '별세', '경찰', '구속', '수사', '기소', '범죄',
  'consent', 'catfish', 'stolen', 'fraud', 'defraud',
  // 돈/리스트/순위
  'top earner', 'top earners', 'earns', 'earned', 'millions', 'million',
  'money', 'income', 'revenue', 'salary', 'net worth', 'richest', 'fortune',
  'highest-paid', 'top models', 'best onlyfans', 'top onlyfans', '10 best',
  'top 10', 'ranked', 'ranking', 'most-followed', 'most followed', 'best accounts',
  'top accounts', 'guide', 'what is', 'explainer', 'paid', 'unpaid', 'auction',
  // AI/IT/사업
  'ai model', 'ai image', 'ai photo', 'ai companion', 'ai influencer',
  'ai generated', 'ai fodder', 'ai 걸', 'ai 이미지', 'ai 사진', 'ai 모델',
  'ai 생성', 'ai 그림', 'ai to', 'uses ai', 'artificial intelligence', 'subscription',
  'business model', '유료', '구독', '광고 모델', '인스타그램 광고', '상표',
  '특허', 'uxui', 'ux design', 'metaverse', 'algorithm', 'loreal', 'makeup',
  'cosmetic', 'instagram premium', 'instagram business', 'whatsapp',
  // 패션/연예/아이돌(비그라비아)
  'k-pop', 'kpop', 'girl group', 'boy band', 'korean actress', 'k-drama',
  'kdrama', 'runway', 'fashion week', 'street style', 'skincare',
  'celebrities', 'celebrity', 'singer', '가수', '배우', '연예인', '걸그룹', '보이그룹',
  'male idol', 'male model', 'male models', 'prince', 'royal',
  // 종교/학술/잡지식
  'pope', 'vatican', 'christian', 'church', 'pastor', '교황', '바티칸',
  'academic', 'research', 'university', 'campus', 'college', 'essay', 'thesis',
  'scholar', '논문', '연구', 'husband', 'mom', 'mum', 'baby', 'single mother',
  'scandal', 'affair', 'castle', 'airline', '콘테스트',
  // 컨벤션/이벤트 (기존)
  'comic-con', 'anime expo', 'comic con', 'comiccon', 'convention',
  'expo', 'festival', 'anime india', 'anime ottawa',
  'best cosplay', 'top cosplay', 'cosplay gallery', 'cosplay contest',
  'cosplay cup', 'cosplay summit', 'cosplay championship',
  'comicpalooza', 'wondercon', 'liverpool comic', 'c2e2', 'mcm birmingham',
  'gamestop', 'game awards', 'contest', 'championship',
  'meta instagram', 'meta starts', 'meta muse', 'algorithm',
  'virat kohli', 'kohli', 'pokemon', 'pickleball', 'anifest', 'ani fest',
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
      clean(firstMatch(item, /<author\b[^>]*>([\s\S]*?)<\/author>/i)) ||
      clean(firstMatch(item, /<source\b[^>]*>([\s\S]*?)<\/source>/i));
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
  return isUnsafe.test((title || '').toLowerCase());
}

// 키워드 매처: 영문/아스키 구문은 단어경계(\b), 한글·일어·기호 키워드는 부분일치.
function makeKeywordMatcher(list) {
  const parts = list.map((k) => {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ascii = /^[\w\s'-]+$/.test(k);
    return ascii ? `(?:^|[^a-z])${escaped}(?:[^a-z]|$)` : escaped;
  });
  return new RegExp(parts.join('|'), 'i');
}

const isOffTopic = makeKeywordMatcher(NEWS_EXCLUDE_KEYWORDS);
const hasTheme = makeKeywordMatcher(NEWS_MUST_KEYWORDS);
const isUnsafe = makeKeywordMatcher(SAFETY_KEYWORDS);

// Google News 관련성 필터 (platform==='news' 전용):
// 테마어 ≥1개 AND 안전차단 없음 AND 오프토픽 없음
function isNewsRelevant(it) {
  const t = (it.title || '').toLowerCase();
  const u = (it.url || '').toLowerCase();
  if (NEWS_EXCLUDE_DOMAINS.some((d) => u.includes(d))) return false;
  if (isExcluded(it.title)) return false;
  if (!hasTheme.test(t)) return false;
  return !isOffTopic.test(t);
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
    .filter((it) => !isExcluded(it.title) && !isExcluded(it.desc || ''))
    .filter((it) => src.platform !== 'news' || isNewsRelevant(it));

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

  // 게시판 상한까지 보관 (최신 항목 유지)
  const capped = unique.slice(0, MAX_TOTAL);

  if (!capped.length) {
    console.warn('\n⚠ 수집 결과가 0건. 기존 issue.json 을 유지하고 종료합니다.');
    return;
  }

  const output = {
    meta: {
      scraped_at: new Date().toISOString(),
      total_items: capped.length,
      source_count: enabled.length,
      categories: [...new Set(capped.map((i) => i.category))].sort(),
      platforms: [...new Set(capped.map((i) => i.platform))].sort(),
    },
    items: capped,
  };

  const outDir = join(import.meta.dirname, '..', 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'issue.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n✓ 저장: ${capped.length}건 → data/issue.json`);
  console.log(`  카테고리: ${output.meta.categories.join(', ') || '(없음)'}`);
  console.log(`  플랫폼: ${output.meta.platforms.join(', ') || '(없음)'}`);
}

main().catch((err) => {
  console.error('Scraper failed:', err);
  process.exit(1);
});
