/* =========================================================
   GlobalHot – app.js
   =========================================================
   RSS 파싱: rss2json(유료/제한) 대신
             allorigins.win CORS 프록시 + 브라우저 내장 DOMParser 사용
             → 시간당 요청 제한 없음
   ========================================================= */
'use strict';

// ── CORS Proxy (RSS XML용) ───────────────────────────────────
const PROXY = 'https://api.allorigins.win/raw?url=';

async function parseRSS(feedUrl, limit = 25) {
  const r = await fetch(PROXY + encodeURIComponent(feedUrl), { cache: 'no-store' });
  if (!r.ok) throw new Error(`RSS fetch failed: ${r.status}`);
  const xml = await r.text();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid RSS XML');

  return [...doc.querySelectorAll('item')].slice(0, limit).map(item => ({
    title:   cleanText(item.querySelector('title')?.textContent || ''),
    link:    item.querySelector('link')?.textContent?.trim()
          || item.querySelector('guid')?.textContent?.trim() || '',
    pubDate: item.querySelector('pubDate')?.textContent?.trim() || '',
  }));
}

// CDATA 및 HTML 엔티티 정리
function cleanText(str) {
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

// ── Source Definitions ──────────────────────────────────────
//  전체 탭에 Reddit 없음 – 다양성 확보
const SOURCES = [
  // ── 미국 전용 ──
  { id: 'reddit_popular',   name: 'Reddit',       sub: 'r/popular',     color: '#FF4500', flag: '🇺🇸', tabs: ['us'],              fetch: fetchRedditPopular   },
  { id: 'reddit_news',      name: 'Reddit',       sub: 'r/news',        color: '#FF4500', flag: '🇺🇸', tabs: ['us'],              fetch: fetchRedditNews      },
  { id: 'ask_hn',           name: 'Ask HN',       sub: 'Q&A',           color: '#FF6600', flag: '🇺🇸', tabs: ['us', 'tech'],      fetch: fetchAskHN           },
  // ── 전체 + 미국 ──
  { id: 'hacker_news',      name: 'Hacker News',  sub: 'Top Stories',   color: '#FF6600', flag: '🇺🇸', tabs: ['all','us','tech'], fetch: fetchHackerNews      },
  // ── 전체 + 글로벌 ──
  { id: 'wikipedia',        name: 'Wikipedia',    sub: 'Trending',      color: '#636466', flag: '🌐', tabs: ['all','world'],     fetch: fetchWikipediaTrending },
  { id: 'product_hunt',     name: 'Product Hunt', sub: "Today's Best",  color: '#DA552F', flag: '🌐', tabs: ['all'],             fetch: fetchProductHunt     },
  { id: 'devto',            name: 'Dev.to',       sub: 'Top Articles',  color: '#3d3d3d', flag: '🌐', tabs: ['all','tech'],      fetch: fetchDevTo           },
  { id: 'github_trending',  name: 'GitHub',       sub: 'Trending',      color: '#24292f', flag: '🌐', tabs: ['all','tech'],      fetch: fetchGitHubTrending  },
  { id: 'lobsters',         name: 'Lobste.rs',    sub: 'Hottest',       color: '#AC130D', flag: '🌐', tabs: ['all','tech'],      fetch: fetchLobsters        },
  { id: 'show_hn',          name: 'Show HN',      sub: '내가 만든 것',   color: '#FF6600', flag: '🌐', tabs: ['tech'],            fetch: fetchShowHN          },
  // ── 일본 ──
  { id: 'hatena',           name: 'はてな',        sub: 'ホットエントリ', color: '#00A4DE', flag: '🇯🇵', tabs: ['all','jp'],        fetch: fetchHatena          },
  { id: 'nhk',              name: 'NHK News',     sub: '最新ニュース',   color: '#003F7D', flag: '🇯🇵', tabs: ['jp','world'],      fetch: fetchNHK             },
  { id: 'reddit_japan',     name: 'Reddit',       sub: 'r/japan',       color: '#FF4500', flag: '🇯🇵', tabs: ['jp'],              fetch: fetchRedditJapan     },
  // ── 세계뉴스 ──
  { id: 'reddit_worldnews', name: 'Reddit',       sub: 'r/worldnews',   color: '#FF4500', flag: '🌍', tabs: ['world'],           fetch: fetchRedditWorldnews },
];

const SOURCE_MAP = Object.fromEntries(SOURCES.map(s => [s.id, s]));

// ── State ────────────────────────────────────────────────────
const state = {
  tab: 'all', sort: 'trending', query: '',
  posts: [], page: 0, PAGE_SIZE: 20,
  sourceStatus: {}, sourceCount: {},
};

// ── Post 정규화 ──────────────────────────────────────────────
function makePost(id, sourceId, title, url, points, comments, time, extra = {}) {
  return {
    id, sourceId,
    title:    String(title).trim(),
    url:      String(url).trim(),
    points:   Number(points)   || 0,
    comments: Number(comments) || 0,
    time:     time instanceof Date ? time : new Date(time || Date.now()),
    ...extra,
  };
}

// ── 트렌딩 점수 ──────────────────────────────────────────────
// 공식: 추천수 + 댓글수×3 + 신선도보너스(최대120, 시간당 2점 감소)
function trendingScore(p) {
  const ageHours = (Date.now() - p.time.getTime()) / 3_600_000;
  return p.points + p.comments * 3 + Math.max(0, 120 - ageHours * 2);
}

// ── Fetch Functions ──────────────────────────────────────────

async function fetchRedditPopular() {
  const r = await fetch('https://www.reddit.com/r/popular.json?limit=30&raw_json=1', { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'rp_' + c.data.id, 'reddit_popular', c.data.title,
    'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    { sub: c.data.subreddit_name_prefixed }
  ));
}

async function fetchRedditNews() {
  const r = await fetch('https://www.reddit.com/r/news.json?limit=25&raw_json=1', { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'rn_' + c.data.id, 'reddit_news', c.data.title,
    c.data.url || 'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    { sub: c.data.subreddit_name_prefixed }
  ));
}

async function fetchHackerNews() {
  const r = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30');
  const d = await r.json();
  return d.hits.map(h => makePost(
    'hn_' + h.objectID, 'hacker_news', h.title,
    h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    h.points, h.num_comments, new Date(h.created_at)
  ));
}

async function fetchAskHN() {
  const r = await fetch('https://hn.algolia.com/api/v1/search?tags=ask_hn&hitsPerPage=15&numericFilters=points>50');
  const d = await r.json();
  return d.hits.map(h => makePost(
    'askhn_' + h.objectID, 'ask_hn', h.title,
    `https://news.ycombinator.com/item?id=${h.objectID}`,
    h.points, h.num_comments, new Date(h.created_at)
  ));
}

async function fetchShowHN() {
  const r = await fetch('https://hn.algolia.com/api/v1/search?tags=show_hn&hitsPerPage=15&numericFilters=points>20');
  const d = await r.json();
  return d.hits.map(h => makePost(
    'shhn_' + h.objectID, 'show_hn', h.title,
    h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    h.points, h.num_comments, new Date(h.created_at)
  ));
}

async function fetchWikipediaTrending() {
  // 어제 날짜 (오늘 데이터는 아직 생성 안 됐을 수 있음)
  const d = new Date(Date.now() - 86_400_000);
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/`
    + `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  const r = await fetch(url);
  const j = await r.json();
  const skip = new Set(['Main_Page','Special:Search','Wikipedia:Featured_pictures',
    'Special:Export','Special:BookSources','Special:Random','Wikipedia:About']);
  return j.items[0].articles
    .filter(a => !skip.has(a.article) && !a.article.startsWith('Special:') && !a.article.startsWith('Wikipedia:'))
    .slice(0, 20)
    .map((a, i) => makePost(
      'wiki_' + i, 'wikipedia',
      a.article.replace(/_/g, ' '),
      `https://en.wikipedia.org/wiki/${encodeURIComponent(a.article)}`,
      a.views, 0, new Date()
    ));
}

async function fetchProductHunt() {
  // rss2json 사용 안 함 – allorigins + DOMParser로 직접 파싱
  const items = await parseRSS('https://www.producthunt.com/feed', 20);
  return items.map((item, i) => makePost(
    'ph_' + i, 'product_hunt', item.title, item.link, 0, 0, new Date(item.pubDate)
  ));
}

async function fetchDevTo() {
  const r = await fetch('https://dev.to/api/articles?per_page=20&top=7');
  const d = await r.json();
  return d.map(a => makePost(
    'dt_' + a.id, 'devto', a.title, a.url,
    a.positive_reactions_count, a.comments_count, new Date(a.published_at)
  ));
}

async function fetchGitHubTrending() {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const r = await fetch(
    `https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=20`,
    { headers: { Accept: 'application/vnd.github.v3+json' } }
  );
  const d = await r.json();
  return (d.items || []).map(repo => makePost(
    'gh_' + repo.id, 'github_trending',
    `${repo.full_name}${repo.description ? ' — ' + repo.description : ''}`,
    repo.html_url, repo.stargazers_count, 0, new Date(repo.created_at),
    { sub: repo.language || 'GitHub' }
  ));
}

async function fetchLobsters() {
  // Lobste.rs는 JSON API가 CORS를 지원함
  const r = await fetch('https://lobste.rs/hottest.json', { cache: 'no-store' });
  const d = await r.json();
  return d.slice(0, 20).map(s => makePost(
    'lb_' + s.short_id, 'lobsters', s.title,
    s.url || `https://lobste.rs/s/${s.short_id}`,
    s.score, s.comment_count, new Date(s.created_at),
    { sub: (s.tags || []).join(', ') }
  ));
}

async function fetchHatena() {
  const items = await parseRSS('https://b.hatena.ne.jp/hotentry/all.rss', 25);
  return items.map((item, i) => makePost(
    'ht_' + i, 'hatena', item.title, item.link, 0, 0, new Date(item.pubDate)
  ));
}

async function fetchNHK() {
  const items = await parseRSS('https://www3.nhk.or.jp/rss/news/cat0.xml', 20);
  return items.map((item, i) => makePost(
    'nhk_' + i, 'nhk', item.title, item.link, 0, 0, new Date(item.pubDate)
  ));
}

async function fetchRedditJapan() {
  const r = await fetch('https://www.reddit.com/r/japan.json?limit=20&raw_json=1', { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'rj_' + c.data.id, 'reddit_japan', c.data.title,
    'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    { sub: c.data.subreddit_name_prefixed }
  ));
}

async function fetchRedditWorldnews() {
  const r = await fetch('https://www.reddit.com/r/worldnews.json?limit=20&raw_json=1', { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'rw_' + c.data.id, 'reddit_worldnews', c.data.title,
    'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    { sub: c.data.subreddit_name_prefixed }
  ));
}

// ── 전체 로딩 ────────────────────────────────────────────────
async function loadAllSources() {
  renderSkeletons(document.getElementById('feed'), 8);
  setRefreshSpinning(true);
  state.posts = [];
  state.page  = 0;

  SOURCES.forEach(s => { state.sourceStatus[s.id] = 'loading'; state.sourceCount[s.id] = 0; });
  renderSourceStatus();

  const results = await Promise.allSettled(SOURCES.map(s => s.fetch()));

  results.forEach((res, i) => {
    const src = SOURCES[i];
    if (res.status === 'fulfilled' && res.value.length > 0) {
      state.posts.push(...res.value);
      state.sourceStatus[src.id] = 'ok';
      state.sourceCount[src.id]  = res.value.length;
    } else {
      if (res.status === 'rejected') console.warn(`[${src.id}]`, res.reason?.message);
      state.sourceStatus[src.id] = 'error';
    }
  });

  setRefreshSpinning(false);
  renderSourceStatus();
  renderFeed();
  renderHotList();
  document.getElementById('updateTime').textContent =
    `마지막 업데이트: ${new Date().toLocaleTimeString('ko-KR')}`;
}

// ── 필터 + 정렬 ──────────────────────────────────────────────
function getFilteredPosts() {
  const validIds = new Set(SOURCES.filter(s => s.tabs.includes(state.tab)).map(s => s.id));
  return state.posts
    .filter(p => {
      if (!validIds.has(p.sourceId)) return false;
      if (state.query) return p.title.toLowerCase().includes(state.query.toLowerCase());
      return true;
    })
    .sort((a, b) => {
      if (state.sort === 'points')   return b.points   - a.points;
      if (state.sort === 'comments') return b.comments - a.comments;
      if (state.sort === 'time')     return b.time     - a.time;
      return trendingScore(b) - trendingScore(a);
    });
}

// ── 피드 렌더링 ──────────────────────────────────────────────
function renderFeed() {
  const feed         = document.getElementById('feed');
  const loadMoreWrap = document.getElementById('loadMoreWrap');
  const filtered     = getFilteredPosts();
  const slice        = filtered.slice(0, (state.page + 1) * state.PAGE_SIZE);

  feed.innerHTML = '';

  if (slice.length === 0) {
    feed.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>표시할 게시글이 없습니다.</p></div>`;
    loadMoreWrap.classList.add('hidden');
    return;
  }

  const frag = document.createDocumentFragment();
  slice.forEach((p, i) => frag.appendChild(createCard(p, i + 1)));
  feed.appendChild(frag);
  loadMoreWrap.classList.toggle('hidden', slice.length >= filtered.length);
}

// ── 카드 생성 (inline event handler 없음 → CSP 준수) ─────────
function createCard(p, rank) {
  const src  = SOURCE_MAP[p.sourceId];
  const card = document.createElement('article');
  card.className = 'post-card';
  card.addEventListener('click', () => openPreview(p));

  const rankEl = document.createElement('div');
  rankEl.className = rank <= 3 ? 'post-rank top3' : 'post-rank';
  rankEl.textContent = rank;

  const body = document.createElement('div');
  body.className = 'post-body';

  // Meta row
  const meta = document.createElement('div');
  meta.className = 'post-meta';

  const badge = document.createElement('span');
  badge.className = 'source-badge';
  badge.style.background = src.color;
  badge.textContent = src.name;

  const flag = document.createElement('span');
  flag.className = 'flag';
  flag.textContent = src.flag;

  const time = document.createElement('span');
  time.className = 'post-time';
  time.textContent = relTime(p.time);

  meta.append(badge, flag);
  if (p.sub) {
    const sub = document.createElement('span');
    sub.className = 'post-subreddit';
    sub.textContent = p.sub;
    meta.appendChild(sub);
  }
  meta.appendChild(time);

  // Title
  const title = document.createElement('div');
  title.className = 'post-title';
  title.textContent = p.title; // textContent = XSS 안전

  // Stats
  const stats = document.createElement('div');
  stats.className = 'post-stats';
  if (p.points > 0) {
    const s = document.createElement('span');
    s.className = 'stat';
    s.textContent = `👍 ${fmtNum(p.points)}`;
    stats.appendChild(s);
  }
  if (p.comments > 0) {
    const s = document.createElement('span');
    s.className = 'stat';
    s.textContent = `💬 ${fmtNum(p.comments)}`;
    stats.appendChild(s);
  }
  const hint = document.createElement('span');
  hint.className = 'preview-hint';
  hint.textContent = '미리보기 →';
  stats.appendChild(hint);

  body.append(meta, title, stats);
  card.append(rankEl, body);
  return card;
}

// ── 프리뷰 패널 ──────────────────────────────────────────────
let currentPreviewId = null;

async function openPreview(p) {
  currentPreviewId = p.id;
  const src = SOURCE_MAP[p.sourceId];

  // 기본 정보 설정
  const badge = document.getElementById('previewBadge');
  badge.textContent  = `${src.flag} ${src.name}`;
  badge.style.background = src.color;
  document.getElementById('previewTime').textContent   = relTime(p.time);
  document.getElementById('previewTitle').textContent  = p.title;
  document.getElementById('previewLink').href          = p.url;

  const statsEl = document.getElementById('previewStats');
  statsEl.innerHTML = '';
  if (p.points   > 0) { const s = document.createElement('span'); s.className = 'preview-stat-item'; s.textContent = `👍 ${fmtNum(p.points)}점`; statsEl.appendChild(s); }
  if (p.comments > 0) { const s = document.createElement('span'); s.className = 'preview-stat-item'; s.textContent = `💬 ${fmtNum(p.comments)}개`; statsEl.appendChild(s); }
  if (p.sub)          { const s = document.createElement('span'); s.className = 'preview-stat-item'; s.textContent = `📌 ${p.sub}`; statsEl.appendChild(s); }

  const descEl = document.getElementById('previewDesc');
  descEl.textContent = '정보 불러오는 중…';
  descEl.classList.add('loading');

  const imgEl = document.getElementById('previewImg');
  imgEl.style.display = 'none';
  imgEl.innerHTML = '';

  // 패널 열기
  const overlay = document.getElementById('previewOverlay');
  const panel   = document.getElementById('previewPanel');
  overlay.classList.remove('hidden');
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('open'));
  document.body.style.overflow = 'hidden';

  // OG 메타데이터 fetch (microlink.io – 무료)
  try {
    const res  = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(p.url)}`);
    const data = await res.json();
    if (currentPreviewId !== p.id) return; // 사용자가 다른 글 클릭함

    if (data.status === 'success') {
      descEl.textContent = data.data?.description || '(설명 없음)';
      descEl.classList.remove('loading');

      const imgUrl = data.data?.image?.url;
      if (imgUrl) {
        const img = document.createElement('img');
        img.alt     = '';
        img.loading = 'lazy';
        img.src     = imgUrl;
        img.addEventListener('error', () => { imgEl.style.display = 'none'; });
        imgEl.appendChild(img);
        imgEl.style.display = 'block';
      }
    } else {
      descEl.textContent = '(미리보기 정보 없음)';
      descEl.classList.remove('loading');
    }
  } catch {
    if (currentPreviewId === p.id) {
      descEl.textContent = '(미리보기를 불러오지 못했습니다)';
      descEl.classList.remove('loading');
    }
  }
}

