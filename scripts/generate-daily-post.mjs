/**
 * GlobalHot 일일 경제·시장 브리핑 자동 생성기
 * 매일 오전 9시 KST GitHub Actions에서 실행
 * 소스: Yahoo Finance, CNBC, Reuters, BBC Business, r/investing, r/stocks, r/economics,
 *        r/CryptoCurrency, HN Algolia (핀테크·AI)
 */

import { writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const SITE_URL  = process.env.SITE_URL || 'https://globalhot.pages.dev';
const KST       = new Date(Date.now() + 9 * 3600_000);
const TODAY     = KST.toISOString().slice(0, 10);
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const DATE_KO   = `${KST.getFullYear()}년 ${KST.getMonth() + 1}월 ${KST.getDate()}일 (${DAY_NAMES[KST.getDay()]})`;

// ── 1. 데이터 수집 ────────────────────────────────────────

/** Node.js용 간단한 RSS XML 파서 */
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
                   ?.replace(/<[^>]+>/g, '')?.trim()?.slice(0, 200) || '';
    if (title && link) items.push({ title, link, date, desc });
  }
  return items;
}

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GlobalHot/1.0 (news aggregator)' },
      signal: AbortSignal.timeout(12000),
      ...opts,
    });
    if (!res.ok) {
      console.warn(`  ⚠️  ${url.slice(0, 60)} → HTTP ${res.status}`);
      return null;
    }
    return res;
  } catch (e) {
    console.warn(`  ⚠️  fetch 실패: ${e.message}`);
    return null;
  }
}

/** HN Algolia API (공개 접근, 인증 불필요) */
async function fetchHNAlgolia(limit = 5) {
  const res = await safeFetch(
    `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${limit * 3}`
  );
  if (!res) return [];
  const data = await res.json();
  const results = (data.hits || [])
    .filter(h => h.url && h.points > 30)
    .slice(0, limit)
    .map(h => ({
      title:       h.title,
      url:         h.url,
      points:      h.points || 0,
      comments:    h.num_comments || 0,
      source:      'Hacker News',
      sourceEmoji: '💻',
      color:       '#FF6600',
      category:    'tech',
    }));
  console.log(`  HN Algolia: ${results.length}개`);
  return results;
}

/** BBC RSS 피드 (공개, 안정적) */
async function fetchBBCRSS(path, source, emoji, color, category, limit = 3) {
  const res = await safeFetch(`https://feeds.bbci.co.uk/news/${path}/rss.xml`);
  if (!res) return [];
  const xml  = await res.text();
  const results = parseRSSXml(xml).slice(0, limit).map(i => ({
    title:       i.title,
    url:         i.link,
    points:      0,
    comments:    0,
    desc:        i.desc,
    source,
    sourceEmoji: emoji,
    color,
    category,
  }));
  console.log(`  BBC ${path}: ${results.length}개`);
  return results;
}

/** Reddit RSS (JSON API보다 덜 제한적) */
async function fetchRedditRSS(sub, label, emoji, color, category, limit = 3) {
  const res = await safeFetch(`https://www.reddit.com/r/${sub}/hot.rss?limit=20`);
  if (!res) return [];
  const xml  = await res.text();
  const results = parseRSSXml(xml)
    .filter(i => i.title && !i.title.toLowerCase().includes('weekly thread'))
    .slice(0, limit)
    .map(i => ({
      title:       i.title,
      url:         i.link,
      points:      0,
      comments:    0,
      source:      label,
      sourceEmoji: emoji,
      color,
      category,
    }));
  console.log(`  Reddit r/${sub} RSS: ${results.length}개`);
  return results;
}

/** DW (Deutsche Welle) RSS - 독립적인 글로벌 뉴스 */
async function fetchDWRSS(limit = 3) {
  const res = await safeFetch('https://rss.dw.com/xml/rss-en-world');
  if (!res) return [];
  const xml  = await res.text();
  const results = parseRSSXml(xml).slice(0, limit).map(i => ({
    title:       i.title,
    url:         i.link,
    points:      0,
    comments:    0,
    source:      'DW News',
    sourceEmoji: '🌐',
    color:       '#005DAC',
    category:    'world',
  }));
  console.log(`  DW News: ${results.length}개`);
  return results;
}

