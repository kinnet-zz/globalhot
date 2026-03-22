/**
 * GlobalHot 일일 경제·시장 브리핑 자동 생성기 v2
 * 매일 오전 9시 KST GitHub Actions에서 실행
 *
 * 설계 원칙:
 *  - 소스: 프론트엔드(app.js)와 동일한 소스 사용 (Yahoo Finance, MarketWatch, CNBC, Reuters,
 *            Reddit JSON API(점수 포함), CoinDesk, 연합뉴스, JTBC, 한겨레)
 *  - 선별: 핫함 점수(upvotes + 최신성) 기준 풀 정렬 후 Gemini가 최종 선별
 *  - AI: 카테고리당 1회 Gemini 호출 → 가장 임팩트 큰 기사 N개 선별 + 한국어 해설 동시 생성
 */

import { writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const SITE_URL  = process.env.SITE_URL || 'https://globalhot.pages.dev';
const KST       = new Date(Date.now() + 9 * 3600_000);
const TODAY     = KST.toISOString().slice(0, 10);
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const DATE_KO   = `${KST.getFullYear()}년 ${KST.getMonth() + 1}월 ${KST.getDate()}일 (${DAY_NAMES[KST.getDay()]})`;

// ── 1. 공통 유틸 ────────────────────────────────────────────

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'GlobalHot/2.0 (economic news aggregator; https://globalhot.pages.dev)',
        'Accept': 'application/json, application/rss+xml, text/xml, */*',
        ...opts.headers,
      },
      signal: AbortSignal.timeout(14000),
      ...opts,
    });
    if (!res.ok) {
      console.warn(`  ⚠️  ${url.slice(0, 70)} → HTTP ${res.status}`);
      return null;
    }
    return res;
  } catch (e) {
    console.warn(`  ⚠️  fetch 실패 [${url.slice(0, 50)}]: ${e.message}`);
    return null;
  }
}

/** 간단한 RSS XML 파서 */
function parseRSSXml(xml) {
  const items = [];
  const blocks = [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)];
  for (const block of blocks) {
    const c     = block[1];
    const title = c.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || '';
    const link  = c.match(/<link[^>]*>\s*(https?:\/\/[^\s<]+)\s*<\/link>/i)?.[1]?.trim()
               || c.match(/<guid[^>]*isPermaLink="true"[^>]*>([\s\S]*?)<\/guid>/i)?.[1]?.trim()
               || c.match(/<guid[^>]*>(https?:\/\/[^\s<]+)<\/guid>/i)?.[1]?.trim() || '';
    const date  = c.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() || '';
    const desc  = c.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]
                   ?.replace(/<[^>]+>/g, '')?.replace(/&nbsp;/g, ' ')?.trim()?.slice(0, 250) || '';
    if (title && link) items.push({ title, link, date, desc });
  }
  return items;
}

/**
 * 핫함 점수: upvotes + 최신성 보정
 * - Reddit처럼 점수가 있으면 그것 사용
 * - RSS(점수=0)는 최신성만으로 순위 결정 (24시간 내 → 최대 80점)
 */
function hotnessScore(p) {
  const ageMs    = Date.now() - (p.time instanceof Date ? p.time.getTime() : Date.now());
  const ageHours = ageMs / 3_600_000;
  const recency  = Math.max(0, 1 - ageHours / 36) * 80; // 36시간 감쇠
  return (p.points || 0) + recency;
}

// ── 2. 소스별 수집 함수 ─────────────────────────────────────

/** Reddit JSON API (Node.js 직접 호출 — CORS 없음) */
async function fetchRedditJSON(sub, label, emoji, color, category, limit = 20) {
  const res = await safeFetch(
    `https://www.reddit.com/r/${sub}/hot.json?limit=30&raw_json=1`
  );
  if (!res) return [];
  const data = await res.json().catch(() => null);
  if (!data?.data?.children) return [];
  const results = data.data.children
    .filter(c => !c.data.stickied && c.data.title)
    .slice(0, limit)
    .map(c => ({
      title:       c.data.title.trim(),
      url:         c.data.url?.startsWith('http') ? c.data.url : `https://reddit.com${c.data.permalink}`,
      points:      c.data.score || 0,
      comments:    c.data.num_comments || 0,
      time:        new Date(c.data.created_utc * 1000),
      source:      label,
      sourceEmoji: emoji,
      color,
      category,
    }));
  console.log(`  Reddit r/${sub}: ${results.length}개 (top score: ${results[0]?.points ?? 0})`);
  return results;
}

