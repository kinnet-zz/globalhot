/* =========================================================
   GlobalHot – app.js  v2
   컨셉: "지금 세계에서 가장 이상하고 놀라운 것들"
   소스: Reddit TIL/IAF/Science, Atlas Obscura, Boing Boing,
         NASA APOD, Smithsonian, BBC World, HN, Product Hunt,
         GitHub Trending, Hatena, NHK, Lobste.rs, Dev.to
   ========================================================= */
'use strict';

// ── 다국어 번역 ───────────────────────────────────────────
const I18N = {
  all: {
    tabs:     { all:'🌐 전체', hot:'🔥 지금핫함', trends:'🔍 검색트렌드', tech:'💻 테크', video:'🎬 핫영상', world:'🌏 세계화제', photo:'📸 포토' },
    sort:     { label:'정렬', trending:'🔥 트렌딩', time:'🕐 최신순', points:'👍 인기순', comments:'💬 댓글순' },
    ui:       { search:'글 제목 검색...', more:'더 보기 →', loadMore:'더 보기 ↓', keywords:'☁️ 키워드 현황', updated:'마지막 업데이트:' },
    sections: { hot:'🔥 지금핫함', trends:'🔍 검색트렌드', tech:'💻 테크', video:'🎬 핫영상', world:'🌏 세계화제', photo:'📸 포토' },
  },
  ko: {
    tabs:     { all:'🌐 전체', hot:'🔥 지금핫함', trends:'🔍 검색트렌드', tech:'💻 테크', video:'🎬 핫영상', world:'🌏 세계화제', photo:'📸 포토' },
    sort:     { label:'정렬', trending:'🔥 트렌딩', time:'🕐 최신순', points:'👍 인기순', comments:'💬 댓글순' },
    ui:       { search:'글 제목 검색...', more:'더 보기 →', loadMore:'더 보기 ↓', keywords:'☁️ 키워드 현황', updated:'마지막 업데이트:' },
    sections: { hot:'🔥 지금핫함', trends:'🔍 검색트렌드', tech:'💻 테크', video:'🎬 핫영상', world:'🌏 세계화제', photo:'📸 포토' },
  },
  en: {
    tabs:     { all:'🌐 All', hot:'🔥 Hot Now', trends:'🔍 Search Trends', tech:'💻 Tech', video:'🎬 Videos', world:'🌏 World', photo:'📸 Photo' },
    sort:     { label:'Sort', trending:'🔥 Trending', time:'🕐 Latest', points:'👍 Top', comments:'💬 Comments' },
    ui:       { search:'Search titles...', more:'More →', loadMore:'Load more ↓', keywords:'☁️ Keywords', updated:'Last updated:' },
    sections: { hot:'🔥 Hot Now', trends:'🔍 Search Trends', tech:'💻 Tech', video:'🎬 Videos', world:'🌏 World', photo:'📸 Photo' },
  },
  ja: {
    tabs:     { all:'🌐 すべて', hot:'🔥 今ホット', trends:'🔍 検索トレンド', tech:'💻 テック', video:'🎬 動画', world:'🌏 世界の話題', photo:'📸 フォト' },
    sort:     { label:'並替', trending:'🔥 急上昇', time:'🕐 新着', points:'👍 人気', comments:'💬 コメント' },
    ui:       { search:'タイトル検索...', more:'もっと見る →', loadMore:'もっと見る ↓', keywords:'☁️ キーワード', updated:'最終更新:' },
    sections: { hot:'🔥 今ホット', trends:'🔍 検索トレンド', tech:'💻 テック', video:'🎬 動画', world:'🌏 世界の話題', photo:'📸 フォト' },
  },
  zh: {
    tabs:     { all:'🌐 全部', hot:'🔥 热门', trends:'🔍 搜索趋势', tech:'💻 科技', video:'🎬 视频', world:'🌏 世界热议', photo:'📸 照片' },
    sort:     { label:'排序', trending:'🔥 趋势', time:'🕐 最新', points:'👍 热门', comments:'💬 评论' },
    ui:       { search:'搜索标题...', more:'更多 →', loadMore:'加载更多 ↓', keywords:'☁️ 关键词', updated:'最后更新:' },
    sections: { hot:'🔥 热门', trends:'🔍 搜索趋势', tech:'💻 科技', video:'🎬 视频', world:'🌏 世界热议', photo:'📸 照片' },
  },
};

function applyI18n(lang) {
  const t = I18N[lang] || I18N.all;

  // 탭 버튼 (이모지 유지, 라벨+툴팁만 변경)
  document.querySelectorAll('.tab[data-tab]').forEach(btn => {
    const key = btn.dataset.tab;
    const label = btn.querySelector('.tab-label');
    if (t.tabs[key]) {
      const textOnly = t.tabs[key].replace(/^\S+\s*/, '');
      if (label) label.textContent = ' ' + textOnly;
      btn.dataset.tip = textOnly;
    }
  });

  // 정렬 라벨 & 옵션
  const sortLabel = document.querySelector('.sort-label');
  if (sortLabel) sortLabel.textContent = t.sort.label;
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    const map = { trending: t.sort.trending, time: t.sort.time, points: t.sort.points, comments: t.sort.comments };
    Array.from(sortSelect.options).forEach(opt => { if (map[opt.value]) opt.textContent = map[opt.value]; });
  }

  // 검색창 placeholder
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.placeholder = t.ui.search;

  // 더 보기 ↓ 버튼
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  if (loadMoreBtn) loadMoreBtn.textContent = t.ui.loadMore;

  // 키워드 현황 제목
  const sidebarTitle = document.querySelector('.sidebar-title');
  if (sidebarTitle) sidebarTitle.textContent = t.ui.keywords;

  // 섹션 "더 보기 →" 버튼들 (렌더 후 존재)
  document.querySelectorAll('.section-more').forEach(el => { el.textContent = t.ui.more; });

  // 섹션 헤더 타이틀들
  document.querySelectorAll('.section-card .section-title[data-tab]').forEach(el => {
    const key = el.dataset.tab;
    if (t.sections[key]) el.textContent = t.sections[key];
  });

  // SECTION_DEFS 레이블 동기화 (다음 renderFeed에서 사용)
  SECTION_DEFS.forEach(def => {
    if (t.sections[def.tab]) def.label = t.sections[def.tab];
  });
}

const PROXY  = 'https://api.allorigins.win/raw?url=';
const PROXY2 = 'https://corsproxy.io/?url=';
const SELF_PROXY = '/api/proxy?url=';
const REDDIT_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

async function fetchWithProxy(url) {
  // 첫 번째 프록시 시도
  try {
    const r = await fetch(PROXY + encodeURIComponent(url), { cache: 'no-store' });
    if (r.ok) {
      const text = await r.text();
      // HTML 응답이면 실패로 간주
      if (!text.trim().startsWith('<') || text.includes('<!DOCTYPE')) throw new Error('non-XML');
      return text;
    }
  } catch {}
  // 두 번째 프록시 시도
  const r2 = await fetch(PROXY2 + encodeURIComponent(url), { cache: 'no-store' });
  if (!r2.ok) throw new Error(`fetch failed: ${r2.status}`);
  return r2.text();
}

// ── RSS 파싱 (rss2json API 사용) ────────────────────────────
async function parseRSS(feedUrl) {
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`RSS fetch failed: ${r.status}`);
  const d = await r.json();
  if (d.status !== 'ok') throw new Error(`rss2json error: ${d.message || d.status}`);

  return d.items.map(item => ({
    title:     item.title || '',
    link:      item.link  || item.guid || '',
    pubDate:   item.pubDate || '',
    thumbnail: item.thumbnail || item.enclosure?.link || '',
    desc:      item.description ? item.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) : '',
  }));
}