function closePreview() {
  currentPreviewId = null;
  const panel   = document.getElementById('previewPanel');
  const overlay = document.getElementById('previewOverlay');
  panel.classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => {
    panel.classList.add('hidden');
    overlay.classList.add('hidden');
  }, 300);
}

// ── HOT TOP 10 ───────────────────────────────────────────────
function renderHotList() {
  const list = document.getElementById('hotList');
  const top  = [...state.posts]
    .filter(p => p.points > 0)
    .sort((a, b) => trendingScore(b) - trendingScore(a))
    .slice(0, 10);

  list.innerHTML = '';
  if (top.length === 0) {
    const li = document.createElement('li');
    li.style.cssText = 'color:var(--text3);font-size:12px';
    li.textContent = '데이터 없음';
    list.appendChild(li);
    return;
  }
  const numClasses = ['gold', 'silver', 'bronze'];
  top.forEach((p, i) => {
    const src = SOURCE_MAP[p.sourceId];
    const li  = document.createElement('li');
    li.className = 'hot-item';

    const num = document.createElement('span');
    num.className = `hot-num ${numClasses[i] || ''}`;
    num.textContent = i + 1;

    const wrap = document.createElement('span');

    const sb = document.createElement('span');
    sb.className = 'hot-source-badge';
    sb.style.background = src.color;
    sb.textContent = src.flag;

    const ttl = document.createElement('span');
    ttl.className = 'hot-title';
    ttl.textContent = p.title;

    wrap.append(sb, ttl);
    li.append(num, wrap);
    li.addEventListener('click', () => openPreview(p));
    list.appendChild(li);
  });
}