/** 범용 RSS 수집 */
async function fetchRSS(url, label, emoji, color, category, limit = 15) {
  const res = await safeFetch(url);
  if (!res) return [];
  const xml = await res.text().catch(() => '');
  const results = parseRSSXml(xml).slice(0, limit).map(item => ({
    title:       item.title.trim(),
    url:         item.link,
    points:      0,
    comments:    0,
    time:        item.date ? new Date(item.date) : new Date(),
    source:      label,
    sourceEmoji: emoji,
    color,
    category,
    desc:        item.desc,
  }));
  console.log(`  ${label}: ${results.length}개`);
  return results;
}

// ── 3. 카테고리 정의 ────────────────────────────────────────

/**
 * 각 카테고리에서 다수(15~20개)를 수집한 뒤,
 * Gemini가 최종 limit개를 선별 + 해설을 작성한다.
 */
const CATEGORIES = [
  {
    id:      'stocks',
    label:   '📊 주식·증시',
    intro:   '오늘 글로벌 증시에서 가장 주목받은 종목·이슈입니다. S&P500, 나스닥, 개별주 핵심 뉴스를 정리했습니다.',
    color:   '#00C851',
    limit:   5,
    fetchers: [
      () => fetchRedditJSON('investing',      'r/investing',    '📈', '#00C851', 'stocks'),
      () => fetchRedditJSON('stocks',         'r/stocks',       '📊', '#1a73e8', 'stocks'),
      () => fetchRedditJSON('wallstreetbets', 'r/WallStreetBets','🚀', '#FF4500', 'stocks', 10),
      () => fetchRSS('https://finance.yahoo.com/rss/topfinstories',
                     'Yahoo Finance', '💰', '#720E9E', 'stocks'),
      () => fetchRSS('https://feeds.marketwatch.com/marketwatch/topstories/',
                     'MarketWatch', '📉', '#006DB0', 'stocks'),
    ],
  },
  {
    id:      'world',
    label:   '🌍 글로벌 경제',
    intro:   '오늘 주요 글로벌 경제 이슈입니다. 연준(Fed) 정책, 인플레이션, 거시경제 동향을 짚어봅니다.',
    color:   '#1565C0',
    limit:   4,
    fetchers: [
      () => fetchRSS('https://feeds.bbci.co.uk/news/business/rss.xml',
                     'BBC Business', '🌍', '#BB1919', 'world'),
      () => fetchRSS('https://www.cnbc.com/id/100003114/device/rss/rss.html',
                     'CNBC', '📺', '#004CA3', 'world'),
      () => fetchRSS('https://feeds.reuters.com/reuters/businessNews',
                     'Reuters Business', '🌐', '#FF7B00', 'world'),
      () => fetchRedditJSON('economics', 'r/economics', '📚', '#1565C0', 'world', 10),
    ],
  },
  {
    id:      'market',
    label:   '💹 시장동향',
    intro:   '외환시장, 원자재(오일·금), 채권 금리 등 오늘의 시장 동향입니다.',
    color:   '#4285F4',
    limit:   4,
    fetchers: [
      () => fetchRSS('https://feeds.marketwatch.com/marketwatch/topstories/',
                     'MarketWatch', '📉', '#006DB0', 'market'),
      () => fetchRSS('https://www.cnbc.com/id/100003114/device/rss/rss.html',
                     'CNBC', '📺', '#004CA3', 'market'),
      () => fetchRSS('https://finance.yahoo.com/rss/topfinstories',
                     'Yahoo Finance', '💰', '#720E9E', 'market'),
      () => fetchRedditJSON('stocks', 'r/stocks', '📊', '#1a73e8', 'market', 10),
    ],
  },
  {
    id:      'crypto',
    label:   '₿ 가상화폐',
    intro:   '비트코인·이더리움·알트코인 오늘의 주요 뉴스와 커뮤니티 화제입니다.',
    color:   '#F7931A',
    limit:   4,
    fetchers: [
      () => fetchRedditJSON('CryptoCurrency', 'r/CryptoCurrency', '₿', '#F7931A', 'crypto'),
      () => fetchRedditJSON('Bitcoin',        'r/Bitcoin',        '₿', '#F7931A', 'crypto'),
      () => fetchRSS('https://www.coindesk.com/arc/outboundfeeds/rss/',
                     'CoinDesk', '🪙', '#1A1A1A', 'crypto'),
    ],
  },
  {
    id:      'korea',
    label:   '🇰🇷 한국경제',
    intro:   '코스피·원화·한국 기업 관련 오늘의 주요 경제 뉴스입니다.',
    color:   '#0060A9',
    limit:   4,
    fetchers: [
      () => fetchRSS('https://www.yna.co.kr/RSS/news.xml',
                     '연합뉴스', '📰', '#0060A9', 'korea'),
      () => fetchRSS('https://fs.jtbc.co.kr/RSS/newsflash.xml',
                     'JTBC', '📺', '#E4002B', 'korea'),
      () => fetchRSS('https://www.hani.co.kr/rss/',
                     '한겨레', '📰', '#005BAC', 'korea'),
    ],
  },
];

