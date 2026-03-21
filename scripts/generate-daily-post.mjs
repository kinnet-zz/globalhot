/**
 * GlobalHot 일일 화제 콘텐츠 자동 생성기
 * 매일 오전 9시 KST GitHub Actions에서 실행
 * - 글로벌 화제 기사 수집 → AI 한국어 해설 생성 → 정적 HTML 발행
 */

import { writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const SITE_URL = process.env.SITE_URL || 'https://globalhot.pages.dev';
const KST      = new Date(Date.now() + 9 * 3600_000);
const TODAY    = KST.toISOString().slice(0, 10);
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const DATE_KO  = `${KST.getFullYear()}년 ${KST.getMonth() + 1}월 ${KST.getDate()}일 (${DAY_NAMES[KST.getDay()]})`;

// ── 1. 데이터 수집 ────────────────────────────────────────

async function fetchHN(limit = 5) {
  try {
    const res = await fetch('https://hacker-news.firebaseio.com/v1/topstories.json',
      { headers: { 'User-Agent': 'GlobalHot/1.0' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) { console.warn(`⚠️ HN topstories HTTP ${res.status}`); return []; }
    const ids   = (await res.json()).slice(0, 30);
    const items = await Promise.all(
      ids.map(id =>
        fetch(`https://hacker-news.firebaseio.com/v1/item/${id}.json`,
          { signal: AbortSignal.timeout(5000) })
          .then(r => r.json())
          .catch(() => null)
      )
    );
    const results = items
      .filter(i => i && i.title && i.score > 50 && i.url)
      .map(i => ({
        title:       i.title,
        url:         i.url,
        points:      i.score,
        comments:    i.descendants || 0,
        source:      'Hacker News',
        sourceEmoji: '💻',
        color:       '#FF6600',
        category:    'tech',
      }))
      .slice(0, limit);
    console.log(`  HN: ${results.length}개`);
    return results;
  } catch (e) {
    console.warn(`⚠️ HN fetch 실패: ${e.message}`);
    return [];
  }
}

async function fetchReddit(sub, label, emoji, color, category, limit = 3) {
  try {
    const res  = await fetch(
      `https://www.reddit.com/r/${sub}/hot.json?limit=15&raw_json=1`,
      { headers: { 'User-Agent': 'GlobalHot/1.0 (github actions)' },
        signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) { console.warn(`⚠️ Reddit r/${sub} HTTP ${res.status}`); return []; }
    const data = await res.json();
    const results = (data?.data?.children || [])
      .map(c => c.data)
      .filter(p => p && !p.over_18 && p.score > 50 && !p.is_video)
      .map(p => ({
        title:       p.title,
        url:         p.url?.startsWith('http') ? p.url : `https://reddit.com${p.permalink}`,
        points:      p.score,
        comments:    p.num_comments,
        source:      label,
        sourceEmoji: emoji,
        color,
        category,
      }))
      .slice(0, limit);
    console.log(`  r/${sub}: ${results.length}개`);
    return results;
  } catch (e) {
    console.warn(`⚠️ Reddit r/${sub} 실패: ${e.message}`);
    return [];
  }
}

const CATEGORIES = [
  {
    id:      'tech',
    label:   '💻 테크 & 개발',
    intro:   '오늘 전세계 개발자 커뮤니티에서 가장 주목받은 기술 소식입니다.',
    color:   '#FF6600',
    fetchers: [
      () => fetchHN(4),
      () => fetchReddit('technology', 'Reddit 테크', '💡', '#FF6600', 'tech', 2),
    ],
    limit: 5,
  },
  {
    id:      'world',
    label:   '🌍 세계 이슈',
    intro:   '오늘 세계에서 가장 많이 공유된 뉴스와 이슈들입니다.',
    color:   '#1565C0',
    fetchers: [
      () => fetchReddit('worldnews',   'Reddit 세계뉴스', '🌍', '#1565C0', 'world', 3),
      () => fetchReddit('geopolitics', 'Reddit 지정학',   '🗺️', '#283593', 'world', 2),
    ],
    limit: 4,
  },
  {
    id:      'science',
    label:   '🔬 과학 & 우주',
    intro:   '오늘 과학계와 우주 탐사에서 화제가 된 발견과 연구입니다.',
    color:   '#00838F',
    fetchers: [
      () => fetchReddit('science', 'Reddit 과학', '🔬', '#00838F', 'science', 2),
      () => fetchReddit('space',   'Reddit 우주', '🚀', '#1A237E', 'science', 2),
    ],
    limit: 3,
  },
  {
    id:      'interesting',
    label:   '🤯 오늘의 발견',
    intro:   '오늘 전세계 사람들이 "이런 게 있었어?" 하고 놀란 흥미로운 발견들입니다.',
    color:   '#46D160',
    fetchers: [
      () => fetchReddit('todayilearned',    'Reddit TIL', '🤯', '#46D160', 'interesting', 2),
      () => fetchReddit('interestingasfuck','Reddit IAF', '✨', '#0DD3BB', 'interesting', 2),
    ],
    limit: 3,
  },
];

async function collectAll() {
  const result = [];
  for (const cat of CATEGORIES) {
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
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data.summary || '';
  } catch {
    return '';
  }
}

async function enrichWithSummaries(categories) {
  const enriched = [];
  for (const cat of categories) {
    const posts = [];
    for (const p of cat.posts) {
      console.log(`  🤖 AI 해설 생성: ${p.title.slice(0, 50)}...`);
      const summary = await getAISummary(p.title, p.source);
      posts.push({ ...p, summary });
      await new Promise(r => setTimeout(r, 300)); // API 과부하 방지
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

function renderPost(p, rank) {
  const summaryHtml = p.summary
    ? `<p class="article-summary">${escapeHtml(p.summary)}</p>`
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
          <span>👍 ${fmtNum(p.points)}</span>
          ${p.comments > 0 ? `<span>💬 ${fmtNum(p.comments)}</span>` : ''}
          <a class="read-more" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">원문 보기 →</a>
        </div>
      </div>
    </article>`;
}

function renderCategory(cat) {
  if (cat.posts.length === 0) return '';
  const articlesHtml = cat.posts.map((p, i) => renderPost(p, i + 1)).join('\n');
  return `
    <section class="category-section" id="${cat.id}">
      <h2 class="category-title" style="border-left-color:${cat.color}">${cat.label}</h2>
      <p class="category-intro">${escapeHtml(cat.intro)}</p>
      <div class="article-list">
        ${articlesHtml}
      </div>
    </section>`;
}

function getPrevDate() {
  const d = new Date(KST);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function generateHTML(categories) {
  const allPosts   = categories.flatMap(c => c.posts);
  const totalCount = allPosts.length;
  const topTitles  = allPosts.slice(0, 3).map(p => p.title).join(' / ');
  const prevDate   = getPrevDate();
  const prevExists = existsSync(join(process.cwd(), 'posts', `${prevDate}.html`));

  const categorySections = categories.map(renderCategory).join('\n');

  const categoryNav = categories
    .filter(c => c.posts.length > 0)
    .map(c => `<a href="#${c.id}" class="nav-pill">${c.label}</a>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(DATE_KO)} 글로벌 화제 뉴스 총정리 | GlobalHot</title>
  <meta name="description" content="${escapeHtml(`${DATE_KO} 전세계 화제 뉴스 ${totalCount}개를 AI가 한국어로 정리했습니다. ${topTitles}`)}" />
  <meta property="og:title" content="${escapeHtml(DATE_KO)} 글로벌 화제 뉴스 총정리 | GlobalHot" />
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
    "headline": "${escapeHtml(DATE_KO)} 글로벌 화제 뉴스 총정리",
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

    /* 헤더 */
    .site-header { background: var(--card); border-bottom: 1px solid var(--border); padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; }
    .site-header a { color: var(--text); text-decoration: none; font-weight: 800; font-size: 18px; }
    .site-header span { color: var(--accent); }
    .header-nav a { font-size: 13px; color: var(--text2); text-decoration: none; }
    .header-nav a:hover { color: var(--accent); }

    /* 컨테이너 */
    .container { max-width: 800px; margin: 0 auto; padding: 32px 20px 80px; }

    /* 포스트 헤더 */
    .post-header { margin-bottom: 36px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
    .post-date { font-size: 12px; color: var(--text3); margin-bottom: 10px; letter-spacing: .5px; text-transform: uppercase; }
    .post-header h1 { font-size: 26px; font-weight: 800; line-height: 1.4; margin-bottom: 12px; }
    .post-intro { font-size: 14px; color: var(--text2); line-height: 1.8; }

    /* 카테고리 네비 */
    .cat-nav { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 32px; }
    .nav-pill { padding: 6px 14px; background: var(--card); border: 1px solid var(--border); border-radius: 20px; font-size: 13px; color: var(--text2); text-decoration: none; }
    .nav-pill:hover { border-color: var(--accent); color: var(--accent); }

    /* 카테고리 섹션 */
    .category-section { margin-bottom: 48px; }
    .category-title { font-size: 18px; font-weight: 800; margin-bottom: 8px; padding-left: 14px; border-left: 4px solid; }
    .category-intro { font-size: 13px; color: var(--text2); margin-bottom: 20px; }

    /* 기사 카드 */
    .article-list { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: var(--card); }
    .article-card { display: flex; align-items: flex-start; gap: 14px; padding: 20px; border-bottom: 1px solid var(--border); }
    .article-card:last-child { border-bottom: none; }
    .article-card:hover { background: rgba(99,102,241,.05); }
    .article-rank { font-size: 16px; font-weight: 800; color: var(--text3); min-width: 28px; text-align: center; padding-top: 3px; flex-shrink: 0; }
    .article-rank.top { color: #f59e0b; }
    .article-body { flex: 1; min-width: 0; }
    .article-title { font-size: 15px; font-weight: 700; margin-bottom: 10px; line-height: 1.5; }
    .article-title a { color: var(--text); text-decoration: none; }
    .article-title a:hover { color: var(--accent); }
    .article-summary { font-size: 14px; color: var(--text2); line-height: 1.8; margin-bottom: 12px; background: rgba(99,102,241,.06); border-left: 3px solid var(--accent); padding: 10px 14px; border-radius: 0 6px 6px 0; }
    .article-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--text3); }
    .source-badge { color: #fff; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .read-more { color: var(--accent); text-decoration: none; font-weight: 600; margin-left: auto; }
    .read-more:hover { text-decoration: underline; }

    /* 하단 네비 */
    .post-nav { display: flex; gap: 12px; margin-top: 40px; flex-wrap: wrap; }
    .post-nav a { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; color: var(--text2); text-decoration: none; font-size: 14px; font-weight: 600; }
    .post-nav a:hover { border-color: var(--accent); color: var(--accent); }

    .footer { text-align: center; margin-top: 48px; font-size: 12px; color: var(--text3); }

    @media (max-width: 600px) {
      .post-header h1 { font-size: 20px; }
      .article-title { font-size: 14px; }
      .article-card { padding: 16px; }
    }
  </style>
</head>
<body>

  <header class="site-header">
    <a href="/">🌐 Global<span>Hot</span></a>
    <nav class="header-nav">
      <a href="/posts/">📚 전체 리포트</a>
    </nav>
  </header>

  <div class="container" itemscope itemtype="https://schema.org/Article">

    <div class="post-header">
      <div class="post-date">📅 ${DATE_KO} · AI 글로벌 뉴스 리포트</div>
      <h1 itemprop="headline">${escapeHtml(DATE_KO)} 전세계 화제 뉴스 총정리</h1>
      <p class="post-intro" itemprop="description">
        Hacker News, Reddit 등 전세계 주요 커뮤니티에서 오늘 가장 많이 회자된 기사 ${totalCount}개를 AI가 한국어로 해설했습니다.
        테크·세계이슈·과학·흥미로운 발견까지 한눈에 확인하세요.
      </p>
    </div>

    <nav class="cat-nav" aria-label="카테고리 바로가기">
      ${categoryNav}
    </nav>

    ${categorySections}

    <nav class="post-nav">
      <a href="/">← GlobalHot 메인</a>
      <a href="/posts/">📚 전체 리포트</a>
      ${prevExists ? `<a href="/posts/${prevDate}.html">← 어제 리포트</a>` : ''}
    </nav>

    <div class="footer">
      © ${KST.getFullYear()} GlobalHot · 매일 오전 9시 자동 업데이트 · AI 해설 by Cloudflare Workers AI
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
    const d = new Date(dateStr + 'T00:00:00+09:00');
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
  <title>글로벌 화제 뉴스 일일 리포트 목록 | GlobalHot</title>
  <meta name="description" content="GlobalHot AI 글로벌 뉴스 리포트 전체 목록. 매일 전세계 화제 뉴스를 AI가 한국어로 해설합니다." />
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
  <header class="site-header">
    <a href="/">🌐 Global<span>Hot</span></a>
  </header>
  <div class="container">
    <h1>📚 AI 글로벌 뉴스 리포트</h1>
    <p class="subtitle">매일 전세계 화제 뉴스를 AI가 한국어로 해설합니다. 총 ${files.length}개의 리포트</p>
    <ul>${listHTML}</ul>
    <a class="back-link" href="/">← GlobalHot 메인으로</a>
  </div>
</body>
</html>`;

  writeFileSync(indexPath, html, 'utf-8');
  console.log('✅ posts/index.html 업데이트 완료');
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
  console.log(`🌐 API 엔드포인트: ${SITE_URL}/api/summarize\n`);

  const postsDir  = join(process.cwd(), 'posts');
  const filePath  = join(postsDir, `${TODAY}.html`);
  mkdirSync(postsDir, { recursive: true });

  if (existsSync(filePath)) {
    console.log(`⏭️  이미 존재: posts/${TODAY}.html — 스킵`);
    process.exit(0);
  }

  console.log('📦 기사 수집 중...');
  const categories = await collectAll();
  const total = categories.reduce((s, c) => s + c.posts.length, 0);
  console.log(`✅ 총 ${total}개 기사 수집 완료\n`);

  if (total === 0) {
    console.error('❌ 기사를 하나도 가져오지 못했습니다. API 접근 문제일 수 있습니다.');
    process.exit(1);
  }

  console.log('🤖 AI 한국어 해설 생성 중...');
  const enriched = await enrichWithSummaries(categories);
  console.log('✅ AI 해설 완료\n');

  const html = generateHTML(enriched);
  writeFileSync(filePath, html, 'utf-8');
  console.log(`✅ posts/${TODAY}.html 생성 완료`);

  updateIndex();
  updateSitemap();
  console.log('\n🎉 완료!');
})();