const CATEGORIES = [
  {
    id:      'stocks',
    label:   '📊 주식·증시',
    intro:   '오늘 글로벌 증시에서 가장 주목받은 종목·이슈입니다. S&P500, 나스닥, 개별주 핵심 뉴스를 정리했습니다.',
    color:   '#00C851',
    fetchers: [
      () => fetchHNAlgolia(3),
      () => fetchBBCRSS('business', 'BBC Business', '💼', '#BB1919', 'stocks', 3),
    ],
    limit: 5,
  },
  {
    id:      'economy',
    label:   '🌍 글로벌 경제',
    intro:   '오늘 주요 글로벌 경제 이슈입니다. 연준(Fed) 정책, 인플레이션, 거시경제 동향을 짚어봅니다.',
    color:   '#1565C0',
    fetchers: [
      () => fetchBBCRSS('world', 'BBC World', '🌍', '#BB1919', 'economy', 3),
      () => fetchRedditRSS('economics',  'Reddit 경제학', '📚', '#1565C0', 'economy', 2),
      () => fetchRedditRSS('investing',  'Reddit 투자', '📈', '#00C851', 'economy', 2),
    ],
    limit: 5,
  },
  {
    id:      'market',
    label:   '💹 시장·환율·원자재',
    intro:   '외환시장, 원자재(오일·금), 채권 금리 등 오늘의 시장 동향입니다.',
    color:   '#4285F4',
    fetchers: [
      () => fetchBBCRSS('business/market_data', 'BBC 시장', '💹', '#BB1919', 'market', 2),
      () => fetchRedditRSS('stocks', 'Reddit 주식', '📊', '#1a73e8', 'market', 3),
    ],
    limit: 4,
  },
  {
    id:      'crypto',
    label:   '₿ 가상화폐',
    intro:   '비트코인·이더리움·알트코인 오늘의 주요 뉴스와 커뮤니티 화제입니다.',
    color:   '#F7931A',
    fetchers: [
      () => fetchRedditRSS('CryptoCurrency', 'Reddit 크립토', '₿', '#F7931A', 'crypto', 3),
      () => fetchRedditRSS('Bitcoin',        'Reddit 비트코인', '₿', '#F7931A', 'crypto', 2),
    ],
    limit: 4,
  },
];

async function collectAll() {
  const result = [];
  for (const cat of CATEGORIES) {
    console.log(`\n📂 [${cat.label}] 수집 중...`);
    const settled = await Promise.allSettled(cat.fetchers.map(f => f()));
    const posts   = settled
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);

    const seen = new Set();
    const deduped = posts
      .sort((a, b) => b.points - a.points)
      .filter(p => {
        if (seen.has(p.title)) return false;
        seen.add(p.title);
        return true;
      })
      .slice(0, cat.limit);

    console.log(`  → ${deduped.length}개 선정`);
    result.push({ ...cat, posts: deduped });
  }
  return result;
}

// ── 2. AI 한국어 해설 생성 (Google Gemini) ───────────────

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

const COLUMN_INSTRUCTION = `당신은 글로벌 금융·경제 전문 칼럼니스트입니다. 아래 규칙을 따르세요.
- "이 기사는" "이번 소식은" "~에 따르면" 으로 시작 금지
- 번호 나열(첫째/둘째, ①②③) 금지
- 배경·맥락·투자 시사점·전망을 담아 3~4문장으로 작성
- 자연스러운 한국어 구어체
- 주가·지수·금리·환율 등 수치가 있다면 맥락과 함께 언급
- 투자 권유 표현("매수하라", "지금 사야 한다") 사용 금지 (정보 제공만)

좋은 예시:
뉴스: "Fed signals rate cuts may slow as inflation stays sticky"
칼럼: 미 연준이 인플레이션이 예상보다 끈적하게 유지되면서 금리 인하 속도를 늦출 수 있다는 신호를 보냈다. 시장이 연내 3~4회 인하를 기대했던 것과 달리 실제로는 1~2회에 그칠 수 있다는 전망이 고개를 들고 있다. 달러 강세와 국채 금리 상승 압력이 다시 살아나면서 신흥국 증시와 원화 환율에도 부담이 될 수 있다. 다음 FOMC 회의 발언이 주목된다.

`;

let geminiQuotaExhausted = false; // 전역 429 플래그

