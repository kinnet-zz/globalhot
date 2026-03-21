/**
 * GlobalHot 주간 화제 자동 포스트 생성기
 * 매주 금요일 GitHub Actions에서 실행
 */

const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const KST   = new Date(Date.now() + 9 * 3600_000);
const WEEK  = `${KST.getFullYear()}년 ${KST.getMonth() + 1}월 ${KST.getDate()}일`;

// ── 1. 데이터 수집 ──────────────────────────────────────

async function fetchHN() {
  const res   = await fetch('https://hacker-news.firebaseio.com/v1/topstories.json');
  const ids   = (await res.json()).slice(0, 20);
  const items = await Promise.all(
    ids.map(id =>
      fetch(`https://hacker-news.firebaseio.com/v1/item/${id}.json`)
        .then(r => r.json())
        .catch(() => null)
    )
  );
  return items
    .filter(i => i && i.title && i.score > 50)
    .map(i => ({
      title:    i.title,
      url:      i.url || `https://news.ycombinator.com/item?id=${i.id}`,
      points:   i.score,
      comments: i.descendants || 0,
      source:   '💻 Hacker News',
      color:    '#FF6600',
    }))
    .slice(0, 5);
}

async function fetchReddit(sub, label, color) {
  const res  = await fetch(
    `https://www.reddit.com/r/${sub}/top.json?limit=10&t=week`,
    { headers: { 'User-Agent': 'GlobalHot/1.0' } }
  );
  const data = await res.json();
  return (data?.data?.children || [])
    .map(c => c.data)
    .filter(p => p && !p.over_18 && p.score > 100)
    .map(p => ({
      title:    p.title,
      url:      p.url.startsWith('http') ? p.url : `https://reddit.com${p.permalink}`,
      points:   p.score,
      comments: p.num_comments,
      source:   label,
      color,
    }))
    .slice(0, 3);
}

async function collectPosts() {
  const results = await Promise.allSettled([
    fetchHN(),
    fetchReddit('worldnews',   '🌍 Reddit 세계뉴스',  '#FF4500'),
    fetchReddit('technology',  '💡 Reddit 테크',       '#FF6600'),
    fetchReddit('todayilearned','🤯 Reddit TIL',       '#46D160'),
    fetchReddit('science',     '🔬 Reddit 과학',       '#5F99CF'),
  ]);

  const posts = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  // 점수 기준 정렬 후 중복 제거
  const seen = new Set();
  return posts
    .sort((a, b) => b.points - a.points)
    .filter(p => {
      if (seen.has(p.title)) return false;
      seen.add(p.title);
      return true;
    })
    .slice(0, 10);
}

// ── 2. HTML 생성 ────────────────────────────────────────

function fmtNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function generateHTML(posts) {
  const title = `이번주 전세계 화제 TOP10 — ${WEEK}`;
  const desc  = posts.slice(0, 3).map(p => p.title).join(' / ');

  const itemsHTML = posts.map((p, i) => `
    <article class="post-item">
      <div class="post-rank ${i < 3 ? 'top3' : ''}">${i + 1}</div>
      <div class="post-body">
        <a class="post-title" href="${p.url}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(p.title)}
        </a>
        <div class="post-meta">
          <span class="post-badge" style="background:${p.color}">${p.source}</span>
          <span>👍 ${fmtNum(p.points)}</span>
          ${p.comments > 0 ? `<span>💬 ${fmtNum(p.comments)}</span>` : ''}
        </div>
      </div>
    </article>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} | GlobalHot</title>
  <meta name="description" content="${escapeHtml(desc)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(desc)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://globalhot.pages.dev/posts/${TODAY}.html" />
  <meta name="robots" content="index, follow" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f1117; --card: #1a1d27; --border: #2a2d3a;
      --text: #e8eaf0; --text2: #9da3b4; --text3: #6b7280;
      --accent: #6366f1; --radius: 12px;
    }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; }
    .site-header { background: var(--card); border-bottom: 1px solid var(--border); padding: 14px 20px; }
    .site-header a { color: var(--text); text-decoration: none; font-weight: 800; font-size: 18px; }
    .site-header span { color: var(--accent); }
    .container { max-width: 760px; margin: 0 auto; padding: 32px 20px 60px; }
    .post-header { margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
    .post-date { font-size: 12px; color: var(--text3); margin-bottom: 8px; }
    h1 { font-size: 24px; font-weight: 800; line-height: 1.4; color: var(--text); }
    .post-intro { margin-top: 12px; font-size: 14px; color: var(--text2); }
    .post-list { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: var(--card); }
    .post-item { display: flex; align-items: flex-start; gap: 14px; padding: 16px; border-bottom: 1px solid var(--border); transition: background .15s; }
    .post-item:last-child { border-bottom: none; }
    .post-item:hover { background: rgba(99,102,241,.06); }
    .post-rank { font-size: 18px; font-weight: 800; color: var(--text3); min-width: 28px; text-align: center; padding-top: 2px; flex-shrink: 0; }
    .post-rank.top3 { color: #f59e0b; }
    .post-body { flex: 1; min-width: 0; }
    .post-title { font-size: 15px; font-weight: 600; color: var(--text); text-decoration: none; line-height: 1.5; display: block; margin-bottom: 8px; }
    .post-title:hover { color: var(--accent); }
    .post-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--text3); }
    .post-badge { color: #fff; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .back-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 32px; color: var(--accent); text-decoration: none; font-size: 14px; font-weight: 600; }
    .back-link:hover { text-decoration: underline; }
    .footer { text-align: center; margin-top: 48px; font-size: 12px; color: var(--text3); }
    @media (max-width: 600px) { h1 { font-size: 20px; } .post-title { font-size: 14px; } }
  </style>
</head>
<body>

  <header class="site-header">
    <a href="/">🌐 Global<span>Hot</span></a>
  </header>

  <div class="container">
    <div class="post-header">
      <div class="post-date">📅 ${WEEK} | 주간 화제 리포트</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="post-intro">
        Hacker News, Reddit 등 전세계 주요 커뮤니티에서 이번 주 가장 많이 회자된 글 TOP10을 선정했습니다.
      </p>
    </div>

    <div class="post-list">
      ${itemsHTML}
    </div>

    <a class="back-link" href="/">← GlobalHot 메인으로</a>
    <a class="back-link" href="/posts/" style="margin-left:16px">📚 지난 리포트 보기</a>

    <div class="footer">
      © ${new Date().getFullYear()} GlobalHot · 매주 금요일 자동 업데이트
    </div>
  </div>

</body>
</html>`;
}

// ── 3. 포스트 목록 페이지 업데이트 ──────────────────────

async function updateIndex(newPost) {
  const fs   = await import('fs');
  const path = await import('path');

  const postsDir  = path.join(process.cwd(), 'posts');
  const indexPath = path.join(postsDir, 'index.html');

  // 기존 포스트 목록 수집
  const files = fs.readdirSync(postsDir)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .sort()
    .reverse();

  const listHTML = files.map(f => {
    const dateStr = f.replace('.html', '');
    const d = new Date(dateStr);
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    return `<li><a href="/posts/${f}">📋 이번주 전세계 화제 TOP10 — ${label}</a></li>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>주간 화제 리포트 목록 | GlobalHot</title>
  <meta name="description" content="GlobalHot 주간 전세계 화제 TOP10 리포트 목록" />
  <meta name="robots" content="index, follow" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --bg: #0f1117; --card: #1a1d27; --border: #2a2d3a; --text: #e8eaf0; --text2: #9da3b4; --accent: #6366f1; }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .site-header { background: var(--card); border-bottom: 1px solid var(--border); padding: 14px 20px; }
    .site-header a { color: var(--text); text-decoration: none; font-weight: 800; font-size: 18px; }
    .site-header span { color: var(--accent); }
    .container { max-width: 760px; margin: 0 auto; padding: 32px 20px 60px; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 24px; }
    ul { list-style: none; display: flex; flex-direction: column; gap: 12px; }
    li a { color: var(--accent); text-decoration: none; font-size: 15px; font-weight: 500; }
    li a:hover { text-decoration: underline; }
    .back-link { display: inline-block; margin-top: 32px; color: var(--text2); text-decoration: none; font-size: 14px; }
  </style>
</head>
<body>
  <header class="site-header">
    <a href="/">🌐 Global<span>Hot</span></a>
  </header>
  <div class="container">
    <h1>📚 주간 화제 리포트</h1>
    <ul>${listHTML}</ul>
    <a class="back-link" href="/">← GlobalHot 메인으로</a>
  </div>
</body>
</html>`;

  fs.writeFileSync(indexPath, html, 'utf-8');
  console.log('✅ posts/index.html 업데이트 완료');
}

// ── 4. 메인 실행 ────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

(async () => {
  console.log(`🚀 ${TODAY} 주간 포스트 생성 시작...`);

  const posts = await collectPosts();
  if (posts.length === 0) {
    console.error('❌ 포스트를 가져오지 못했습니다.');
    process.exit(1);
  }
  console.log(`📦 ${posts.length}개 포스트 수집 완료`);

  const { writeFileSync, mkdirSync } = await import('fs');
  const { join } = await import('path');

  const postsDir = join(process.cwd(), 'posts');
  mkdirSync(postsDir, { recursive: true });

  const filePath = join(postsDir, `${TODAY}.html`);
  const html     = generateHTML(posts);
  writeFileSync(filePath, html, 'utf-8');
  console.log(`✅ posts/${TODAY}.html 생성 완료`);

  await updateIndex();
  console.log('🎉 완료!');
})();
