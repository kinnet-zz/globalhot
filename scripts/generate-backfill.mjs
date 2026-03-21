/**
 * GlobalHot 과거 주간 포스트 일괄 생성 (백필)
 * 사용법: node scripts/generate-backfill.mjs [주수=12]
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const WEEKS    = parseInt(process.argv[2] || '12');
const postsDir = join(process.cwd(), 'posts');
mkdirSync(postsDir, { recursive: true });

// ── 유틸 ──────────────────────────────────────────────

function fmtNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fridayOf(weeksAgo) {
  const d   = new Date();
  const day = d.getDay();
  const diff = day >= 5 ? day - 5 : day + 2;
  d.setDate(d.getDate() - diff - weeksAgo * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

const dateStr  = d => d.toISOString().slice(0, 10);
const korDate  = d => `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;

// ── API ───────────────────────────────────────────────

async function fetchHNRange(from, to) {
  const url = `https://hn.algolia.com/api/v1/search?tags=story` +
    `&numericFilters=created_at_i>${Math.floor(from/1000)},created_at_i<${Math.floor(to/1000)},points>30` +
    `&hitsPerPage=10&attributesToRetrieve=title,url,points,num_comments,objectID`;
  try {
    const data = await fetch(url).then(r => r.json());
    return (data.hits || []).map(h => ({
      title:    h.title,
      url:      h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      points:   h.points || 0,
      comments: h.num_comments || 0,
      source:   '💻 Hacker News',
      color:    '#FF6600',
    })).slice(0, 5);
  } catch { return []; }
}

async function fetchReddit(sub, label, color) {
  try {
    const data = await fetch(
      `https://www.reddit.com/r/${sub}/top.json?limit=8&t=week`,
      { headers: { 'User-Agent': 'GlobalHot/1.0' } }
    ).then(r => r.json());
    return (data?.data?.children || [])
      .map(c => c.data)
      .filter(p => p && !p.over_18 && p.score > 30)
      .map(p => ({
        title:    p.title,
        url:      p.url.startsWith('http') ? p.url : `https://reddit.com${p.permalink}`,
        points:   p.score,
        comments: p.num_comments,
        source:   label,
        color,
      })).slice(0, 2);
  } catch { return []; }
}

async function collectForWeek(friday) {
  const to   = friday.getTime() + 24 * 3600_000;
  const from = to - 8 * 24 * 3600_000;

  const results = await Promise.allSettled([
    fetchHNRange(from, to),
    fetchReddit('worldnews',     '🌍 Reddit 세계뉴스',  '#FF4500'),
    fetchReddit('technology',    '💡 Reddit 테크',       '#FF6600'),
    fetchReddit('todayilearned', '🤯 Reddit TIL',        '#46D160'),
    fetchReddit('science',       '🔬 Reddit 과학',       '#5F99CF'),
  ]);

  const seen = new Set();
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => b.points - a.points)
    .filter(p => {
      if (!p.title || seen.has(p.title)) return false;
      seen.add(p.title);
      return true;
    })
    .slice(0, 10);
}

// ── HTML 템플릿 ───────────────────────────────────────

function generateHTML(posts, friday) {
  const label = korDate(friday);
  const title = `이번주 전세계 화제 TOP10 — ${label}`;
  const desc  = posts.slice(0, 3).map(p => p.title).join(' / ');
  const slug  = dateStr(friday);

  const items = posts.map((p, i) => `
    <article class="post-item">
      <div class="post-rank ${i < 3 ? 'top3' : ''}">${i + 1}</div>
      <div class="post-body">
        <a class="post-title" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.title)}</a>
        <div class="post-meta">
          <span class="post-badge" style="background:${p.color}">${p.source}</span>
          <span>👍 ${fmtNum(p.points)}</span>
          ${p.comments > 0 ? `<span>💬 ${fmtNum(p.comments)}</span>` : ''}
        </div>
      </div>
    </article>`).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${esc(title)} | GlobalHot</title>
  <meta name="description" content="${esc(desc)}"/>
  <meta property="og:title" content="${esc(title)}"/>
  <meta property="og:type" content="article"/>
  <meta property="og:url" content="https://globalhot.pages.dev/posts/${slug}.html"/>
  <meta name="robots" content="index, follow"/>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#0f1117;--card:#1a1d27;--border:#2a2d3a;--text:#e8eaf0;--text2:#9da3b4;--text3:#6b7280;--accent:#6366f1;--r:12px}
    body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6}
    .hdr{background:var(--card);border-bottom:1px solid var(--border);padding:14px 20px}
    .hdr a{color:var(--text);text-decoration:none;font-weight:800;font-size:18px}
    .hdr span{color:var(--accent)}
    .wrap{max-width:760px;margin:0 auto;padding:32px 20px 60px}
    .ph{margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid var(--border)}
    .pd{font-size:12px;color:var(--text3);margin-bottom:8px}
    h1{font-size:22px;font-weight:800;line-height:1.4}
    .pi{margin-top:10px;font-size:14px;color:var(--text2)}
    .list{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:var(--r);overflow:hidden;background:var(--card)}
    .post-item{display:flex;align-items:flex-start;gap:14px;padding:16px;border-bottom:1px solid var(--border);transition:background .15s}
    .post-item:last-child{border-bottom:none}
    .post-item:hover{background:rgba(99,102,241,.06)}
    .post-rank{font-size:18px;font-weight:800;color:var(--text3);min-width:28px;text-align:center;flex-shrink:0;padding-top:2px}
    .post-rank.top3{color:#f59e0b}
    .post-body{flex:1;min-width:0}
    .post-title{font-size:15px;font-weight:600;color:var(--text);text-decoration:none;line-height:1.5;display:block;margin-bottom:8px}
    .post-title:hover{color:var(--accent)}
    .post-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--text3)}
    .post-badge{color:#fff;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700}
    .links{display:flex;gap:16px;margin-top:28px}
    .lnk{color:var(--accent);text-decoration:none;font-size:14px;font-weight:600}
    .lnk:hover{text-decoration:underline}
    .ft{text-align:center;margin-top:48px;font-size:12px;color:var(--text3)}
    @media(max-width:600px){h1{font-size:19px}.post-title{font-size:14px}}
  </style>
</head>
<body>
  <header class="hdr"><a href="/">🌐 Global<span>Hot</span></a></header>
  <div class="wrap">
    <div class="ph">
      <div class="pd">📅 ${label} | 주간 화제 리포트</div>
      <h1>${esc(title)}</h1>
      <p class="pi">Hacker News, Reddit 등 전세계 주요 커뮤니티에서 이번 주 가장 많이 회자된 글 TOP10입니다.</p>
    </div>
    <div class="list">${items}</div>
    <div class="links">
      <a class="lnk" href="/">← 메인으로</a>
      <a class="lnk" href="/posts/">📚 지난 리포트</a>
    </div>
    <div class="ft">© ${friday.getFullYear()} GlobalHot · 매주 금요일 자동 업데이트</div>
  </div>
</body>
</html>`;
}

// ── 목록 페이지 재생성 ─────────────────────────────────

function rebuildIndex() {
  const files = readdirSync(postsDir)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .sort().reverse();

  const listHTML = files.map(f => {
    const slug = f.replace('.html', '');
    const d    = new Date(slug);
    const lbl  = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
    return `<li><a href="/posts/${f}">📋 이번주 전세계 화제 TOP10 — ${lbl}</a></li>`;
  }).join('\n');

  writeFileSync(join(postsDir, 'index.html'), `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>주간 화제 리포트 목록 | GlobalHot</title>
  <meta name="description" content="GlobalHot 주간 전세계 화제 TOP10 리포트 목록. 매주 금요일 자동 업데이트됩니다."/>
  <meta name="robots" content="index, follow"/>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#0f1117;--card:#1a1d27;--border:#2a2d3a;--text:#e8eaf0;--text2:#9da3b4;--accent:#6366f1}
    body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    .hdr{background:var(--card);border-bottom:1px solid var(--border);padding:14px 20px}
    .hdr a{color:var(--text);text-decoration:none;font-weight:800;font-size:18px}
    .hdr span{color:var(--accent)}
    .wrap{max-width:760px;margin:0 auto;padding:32px 20px 60px}
    h1{font-size:22px;font-weight:800;margin-bottom:8px}
    .sub{font-size:14px;color:var(--text2);margin-bottom:28px}
    ul{list-style:none;display:flex;flex-direction:column;gap:10px}
    li{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px}
    li a{color:var(--accent);text-decoration:none;font-size:15px;font-weight:500}
    li a:hover{text-decoration:underline}
    .bk{display:inline-block;margin-top:28px;color:var(--text2);text-decoration:none;font-size:14px}
  </style>
</head>
<body>
  <header class="hdr"><a href="/">🌐 Global<span>Hot</span></a></header>
  <div class="wrap">
    <h1>📚 주간 화제 리포트</h1>
    <p class="sub">매주 금요일 전세계 커뮤니티 화제 TOP10을 자동으로 정리합니다.</p>
    <ul>${listHTML}</ul>
    <a class="bk" href="/">← GlobalHot 메인으로</a>
  </div>
</body>
</html>`, 'utf-8');

  return files.length;
}

// ── 메인 ─────────────────────────────────────────────

const generated = [];

for (let w = 0; w < WEEKS; w++) {
  const friday = fridayOf(w);
  const slug   = dateStr(friday);
  const path   = join(postsDir, `${slug}.html`);

  if (existsSync(path)) {
    console.log(`⏭️  ${slug} 이미 존재 — 스킵`);
    continue;
  }

  console.log(`📡 ${slug} 수집 중...`);
  const posts = await collectForWeek(friday);

  if (posts.length < 3) {
    console.log(`⚠️  ${slug} 데이터 부족 (${posts.length}개) — 스킵`);
    continue;
  }

  writeFileSync(path, generateHTML(posts, friday), 'utf-8');
  generated.push(slug);
  console.log(`✅ ${slug} 생성 (${posts.length}개)`);

  if (w < WEEKS - 1) await new Promise(r => setTimeout(r, 1200));
}

const total = rebuildIndex();
console.log(`\n🎉 완료! ${generated.length}개 신규 생성 / 총 ${total}개 포스트`);