async function getAISummary(title, source, retries = 2) {
  if (!GEMINI_KEY) { console.warn('  ⚠️  GEMINI_API_KEY 없음'); return ''; }
  if (geminiQuotaExhausted) return ''; // 쿼터 소진 시 즉시 스킵
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${COLUMN_INSTRUCTION}뉴스: "${title}" (출처: ${source})\n\n칼럼:` }],
          }],
          generationConfig: { temperature: 0.75, maxOutputTokens: 300 },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 429) {
        if (attempt < retries) {
          const waitMs = 8000 * (attempt + 1); // 8s → 16s (빠른 재시도)
          console.warn(`  ⚠️  Gemini 429 — ${waitMs / 1000}초 대기 (${attempt + 1}/${retries})`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        console.warn('  ⚠️  Gemini 429 — 쿼터 소진, 이후 기사 스킵');
        geminiQuotaExhausted = true;
        return '';
      }

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        console.warn(`  ⚠️  Gemini API ${res.status}: ${err.slice(0, 120)}`);
        return '';
      }

      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } catch (e) {
      if (attempt < retries) {
        console.warn(`  ⚠️  Gemini 오류: ${e.message} — 재시도`);
        await new Promise(r => setTimeout(r, 3000));
      } else {
        console.warn(`  ⚠️  Gemini 실패: ${e.message}`);
        return '';
      }
    }
  }
  return '';
}

async function enrichWithSummaries(categories) {
  const enriched = [];
  for (const cat of categories) {
    const posts = [];
    for (const p of cat.posts) {
      process.stdout.write(`  🤖 AI 해설: ${p.title.slice(0, 45)}... `);
      const summary = await getAISummary(p.title, p.source);
      console.log(summary ? '✓' : '(스킵)');
      posts.push({ ...p, summary });
      if (!geminiQuotaExhausted) await new Promise(r => setTimeout(r, 4000)); // Gemini 무료: 15 RPM
    }
    enriched.push({ ...cat, posts });
  }
  return enriched;
}

// ── 3. HTML 생성 ──────────────────────────────────────────

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
  const bodyHtml = p.summary || p.desc
    ? `<p class="art-body">${escapeHtml(p.summary || p.desc)}</p>`
    : '';

  const statsParts = [];
  if (p.points > 0)   statsParts.push(`👍 ${fmtNum(p.points)} 추천`);
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
      <h3 class="art-title" itemprop="headline">
        ${escapeHtml(p.title)}
      </h3>
      ${bodyHtml}
      <a class="art-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" itemprop="url">
        원문 읽기 →
      </a>
    </article>`;
}

function renderCategory(cat) {
  if (cat.posts.length === 0) return '';
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
  const allPosts   = categories.flatMap(c => c.posts);
  const total      = allPosts.length;
  const topTitles  = allPosts.slice(0, 3).map(p => p.title).join(' / ');
  const prevDate   = new Date(KST - 86400000).toISOString().slice(0, 10);
  const prevExists = existsSync(join(process.cwd(), 'posts', `${prevDate}.html`));

  const catSections = categories.map(renderCategory).join('\n');
  const catNav = categories
    .filter(c => c.posts.length > 0)
    .map(c => `<a href="#${c.id}" class="nav-pill">${c.label}</a>`)
    .join('');

  const pageTitle = `${DATE_KO} 글로벌 경제·주식 브리핑`;
  const pageDesc  = `${DATE_KO} 글로벌 경제·증시 주요 뉴스 ${total}건. 미국주식·가상화폐·거시경제 분야에서 오늘 가장 주목받은 소식을 AI가 한국어로 해설합니다. ${topTitles}`;

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

    /* 헤더 */
    .site-header { background: var(--card); border-bottom: 1px solid var(--border); padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; }
    .site-logo { color: var(--text); text-decoration: none; font-weight: 800; font-size: 18px; letter-spacing: -.3px; }
    .site-logo span { color: var(--accent); }
    .header-nav a { font-size: 13px; color: var(--text2); text-decoration: none; }
    .header-nav a:hover { color: var(--text); }

    /* 레이아웃 */
    .container { max-width: 740px; margin: 0 auto; padding: 40px 24px 100px; }

    /* 포스트 헤더 */
    .post-header { margin-bottom: 40px; }
    .post-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent); margin-bottom: 12px; }
    .post-header h1 { font-size: 28px; font-weight: 800; line-height: 1.35; letter-spacing: -.4px; margin-bottom: 16px; }
    .post-byline { display: flex; align-items: center; gap: 16px; font-size: 13px; color: var(--text3); padding-bottom: 24px; border-bottom: 1px solid var(--border); }
    .post-byline strong { color: var(--text2); }

    /* 카테고리 네비 */
    .cat-nav { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 40px; }
    .nav-pill { padding: 5px 14px; background: transparent; border: 1px solid var(--border); border-radius: 20px; font-size: 12px; color: var(--text3); text-decoration: none; transition: all .15s; }
    .nav-pill:hover { border-color: var(--accent); color: var(--accent); }

    /* 카테고리 섹션 */
    .cat-section { margin-bottom: 56px; }
    .cat-header { margin-bottom: 20px; }
    .cat-title { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }
    .cat-intro { font-size: 13px; color: var(--text3); line-height: 1.6; }

    /* 기사 아이템 — 신문 칼럼 스타일 */
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

    /* 하단 네비 */
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
    <a class="site-logo" href="/">🌐 Global<span>Hot</span></a>
    <nav class="header-nav"><a href="/posts/">지난 리포트</a></nav>
  </header>

  <div class="container" itemscope itemtype="https://schema.org/Article">

    <div class="post-header">
      <div class="post-eyebrow">GlobalHot Daily · ${TODAY}</div>
      <h1 itemprop="headline">${escapeHtml(DATE_KO)}<br>오늘 전세계에서 가장 뜨거웠던 뉴스</h1>
      <div class="post-byline">
        <span>by <strong>GlobalHot 편집부</strong></span>
        <span>·</span>
        <span>뉴스 ${total}건</span>
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
      © ${KST.getFullYear()} GlobalHot · 매일 오전 9시 발행<br>
      출처: BBC Business · Reuters · Reddit (r/investing, r/stocks, r/economics, r/CryptoCurrency) · Hacker News<br>
      <br>
      ⚠️ 면책조항: 본 콘텐츠는 AI가 자동으로 수집·요약한 정보 제공용이며, 투자 권유가 아닙니다. 투자 결정은 반드시 전문가와 상의하시기 바랍니다.
    </div>

  </div>

