/**
 * GlobalHot 일일 화제 콘텐츠 자동 생성기
 * 매일 오전 9시 KST GitHub Actions에서 실행
 * 소스: HN Algolia API + BBC RSS (GitHub Actions에서 안정적으로 접근 가능)
 */

import { writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
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
    id:      'tech',
    label:   '💻 테크 & 개발',
    intro:   '오늘 전세계 개발자와 테크 업계에서 가장 주목받은 뉴스와 이슈입니다.',
    color:   '#FF6600',
    fetchers: [
      () => fetchHNAlgolia(4),
      () => fetchBBCRSS('technology', 'BBC 테크', '📡', '#BB1919', 'tech', 2),
    ],
    limit: 5,
  },
  {
    id:      'world',
    label:   '🌍 세계 이슈',
    intro:   '오늘 세계 주요 언론이 가장 많이 다룬 국제 뉴스입니다.',
    color:   '#1565C0',
    fetchers: [
      () => fetchBBCRSS('world', 'BBC World', '🌍', '#BB1919', 'world', 3),
      () => fetchDWRSS(2),
      () => fetchRedditRSS('worldnews', 'Reddit 세계뉴스', '📰', '#FF4500', 'world', 2),
    ],
    limit: 5,
  },
  {
    id:      'science',
    label:   '🔬 과학 & 우주',
    intro:   '오늘 과학·우주 분야에서 화제가 된 연구와 발견입니다.',
    color:   '#00838F',
    fetchers: [
      () => fetchBBCRSS('science_and_environment', 'BBC 과학', '🔬', '#00838F', 'science', 3),
      () => fetchRedditRSS('space', 'Reddit 우주', '🚀', '#1A237E', 'science', 2),
    ],
    limit: 4,
  },
  {
    id:      'interesting',
    label:   '🤯 오늘의 발견',
    intro:   '"이런 게 있었어?" 오늘 전세계 사람들이 공유하고 놀란 흥미로운 이야기들입니다.',
    color:   '#46D160',
    fetchers: [
      () => fetchRedditRSS('todayilearned',     'Reddit TIL', '🤯', '#46D160', 'interesting', 2),
      () => fetchRedditRSS('interestingasfuck', 'Reddit IAF', '✨', '#0DD3BB', 'interesting', 2),
    ],
    limit: 3,
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

// ── 2. AI 한국어 해설 생성 ────────────────────────────────

async function getAISummary(title, source) {
  try {
    const res = await fetch(`${SITE_URL}/api/summarize`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, source, lang: 'ko', mode: 'long' }),
      signal:  AbortSignal.timeout(20000),
    });
    if (!res.ok) { console.warn(`  ⚠️  AI API ${res.status}`); return ''; }
    const data = await res.json();
    return data.summary || '';
  } catch (e) {
    console.warn(`  ⚠️  AI 해설 실패: ${e.message}`);
    return '';
  }
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
      await new Promise(r => setTimeout(r, 400));
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

function renderArticle(p, rank) {
  const summaryHtml = p.summary
    ? `<p class="article-summary">${escapeHtml(p.summary)}</p>`
    : (p.desc ? `<p class="article-summary">${escapeHtml(p.desc)}</p>` : '');

  const statsHtml = p.points > 0
    ? `<span>👍 ${fmtNum(p.points)}</span>${p.comments > 0 ? `<span>💬 ${fmtNum(p.comments)}</span>` : ''}`
    : '';

  return `
    <article class="article-card" itemscope itemtype="https://schema.org/NewsArticle">
      <meta itemprop="datePublished" content="${TODAY}" />
      <div class="article-rank ${rank <= 3 ? 'top' : ''}">${rank}</div>
      <div class="article-body">
        <h3 class="article-title" itemprop="headline">
          <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" itemprop="url">
            ${escapeHtml(p.title)}
          </a>
        </h3>
        ${summaryHtml}
        <div class="article-meta">
          <span class="source-badge" style="background:${p.color}">${p.sourceEmoji} ${escapeHtml(p.source)}</span>
          ${statsHtml}
          <a class="read-more" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">원문 →</a>
        </div>
      </div>
    </article>`;
}

