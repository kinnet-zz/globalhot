/* =========================================================
   GlobalHot – app.js  v2
   컨셉: "지금 세계에서 가장 이상하고 놀라운 것들"
   소스: Reddit TIL/IAF/Science, Atlas Obscura, Boing Boing,
         NASA APOD, Smithsonian, BBC World, HN, Product Hunt,
         GitHub Trending, Hatena, NHK, Lobste.rs, Dev.to
   ========================================================= */
'use strict';

const PROXY = 'https://api.allorigins.win/raw?url=';

// ── RSS 파싱 (이미지 추출 포함) ────────────────────────────
async function parseRSS(feedUrl, limit = 25) {
  const r = await fetch(PROXY + encodeURIComponent(feedUrl), { cache: 'no-store' });
  if (!r.ok) throw new Error(`RSS fetch failed: ${r.status}`);
  const xml = await r.text();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid RSS XML');

  return [...doc.querySelectorAll('item')].slice(0, limit).map(item => ({
    title:     cleanText(item.querySelector('title')?.textContent || ''),
    link:      item.querySelector('link')?.textContent?.trim()
            || item.querySelector('guid')?.textContent?.trim() || '',
    pubDate:   item.querySelector('pubDate')?.textContent?.trim() || '',
    thumbnail: extractRssImage(item),
  }));
}

function extractRssImage(item) {
  const NS = 'http://search.yahoo.com/mrss/';
  // media:thumbnail
  const mt = item.getElementsByTagNameNS(NS, 'thumbnail')[0];
  if (mt?.getAttribute('url')) return mt.getAttribute('url');
  // media:content (image)
  const mc = item.getElementsByTagNameNS(NS, 'content')[0];
  if (mc && /image/.test(mc.getAttribute('medium') || mc.getAttribute('type') || ''))
    return mc.getAttribute('url') || '';
  // enclosure
  const enc = item.querySelector('enclosure');
  if (enc?.getAttribute('type')?.startsWith('image/')) return enc.getAttribute('url') || '';
  // description 내 첫 번째 <img>
  const desc = item.querySelector('description')?.textContent || '';
  const m = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : '';
}