function extractRssDesc(item) {
  const raw = item.querySelector('description')?.textContent || '';
  const text = cleanText(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 200) || '';
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
  // 🔍 검색트렌드
  { id: 'trends_kr', name: 'Google 트렌드', sub: '🇰🇷 한국', color: '#4285F4', emoji: '🔍', lang: 'ko', tabs: ['trends','hot'], fetch: () => fetchGoogleTrends('KR', 'trends_kr') },
  { id: 'trends_us', name: 'Google 트렌드', sub: '🇺🇸 미국', color: '#4285F4', emoji: '🔍', lang: 'en', tabs: ['trends'],       fetch: () => fetchGoogleTrends('US', 'trends_us') },
  { id: 'trends_jp', name: 'Google 트렌드', sub: '🇯🇵 일본', color: '#4285F4', emoji: '🔍', lang: 'ja', tabs: ['trends'],       fetch: () => fetchGoogleTrends('JP', 'trends_jp') },

  // 🔥 지금핫함
  { id: 'reddit_til',    name: 'r/todayilearned',     sub: 'TIL',        color: '#FF4500', emoji: '💡', lang: 'en', tabs: ['hot'], fetch: fetchRedditTIL      },
  { id: 'reddit_iaf',    name: 'r/interestingasfuck', sub: '이상한세계', color: '#FF6314', emoji: '🤯', lang: 'en', tabs: ['hot'], fetch: fetchRedditIAF      },
  { id: 'boing_boing',   name: 'Boing Boing',         sub: '이상한인터넷',color: '#CC0000', emoji: '😂', lang: 'en', tabs: ['hot'], fetch: fetchBoingBoing     },
  { id: 'reddit_mildly', name: 'r/mildlyinteresting', sub: '은근흥미',   color: '#FF4500', emoji: '😮', lang: 'en', tabs: ['hot'], fetch: fetchRedditMildly   },

  // 💻 테크
  { id: 'hacker_news',    name: 'Hacker News',  sub: 'Top Stories',  color: '#FF6600', emoji: '💻', lang: 'en', tabs: ['tech'], fetch: fetchHackerNews     },
  { id: 'ask_hn',         name: 'Ask HN',       sub: 'Q&A',          color: '#FF6600', emoji: '❓', lang: 'en', tabs: ['hot'],  fetch: fetchAskHN          },
  { id: 'show_hn',        name: 'Show HN',      sub: '내가만든것',   color: '#FF6600', emoji: '✨', lang: 'en', tabs: ['hot'],  fetch: fetchShowHN         },
  { id: 'github_trending',name: 'GitHub',       sub: 'Trending',     color: '#24292f', emoji: '⭐', lang: 'en', tabs: ['tech'], fetch: fetchGitHubTrending },
  { id: 'product_hunt',   name: 'Product Hunt', sub: "Today's Best", color: '#DA552F', emoji: '🚀', lang: 'en', tabs: ['tech'], fetch: fetchProductHunt    },
  { id: 'lobsters',       name: 'Lobste.rs',    sub: 'Hottest',      color: '#AC130D', emoji: '🦞', lang: 'en', tabs: ['tech'], fetch: fetchLobsters       },
  { id: 'devto',          name: 'Dev.to',       sub: 'Top Articles', color: '#3d3d3d', emoji: '📝', lang: 'en', tabs: ['tech'], fetch: fetchDevTo          },
  { id: 'techcrunch',     name: 'TechCrunch',   sub: '최신 테크뉴스', color: '#0E9A47', emoji: '📰', lang: 'en', tabs: ['tech'], fetch: fetchTechCrunch     },
  { id: 'the_verge',      name: 'The Verge',    sub: '테크/문화',    color: '#FA4B2A', emoji: '⚡', lang: 'en', tabs: ['tech'], fetch: fetchTheVerge       },

  // 🎬 영상
  { id: 'yt_kr', name: 'YouTube', sub: '🇰🇷 인기', color: '#FF0000', emoji: '▶️', lang: 'ko', tabs: ['video'], fetch: () => fetchYouTubeTrending('KR') },
  { id: 'yt_us', name: 'YouTube', sub: '🇺🇸 인기', color: '#FF0000', emoji: '▶️', lang: 'en', tabs: ['video'], fetch: () => fetchYouTubeTrending('US') },
  { id: 'yt_jp', name: 'YouTube', sub: '🇯🇵 인기', color: '#FF0000', emoji: '▶️', lang: 'ja', tabs: ['video'], fetch: () => fetchYouTubeTrending('JP') },

  // 📸 포토
  { id: 'photo_earthporn',    name: 'r/EarthPorn',      sub: 'Landscapes',   color: '#2E7D32', emoji: '🏔️', lang: 'en', tabs: ['photo'], fetch: fetchEarthPorn         },
  { id: 'photo_itap',         name: 'r/itookapicture',  sub: 'Photography',  color: '#1565C0', emoji: '📷', lang: 'en', tabs: ['photo'], fetch: fetchITookAPicture     },
  { id: 'photo_urban',        name: 'r/UrbanPhotography',sub: 'Street',      color: '#37474F', emoji: '🏙️', lang: 'en', tabs: ['photo'], fetch: fetchUrbanPhotography  },
  { id: 'photo_macro',        name: 'r/MacroPorn',      sub: 'Macro',        color: '#00838F', emoji: '🔬', lang: 'en', tabs: ['photo'], fetch: fetchMacroPorn         },
  { id: 'photo_analog',       name: 'r/analog',         sub: 'Film',         color: '#5D4037', emoji: '🎞️', lang: 'en', tabs: ['photo'], fetch: fetchAnalog            },
  { id: 'photo_photojournalism',name:'r/photojournalism',sub:'News Photo',   color: '#B71C1C', emoji: '📰', lang: 'en', tabs: ['photo'], fetch: fetchPhotojournalism   },
  { id: 'photo_spaceporn',    name: 'r/spaceporn',      sub: 'Space',        color: '#1A237E', emoji: '🌌', lang: 'en', tabs: ['photo'], fetch: fetchSpacePorn         },
  { id: 'photo_flickr',       name: 'Flickr',           sub: 'Best Photos',  color: '#FF0084', emoji: '📷', lang: 'en', tabs: ['photo'], fetch: fetchFlickrPhoto       },
  { id: 'photo_deviantart',   name: 'DeviantArt',       sub: 'Photography',  color: '#05CC47', emoji: '🎨', lang: 'en', tabs: ['photo'], fetch: fetchDeviantArtPhoto   },

  // 🌏 세계화제
  { id: 'bbc_world',    name: 'BBC World', sub: 'News',           color: '#BB1919', emoji: '🌍', lang: 'en', tabs: ['world'], fetch: fetchBBCWorld    },
  { id: 'bbc_chinese',  name: 'BBC 中文',  sub: '中国新闻',       color: '#BB1919', emoji: '🇨🇳', lang: 'zh', tabs: ['world'], fetch: fetchBBCChinese  },
  { id: 'hatena',       name: 'はてな',    sub: 'ホットエントリ', color: '#00A4DE', emoji: '🇯🇵', lang: 'ja', tabs: ['world'], fetch: fetchHatena      },
  { id: 'nhk',          name: 'NHK News', sub: '最新ニュース',    color: '#003F7D', emoji: '🇯🇵', lang: 'ja', tabs: ['world'], fetch: fetchNHK         },

  // 🇰🇷 한국어 추가 소스
  { id: 'yonhap',      name: '연합뉴스',  sub: '속보',       color: '#0060A9', emoji: '📰', lang: 'ko', tabs: ['hot','world'], fetch: fetchYonhap      },
  { id: 'jtbc',        name: 'JTBC 뉴스', sub: '헤드라인',   color: '#E4002B', emoji: '📺', lang: 'ko', tabs: ['hot','world'], fetch: fetchJTBC        },
  { id: 'hani',        name: '한겨레',    sub: '주요기사',   color: '#005BAC', emoji: '📰', lang: 'ko', tabs: ['world'],       fetch: fetchHani        },
  { id: 'starnews',    name: '스타뉴스',  sub: 'K-Pop·연예', color: '#E91E63', emoji: '⭐', lang: 'ko', tabs: ['hot','world'], fetch: fetchStarnews    },
  { id: 'isplus',      name: 'IS Plus',   sub: 'JTBC 연예',  color: '#C62828', emoji: '🎬', lang: 'ko', tabs: ['hot','world'], fetch: fetchISPlus      },
  { id: 'newsen',      name: '뉴스엔',    sub: '연예뉴스',   color: '#0070C0', emoji: '📺', lang: 'ko', tabs: ['hot'],         fetch: fetchNewsen      },
  { id: 'mk_enter',    name: '매경 엔터', sub: '연예·문화',  color: '#004EA2', emoji: '🎭', lang: 'ko', tabs: ['hot'],         fetch: fetchMKEnter     },

  // 🇺🇸 미국 엔터·문화
  { id: 'deadline',      name: 'Deadline',    sub: 'Hollywood',    color: '#1a1a1a', emoji: '🎬', lang: 'en', tabs: ['hot','world'], fetch: fetchDeadline      },
  { id: 'rolling_stone', name: 'Rolling Stone',sub: 'Music·Culture',color:'#FF6900', emoji: '🎸', lang: 'en', tabs: ['hot','world'], fetch: fetchRollingStone  },
  { id: 'reddit_comedy', name: 'r/comedy',    sub: 'Comedy',       color: '#FF4500', emoji: '😂', lang: 'en', tabs: ['hot'],         fetch: fetchRedditComedy  },
  { id: 'reddit_kpop_r', name: 'r/kpop',      sub: 'K-Pop Fan',    color: '#9C27B0', emoji: '🎤', lang: 'en', tabs: ['hot','world'], fetch: fetchRedditKpopFan },
  { id: 'billboard',     name: 'Billboard',   sub: 'Music Charts', color: '#0E2A6A', emoji: '🎵', lang: 'en', tabs: ['hot','world'], fetch: fetchBillboard     },
  { id: 'variety',       name: 'Variety',     sub: 'Entertainment',color: '#5C0000', emoji: '🎬', lang: 'en', tabs: ['hot','world'], fetch: fetchVariety       },
  { id: 'pitchfork',     name: 'Pitchfork',   sub: 'Music Reviews',color: '#007A36', emoji: '🎧', lang: 'en', tabs: ['hot'],         fetch: fetchPitchfork     },
  { id: 'hypebeast',     name: 'Hypebeast',   sub: 'Street Culture',color:'#FF0000', emoji: '👟', lang: 'en', tabs: ['hot','world'], fetch: fetchHypebeast     },
  { id: 'kpopmap',       name: 'KpopMap',     sub: 'K-Pop News',   color: '#FF69B4', emoji: '🎤', lang: 'en', tabs: ['hot','world'], fetch: fetchKpopMap       },
  { id: 'jpopasia',      name: 'JpopAsia',    sub: 'J-Pop·Idol',   color: '#E60012', emoji: '🎵', lang: 'en', tabs: ['hot','world'], fetch: fetchJpopAsia      },

  // 🇯🇵 일본어 추가 소스
  { id: 'qiita',           name: 'Qiita',          sub: '人気記事',   color: '#55C500', emoji: '💻', lang: 'ja', tabs: ['tech','world'], fetch: fetchQiita          },
  { id: 'zenn',            name: 'Zenn',            sub: 'トレンド',   color: '#3EA8FF', emoji: '✍️', lang: 'ja', tabs: ['tech','world'], fetch: fetchZenn           },
  { id: 'itmedia',         name: 'ITmedia',         sub: 'ニュース',  color: '#E60012', emoji: '📱', lang: 'ja', tabs: ['tech','world'], fetch: fetchITmedia        },
  { id: 'soranews',        name: 'SoraNews24',      sub: 'Japan Pop', color: '#0078D7', emoji: '🗾', lang: 'ja', tabs: ['hot','world'], fetch: fetchSoraNews       },
  { id: 'tokyo_weekender', name: 'Tokyo Weekender', sub: 'Japan Life',color: '#E60012', emoji: '🗾', lang: 'ja', tabs: ['world'],        fetch: fetchTokyoWeekender },
  { id: 'reddit_jpop',     name: 'r/jpop',          sub: 'J-Pop·Idol',color: '#FF4500', emoji: '🎵', lang: 'ja', tabs: ['hot','world'], fetch: fetchRedditJpop     },
  { id: 'natalie_music',   name: 'ナタリー',        sub: '音楽ニュース',color:'#FF6B35',emoji: '🎵', lang: 'ja', tabs: ['hot','world'], fetch: fetchNatalieMusic   },
  { id: 'modelpress',      name: 'Modelpress',      sub: 'アイドル·芸能',color:'#FF69B4',emoji:'💃', lang: 'ja', tabs: ['hot'],         fetch: fetchModelpress     },

  // 🇨🇳 중국어 추가 소스
  { id: 'solidot',     name: 'Solidot',    sub: '科技新闻', color: '#336699', emoji: '🔬', lang: 'zh', tabs: ['tech','world'], fetch: fetchSolidot    },
  { id: 'sspai',       name: '少数派',     sub: '精选文章', color: '#D71A1C', emoji: '📱', lang: 'zh', tabs: ['tech','world'], fetch: fetchSspai      },
  { id: 'v2ex',        name: 'V2EX',       sub: '热门话题', color: '#3891D5', emoji: '💬', lang: 'zh', tabs: ['hot','world'],  fetch: fetchV2EX       },
  { id: 'global_times',name: 'Global Times',sub:'中国文化', color: '#CC0000', emoji: '🇨🇳', lang: 'zh', tabs: ['world'],       fetch: fetchGlobalTimes },
  { id: 'china_daily', name: 'China Daily', sub: 'Culture', color: '#CC0000', emoji: '🗞️', lang: 'zh', tabs: ['world'],       fetch: fetchChinaDaily  },
  { id: 'huxiu',       name: '虎嗅',       sub: '科技商业', color: '#FF6600', emoji: '📊', lang: 'zh', tabs: ['tech','hot'],   fetch: fetchHuxiu       },
  { id: 'ifanr',       name: '爱范儿',     sub: '科技生活', color: '#00AEEF', emoji: '📱', lang: 'zh', tabs: ['tech','hot'],   fetch: fetchIFanr       },
  { id: 'kr36',        name: '36氪',       sub: '创业科技', color: '#1890FF', emoji: '🚀', lang: 'zh', tabs: ['tech','hot'],   fetch: fetchKr36        },
  { id: 'ltn',         name: '自由時報',   sub: '台灣新聞', color: '#E60026', emoji: '🇹🇼', lang: 'zh', tabs: ['world'],       fetch: fetchLTN         },
  { id: 'mingpao',     name: '明報',       sub: '香港新聞', color: '#003F7D', emoji: '🇭🇰', lang: 'zh', tabs: ['world'],       fetch: fetchMingPao     },
];