// ── 4. 풀 수집 + 핫함 정렬 ──────────────────────────────────

async function collectAll() {
  const result = [];

  for (const cat of CATEGORIES) {
    console.log(`\n📂 [${cat.label}] 수집 중...`);
    const settled = await Promise.allSettled(cat.fetchers.map(f => f()));
    const raw = settled
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .filter(p => p.title && p.url);

    // 제목 기준 중복 제거 후 핫함 점수 정렬
    const seen = new Set();
    const pool = raw
      .filter(p => {
        const key = p.title.toLowerCase().slice(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => hotnessScore(b) - hotnessScore(a));

    console.log(`  → 풀: ${pool.length}개 (Gemini가 ${cat.limit}개 선별 예정)`);
    result.push({ ...cat, pool });
  }
  return result;
}

// ── 5. Gemini: 선별 + 해설 (카테고리당 1회 호출) ────────────

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
let geminiQuotaExhausted = false;

/**
 * pool에서 limit개를 선별하고 각각 한국어 해설을 작성한다.
 * 실패 시 pool 상위 limit개에 빈 해설로 폴백.
 */
async function getAISelectionAndSummary(pool, catLabel, limit) {
  // 폴백: AI 없을 때
  const fallback = () => pool.slice(0, limit).map(a => ({ ...a, summary: '' }));

  if (!GEMINI_KEY) { console.warn('  ⚠️  GEMINI_API_KEY 없음'); return fallback(); }
  if (geminiQuotaExhausted) { console.warn('  ⚠️  Gemini 쿼터 소진 — 핫함 순 폴백'); return fallback(); }

  // Gemini에게 보낼 기사 수 (너무 많으면 토큰 낭비, 너무 적으면 선택지 부족)
  const candidates = pool.slice(0, Math.min(pool.length, 18));

  const articleList = candidates.map((a, i) => {
    const scoreStr = a.points > 0 ? `, 추천 ${a.points}` : '';
    const timeStr  = a.time instanceof Date
      ? `, 발행 ${a.time.toLocaleDateString('ko-KR')}`
      : '';
    return `[${i + 1}] "${a.title}" (출처: ${a.source}${scoreStr}${timeStr})`;
  }).join('\n');

  const prompt = `당신은 글로벌 금융·경제 전문 칼럼니스트입니다.

다음은 오늘 "${catLabel}" 분야에서 수집된 기사 후보 ${candidates.length}개입니다:

${articleList}

위 기사 중 오늘 한국 투자자에게 가장 중요한 ${limit}개를 선별하고, 각각 3~4문장의 한국어 칼럼을 작성하세요.

선별 기준 (중요도 순):
1. 시장 파급력 — 지수·환율·금리·자산가격에 직접 영향
2. 한국 투자자 관련성 — 코스피·원화·한국 기업 연관성
3. 글로벌 경제 흐름의 핵심 이슈 — 장기 트렌드 변화
4. 추천수 등 커뮤니티 관심도

칼럼 작성 규칙:
- "이 기사는" "이번 소식은" "~에 따르면" 으로 시작 금지
- 번호 나열(첫째/둘째 ①②③) 금지
- 배경·맥락·투자 시사점·전망을 담아 3~4문장
- 자연스러운 한국어 구어체
- 수치(주가·금리·환율 등)가 있다면 맥락과 함께 언급
- 투자 권유 표현("매수하라", "지금 사야 한다") 사용 금지

반드시 아래 JSON 형식으로만 응답하세요 (앞뒤 코드블록·설명 없이 순수 JSON):
[
  { "idx": 1, "summary": "칼럼 3~4문장" },
  { "idx": 5, "summary": "칼럼 3~4문장" }
]`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.65, maxOutputTokens: 1200 },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (res.status === 429) {
        if (attempt < 2) {
          const wait = 10000 * (attempt + 1);
          console.warn(`  ⚠️  Gemini 429 — ${wait / 1000}초 대기`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        console.warn('  ⚠️  Gemini 쿼터 소진');
        geminiQuotaExhausted = true;
        return fallback();
      }

      if (!res.ok) {
        console.warn(`  ⚠️  Gemini API ${res.status}`);
        return fallback();
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

      // JSON 파싱 — 코드블록 등 래핑 제거 후 시도
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      let selections;
      try {
        selections = JSON.parse(jsonStr);
      } catch {
        // 부분 파싱 시도: 첫 [ ... ] 추출
        const m = jsonStr.match(/\[[\s\S]*\]/);
        selections = m ? JSON.parse(m[0]) : null;
      }

      if (!Array.isArray(selections) || selections.length === 0) {
        console.warn('  ⚠️  Gemini 응답 파싱 실패 — 핫함 순 폴백');
        return fallback();
      }

      // idx → candidates 인덱스로 매핑 (1-based)
      const selected = selections
        .filter(s => s.idx >= 1 && s.idx <= candidates.length)
        .map(s => ({ ...candidates[s.idx - 1], summary: s.summary || '' }));

      // 선택이 부족하면 남은 pool 상위로 채움
      if (selected.length < limit) {
        const usedIdxs = new Set(selections.map(s => s.idx - 1));
        const extras = candidates.filter((_, i) => !usedIdxs.has(i)).slice(0, limit - selected.length);
        selected.push(...extras.map(a => ({ ...a, summary: '' })));
      }

      console.log(`  ✓ Gemini 선별 완료: ${selected.length}개 (from ${candidates.length}개 후보)`);
      return selected.slice(0, limit);

    } catch (e) {
      if (attempt < 2) {
        console.warn(`  ⚠️  Gemini 오류: ${e.message} — 재시도`);
        await new Promise(r => setTimeout(r, 4000));
      } else {
        console.warn(`  ⚠️  Gemini 최종 실패: ${e.message}`);
        return fallback();
      }
    }
  }
  return fallback();
}

async function enrichWithAI(categories) {
  const enriched = [];
  for (const cat of categories) {
    console.log(`\n🤖 [${cat.label}] AI 선별 + 해설 생성 중...`);
    const posts = await getAISelectionAndSummary(cat.pool, cat.label, cat.limit);
    enriched.push({ ...cat, posts });
    // Gemini 무료 플랜: 15 RPM 제한 — 카테고리 간 6초 대기
    if (!geminiQuotaExhausted) await new Promise(r => setTimeout(r, 6000));
  }
  return enriched;
}

// ── 6. HTML 생성 ─────────────────────────────────────────────

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function renderArticle(p) {
  const bodyHtml = (p.summary || p.desc)
    ? `<p class="art-body">${escapeHtml(p.summary || p.desc)}</p>`
    : '';

  const statsParts = [];
  if (p.points   > 0) statsParts.push(`👍 ${fmtNum(p.points)} 추천`);
  if (p.comments > 0) statsParts.push(`💬 ${fmtNum(p.comments)} 댓글`);
  const statsHtml = statsParts.length
    ? `<span class="art-stats">${statsParts.join(' · ')}</span>` : '';

  return `
    <article class="art-item" itemscope itemtype="https://schema.org/NewsArticle">
      <meta itemprop="datePublished" content="${TODAY}" />
      <div class="art-source-line">
        <span class="art-badge" style="background:${p.color}">${p.sourceEmoji} ${escapeHtml(p.source)}</span>
        ${statsHtml}
      </div>
      <h3 class="art-title" itemprop="headline">${escapeHtml(p.title)}</h3>
      ${bodyHtml}
      <a class="art-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" itemprop="url">
        원문 읽기 →
      </a>
    </article>`;
}

function renderCategory(cat) {
  if (!cat.posts || cat.posts.length === 0) return '';
  return `
    <section class="cat-section" id="${cat.id}">
      <div class="cat-header">
        <h2 class="cat-title" style="color:${cat.color}">${cat.label}</h2>
        <p class="cat-intro">${escapeHtml(cat.intro)}</p>
      </div>
      <div class="art-list">
        ${cat.posts.map(p => renderArticle(p)).join('\n')}
      </div>
    </section>`;
}

function generateHTML(categories) {
  const allPosts  = categories.flatMap(c => c.posts || []);
  const total     = allPosts.length;
  const topTitles = allPosts.slice(0, 3).map(p => p.title).join(' / ');
  const prevDate  = new Date(KST - 86400000).toISOString().slice(0, 10);
  const prevExists = existsSync(join(process.cwd(), 'posts', `${prevDate}.html`));

  const catSections = categories.map(renderCategory).join('\n');
  const catNav = categories
    .filter(c => c.posts?.length > 0)
    .map(c => `<a href="#${c.id}" class="nav-pill">${c.label}</a>`)
    .join('');

  const pageTitle = `${DATE_KO} 글로벌 경제·주식 브리핑`;
  const pageDesc  = `${DATE_KO} 글로벌 경제·증시 주요 뉴스 ${total}건. 미국주식·가상화폐·거시경제에서 오늘 가장 주목받은 소식을 AI가 선별·한국어로 해설합니다. ${topTitles}`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(pageTitle)} | GlobalHot</title>
  <meta name="description" content="${escapeHtml(pageDesc)}" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(pageDesc)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${SITE_URL}/posts/${TODAY}.html" />
  <meta property="og:site_name" content="GlobalHot" />
  <meta name="robots" content="index, follow" />
  <meta name="author" content="GlobalHot 경제팀" />
  <link rel="canonical" href="${SITE_URL}/posts/${TODAY}.html" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${escapeHtml(pageTitle)}",
    "description": "${escapeHtml(pageDesc)}",
    "datePublished": "${TODAY}",
    "dateModified": "${TODAY}",
    "author": { "@type": "Organization", "name": "GlobalHot 경제팀" },
    "publisher": { "@type": "Organization", "name": "GlobalHot – 글로벌 경제·주식 뉴스", "url": "${SITE_URL}" },
    "url": "${SITE_URL}/posts/${TODAY}.html"
  }
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f1117; --card: #1a1d27; --border: #2a2d3a;
      --text: #e8eaf0; --text2: #9da3b4; --text3: #6b7280;
      --accent: #6366f1; --radius: 10px;
    }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', sans-serif; line-height: 1.75; }
    .site-header { background: var(--card); border-bottom: 1px solid var(--border); padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; }
    .site-logo { color: var(--text); text-decoration: none; font-weight: 800; font-size: 18px; letter-spacing: -.3px; }
    .site-logo span { color: var(--accent); }
    .header-nav a { font-size: 13px; color: var(--text2); text-decoration: none; }
    .header-nav a:hover { color: var(--text); }
    .container { max-width: 740px; margin: 0 auto; padding: 40px 24px 100px; }
    .post-header { margin-bottom: 40px; }
    .post-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent); margin-bottom: 12px; }
    .post-header h1 { font-size: 28px; font-weight: 800; line-height: 1.35; letter-spacing: -.4px; margin-bottom: 16px; }
    .post-byline { display: flex; align-items: center; gap: 16px; font-size: 13px; color: var(--text3); padding-bottom: 24px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .post-byline strong { color: var(--text2); }
    .cat-nav { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 40px; }
    .nav-pill { padding: 5px 14px; background: transparent; border: 1px solid var(--border); border-radius: 20px; font-size: 12px; color: var(--text3); text-decoration: none; transition: all .15s; }
    .nav-pill:hover { border-color: var(--accent); color: var(--accent); }
    .cat-section { margin-bottom: 56px; }
    .cat-header { margin-bottom: 20px; }
    .cat-title { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }
    .cat-intro { font-size: 13px; color: var(--text3); line-height: 1.6; }
    .art-list { display: flex; flex-direction: column; }
    .art-item { padding: 28px 0; border-bottom: 1px solid var(--border); }
    .art-item:last-child { border-bottom: none; }
    .art-source-line { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
    .art-badge { font-size: 10px; font-weight: 700; color: #fff; padding: 2px 8px; border-radius: 4px; letter-spacing: .3px; }
    .art-stats { font-size: 11px; color: var(--text3); }
    .art-title { font-size: 19px; font-weight: 700; line-height: 1.45; letter-spacing: -.3px; margin-bottom: 12px; color: var(--text); }
    .art-body { font-size: 15px; color: var(--text2); line-height: 1.85; margin-bottom: 16px; }
    .art-link { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: var(--accent); text-decoration: none; border-bottom: 1px solid transparent; transition: border-color .15s; }
    .art-link:hover { border-bottom-color: var(--accent); }
    .post-nav { display: flex; gap: 10px; margin-top: 48px; padding-top: 32px; border-top: 1px solid var(--border); flex-wrap: wrap; }
    .post-nav a { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text2); text-decoration: none; font-size: 13px; font-weight: 600; transition: all .15s; }
    .post-nav a:hover { border-color: var(--accent); color: var(--accent); }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text3); line-height: 2; }
    @media (max-width: 600px) {
      .container { padding: 28px 18px 80px; }
      .post-header h1 { font-size: 22px; }
      .art-title { font-size: 16px; }
      .art-body { font-size: 14px; }
    }
  </style>