function cleanText(str) {
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

// Reddit 썸네일 유효성 체크
function validThumb(t) {
  return t && !['self','default','nsfw','image','spoiler',''].includes(t) && t.startsWith('http');
}

// ── Source 정의 ──────────────────────────────────────────
const SOURCES = [
  // 🔥 지금핫함
  { id: 'reddit_til',    name: 'r/todayilearned', sub: 'TIL',          color: '#FF4500', emoji: '💡', tabs: ['hot','til'],      fetch: fetchRedditTIL      },
  { id: 'reddit_iaf',    name: 'r/interestingasfuck', sub: '이상한세계', color: '#FF6314', emoji: '🤯', tabs: ['hot','internet'], fetch: fetchRedditIAF      },
  { id: 'boing_boing',   name: 'Boing Boing',     sub: '이상한인터넷',  color: '#CC0000', emoji: '😂', tabs: ['hot','internet'], fetch: fetchBoingBoing     },
  { id: 'hacker_news',   name: 'Hacker News',     sub: 'Top Stories',  color: '#FF6600', emoji: '💻', tabs: ['hot'],            fetch: fetchHackerNews     },
  { id: 'product_hunt',  name: 'Product Hunt',    sub: "Today's Best", color: '#DA552F', emoji: '🚀', tabs: ['hot'],            fetch: fetchProductHunt    },
  { id: 'github_trending',name:'GitHub',          sub: 'Trending',     color: '#24292f', emoji: '⭐', tabs: ['hot'],            fetch: fetchGitHubTrending },

  // 🤯 놀라운발견
  { id: 'nasa_apod',     name: 'NASA APOD',       sub: '오늘의우주',   color: '#0B3D91', emoji: '🚀', tabs: ['discover'],       fetch: fetchNASAAPOD       },
  { id: 'reddit_science',name: 'r/science',       sub: '과학',         color: '#FF4500', emoji: '🔬', tabs: ['discover'],       fetch: fetchRedditScience  },
  { id: 'atlas_obscura', name: 'Atlas Obscura',   sub: '이상한역사',   color: '#4A90A4', emoji: '🗺️', tabs: ['discover','til'], fetch: fetchAtlasObscura   },
  { id: 'smithsonian',   name: 'Smithsonian',     sub: 'Magazine',     color: '#A63A2E', emoji: '🏛️', tabs: ['discover'],       fetch: fetchSmithsonian    },
  { id: 'wikipedia',     name: 'Wikipedia',       sub: 'Trending',     color: '#636466', emoji: '📖', tabs: ['discover'],       fetch: fetchWikipediaTrending },

  // 😂 오늘의인터넷
  { id: 'reddit_mildly', name: 'r/mildlyinteresting', sub: '은근흥미', color: '#FF4500', emoji: '😮', tabs: ['internet'],       fetch: fetchRedditMildly   },
  { id: 'lobsters',      name: 'Lobste.rs',       sub: 'Hottest',      color: '#AC130D', emoji: '🦞', tabs: ['internet'],       fetch: fetchLobsters       },

  // 💡 TIL
  { id: 'ask_hn',        name: 'Ask HN',          sub: 'Q&A',          color: '#FF6600', emoji: '❓', tabs: ['til'],            fetch: fetchAskHN          },
  { id: 'show_hn',       name: 'Show HN',         sub: '내가만든것',   color: '#FF6600', emoji: '✨', tabs: ['til'],            fetch: fetchShowHN         },
  { id: 'devto',         name: 'Dev.to',          sub: 'Top Articles', color: '#3d3d3d', emoji: '📝', tabs: ['til'],            fetch: fetchDevTo          },

  // 🌏 세계화제
  { id: 'bbc_world',     name: 'BBC World',       sub: 'News',         color: '#BB1919', emoji: '🌍', tabs: ['world'],          fetch: fetchBBCWorld       },
  { id: 'hatena',        name: 'はてな',           sub: 'ホットエントリ', color: '#00A4DE', emoji: '🇯🇵', tabs: ['world'],        fetch: fetchHatena         },
  { id: 'nhk',           name: 'NHK News',        sub: '最新ニュース',  color: '#003F7D', emoji: '🇯🇵', tabs: ['world'],         fetch: fetchNHK            },
];

const SOURCE_MAP = Object.fromEntries(SOURCES.map(s => [s.id, s]));

// ── State ────────────────────────────────────────────────
const state = {
  tab: 'hot', sort: 'trending', query: '',
  posts: [], page: 0, PAGE_SIZE: 20,
  sourceStatus: {}, sourceCount: {},
};

// ── Post 정규화 ──────────────────────────────────────────
function makePost(id, sourceId, title, url, points, comments, time, extra = {}) {
  return {
    id, sourceId,
    title:     String(title).trim(),
    url:       String(url).trim(),
    points:    Number(points)   || 0,
    comments:  Number(comments) || 0,
    time:      time instanceof Date ? time : new Date(time || Date.now()),
    thumbnail: '',
    desc:      '',
    ...extra,
  };
}

// ── 트렌딩 점수 ──────────────────────────────────────────
function trendingScore(p) {
  const ageHours = (Date.now() - p.time.getTime()) / 3_600_000;
  return p.points + p.comments * 3 + Math.max(0, 120 - ageHours * 2);
}

// ── Fetch Functions ──────────────────────────────────────

async function fetchRedditTIL() {
  const r = await fetch('https://www.reddit.com/r/todayilearned.json?limit=25&raw_json=1', { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'til_' + c.data.id, 'reddit_til',
    c.data.title,
    'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    { thumbnail: validThumb(c.data.thumbnail) ? c.data.thumbnail : '' }
  ));
}

async function fetchRedditIAF() {
  const r = await fetch('https://www.reddit.com/r/interestingasfuck.json?limit=25&raw_json=1', { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'iaf_' + c.data.id, 'reddit_iaf',
    c.data.title,
    'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    { thumbnail: validThumb(c.data.thumbnail) ? c.data.thumbnail : '' }
  ));
}

async function fetchRedditScience() {
  const r = await fetch('https://www.reddit.com/r/science.json?limit=20&raw_json=1', { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'sci_' + c.data.id, 'reddit_science',
    c.data.title,
    c.data.url || 'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    { thumbnail: validThumb(c.data.thumbnail) ? c.data.thumbnail : '' }
  ));
}

async function fetchRedditMildly() {
  const r = await fetch('https://www.reddit.com/r/mildlyinteresting.json?limit=20&raw_json=1', { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'mi_' + c.data.id, 'reddit_mildly',
    c.data.title,
    'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    { thumbnail: validThumb(c.data.thumbnail) ? c.data.thumbnail : '' }
  ));
}

async function fetchHackerNews() {
  const r = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=25');
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

async function fetchProductHunt() {
  const items = await parseRSS('https://www.producthunt.com/feed', 20);
  return items.map((item, i) => makePost(
    'ph_' + i, 'product_hunt', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail }
  ));
}

async function fetchGitHubTrending() {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const r = await fetch(
    `https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=15`,
    { headers: { Accept: 'application/vnd.github.v3+json' } }
  );
  const d = await r.json();
  return (d.items || []).map(repo => makePost(
    'gh_' + repo.id, 'github_trending',
    `${repo.full_name}${repo.description ? ' — ' + repo.description : ''}`,
    repo.html_url, repo.stargazers_count, 0, new Date(repo.created_at),
    { sub: repo.language || 'GitHub', thumbnail: repo.owner?.avatar_url || '' }
  ));
}

async function fetchNASAAPOD() {
  // DEMO_KEY: 30req/hour per IP — 소규모 사이트에 충분
  const r = await fetch('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&count=5');
  const d = await r.json();
  if (!Array.isArray(d)) throw new Error('NASA APOD unexpected response');
  return d.filter(a => a.media_type === 'image').map((a, i) => makePost(
    'nasa_' + i, 'nasa_apod', a.title,
    `https://apod.nasa.gov/apod/astropix.html`,
    0, 0, new Date(a.date),
    { thumbnail: a.url, desc: a.explanation?.slice(0, 120) + '…' || '' }
  ));
}

async function fetchRedditScience_unused() { /* 위에서 사용 */ }

async function fetchAtlasObscura() {
  const items = await parseRSS('https://www.atlasobscura.com/feeds/latest', 20);
  return items.map((item, i) => makePost(
    'ao_' + i, 'atlas_obscura', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail }
  ));
}