// ── 소스 현황 ────────────────────────────────────────────────
function renderSourceStatus() {
  const el = document.getElementById('sourceStatus');
  el.innerHTML = '';
  SOURCES.forEach(s => {
    const st    = state.sourceStatus[s.id] || 'loading';
    const count = state.sourceCount[s.id]  || 0;
    const li    = document.createElement('li');
    li.className = 'source-status-item';
    li.innerHTML = `
      <span class="status-dot ${st}"></span>
      <span class="source-count">${st === 'ok' ? count + '개' : st === 'error' ? '오류' : '…'}</span>`;
    const b = document.createElement('span');
    b.className = 'source-badge';
    b.style.cssText = `background:${s.color};font-size:10px`;
    b.textContent = `${s.flag} ${s.name}`;
    li.insertBefore(b, li.children[1]);
    el.appendChild(li);
  });
}

// ── Skeleton ─────────────────────────────────────────────────
function renderSkeletons(container, n) {
  container.innerHTML = Array.from({ length: n }, () => `
    <div class="skeleton-card">
      <div class="skeleton-line w30 h8"></div>
      <div class="skeleton-line w80"></div>
      <div class="skeleton-line w60"></div>
      <div class="skeleton-line w40 h8"></div>
    </div>`).join('');
}

// ── Utilities ────────────────────────────────────────────────
function relTime(date) {
  const m = Math.floor((Date.now() - date.getTime()) / 60000);
  if (m < 1)  return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}일 전` : date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}
function fmtNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}
function setRefreshSpinning(on) {
  document.getElementById('refreshBtn').classList.toggle('spinning', on);
}

// ── Events ───────────────────────────────────────────────────
function initEvents() {
  document.querySelectorAll('.tab').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.tab  = btn.dataset.tab;
      state.page = 0;
      renderFeed();
    })
  );
  document.getElementById('sortSelect').addEventListener('change', e => {
    state.sort = e.target.value; state.page = 0; renderFeed();
  });
  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = e.target.value.trim(); state.page = 0; renderFeed(); }, 300);
  });
  document.getElementById('loadMoreBtn').addEventListener('click', () => {
    state.page++; renderFeed(); window.scrollBy({ top: 600, behavior: 'smooth' });
  });
  document.getElementById('refreshBtn').addEventListener('click', loadAllSources);
  document.getElementById('previewClose').addEventListener('click', closePreview);
  document.getElementById('previewOverlay').addEventListener('click', closePreview);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePreview(); });

  // 테마 토글
  const moonPath = 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z';
  const sunPath  = 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.36-6.36-.71.71M6.34 17.66l-.71.71M17.66 17.66l.71.71M6.34 6.34l-.71-.71M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z';
  function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const icon = document.getElementById('themeIcon');
    icon.innerHTML = '';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', dark ? moonPath : sunPath);
    icon.appendChild(path);
  }
  document.getElementById('themeBtn').addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyTheme(!isDark);
    localStorage.setItem('gh-theme', isDark ? 'light' : 'dark');
  });
  const saved = localStorage.getItem('gh-theme');
  if (saved) applyTheme(saved === 'dark');
}

setInterval(loadAllSources, 5 * 60 * 1000);
initEvents();
loadAllSources();