const SOURCE_MAP = Object.fromEntries(SOURCES.map(s => [s.id, s]));

// ── State ────────────────────────────────────────────────
const state = {
  tab: 'all', sort: 'trending', query: '', lang: 'all',
  posts: [], page: 0, PAGE_SIZE: 20,
  isLoading: false,
};

// ── Post 정규화 ──────────────────────────────────────────
function makePost(id, sourceId, title, url, points, comments, time, extra = {}) {
  return {
    id, sourceId,
    title:     String(title).trim(),
    url:       String(url).trim(),
    points:    Number(points)   || 0,
    comments:  Number(comments) || 0,
    time:      (time instanceof Date && !isNaN(time)) ? time : (() => { const d = new Date(time); return isNaN(d) ? new Date() : d; })(),
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
  const r = await fetch(SELF_PROXY + encodeURIComponent('https://www.reddit.com/r/todayilearned.json?limit=25&raw_json=1'), { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'til_' + c.data.id, 'reddit_til',
    c.data.title,
    'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    {
      thumbnail: validThumb(c.data.thumbnail) ? c.data.thumbnail : '',
      // TIL 셀프포스트는 selftext에 출처/보충 설명이 있음
      desc: (c.data.selftext || '').replace(/\n+/g, ' ').trim().slice(0, 160) || '',
    }
  ));
}

async function fetchRedditIAF() {
  const r = await fetch(SELF_PROXY + encodeURIComponent('https://www.reddit.com/r/interestingasfuck.json?limit=25&raw_json=1'), { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'iaf_' + c.data.id, 'reddit_iaf',
    c.data.title,
    'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    {
      thumbnail: validThumb(c.data.thumbnail) ? c.data.thumbnail : '',
      desc: (c.data.selftext || '').replace(/\n+/g, ' ').trim().slice(0, 160) || '',
    }
  ));
}

async function fetchRedditScience() {
  const r = await fetch(SELF_PROXY + encodeURIComponent('https://www.reddit.com/r/science.json?limit=20&raw_json=1'), { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'sci_' + c.data.id, 'reddit_science',
    c.data.title,
    c.data.url || 'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    {
      thumbnail: validThumb(c.data.thumbnail) ? c.data.thumbnail : '',
      // r/science는 selftext에 논문 요약이 들어있는 경우 많음
      desc: (c.data.selftext || '').replace(/\n+/g, ' ').trim().slice(0, 200) || '',
    }
  ));
}