</body>
</html>`;
}

// ── 4. index.html 홈페이지 AI 리포트 섹션 업데이트 ───────

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

  const allPosts = enriched.flatMap(c => c.posts);
  const top3 = allPosts.slice(0, 3);
  const total = allPosts.length;

  const articleCards = top3.map(a => `
        <div class="dr-article">
          <span class="dr-badge" style="background:${a.color}">${a.sourceEmoji} ${escapeHtml(a.source)}</span>
          <p class="dr-headline">${escapeHtml(a.title)}</p>
          ${a.summary ? `<p class="dr-summary">${escapeHtml(a.summary)}</p>` : ''}
        </div>`).join('');

  const snippet = `<!-- DAILY_REPORT_START -->
  <div class="daily-report">
    <div class="daily-report-inner">
      <div class="dr-header">
        <span class="dr-eyebrow">🤖 AI 글로벌 리포트 · ${TODAY}</span>
        <span class="dr-date">${DATE_KO}</span>
      </div>
      <div class="dr-articles">${articleCards}
      </div>
      <a class="dr-more" href="/posts/${TODAY}.html">오늘 전체 리포트 보기 (${total}개 기사) →</a>
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

// ── 6. posts/index.html 업데이트 ──────────────────────────

function updateIndex() {
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
  <meta name="description" content="GlobalHot AI 경제·주식 브리핑 전체 목록. 매일 미국주식·가상화폐·글로벌경제 뉴스를 AI가 한국어로 해설합니다. 총 ${files.length}개의 브리핑." />
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
    <p class="subtitle">매일 미국주식·가상화폐·글로벌경제 뉴스를 AI가 한국어로 해설합니다. 총 ${files.length}개의 브리핑</p>
    <ul>${listHTML}</ul>
    <a class="back-link" href="/">← GlobalHot 메인으로</a>
  </div>
</body>
</html>`;

  writeFileSync(indexPath, html, 'utf-8');
  console.log('\n✅ posts/index.html 업데이트 완료');
}

// ── 7. sitemap.xml 업데이트 ───────────────────────────────

function updateSitemap() {
  const postsDir   = join(process.cwd(), 'posts');
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

// ── 8. 메인 실행 ──────────────────────────────────────────

(async () => {
  console.log(`\n🚀 ${TODAY} (${DATE_KO}) 일일 포스트 생성 시작`);
  console.log(`🌐 AI API: ${SITE_URL}/api/summarize\n`);

  const postsDir = join(process.cwd(), 'posts');
  const filePath = join(postsDir, `${TODAY}.html`);
  mkdirSync(postsDir, { recursive: true });

  if (existsSync(filePath)) {
    console.log(`⏭️  이미 존재: posts/${TODAY}.html — 스킵`);
    process.exit(0);
  }

  const categories = await collectAll();
  const total = categories.reduce((s, c) => s + c.posts.length, 0);
  console.log(`\n📦 총 ${total}개 기사 수집 완료`);

  if (total === 0) {
    console.error('❌ 기사를 하나도 가져오지 못했습니다.');
    process.exit(1);
  }

  console.log('\n🤖 AI 한국어 해설 생성 중...');
  const enriched = await enrichWithSummaries(categories);

  const html = generateHTML(enriched);
  writeFileSync(filePath, html, 'utf-8');
  console.log(`\n✅ posts/${TODAY}.html 생성 완료`);

  updateHomepage(enriched);
  updateIndex();
  updateSitemap();
  console.log('\n🎉 완료!');
})();