async function fetchSmithsonian() {
  const items = await parseRSS('https://www.smithsonianmag.com/rss/latest_articles/', 15);
  return items.map((item, i) => makePost(
    'sm_' + i, 'smithsonian', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail }
  ));
}

async function fetchWikipediaTrending() {
  const d = new Date(Date.now() - 86_400_000);
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/`
    + `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  const r = await fetch(url);
  const j = await r.json();
  const skip = new Set(['Main_Page','Special:Search','Wikipedia:Featured_pictures',
    'Special:Export','Special:BookSources','Special:Random','Wikipedia:About']);
  return j.items[0].articles
    .filter(a => !skip.has(a.article) && !a.article.startsWith('Special:') && !a.article.startsWith('Wikipedia:'))
    .slice(0, 15)
    .map((a, i) => makePost(
      'wiki_' + i, 'wikipedia',
      a.article.replace(/_/g, ' '),
      `https://en.wikipedia.org/wiki/${encodeURIComponent(a.article)}`,
      a.views, 0, new Date()
    ));
}

async function fetchBoingBoing() {
  const items = await parseRSS('https://boingboing.net/feed', 20);
  return items.map((item, i) => makePost(
    'bb_' + i, 'boing_boing', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail }
  ));
}

async function fetchBBCWorld() {
  const items = await parseRSS('https://feeds.bbci.co.uk/news/world/rss.xml', 20);
  return items.map((item, i) => makePost(
    'bbc_' + i, 'bbc_world', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail }
  ));
}

async function fetchHatena() {
  const items = await parseRSS('https://b.hatena.ne.jp/hotentry/all.rss', 20);
  return items.map((item, i) => makePost(
    'ht_' + i, 'hatena', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail }
  ));
}

async function fetchNHK() {
  const items = await parseRSS('https://www3.nhk.or.jp/rss/news/cat0.xml', 15);
  return items.map((item, i) => makePost(
    'nhk_' + i, 'nhk', item.title, item.link, 0, 0, new Date(item.pubDate)
  ));
}

async function fetchLobsters() {
  const r = await fetch('https://lobste.rs/hottest.json', { cache: 'no-store' });
  const d = await r.json();
  return d.slice(0, 15).map(s => makePost(
    'lb_' + s.short_id, 'lobsters', s.title,
    s.url || `https://lobste.rs/s/${s.short_id}`,
    s.score, s.comment_count, new Date(s.created_at),
    { sub: (s.tags || []).join(', ') }
  ));
}

async function fetchDevTo() {
  const r = await fetch('https://dev.to/api/articles?per_page=15&top=7');
  const d = await r.json();
  return d.map(a => makePost(
    'dt_' + a.id, 'devto', a.title, a.url,
    a.positive_reactions_count, a.comments_count, new Date(a.published_at),
    { thumbnail: a.cover_image || a.social_image || '' }
  ));
}

// ── 전체 로딩 ────────────────────────────────────────────
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

// ── 필터 + 정렬 ──────────────────────────────────────────
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