function renderCategory(cat) {
  if (cat.posts.length === 0) return '';
  return `
    <section class="category-section" id="${cat.id}">
      <h2 class="category-title" style="border-left-color:${cat.color}">${cat.label}</h2>
      <p class="category-intro">${escapeHtml(cat.intro)}</p>
      <div class="article-list">
        ${cat.posts.map((p, i) => renderArticle(p, i + 1)).join('\n')}
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

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(DATE_KO)} 글로벌 화제 뉴스 AI 총정리 | GlobalHot</title>
  <meta name="description" content="${escapeHtml(`${DATE_KO} 전세계 화제 뉴스 ${total}건을 AI가 한국어로 해설합니다. ${topTitles}`)}" />
  <meta property="og:title" content="${escapeHtml(DATE_KO)} 글로벌 화제 뉴스 AI 총정리" />
  <meta property="og:description" content="${escapeHtml(topTitles)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${SITE_URL}/posts/${TODAY}.html" />
  <meta property="og:site_name" content="GlobalHot" />
  <meta name="robots" content="index, follow" />
  <meta name="author" content="GlobalHot" />
  <link rel="canonical" href="${SITE_URL}/posts/${TODAY}.html" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${escapeHtml(DATE_KO)} 글로벌 화제 뉴스 AI 총정리",
    "description": "${escapeHtml(topTitles)}",
    "datePublished": "${TODAY}",
    "dateModified": "${TODAY}",
    "author": { "@type": "Organization", "name": "GlobalHot" },
    "publisher": { "@type": "Organization", "name": "GlobalHot", "url": "${SITE_URL}" },
    "url": "${SITE_URL}/posts/${TODAY}.html"
  }
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f1117; --card: #1a1d27; --border: #2a2d3a;
      --text: #e8eaf0; --text2: #9da3b4; --text3: #6b7280;
      --accent: #6366f1; --radius: 12px;
    }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', sans-serif; line-height: 1.7; }
    .site-header { background: var(--card); border-bottom: 1px solid var(--border); padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; }
    .site-header a { color: var(--text); text-decoration: none; font-weight: 800; font-size: 18px; }
    .site-header span { color: var(--accent); }
    .header-nav a { font-size: 13px; color: var(--text2); text-decoration: none; }
    .header-nav a:hover { color: var(--accent); }
    .container { max-width: 800px; margin: 0 auto; padding: 32px 20px 80px; }
    .post-header { margin-bottom: 36px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
    .post-date { font-size: 12px; color: var(--text3); margin-bottom: 10px; letter-spacing: .5px; }
    .post-header h1 { font-size: 26px; font-weight: 800; line-height: 1.4; margin-bottom: 12px; }
    .post-intro { font-size: 14px; color: var(--text2); line-height: 1.8; }
    .cat-nav { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 32px; }
    .nav-pill { padding: 6px 14px; background: var(--card); border: 1px solid var(--border); border-radius: 20px; font-size: 13px; color: var(--text2); text-decoration: none; }
    .nav-pill:hover { border-color: var(--accent); color: var(--accent); }
    .category-section { margin-bottom: 48px; }
    .category-title { font-size: 18px; font-weight: 800; margin-bottom: 8px; padding-left: 14px; border-left: 4px solid; }
    .category-intro { font-size: 13px; color: var(--text2); margin-bottom: 20px; line-height: 1.6; }
    .article-list { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: var(--card); }
    .article-card { display: flex; align-items: flex-start; gap: 14px; padding: 20px; border-bottom: 1px solid var(--border); }
    .article-card:last-child { border-bottom: none; }
    .article-card:hover { background: rgba(99,102,241,.05); }
    .article-rank { font-size: 16px; font-weight: 800; color: var(--text3); min-width: 28px; text-align: center; padding-top: 3px; flex-shrink: 0; }
    .article-rank.top { color: #f59e0b; }
    .article-body { flex: 1; min-width: 0; }
    .article-title { font-size: 15px; font-weight: 700; margin-bottom: 10px; line-height: 1.5; }
    .article-title a { color: var(--text); text-decoration: none; }
    .article-title a:hover { color: var(--accent); }
    .article-summary { font-size: 14px; color: var(--text2); line-height: 1.8; margin-bottom: 12px; background: rgba(99,102,241,.07); border-left: 3px solid var(--accent); padding: 10px 14px; border-radius: 0 6px 6px 0; }
    .article-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--text3); }
    .source-badge { color: #fff; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .read-more { color: var(--accent); text-decoration: none; font-weight: 600; margin-left: auto; }
    .read-more:hover { text-decoration: underline; }
    .post-nav { display: flex; gap: 12px; margin-top: 40px; flex-wrap: wrap; }
    .post-nav a { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; color: var(--text2); text-decoration: none; font-size: 14px; font-weight: 600; }
    .post-nav a:hover { border-color: var(--accent); color: var(--accent); }
    .footer { text-align: center; margin-top: 48px; font-size: 12px; color: var(--text3); line-height: 1.8; }
    @media (max-width: 600px) { .post-header h1 { font-size: 20px; } .article-title { font-size: 14px; } .article-card { padding: 16px; gap: 10px; } }
  </style>
</head>
<body>

  <header class="site-header">
    <a href="/">🌐 Global<span>Hot</span></a>
    <nav class="header-nav"><a href="/posts/">📚 전체 리포트</a></nav>
  </header>

  <div class="container" itemscope itemtype="https://schema.org/Article">
    <div class="post-header">
      <div class="post-date">📅 ${DATE_KO} · AI 글로벌 뉴스 리포트</div>
      <h1 itemprop="headline">${escapeHtml(DATE_KO)} 전세계 화제 뉴스 총정리</h1>
      <p class="post-intro" itemprop="description">
        Hacker News, BBC, Reddit 등 전세계 주요 매체에서 오늘 가장 많이 회자된 기사 ${total}건을
        AI가 한국어로 해설했습니다. 테크·세계이슈·과학·흥미로운 발견까지 한눈에 확인하세요.
      </p>
    </div>

    <nav class="cat-nav" aria-label="카테고리 바로가기">${catNav}</nav>

    ${catSections}

    <nav class="post-nav">
      <a href="/">← GlobalHot 메인</a>
      <a href="/posts/">📚 전체 리포트</a>
      ${prevExists ? `<a href="/posts/${prevDate}.html">← 어제 리포트</a>` : ''}
    </nav>

    <div class="footer">
      © ${KST.getFullYear()} GlobalHot · 매일 오전 9시 자동 업데이트<br>
      뉴스 출처: Hacker News · BBC · Reddit · DW News · AI 해설: Cloudflare Workers AI
    </div>
  </div>

</body>
</html>`;
}