async function fetchRedditMildly() {
  const r = await fetch(SELF_PROXY + encodeURIComponent('https://www.reddit.com/r/mildlyinteresting.json?limit=20&raw_json=1'), { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'mi_' + c.data.id, 'reddit_mildly',
    c.data.title,
    'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    {
      thumbnail: validThumb(c.data.thumbnail) ? c.data.thumbnail : '',
      desc: (c.data.selftext || '').replace(/\n+/g, ' ').trim().slice(0, 160) || '',
    }
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

async function fetchYouTubeTrending(regionCode) {
  const url = `/api/youtube?regionCode=${regionCode}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`YouTube API failed: ${r.status}`);
  const d = await r.json();
  if (!d.items) throw new Error('YouTube no items');
  return d.items.map(v => makePost(
    `yt_${regionCode}_${v.id}`,
    regionCode === 'KR' ? 'yt_kr' : regionCode === 'US' ? 'yt_us' : 'yt_jp',
    v.snippet.title,
    `https://www.youtube.com/watch?v=${v.id}`,
    Number(v.statistics?.likeCount || 0),
    Number(v.statistics?.commentCount || 0),
    new Date(v.snippet.publishedAt),
    {
      thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || '',
      desc: v.snippet.description?.slice(0, 120) || '',
      videoId: v.id,
      sub: v.snippet.channelTitle,
    }
  ));
}