// ── 피드 렌더링 ──────────────────────────────────────────
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

  // 첫 번째 글이 썸네일 있으면 히어로 카드로
  if (state.page === 0 && slice[0].thumbnail && !state.query) {
    frag.appendChild(createHeroCard(slice[0]));
    slice.slice(1).forEach((p, i) => frag.appendChild(createCard(p, i + 2)));
  } else {
    slice.forEach((p, i) => frag.appendChild(createCard(p, i + 1)));
  }

  feed.appendChild(frag);
  loadMoreWrap.classList.toggle('hidden', slice.length >= filtered.length);
}

// ── 히어로 카드 (썸네일 있는 1위 글) ───────────────────────
function createHeroCard(p) {
  const src  = SOURCE_MAP[p.sourceId];
  const card = document.createElement('article');
  card.className = 'hero-card';
  card.addEventListener('click', () => openPreview(p));

  const img = document.createElement('div');
  img.className = 'hero-img';
  img.style.backgroundImage = `url(${p.thumbnail})`;

  const body = document.createElement('div');
  body.className = 'hero-body';

  const meta = document.createElement('div');
  meta.className = 'hero-meta';

  const badge = document.createElement('span');
  badge.className = 'source-badge';
  badge.style.background = src.color;
  badge.textContent = `${src.emoji} ${src.name}`;

  const tag = document.createElement('span');
  tag.className = 'emotion-tag';
  tag.style.background = src.color + '33';
  tag.style.color = src.color;
  tag.textContent = src.emoji + ' ' + (src.sub || '');

  const time = document.createElement('span');
  time.className = 'post-time';
  time.textContent = relTime(p.time);

  meta.append(badge, tag, time);

  const title = document.createElement('div');
  title.className = 'hero-title';
  title.textContent = p.title;

  if (p.desc) {
    const desc = document.createElement('div');
    desc.className = 'hero-desc';
    desc.textContent = p.desc;
    body.append(meta, title, desc);
  } else {
    body.append(meta, title);
  }

  if (p.points > 0 || p.comments > 0) {
    const stats = document.createElement('div');
    stats.className = 'hero-stats';
    if (p.points   > 0) stats.appendChild(makeStat(`👍 ${fmtNum(p.points)}`));
    if (p.comments > 0) stats.appendChild(makeStat(`💬 ${fmtNum(p.comments)}`));
    body.appendChild(stats);
  }

  card.append(img, body);
  return card;
}

// ── 일반 카드 ────────────────────────────────────────────
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

  const meta = document.createElement('div');
  meta.className = 'post-meta';

  const badge = document.createElement('span');
  badge.className = 'source-badge';
  badge.style.background = src.color;
  badge.textContent = src.emoji + ' ' + src.name;

  const time = document.createElement('span');
  time.className = 'post-time';
  time.textContent = relTime(p.time);

  meta.append(badge);
  if (p.sub) {
    const sub = document.createElement('span');
    sub.className = 'post-subreddit';
    sub.textContent = p.sub;
    meta.appendChild(sub);
  }
  meta.appendChild(time);

  const title = document.createElement('div');
  title.className = 'post-title';
  title.textContent = p.title;

  const stats = document.createElement('div');
  stats.className = 'post-stats';
  if (p.points   > 0) stats.appendChild(makeStat(`👍 ${fmtNum(p.points)}`));
  if (p.comments > 0) stats.appendChild(makeStat(`💬 ${fmtNum(p.comments)}`));
  const hint = document.createElement('span');
  hint.className = 'preview-hint';
  hint.textContent = '미리보기 →';
  stats.appendChild(hint);

  body.append(meta, title, stats);

  // 썸네일 (있을 때만)
  if (p.thumbnail) {
    const thumb = document.createElement('div');
    thumb.className = 'post-thumb';
    const img = document.createElement('img');
    img.src = p.thumbnail;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => { thumb.style.display = 'none'; });
    thumb.appendChild(img);
    card.append(rankEl, body, thumb);
  } else {
    card.append(rankEl, body);
  }

  return card;
}

function makeStat(text) {
  const s = document.createElement('span');
  s.className = 'stat';
  s.textContent = text;
  return s;
}

// ── 프리뷰 패널 ──────────────────────────────────────────
let currentPreviewId = null;