// ── 4. posts/index.html 업데이트 ──────────────────────────

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
        <span class="item-title">📋 ${label} 글로벌 화제 뉴스 총정리</span>
      </a>
    </li>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>글로벌 화제 뉴스 AI 일일 리포트 목록 | GlobalHot</title>
  <meta name="description" content="GlobalHot AI 글로벌 뉴스 리포트 전체 목록. 매일 전세계 화제 뉴스를 AI가 한국어로 해설합니다. 총 ${files.length}개의 리포트." />
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
  <header class="site-header"><a href="/">🌐 Global<span>Hot</span></a></header>
  <div class="container">
    <h1>📚 AI 글로벌 뉴스 리포트</h1>
    <p class="subtitle">매일 전세계 화제 뉴스를 AI가 한국어로 해설합니다. 총 ${files.length}개의 리포트</p>
    <ul>${listHTML}</ul>
    <a class="back-link" href="/">← GlobalHot 메인으로</a>
  </div>
</body>
</html>`;

  writeFileSync(indexPath, html, 'utf-8');
  console.log('\n✅ posts/index.html 업데이트 완료');
}

// ── 5. sitemap.xml 업데이트 ───────────────────────────────

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

// ── 6. 메인 실행 ──────────────────────────────────────────

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

  updateIndex();
  updateSitemap();
  console.log('\n🎉 완료!');
})();