async function fetchSpaceNews() {
  const items = await parseRSS('https://spacenews.com/feed/');
  return items.map((item, i) => makePost(
    'sn_' + i, 'spacenews', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}

async function fetchScienceAlert() {
  const items = await parseRSS('https://www.sciencealert.com/feed');
  return items.map((item, i) => makePost(
    'sa_' + i, 'sciencealert', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}

async function fetchPhysOrg() {
  const items = await parseRSS('https://phys.org/rss-feed/');
  return items.map((item, i) => makePost(
    'po_' + i, 'physorg', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}

async function fetchNASAAPOD() {
  // 오늘 포함 최근 7일 범위에서 최대 5개 이미지
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const r = await fetch(`https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&start_date=${weekAgo}&end_date=${today}`);
  const d = await r.json();
  if (!Array.isArray(d)) throw new Error('NASA APOD unexpected response');
  return d.filter(a => a.media_type === 'image').slice(-5).reverse().map((a, i) => makePost(
    'nasa_' + i, 'nasa_apod', a.title,
    `https://apod.nasa.gov/apod/ap${a.date.replace(/-/g,'').slice(2)}.html`,
    0, 0, new Date(a.date),
    { thumbnail: a.url, desc: a.explanation?.slice(0, 120) + '…' || '' }
  ));
}

// ── Google Trends ────────────────────────────────────────
// RSS: trends.google.com/trending/rss?geo=KR|US|JP
// ht: 네임스페이스에 트래픽, 이미지, 관련뉴스가 들어있음
async function fetchGoogleTrends(geo, sourceId) {
  const HT = 'https://trends.google.com/trends/trendingSearches';
  const url = `https://trends.google.com/trending/rss?geo=${geo}`;

  const r = await fetch(SELF_PROXY + encodeURIComponent(url), { cache: 'no-store' });
  if (!r.ok) throw new Error(`Google Trends (${geo}) fetch failed`);
  const xml = await r.text();

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Google Trends XML parse error');

  // 네임스페이스 없이도 동작하는 헬퍼
  function htGet(el, tag) {
    return el.getElementsByTagNameNS(HT, tag)[0]?.textContent?.trim()
        || el.getElementsByTagName(`ht:${tag}`)[0]?.textContent?.trim()
        || '';
  }

  return [...doc.querySelectorAll('item')].slice(0, 20).map((item, i) => {
    const title    = cleanText(item.querySelector('title')?.textContent || '');
    const traffic  = htGet(item, 'approx_traffic');
    const picture  = htGet(item, 'picture');

    // 첫 번째 관련 뉴스 아이템
    const newsItem    = item.getElementsByTagNameNS(HT, 'news_item')[0]
                     || item.getElementsByTagName('ht:news_item')[0];
    const newsTitle   = newsItem ? htGet(newsItem, 'news_item_title')   : '';
    const newsSnippet = newsItem ? htGet(newsItem, 'news_item_snippet') : '';
    const newsUrl     = newsItem ? htGet(newsItem, 'news_item_url')     : '';
    const newsPic     = newsItem ? htGet(newsItem, 'news_item_picture') : '';

    return makePost(
      `gt_${geo}_${i}`, sourceId,
      title,
      newsUrl || `https://www.google.com/search?q=${encodeURIComponent(title)}`,
      0, 0, new Date(),
      {
        thumbnail: picture || newsPic,
        desc:      newsSnippet || newsTitle,
        sub:       traffic ? `🔍 ${traffic} 검색` : `🔍 트렌딩`,
      }
    );
  });
}

async function fetchRedditSpace() {
  const r = await fetch(SELF_PROXY + encodeURIComponent('https://www.reddit.com/r/space/hot.json?limit=15&raw_json=1'), { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'sp_' + c.data.id, 'reddit_space',
    c.data.title,
    c.data.url || 'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    { thumbnail: validThumb(c.data.thumbnail) ? c.data.thumbnail : '', desc: (c.data.selftext || '').replace(/\n+/g, ' ').trim().slice(0, 160) }
  ));
}

async function fetchRedditNature() {
  const r = await fetch(SELF_PROXY + encodeURIComponent('https://www.reddit.com/r/NatureIsFuckinLit/hot.json?limit=15&raw_json=1'), { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'nat_' + c.data.id, 'reddit_nature',
    c.data.title,
    'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    { thumbnail: validThumb(c.data.thumbnail) ? c.data.thumbnail : '' }
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
    .slice(0, 8)
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
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}

function redditImagePost(prefix, sourceId, c) {
  const p = c.data;
  const thumb = p.preview?.images?.[0]?.resolutions?.[2]?.url?.replace(/&amp;/g, '&')
             || p.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&')
             || (validThumb(p.thumbnail) ? p.thumbnail : '');
  return makePost(
    `${prefix}_${p.id}`, sourceId, p.title,
    'https://reddit.com' + p.permalink,
    p.score, p.num_comments, new Date(p.created_utc * 1000),
    { thumbnail: thumb }
  );
}

async function fetchRedditPhoto(sub, prefix, sourceId) {
  const url = `https://www.reddit.com/r/${sub}/hot.json?limit=25&raw_json=1`;
  const r = await fetch(SELF_PROXY + encodeURIComponent(url), { cache: 'no-store' });
  const d = await r.json();
  return d.data.children
    .filter(c => validThumb(c.data.thumbnail) || c.data.preview?.images?.[0])
    .map(c => {
      const p = c.data;
      const thumb = p.preview?.images?.[0]?.resolutions?.[2]?.url?.replace(/&amp;/g, '&')
                 || p.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&')
                 || (validThumb(p.thumbnail) ? p.thumbnail : '');
      // 외부 링크면 원본 사이트, Reddit 내부 이미지면 게시글로
      const isRedditHosted = !p.url || /reddit\.com|i\.redd\.it|v\.redd\.it/i.test(p.url);
      const link = isRedditHosted ? ('https://www.reddit.com' + p.permalink) : p.url;
      return makePost(`${prefix}_${p.id}`, sourceId, p.title, link,
        p.score, p.num_comments, new Date(p.created_utc * 1000), { thumbnail: thumb });
    });
}

function fetchEarthPorn()         { return fetchRedditPhoto('EarthPorn',        'ep',  'photo_earthporn');      }
function fetchITookAPicture()     { return fetchRedditPhoto('itookapicture',     'it',  'photo_itap');           }
function fetchUrbanPhotography()  { return fetchRedditPhoto('UrbanPhotography',  'up',  'photo_urban');          }
function fetchMacroPorn()         { return fetchRedditPhoto('MacroPorn',         'mp',  'photo_macro');          }
function fetchAnalog()            { return fetchRedditPhoto('analog',            'an',  'photo_analog');         }
function fetchPhotojournalism()   { return fetchRedditPhoto('photojournalism',   'pj',  'photo_photojournalism');}
function fetchSpacePorn()         { return fetchRedditPhoto('spaceporn',         'sp',  'photo_spaceporn');      }

async function fetchFlickrPhoto() {
  const url = 'https://api.flickr.com/services/feeds/photos_public.gne?tags=landscape,nature,street,photography&format=rss_200&lang=en-us';
  const r = await fetch(SELF_PROXY + encodeURIComponent(url), { cache: 'no-store' });
  const xml = await r.text();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Flickr RSS parse error');
  return [...doc.querySelectorAll('item')].slice(0, 20).map((item, i) => {
    const title = cleanText(item.querySelector('title')?.textContent || '');
    const linkEl = item.querySelector('link');
    const link  = linkEl?.getAttribute('href')
               || linkEl?.textContent?.trim()
               || item.querySelector('guid')?.textContent?.trim() || '';
    const NS = 'http://search.yahoo.com/mrss/';
    const thumb = item.getElementsByTagNameNS(NS, 'thumbnail')[0]?.getAttribute('url')
               || item.getElementsByTagNameNS(NS, 'content')[0]?.getAttribute('url') || '';
    const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
    return makePost(`fl_${i}`, 'photo_flickr', title, link, 0, 0, new Date(pubDate), { thumbnail: thumb });
  });
}

async function fetchDeviantArtPhoto() {
  const url = 'https://backend.deviantart.com/rss.xml?type=deviation&q=tag%3Aphotography+landscape';
  const r = await fetch(SELF_PROXY + encodeURIComponent(url), { cache: 'no-store' });
  const xml = await r.text();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('DeviantArt RSS parse error');
  return [...doc.querySelectorAll('item')].slice(0, 20).map((item, i) => {
    const title = cleanText(item.querySelector('title')?.textContent || '');
    const link  = item.querySelector('link')?.textContent?.trim()
               || item.querySelector('guid')?.textContent?.trim() || '';
    const NS = 'http://search.yahoo.com/mrss/';
    const thumb = item.getElementsByTagNameNS(NS, 'thumbnail')[0]?.getAttribute('url')
               || item.getElementsByTagNameNS(NS, 'content')[0]?.getAttribute('url') || '';
    const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
    return makePost(`da_${i}`, 'photo_deviantart', title, link, 0, 0, new Date(pubDate), { thumbnail: thumb });
  });
}

async function fetchBBCWorld() {
  const items = await parseRSS('https://feeds.bbci.co.uk/news/world/rss.xml', 20);
  return items.map((item, i) => makePost(
    'bbc_' + i, 'bbc_world', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}

async function fetchBBCChinese() {
  const items = await parseRSS('https://feeds.bbci.co.uk/zhongwen/simp/rss.xml', 20);
  return items.map((item, i) => makePost(
    'bbcz_' + i, 'bbc_chinese', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}

// ── 🇰🇷 한국어 소스 ──────────────────────────────────────
async function fetchYonhap() {
  const items = await parseRSS('https://www.yna.co.kr/RSS/news.xml', 20);
  return items.map((item, i) => makePost(
    'yn_' + i, 'yonhap', item.title, item.link, 0, 0, new Date(item.pubDate),
    { desc: item.desc }
  ));
}
async function fetchJTBC() {
  const items = await parseRSS('https://fs.jtbc.co.kr/RSS/newsflash.xml', 20);
  return items.map((item, i) => makePost(
    'jtbc_' + i, 'jtbc', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}
async function fetchHani() {
  const items = await parseRSS('https://www.hani.co.kr/rss/', 20);
  return items.map((item, i) => makePost(
    'hani_' + i, 'hani', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}

// ── 🇯🇵 일본어 소스 ──────────────────────────────────────
async function fetchQiita() {
  const items = await parseRSS('https://qiita.com/popular-items/feed', 20);
  return items.map((item, i) => makePost(
    'qt_' + i, 'qiita', item.title, item.link,
    parseInt(item.desc?.match(/LGTM\s*(\d+)/)?.[1] || '0'),
    0, new Date(item.pubDate), { desc: item.desc }
  ));
}
async function fetchZenn() {
  const items = await parseRSS('https://zenn.dev/feed', 20);
  return items.map((item, i) => makePost(
    'zn_' + i, 'zenn', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}
async function fetchITmedia() {
  const items = await parseRSS('https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml', 20);
  return items.map((item, i) => makePost(
    'itm_' + i, 'itmedia', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}

// ── 🇨🇳 중국어 소스 ──────────────────────────────────────
async function fetchSolidot() {
  const items = await parseRSS('https://www.solidot.org/index.rss', 20);
  return items.map((item, i) => makePost(
    'sd_' + i, 'solidot', item.title, item.link, 0, 0, new Date(item.pubDate),
    { desc: item.desc }
  ));
}
async function fetchSspai() {
  const items = await parseRSS('https://sspai.com/feed', 20);
  return items.map((item, i) => makePost(
    'sp_' + i, 'sspai', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}
async function fetchV2EX() {
  const items = await parseRSS('https://www.v2ex.com/?tab=all', 20);
  return items.map((item, i) => makePost(
    'v2_' + i, 'v2ex', item.title, item.link, 0, 0, new Date(item.pubDate),
    { desc: item.desc }
  ));
}

// ── 신규: 한국 엔터 ───────────────────────────────────────
async function fetchStarnews() {
  const items = await parseRSS('https://star.mt.co.kr/rss/rss.xml', 20);
  return items.map((item, i) => makePost(
    'sn_' + i, 'starnews', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}
async function fetchISPlus() {
  const items = await parseRSS('https://isplus.com/rss/rss.html', 20);
  return items.map((item, i) => makePost(
    'isp_' + i, 'isplus', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}

// ── 신규: 미국 엔터 ───────────────────────────────────────
async function fetchDeadline() {
  const items = await parseRSS('https://deadline.com/feed/', 20);
  return items.map((item, i) => makePost(
    'dl_' + i, 'deadline', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}
async function fetchRollingStone() {
  const items = await parseRSS('https://www.rollingstone.com/feed/', 20);
  return items.map((item, i) => makePost(
    'rs_' + i, 'rolling_stone', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}
async function fetchRedditComedy() {
  const r = await fetch(SELF_PROXY + encodeURIComponent('https://www.reddit.com/r/comedy/hot.json?limit=25&raw_json=1'), { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'rc_' + c.data.id, 'reddit_comedy', c.data.title,
    'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    { thumbnail: validThumb(c.data.thumbnail) ? c.data.thumbnail : '' }
  ));
}
async function fetchRedditKpopFan() {
  const r = await fetch(SELF_PROXY + encodeURIComponent('https://www.reddit.com/r/kpop/hot.json?limit=25&raw_json=1'), { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'rkp_' + c.data.id, 'reddit_kpop_r', c.data.title,
    'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    { thumbnail: validThumb(c.data.thumbnail) ? c.data.thumbnail : '' }
  ));
}

// ── 신규: 일본 문화 ───────────────────────────────────────
async function fetchSoraNews() {
  const items = await parseRSS('https://soranews24.com/feed/', 20);
  return items.map((item, i) => makePost(
    'srn_' + i, 'soranews', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}
async function fetchTokyoWeekender() {
  const items = await parseRSS('https://www.tokyoweekender.com/feed/', 20);
  return items.map((item, i) => makePost(
    'tw_' + i, 'tokyo_weekender', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}
async function fetchRedditJpop() {
  const r = await fetch(SELF_PROXY + encodeURIComponent('https://www.reddit.com/r/jpop/hot.json?limit=25&raw_json=1'), { cache: 'no-store' });
  const d = await r.json();
  return d.data.children.map(c => makePost(
    'rjp_' + c.data.id, 'reddit_jpop', c.data.title,
    'https://reddit.com' + c.data.permalink,
    c.data.score, c.data.num_comments, new Date(c.data.created_utc * 1000),
    { thumbnail: validThumb(c.data.thumbnail) ? c.data.thumbnail : '' }
  ));
}

// ── 신규: 중국 엔터 ───────────────────────────────────────
// ── 한국어 신규 ───────────────────────────────────────────
async function fetchNewsen() {
  const items = await parseRSS('https://www.newsen.com/rss.php', 20);
  return items.map((item, i) => makePost('ns_'+i,'newsen',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}
async function fetchMKEnter() {
  const items = await parseRSS('https://www.mk.co.kr/rss/30200030/', 20);
  return items.map((item, i) => makePost('mk_'+i,'mk_enter',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}

// ── 영어 엔터 신규 ────────────────────────────────────────
async function fetchBillboard() {
  const items = await parseRSS('https://www.billboard.com/feed/', 20);
  return items.map((item, i) => makePost('bb_'+i,'billboard',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}
async function fetchVariety() {
  const items = await parseRSS('https://variety.com/feed/', 20);
  return items.map((item, i) => makePost('vt_'+i,'variety',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}
async function fetchPitchfork() {
  const items = await parseRSS('https://pitchfork.com/feed/feed-news/rss', 20);
  return items.map((item, i) => makePost('pf_'+i,'pitchfork',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}
async function fetchHypebeast() {
  const items = await parseRSS('https://hypebeast.com/feed', 20);
  return items.map((item, i) => makePost('hb_'+i,'hypebeast',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}
async function fetchKpopMap() {
  const items = await parseRSS('https://www.kpopmap.com/feed/', 20);
  return items.map((item, i) => makePost('km_'+i,'kpopmap',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}
async function fetchJpopAsia() {
  const items = await parseRSS('https://www.jpopasia.com/feed/news/', 20);
  return items.map((item, i) => makePost('ja_'+i,'jpopasia',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}

// ── 일본어 신규 ───────────────────────────────────────────
async function fetchNatalieMusic() {
  const items = await parseRSS('https://natalie.mu/music/feed/news', 20);
  return items.map((item, i) => makePost('nm_'+i,'natalie_music',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}
async function fetchModelpress() {
  const items = await parseRSS('https://mdpr.jp/rss', 20);
  return items.map((item, i) => makePost('mp_'+i,'modelpress',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}

// ── 중국어 신규 ───────────────────────────────────────────
async function fetchHuxiu() {
  const items = await parseRSS('https://www.huxiu.com/rss/0.xml', 20);
  return items.map((item, i) => makePost('hx_'+i,'huxiu',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}
async function fetchIFanr() {
  const items = await parseRSS('https://www.ifanr.com/feed', 20);
  return items.map((item, i) => makePost('ifr_'+i,'ifanr',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}
async function fetchKr36() {
  const items = await parseRSS('https://36kr.com/feed', 20);
  return items.map((item, i) => makePost('k36_'+i,'kr36',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}
async function fetchLTN() {
  const items = await parseRSS('https://news.ltn.com.tw/rss/all.xml', 20);
  return items.map((item, i) => makePost('ltn_'+i,'ltn',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}
async function fetchMingPao() {
  const items = await parseRSS('https://news.mingpao.com/rss/pns/s00001.xml', 20);
  return items.map((item, i) => makePost('mgp_'+i,'mingpao',item.title,item.link,0,0,new Date(item.pubDate),{thumbnail:item.thumbnail,desc:item.desc}));
}

async function fetchGlobalTimes() {
  const items = await parseRSS('https://www.globaltimes.cn/rss/outbrain.xml', 20);
  return items.map((item, i) => makePost(
    'gt_' + i, 'global_times', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}
async function fetchChinaDaily() {
  const items = await parseRSS('https://www.chinadaily.com.cn/rss/culture_rss.xml', 20);
  return items.map((item, i) => makePost(
    'cd_' + i, 'china_daily', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
  ));
}

async function fetchHatena() {
  const items = await parseRSS('https://b.hatena.ne.jp/hotentry/all.rss', 20);
  return items.map((item, i) => makePost(
    'ht_' + i, 'hatena', item.title, item.link, 0, 0, new Date(item.pubDate),
    { thumbnail: item.thumbnail, desc: item.desc }
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
    {
      thumbnail: a.cover_image || a.social_image || '',
      desc: a.description || '',
    }
  ));
}

async function fetchTechCrunch() {
  const feed = 'https://techcrunch.com/feed/';
  const items = await parseRSS(feed, 12);
  return items.map((item, i) => makePost(
    'tc_' + i, 'techcrunch', item.title, item.link,
    0, 0, new Date(item.pubDate),
    { desc: (item.description || '').replace(/<[^>]+>/g, '').trim().slice(0, 160) }
  ));
}

async function fetchTheVerge() {
  const feed = 'https://www.theverge.com/rss/index.xml';
  const items = await parseRSS(feed, 12);
  return items.map((item, i) => makePost(
    'tv_' + i, 'the_verge', item.title, item.link,
    0, 0, new Date(item.pubDate),
    { desc: (item.description || '').replace(/<[^>]+>/g, '').trim().slice(0, 160) }
  ));
}

// ── 전체 로딩 ────────────────────────────────────────────
async function loadAllSources() {
  renderSkeletons(document.getElementById('feed'), 8);
  setRefreshSpinning(true);
  state.posts = [];
  state.page  = 0;
  state.isLoading = true;

  const results = await Promise.allSettled(SOURCES.map(s => s.fetch()));

  results.forEach((res, i) => {
    const src = SOURCES[i];
    if (res.status === 'fulfilled' && res.value.length > 0) {
      state.posts.push(...res.value);
    } else {
      if (res.status === 'rejected') console.warn(`[${src.id}]`, res.reason?.message);
    }
  });

  state.isLoading = false;
  setRefreshSpinning(false);
  renderFeed();
  buildWordCloud();
  const _t = I18N[state.lang] || I18N.all;
  const _locale = { ko:'ko-KR', en:'en-US', ja:'ja-JP', zh:'zh-CN' }[state.lang] || 'ko-KR';
  document.getElementById('updateTime').textContent =
    `${_t.ui.updated} ${new Date().toLocaleTimeString(_locale)}`;
}

// ── 섹션 정의 (전체 대시보드용) ──────────────────────────
const SECTION_DEFS = [
  { tab: 'hot',    label: '🔥 지금 전세계 화제',  color: '#FF4500', limit: 10, featured: true },
  { tab: 'tech',   label: '💻 테크 · 개발자 픽',  color: '#FF6600', limit: 5  },
  { tab: 'world',  label: '🌍 세계 이슈',          color: '#1565C0', limit: 5  },
  { tab: 'trends', label: '🔍 검색 트렌드',        color: '#4285F4', limit: 5  },
  { tab: 'video',  label: '🎬 핫 영상',            color: '#FF0000', limit: 4  },
  { tab: 'photo',  label: '📸 포토',               color: '#2E7D32', limit: 6  },
];

// ── 탭별 게시물 가져오기 ─────────────────────────────────
function getPostsForTab(tabId) {
  const validIds = new Set(SOURCES.filter(s => s.tabs.includes(tabId)).map(s => s.id));
  const sorted = state.posts
    .filter(p => {
      if (!validIds.has(p.sourceId)) return false;
      if (state.lang !== 'all') {
        const src = SOURCE_MAP[p.sourceId];
        if (src && src.lang !== state.lang) return false;
      }
      if (state.query) return p.title.toLowerCase().includes(state.query.toLowerCase());
      return true;
    })
    .sort((a, b) => {
      if (state.sort === 'points')   return b.points   - a.points;
      if (state.sort === 'comments') return b.comments - a.comments;
      if (state.sort === 'time')     return b.time     - a.time;
      return trendingScore(b) - trendingScore(a);
    });

  // 영상 탭: videoId 기준 중복 제거 (같은 영상이 KR/US/JP 모두에 뜨는 경우)
  if (tabId === 'video') {
    const seen = new Set();
    return sorted.filter(p => {
      const key = p.videoId || p.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // 포토 탭: 소스당 최대 15개 (이미지 그리드 특성상 더 많이)
  if (tabId === 'photo') {
    return sorted.reduce((acc, p) => {
      const cnt = acc.count.get(p.sourceId) || 0;
      if (cnt < 15) {
        acc.posts.push(p);
        acc.count.set(p.sourceId, cnt + 1);
      }
      return acc;
    }, { posts: [], count: new Map() }).posts;
  }

  // 나머지 탭: 소스당 최대 5개로 다양성 확보
  return sorted.reduce((acc, p) => {
    const cnt = acc.count.get(p.sourceId) || 0;
    if (cnt < 5) {
      acc.posts.push(p);
      acc.count.set(p.sourceId, cnt + 1);
    }
    return acc;
  }, { posts: [], count: new Map() }).posts;
}

// ── 메인 렌더 ────────────────────────────────────────────
function renderFeed() {
  const feed         = document.getElementById('feed');
  const loadMoreWrap = document.getElementById('loadMoreWrap');
  loadMoreWrap.classList.add('hidden');
  feed.innerHTML = '';

  if (state.tab === 'all') {
    // 전체: B+C 혼합 대시보드
    const dashboard = document.createElement('div');
    dashboard.className = 'dashboard';
    let anyContent = false;
    SECTION_DEFS.forEach(def => {
      const posts = getPostsForTab(def.tab).slice(0, def.limit || 5);
      if (posts.length === 0) return;
      anyContent = true;
      const block = createSectionBlock(def, posts);
      if (def.featured) block.classList.add('section-block--featured');
      dashboard.appendChild(block);
    });
    if (!anyContent) {
      feed.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>표시할 게시글이 없습니다.</p></div>`;
    } else {
      feed.appendChild(dashboard);
    }
  } else if (state.tab === 'video') {
    const posts = getPostsForTab('video');
    const slice = posts.slice(0, (state.page + 1) * state.PAGE_SIZE);
    if (slice.length === 0) {
      const msg = state.isLoading ? '영상을 불러오는 중입니다...' : '잠시 후 다시 시도해 주세요.';
      feed.innerHTML = `<div class="empty-state"><div class="empty-icon">🎬</div><p>${msg}</p></div>`;
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'video-grid';
    slice.forEach(p => grid.appendChild(createVideoCard(p)));
    feed.appendChild(grid);
    loadMoreWrap.classList.toggle('hidden', slice.length >= posts.length);
  } else if (state.tab === 'photo') {
    // 포토: 이미지 그리드
    const posts = getPostsForTab(state.tab);
    const slice = posts.slice(0, (state.page + 1) * state.PAGE_SIZE);
    if (slice.length === 0) {
      feed.innerHTML = `<div class="empty-state"><div class="empty-icon">📸</div><p>이미지를 불러오는 중입니다.</p></div>`;
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'gravure-grid';
    slice.forEach(p => grid.appendChild(createGravureCard(p)));
    feed.appendChild(grid);
    loadMoreWrap.classList.toggle('hidden', slice.length >= posts.length);
  } else {
    // 단일 탭: 컴팩트 리스트
    const posts = getPostsForTab(state.tab);
    const slice = posts.slice(0, (state.page + 1) * state.PAGE_SIZE);
    if (slice.length === 0) {
      feed.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>표시할 게시글이 없습니다.</p></div>`;
      return;
    }
    const list = document.createElement('div');
    list.className = 'compact-list';
    slice.forEach((p, i) => list.appendChild(createCompactCard(p, i + 1)));
    feed.appendChild(list);
    loadMoreWrap.classList.toggle('hidden', slice.length >= posts.length);
  }
}

// ── 섹션 블록 (전체 대시보드용) ──────────────────────────
function createSectionBlock(def, posts) {
  const block = document.createElement('div');
  block.className = 'section-block';

  const header = document.createElement('div');
  header.className = 'section-header';
  header.style.borderLeftColor = def.color;

  const title = document.createElement('span');
  title.className = 'section-header-title section-title';
  title.dataset.tab = def.tab;
  title.textContent = def.label;

  const more = document.createElement('button');
  more.className = 'section-more';
  const t = I18N[state.lang] || I18N.all;
  more.textContent = t.ui.more;
  more.addEventListener('click', () => {
    // 해당 탭으로 이동
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.tab[data-tab="${def.tab}"]`);
    if (btn) btn.classList.add('active');
    state.tab = def.tab;
    state.page = 0;
    renderFeed();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  header.append(title, more);
  block.appendChild(header);

  if (def.tab === 'video') {
    const grid = document.createElement('div');
    grid.className = 'video-grid video-grid--mini';
    posts.forEach(p => grid.appendChild(createVideoCard(p)));
    block.appendChild(grid);
  } else if (def.tab === 'photo') {
    const grid = document.createElement('div');
    grid.className = 'gravure-grid gravure-grid--mini';
    posts.forEach(p => grid.appendChild(createGravureCard(p)));
    block.appendChild(grid);
  } else {
    const list = document.createElement('div');
    // featured(화제 TOP10): 2열 그리드로 표시
    list.className = def.featured ? 'compact-list compact-list--2col' : 'compact-list';
    posts.forEach((p, i) => list.appendChild(createCompactCard(p, i + 1)));
    block.appendChild(list);
  }

  return block;
}

// ── 컴팩트 카드 (aagag 스타일) ───────────────────────────
function createCompactCard(p, rank) {
  const src  = SOURCE_MAP[p.sourceId];
  const card = document.createElement('article');
  card.className = 'compact-card';
  card.addEventListener('click', () => openDetail(p));

  // 순위
  const rankEl = document.createElement('div');
  rankEl.className = rank <= 3 ? 'compact-rank top3' : 'compact-rank';
  rankEl.textContent = rank;

  // 썸네일
  if (p.thumbnail) {
    const thumb = document.createElement('div');
    thumb.className = 'compact-thumb';
    const img = document.createElement('img');
    img.src = p.thumbnail; img.alt = ''; img.loading = 'lazy';
    img.addEventListener('error', () => { thumb.style.display = 'none'; });
    thumb.appendChild(img);
    card.appendChild(thumb);
  }

  // 본문
  const body = document.createElement('div');
  body.className = 'compact-body';

  const titleEl = document.createElement('div');
  titleEl.className = p.sourceId.startsWith('trends_') ? 'compact-title is-trend-title' : 'compact-title';
  titleEl.textContent = p.title;

  const meta = document.createElement('div');
  meta.className = 'compact-meta';

  const badge = document.createElement('span');
  badge.className = 'compact-badge';
  badge.style.background = src.color;
  badge.textContent = src.emoji + ' ' + src.name;

  meta.appendChild(badge);

  if (p.sub) {
    const sub = document.createElement('span');
    sub.className = 'compact-sub';
    sub.textContent = p.sub;
    meta.appendChild(sub);
  }
  if (p.points > 0) {
    const s = document.createElement('span');
    s.textContent = `👍 ${fmtNum(p.points)}`;
    meta.appendChild(s);
  }
  if (p.comments > 0) {
    const s = document.createElement('span');
    s.textContent = `💬 ${fmtNum(p.comments)}`;
    meta.appendChild(s);
  }
  const timeEl = document.createElement('span');
  timeEl.className = 'compact-time';
  timeEl.textContent = relTime(p.time);
  meta.appendChild(timeEl);

  body.append(titleEl);
  if (p.desc) {
    const descEl = document.createElement('div');
    descEl.className = 'compact-desc';
    descEl.textContent = p.desc;
    body.appendChild(descEl);
  }

  // AI 요약 영역 (Trends 제외)
  if (!p.sourceId.startsWith('trends_')) {
    const aiEl = document.createElement('div');
    aiEl.className = 'compact-ai-summary loading';
    aiEl.textContent = '';
    body.appendChild(aiEl);

    // 화면에 보일 때만 API 호출 (비용 절감)
    summaryObserver.observe(card);
    card.dataset.aiTitle  = p.title;
    card.dataset.aiSource = SOURCE_MAP[p.sourceId]?.name ?? '';
    card.dataset.aiEl     = 'pending'; // 플래그
    card._aiEl = aiEl;
  }

  body.appendChild(meta);

  card.append(rankEl, body);
  return card;
}

// ── AI 요약 IntersectionObserver ─────────────────────────
const summaryCache = new Map(); // 세션 내 중복 요청 방지
const summaryObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const card = entry.target;
    if (!card._aiEl || card.dataset.aiEl !== 'pending') return;
    card.dataset.aiEl = 'fetching';
    summaryObserver.unobserve(card);

    const title  = card.dataset.aiTitle;
    const source = card.dataset.aiSource;
    const key    = title.slice(0, 80);

    if (summaryCache.has(key)) {
      renderSummary(card._aiEl, summaryCache.get(key));
      return;
    }

    fetch('/api/summarize', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, source }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const text = data?.summary ?? '';
        summaryCache.set(key, text);
        renderSummary(card._aiEl, text);
      })
      .catch(() => { card._aiEl.remove(); });
  });
}, { rootMargin: '200px' });

function renderSummary(el, text) {
  if (!text) { el.remove(); return; }
  el.classList.remove('loading');
  el.textContent = '🤖 ' + text;
}

// ── 유튜브 비디오 카드 ───────────────────────────────────
function createVideoCard(p) {
  const src = SOURCE_MAP[p.sourceId];
  const card = document.createElement('div');
  card.className = 'video-card';
  card.addEventListener('click', () => {
    if (p.url) window.open(p.url, '_blank', 'noopener,noreferrer');
  });

  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'video-thumb';

  if (p.thumbnail) {
    const img = document.createElement('img');
    img.src = p.thumbnail; img.alt = ''; img.loading = 'lazy';
    thumbWrap.appendChild(img);
  } else {
    thumbWrap.style.background = '#111';
  }

  const playBtn = document.createElement('div');
  playBtn.className = 'video-play';
  playBtn.innerHTML = '▶';
  thumbWrap.appendChild(playBtn);

  const info = document.createElement('div');
  info.className = 'video-info';

  const title = document.createElement('div');
  title.className = 'video-title';
  title.textContent = p.title;

  const meta = document.createElement('div');
  meta.className = 'video-meta';

  const badge = document.createElement('span');
  badge.className = 'compact-badge';
  badge.style.background = src.color;
  badge.textContent = src.sub;

  const channel = document.createElement('span');
  channel.textContent = p.sub || '';

  const stats = document.createElement('span');
  if (p.points > 0) stats.textContent = `👍 ${fmtNum(p.points)}`;

  meta.append(badge, channel, stats);
  info.append(title, meta);
  card.append(thumbWrap, info);
  return card;
}

// ── 그라비아 이미지 카드 ──────────────────────────────────
function createGravureCard(p) {
  const src  = SOURCE_MAP[p.sourceId];
  const card = document.createElement('div');

  if (!p.thumbnail) {
    // 썸네일 없으면 컴팩트 카드로 폴백
    card.className = 'gravure-no-thumb';
    card.appendChild(createCompactCard(p, 0));
    return card;
  }

  card.className = 'gravure-card';
  card.addEventListener('click', () => {
    if (p.url) window.open(p.url, '_blank', 'noopener,noreferrer');
  });

  const img = document.createElement('img');
  img.src = p.thumbnail; img.alt = p.title; img.loading = 'lazy';
  img.addEventListener('error', () => {
    card.classList.add('gravure-no-thumb');
    card.innerHTML = '';
    card.appendChild(createCompactCard(p, 0));
  });

  const info = document.createElement('div');
  info.className = 'gravure-card-info';

  const title = document.createElement('div');
  title.className = 'gravure-card-title';
  title.textContent = p.title;

  const meta = document.createElement('div');
  meta.className = 'gravure-card-meta';

  const badge = document.createElement('span');
  badge.className = 'gravure-card-badge';
  badge.style.background = src.color;
  badge.textContent = src.emoji;

  const score = document.createElement('span');
  score.textContent = p.points > 0 ? `👍 ${fmtNum(p.points)}` : relTime(p.time);

  meta.append(badge, score);
  info.append(title, meta);
  card.append(img, info);
  return card;
}

function makeStat(text) {
  const s = document.createElement('span');
  s.className = 'stat';
  s.textContent = text;
  return s;
}

// ── 워드클라우드 ──────────────────────────────────────────
const WC_STOP = new Set([
  'the','a','an','of','in','to','and','for','is','on','at','by','with',
  'from','as','that','this','it','be','are','was','were','or','but','not',
  'have','has','will','can','its','i','my','we','our','how','what','why',
  'show','hn','ask','tell','make','made','new','use','get','just','like',
  'more','some','into','than','about','after','been','also','one','two',
  'using','your','their','they','all','who','when','which','if','would',
  'could','should','do','did','does','had','so','up','out','about','help',
]);

const WC_COLORS = [
  '#7c6fff','#ff6b6b','#4ecdc4','#f7dc6f','#82e0aa',
  '#f0b27a','#85c1e9','#c39bd3','#f1948a','#76d7c4',
  '#a9cce3','#fad7a0','#a9dfbf','#f9e79f','#d7bde2',
];

function buildWordCloud() {
  const canvas = document.getElementById('wordCloud');
  const tooltip = document.getElementById('wcTooltip');
  if (!canvas || !window.WordCloud) return;

  const freq = {};
  state.posts.forEach(p => {
    const src = SOURCE_MAP[p.sourceId];
    const weight = 1 + (p.points || 0) / 200;
    const words = p.title
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !WC_STOP.has(w) && !/^\d+$/.test(w));
    words.forEach(w => {
      freq[w] = (freq[w] || 0) + weight;
    });
  });

  const list = Object.entries(freq)
    .filter(([, c]) => c >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([w, c]) => [w, Math.min(Math.max(c * 5, 10), 55)]);

  if (list.length === 0) return;

  // 캔버스 크기를 컨테이너에 맞게 설정
  const wrap = canvas.parentElement;
  const rawW = wrap ? (wrap.clientWidth || wrap.offsetWidth) : 0;
  const size = rawW > 50 ? Math.min(rawW, 280) : 260;
  canvas.width  = size;
  canvas.height = size;

  const colorIdx = {};
  let ci = 0;

  WordCloud(canvas, {
    list,
    gridSize: 6,
    weightFactor: 1,
    fontFamily: 'Noto Sans KR, sans-serif',
    fontWeight: '700',
    color: (word) => {
      if (!colorIdx[word]) colorIdx[word] = WC_COLORS[ci++ % WC_COLORS.length];
      return colorIdx[word];
    },
    backgroundColor: 'transparent',
    rotateRatio: 0.4,
    rotationSteps: 2,
    minSize: 10,
    drawOutOfBound: false,
    shrinkToFit: true,

    // 클릭: 검색창에 키워드 입력 후 검색 실행
    click: (item) => {
      const word = item[0];
      const input = document.getElementById('searchInput');
      input.value = word;
      state.query = word;
      state.page = 0;
      state.tab = 'all';
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      const allTab = document.querySelector('.tab[data-tab="all"]');
      if (allTab) allTab.classList.add('active');
      renderFeed();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // 호버: 툴팁 표시 + 커서 변경
    hover: (item, dimension) => {
      if (item && dimension) {
        tooltip.textContent = `🔍 ${item[0]}`;
        tooltip.style.left = (dimension.x + 8) + 'px';
        tooltip.style.top  = (dimension.y + 8) + 'px';
        tooltip.classList.add('visible');
        canvas.style.cursor = 'pointer';
      } else {
        tooltip.classList.remove('visible');
        canvas.style.cursor = 'default';
      }
    },
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.classList.remove('visible');
    canvas.style.cursor = 'default';
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
  if (!date || isNaN(date.getTime())) return '';
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
  document.getElementById('langSelect').addEventListener('change', e => {
    state.lang = e.target.value; state.page = 0;
    applyI18n(state.lang);
    renderFeed();
  });
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

// ── Detail Panel ─────────────────────────────────────────
function openDetail(post) {
  const src = SOURCE_MAP[post.sourceId] || {};

  // 기본 정보 채우기
  document.getElementById('detailTitle').textContent = post.title;

  const badge = document.getElementById('detailBadge');
  badge.textContent = (src.emoji || '') + ' ' + (src.name || post.sourceId);
  badge.style.background = src.color || '#555';

  document.getElementById('detailLink').href = post.url || '#';

  const meta = document.getElementById('detailMeta');
  meta.innerHTML = '';
  const addMeta = (text) => {
    const s = document.createElement('span');
    s.textContent = text;
    meta.appendChild(s);
  };
  const t = relTime(post.time);
  if (t) addMeta('🕐 ' + t);
  if (post.points > 0) addMeta('👍 ' + fmtNum(post.points));
  if (post.comments > 0) addMeta('💬 ' + fmtNum(post.comments));
  if (post.sub) addMeta('📌 ' + post.sub);

  // AI 요약
  const summaryEl = document.getElementById('detailSummary');
  summaryEl.className = 'detail-summary-box loading';
  summaryEl.textContent = 'AI 분석 중...';

  const key = post.title.slice(0, 80);
  if (summaryCache.has(key)) {
    applyDetailSummary(summaryEl, summaryCache.get(key));
  } else {
    fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: post.title, source: src.name || '' }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const text = data?.summary ?? '';
        summaryCache.set(key, text);
        applyDetailSummary(summaryEl, text);
      })
      .catch(() => { summaryEl.style.display = 'none'; });
  }

  // Giscus 댓글 로드
  loadGiscusComments(post.title);

  // 패널 열기
  const panel = document.getElementById('detailPanel');
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  // 패널 상단으로 스크롤
  document.querySelector('.detail-sheet').scrollTop = 0;
}

function loadGiscusComments(term) {
  const container = document.getElementById('detailComments');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // 기존 위젯 초기화
  container.innerHTML = '<h3 class="detail-comments-title">💬 댓글</h3>';

  const script = document.createElement('script');
  script.src = 'https://giscus.app/client.js';
  script.setAttribute('data-repo',            'kinnet-zz/globalhot');
  script.setAttribute('data-repo-id',         'R_kgDORs40ww');
  script.setAttribute('data-category',        'General');
  script.setAttribute('data-category-id',     'DIC_kwDORs40w84C47dH');
  script.setAttribute('data-mapping',         'specific');
  script.setAttribute('data-term',            term.slice(0, 200));
  script.setAttribute('data-strict',          '0');
  script.setAttribute('data-reactions-enabled','1');
  script.setAttribute('data-emit-metadata',   '0');
  script.setAttribute('data-input-position',  'top');
  script.setAttribute('data-theme',           isDark ? 'dark_dimmed' : 'light');
  script.setAttribute('data-lang',            'ko');
  script.setAttribute('crossorigin',          'anonymous');
  script.async = true;
  container.appendChild(script);
}

function applyDetailSummary(el, text) {
  el.classList.remove('loading');
  if (!text) { el.style.display = 'none'; return; }
  el.textContent = '🤖 ' + text;
}

function closeDetail() {
  const panel = document.getElementById('detailPanel');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// 패널 닫기 이벤트
document.getElementById('detailBack').addEventListener('click', closeDetail);
document.getElementById('detailBackdrop').addEventListener('click', closeDetail);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

setInterval(loadAllSources, 5 * 60 * 1000);
initEvents();
loadAllSources();