</head>
<body>

  <header class="site-header">
    <a class="site-logo" href="/">📈 Global<span>Hot</span></a>
    <nav class="header-nav"><a href="/posts/">지난 리포트</a></nav>
  </header>

  <div class="container" itemscope itemtype="https://schema.org/Article">

    <div class="post-header">
      <div class="post-eyebrow">🤖 GlobalHot AI 브리핑 · ${TODAY}</div>
      <h1 itemprop="headline">${escapeHtml(DATE_KO)}<br>오늘 전세계에서 가장 뜨거웠던 경제·시장 뉴스</h1>
      <div class="post-byline">
        <span>by <strong>GlobalHot AI 편집부</strong></span>
        <span>·</span>
        <span>AI 선별 ${total}건</span>
        <span>·</span>
        <span itemprop="datePublished" content="${TODAY}">${DATE_KO}</span>
      </div>
    </div>

    <nav class="cat-nav" aria-label="카테고리 바로가기">${catNav}</nav>

    ${catSections}

    <nav class="post-nav">
      <a href="/">← 메인으로</a>
      <a href="/posts/">지난 리포트</a>
      ${prevExists ? `<a href="/posts/${prevDate}.html">← 어제</a>` : ''}
    </nav>

    <div class="footer">
      © ${KST.getFullYear()} GlobalHot · 매일 오전 9시 KST 발행<br>
      출처: Yahoo Finance · MarketWatch · CNBC · Reuters Business · BBC Business ·
             Reddit (r/investing, r/stocks, r/WallStreetBets, r/economics, r/CryptoCurrency, r/Bitcoin) ·
             CoinDesk · 연합뉴스 · JTBC · 한겨레<br>
      AI 선별 및 해설: Google Gemini 2.0 Flash<br>
      <br>
      ⚠️ 면책조항: 본 콘텐츠는 AI가 자동 수집·선별·요약한 정보 제공용이며, 투자 권유가 아닙니다. 투자 결정은 반드시 전문가와 상의하시기 바랍니다.
    </div>

  </div>