async function openPreview(p) {
  currentPreviewId = p.id;
  const src = SOURCE_MAP[p.sourceId];

  const badge = document.getElementById('previewBadge');
  badge.textContent  = `${src.emoji} ${src.name}`;
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
  const imgEl  = document.getElementById('previewImg');

  // NASA APOD는 이미 설명 있음
  if (p.desc) {
    descEl.textContent = p.desc;
    descEl.classList.remove('loading');
  } else {
    descEl.textContent = '정보 불러오는 중…';
    descEl.classList.add('loading');
  }

  // 썸네일 있으면 바로 표시
  imgEl.style.display = 'none';
  imgEl.innerHTML = '';
  if (p.thumbnail) {
    const img = document.createElement('img');
    img.alt = ''; img.loading = 'lazy'; img.src = p.thumbnail;
    img.addEventListener('error', () => { imgEl.style.display = 'none'; });
    imgEl.appendChild(img);
    imgEl.style.display = 'block';
  }

  const overlay = document.getElementById('previewOverlay');
  const panel   = document.getElementById('previewPanel');
  overlay.classList.remove('hidden');
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('open'));
  document.body.style.overflow = 'hidden';

  // OG 메타 fetch (설명 없을 때만)
  if (!p.desc) {
    try {
      const res  = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(p.url)}`);
      const data = await res.json();
      if (currentPreviewId !== p.id) return;
      if (data.status === 'success') {
        descEl.textContent = data.data?.description || '(설명 없음)';
        descEl.classList.remove('loading');
        const imgUrl = data.data?.image?.url;
        if (imgUrl && !p.thumbnail) {
          const img = document.createElement('img');
          img.alt = ''; img.loading = 'lazy'; img.src = imgUrl;
          img.addEventListener('error', () => { imgEl.style.display = 'none'; });
          imgEl.innerHTML = '';
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

// ── HOT TOP 10 ───────────────────────────────────────────
function renderHotList() {
  const list = document.getElementById('hotList');
  // 전체 소스에서 점수 있는 것 + 최신 것 혼합
  const byScore = [...state.posts]
    .filter(p => p.points > 0)
    .sort((a, b) => trendingScore(b) - trendingScore(a))
    .slice(0, 10);
  const top = byScore.length >= 5 ? byScore : [...state.posts]
    .sort((a, b) => trendingScore(b) - trendingScore(a))
    .slice(0, 10);

  list.innerHTML = '';
  const numClasses = ['gold', 'silver', 'bronze'];
  top.forEach((p, i) => {
    const src = SOURCE_MAP[p.sourceId];
    const li  = document.createElement('li');
    li.className = 'hot-item';

    const num = document.createElement('span');
    num.className = `hot-num ${numClasses[i] || ''}`;
    num.textContent = i + 1;

    const wrap = document.createElement('span');
    const sb   = document.createElement('span');
    sb.className = 'hot-source-badge';
    sb.style.background = src.color;
    sb.textContent = src.emoji;

    const ttl = document.createElement('span');
    ttl.className = 'hot-title';
    ttl.textContent = p.title;

    wrap.append(sb, ttl);
    li.append(num, wrap);
    li.addEventListener('click', () => openPreview(p));
    list.appendChild(li);
  });
}

// ── 소스 현황 ────────────────────────────────────────────
function renderSourceStatus() {
  const el = document.getElementById('sourceStatus');
  el.innerHTML = '';
  SOURCES.forEach(s => {
    const st    = state.sourceStatus[s.id] || 'loading';
    const count = state.sourceCount[s.id]  || 0;
    const li    = document.createElement('li');
    li.className = 'source-status-item';

    const dot = document.createElement('span');
    dot.className = `status-dot ${st}`;

    const b = document.createElement('span');
    b.className = 'source-badge';
    b.style.cssText = `background:${s.color};font-size:10px`;
    b.textContent = `${s.emoji} ${s.name}`;

    const cnt = document.createElement('span');
    cnt.className = 'source-count';
    cnt.textContent = st === 'ok' ? count + '개' : st === 'error' ? '오류' : '…';

    li.append(dot, b, cnt);
    el.appendChild(li);
  });
}

// ── Skeleton ─────────────────────────────────────────────
function renderSkeletons(container, n) {
  container.innerHTML = Array.from({ length: n }, () => `
    <div class="skeleton-card">
      <div class="skeleton-line w30 h8"></div>
      <div class="skeleton-line w80"></div>
      <div class="skeleton-line w60"></div>
      <div class="skeleton-line w40 h8"></div>
    </div>`).join('');
}

// ── Utilities ────────────────────────────────────────────
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
  if (n >= 1_000)     return (n / 1_000).toFixed(1)     + 'K';
  return n.toLocaleString();
}
function setRefreshSpinning(on) {
  document.getElementById('refreshBtn').classList.toggle('spinning', on);
}

// ── Events ───────────────────────────────────────────────
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