</body>
</html>`;
}

// ── 7. index.html 홈페이지 AI 리포트 섹션 업데이트 ──────────

function updateHomepage(enriched) {
  const indexPath = join(process.cwd(), 'index.html');
  if (!existsSync(indexPath)) {
    console.warn('⚠️  index.html 없음 — 홈페이지 업데이트 스킵');
    return;
  }

  let html = readFileSync(indexPath, 'utf-8');
  if (!html.includes('<!-- DAILY_REPORT_START -->')) {
    console.warn('⚠️  DAILY_REPORT 마커 없음 — 홈페이지 업데이트 스킵');
    return;
  }

  const allPosts = enriched.flatMap(c => c.posts || []);
  const total    = allPosts.length;

  // 카테고리별로 대표 기사 1개씩 → 최대 3개 (다양성 확보)
  const top3 = enriched
    .filter(c => c.posts?.length > 0)
    .map(c => c.posts[0])
    .slice(0, 3);

  const articleCards = top3.map(a => `
        <div class="dr-article">
          <span class="dr-badge" style="background:${a.color}">${a.sourceEmoji} ${escapeHtml(a.source)}</span>
          <p class="dr-headline">${escapeHtml(a.title)}</p>
          ${a.summary ? `<p class="dr-summary">${escapeHtml(a.summary.slice(0, 120))}...</p>` : ''}
        </div>`).join('');

  const snippet = `<!-- DAILY_REPORT_START -->
  <div class="daily-report">
    <div class="daily-report-inner">
      <div class="dr-header">
        <span class="dr-eyebrow">🤖 AI 경제·시장 브리핑 · ${TODAY}</span>
        <span class="dr-date">${DATE_KO}</span>
      </div>
      <div class="dr-articles">${articleCards}
      </div>
      <a class="dr-more" href="/posts/${TODAY}.html">오늘 전체 브리핑 보기 (${total}개 기사) →</a>
    </div>
  </div>
  <!-- DAILY_REPORT_END -->`;

  html = html.replace(
    /<!-- DAILY_REPORT_START -->[\s\S]*?<!-- DAILY_REPORT_END -->/,
    snippet,
  );

  writeFileSync(indexPath, html, 'utf-8');
  console.log('✅ index.html AI 리포트 섹션 업데이트 완료');
}

// ── 8. posts/index.html 업데이트 ───────────────────────────

function updatePostsIndex() {
  const postsDir  = join(process.cwd(), 'posts');
  const indexPath = join(postsDir, 'index.html');

  const files = readdirSync(postsDir)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .sort()
    .reverse();

  const listHTML = files.map(f => {
    const dateStr = f.replace('.html', '');
    const d = new Date(dateStr + 'T09:00:00+09:00');
    const dayName = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dayName})`;
    return `
    <li>
      <a href="/posts/${f}">
        <span class="item-date">${dateStr}</span>
        <span class="item-title">📊 ${label} 글로벌 경제·주식 브리핑</span>
      </a>
    </li>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>글로벌 경제·주식 AI 브리핑 목록 | GlobalHot</title>
  <meta name="description" content="GlobalHot AI 경제·주식 브리핑 전체 목록. 매일 미국주식·가상화폐·글로벌경제 뉴스를 AI가 선별·한국어로 해설합니다. 총 ${files.length}개의 브리핑." />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${SITE_URL}/posts/" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --bg: #0f1117; --card: #1a1d27; --border: #2a2d3a; --text: #e8eaf0; --text2: #9da3b4; --text3: #6b7280; --accent: #6366f1; }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', sans-serif; }
    .site-header { background: var(--card); border-bottom: 1px solid var(--border); padding: 14px 20px; }
    .site-header a { color: var(--text); text-decoration: none; font-weight: 800; font-size: 18px; }
    .site-header span { color: var(--accent); }
    .container { max-width: 760px; margin: 0 auto; padding: 32px 20px 60px; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
    .subtitle { font-size: 14px; color: var(--text2); margin-bottom: 28px; }
    ul { list-style: none; display: flex; flex-direction: column; gap: 4px; }
    li a { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; text-decoration: none; }
    li a:hover { border-color: var(--accent); }
    .item-date { font-size: 12px; color: var(--text3); min-width: 90px; font-family: monospace; }
    .item-title { font-size: 14px; color: var(--text); font-weight: 500; }
    li a:hover .item-title { color: var(--accent); }
    .back-link { display: inline-block; margin-top: 28px; color: var(--text2); text-decoration: none; font-size: 14px; }
    .back-link:hover { color: var(--accent); }
  </style>
</head>
<body>
  <header class="site-header"><a href="/">📈 Global<span>Hot</span></a></header>
  <div class="container">
    <h1>📚 AI 경제·주식 브리핑 아카이브</h1>
    <p class="subtitle">매일 미국주식·가상화폐·글로벌경제 뉴스를 AI가 선별·한국어로 해설합니다. 총 ${files.length}개의 브리핑</p>
    <ul>${listHTML}</ul>
    <a class="back-link" href="/">← GlobalHot 메인으로</a>
  </div>
</body>
</html>`;

  writeFileSync(indexPath, html, 'utf-8');
  console.log('✅ posts/index.html 업데이트 완료');
}

// ── 9. sitemap.xml 업데이트 ────────────────────────────────

function updateSitemap() {
  const postsDir    = join(process.cwd(), 'posts');
  const sitemapPath = join(process.cwd(), 'sitemap.xml');

  const postFiles = readdirSync(postsDir)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .sort()
    .reverse();

  const postUrls = postFiles.map(f => {
    const dateStr = f.replace('.html', '');
    return `  <url>
    <loc>${SITE_URL}/posts/${f}</loc>
    <lastmod>${dateStr}</lastmod>
    <changefreq>never</changefreq>
    <priority>0.8</priority>
  </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_URL}/posts/</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${SITE_URL}/about.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${SITE_URL}/privacy.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
${postUrls}
</urlset>`;

  writeFileSync(sitemapPath, xml, 'utf-8');
  console.log(`✅ sitemap.xml 업데이트 완료 (포스트 ${postFiles.length}개)`);
}

// ── 10. 메인 실행 ───────────────────────────────────────────

(async () => {
  console.log(`\n🚀 ${TODAY} (${DATE_KO}) 일일 포스트 생성 시작 v2`);
  console.log(`🤖 AI: Gemini 2.0 Flash (카테고리당 1회 호출 — 선별+해설 동시)\n`);

  const postsDir = join(process.cwd(), 'posts');
  const filePath = join(postsDir, `${TODAY}.html`);
  mkdirSync(postsDir, { recursive: true });

  if (existsSync(filePath)) {
    console.log(`⏭️  이미 존재: posts/${TODAY}.html — 스킵`);
    process.exit(0);
  }

  // 1단계: 풀 수집 + 핫함 정렬
  const categories = await collectAll();
  const poolTotal  = categories.reduce((s, c) => s + (c.pool?.length || 0), 0);
  console.log(`\n📦 총 ${poolTotal}개 기사 풀 수집 완료`);

  if (poolTotal === 0) {
    console.error('❌ 기사를 하나도 가져오지 못했습니다.');
    process.exit(1);
  }

  // 2단계: Gemini 선별 + 해설
  console.log('\n🤖 AI 선별 및 한국어 해설 생성 중...');
  const enriched  = await enrichWithAI(categories);
  const postTotal = enriched.reduce((s, c) => s + (c.posts?.length || 0), 0);
  console.log(`\n✅ AI 선별 완료: ${postTotal}개 기사`);

  // 3단계: HTML 생성
  const html = generateHTML(enriched);
  writeFileSync(filePath, html, 'utf-8');
  console.log(`✅ posts/${TODAY}.html 생성 완료`);

  updateHomepage(enriched);
  updatePostsIndex();
  updateSitemap();
  console.log('\n🎉 완료!');
})();
