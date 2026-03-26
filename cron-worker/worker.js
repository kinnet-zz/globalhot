// globalhot-cron: 6시간마다 전체 소스 기사 요약 사전 생성 → KV 저장
// 사용자 방문 시 AI 호출 0건, KV에서 즉시 반환

// ── 사전 생성 대상 소스 (전체 소스 커버) ─────────────────
const SOURCES = [
  // 📊 주식·증시
  { id: 'reddit_investing', name: 'r/investing',       type: 'reddit', sub: 'investing',       max: 15, lang: 'ko' },
  { id: 'reddit_stocks',    name: 'r/stocks',          type: 'reddit', sub: 'stocks',          max: 15, lang: 'ko' },
  { id: 'reddit_wsb',       name: 'r/wallstreetbets',  type: 'reddit', sub: 'wallstreetbets',  max: 10, lang: 'ko' },
  { id: 'yahoo_finance',    name: 'Yahoo Finance',     type: 'rss',    url: 'https://finance.yahoo.com/rss/topfinstories',                    max: 10, lang: 'ko' },

  // 💹 시장동향
  { id: 'marketwatch',      name: 'MarketWatch',       type: 'rss',    url: 'https://feeds.marketwatch.com/marketwatch/topstories/',          max: 10, lang: 'ko' },
  { id: 'cnbc',             name: 'CNBC',              type: 'rss',    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',          max: 10, lang: 'ko' },
  { id: 'wsj',              name: 'Wall Street Journal', type: 'rss',  url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml',                   max: 10, lang: 'ko' },
  { id: 'reddit_economics', name: 'r/economics',       type: 'reddit', sub: 'economics',       max: 10, lang: 'ko' },

  // 🌍 글로벌경제
  { id: 'bbc_business',     name: 'BBC Business',      type: 'rss',    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',                max: 10, lang: 'ko' },
  { id: 'bbc_world',        name: 'BBC World',         type: 'rss',    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                   max: 10, lang: 'ko' },

  // 🤖 핀테크·AI
  { id: 'hacker_news',      name: 'Hacker News',       type: 'algolia', url: 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20', max: 20, lang: 'ko' },
  { id: 'ask_hn',           name: 'Ask HN',            type: 'algolia', url: 'https://hn.algolia.com/api/v1/search?tags=ask_hn&hitsPerPage=10&numericFilters=points>50', max: 10, lang: 'ko' },
  { id: 'show_hn',          name: 'Show HN',           type: 'algolia', url: 'https://hn.algolia.com/api/v1/search?tags=show_hn&hitsPerPage=10&numericFilters=points>20', max: 10, lang: 'ko' },
  { id: 'github_trending',  name: 'GitHub',            type: 'github',  max: 10, lang: 'ko' },

  // ₿ 가상화폐
  { id: 'reddit_crypto',    name: 'r/CryptoCurrency',  type: 'reddit', sub: 'CryptoCurrency',  max: 10, lang: 'ko' },
  { id: 'reddit_bitcoin',   name: 'r/Bitcoin',         type: 'reddit', sub: 'Bitcoin',         max: 10, lang: 'ko' },
  { id: 'coindesk',         name: 'CoinDesk',          type: 'rss',    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',               max: 10, lang: 'ko' },

  // 🇰🇷 한국경제
  { id: 'hankyung',         name: '한국경제',           type: 'rss',    url: 'https://www.hankyung.com/feed/economy',                        max: 10, lang: 'ko' },
  { id: 'mk',               name: '매일경제',           type: 'rss',    url: 'https://www.mk.co.kr/rss/40300001/',                           max: 10, lang: 'ko' },
  { id: 'jtbc',             name: 'JTBC 뉴스',          type: 'rss',    url: 'https://fs.jtbc.co.kr/RSS/newsflash.xml',                      max: 10, lang: 'ko' },
  { id: 'hani',             name: '한겨레',             type: 'rss',    url: 'https://www.hani.co.kr/rss/',                                  max: 10, lang: 'ko' },
];

// ── HTML 엔티티 디코딩 (DOM 없는 Workers 환경용) ───────────
function decodeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// ── RSS 피드에서 타이틀 수집 ──────────────────────────────
async function fetchTitlesFromRSS(url, max) {
  const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
  const r = await fetch(rss2jsonUrl);
  if (!r.ok) return [];
  const d = await r.json();
  if (d.status !== 'ok') return [];
  return d.items.slice(0, max).map(item => decodeHTML(item.title || ''));
}

// ── Algolia HN API에서 타이틀 수집 ───────────────────────
async function fetchTitlesFromAlgolia(url, max) {
  const r = await fetch(url);
  if (!r.ok) return [];
  const d = await r.json();
  return d.hits.slice(0, max).map(h => decodeHTML(h.title || ''));
}

// ── Reddit JSON API에서 타이틀 수집 ──────────────────────
async function fetchTitlesFromReddit(sub, max) {
  const url = `https://www.reddit.com/r/${sub}.json?limit=${max}&raw_json=1`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GlobalHot/1.0)',
      'Accept': 'application/json',
    },
  });
  if (!r.ok) return [];
  const d = await r.json();
  return (d?.data?.children ?? [])
    .slice(0, max)
    .map(c => decodeHTML(c?.data?.title || ''))
    .filter(Boolean);
}

// ── GitHub Trending에서 타이틀 수집 ──────────────────────
async function fetchTitlesFromGitHub(max) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const url = `https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=${max}`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'GlobalHot/1.0',
      'Accept': 'application/vnd.github.v3+json',
    },
  });
  if (!r.ok) return [];
  const d = await r.json();
  return (d?.items ?? []).slice(0, max).map(item =>
    `${item.full_name}: ${item.description || ''}`.trim()
  ).filter(Boolean);
}

// ── LANG_CONFIG (ko 전용, summarize.js와 동일) ────────────
const LANG_CONFIG = {
  ko: {
    system: '당신은 IT·국제 분야 전문 칼럼니스트입니다. 간결하고 통찰 있는 한국어로 씁니다.',
    prompt: (title, source) => `뉴스: "${title}" (${source})\n\n2문장 칼럼:`,
    fewShot: [
      {
        user: '뉴스: "Google fires 28 employees after protest against Israel contract" (Hacker News)\n\n2문장 칼럼:',
        assistant: '구글이 이스라엘 군 계약에 반대해 사내 시위를 벌인 직원 28명을 해고했다. AI가 군사 기술에 깊숙이 연루될수록 이런 내부 갈등은 더 빈번하게 터져 나올 것이다.',
      },
    ],
  },
};

function kvKey(lang, title, mode) {
  return `${lang}:${mode}:${title.slice(0, 100)}`;
}

// ── 기사 1건 요약 생성 ────────────────────────────────────
async function generateSummary(env, title, sourceName, lang) {
  const cfg = LANG_CONFIG[lang] || LANG_CONFIG.ko;
  const fewShotMessages = cfg.fewShot.flatMap(ex => [
    { role: 'user',      content: ex.user      },
    { role: 'assistant', content: ex.assistant  },
  ]);

  const result = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      { role: 'system', content: cfg.system },
      ...fewShotMessages,
      { role: 'user',   content: cfg.prompt(title, sourceName) },
    ],
    max_tokens: 150,
    temperature: 0.6,
  });

  return result?.response?.trim() ?? '';
}

// ── 크론 메인 로직 ────────────────────────────────────────
async function runCron(env) {
  let generated = 0;
  let skipped = 0;

  for (const src of SOURCES) {
    let titles;
    try {
      if (src.type === 'algolia') {
        titles = await fetchTitlesFromAlgolia(src.url, src.max);
      } else if (src.type === 'reddit') {
        titles = await fetchTitlesFromReddit(src.sub, src.max);
      } else if (src.type === 'github') {
        titles = await fetchTitlesFromGitHub(src.max);
      } else {
        titles = await fetchTitlesFromRSS(src.url, src.max);
      }
    } catch {
      console.error(`[cron] fetch failed: ${src.id}`);
      continue;
    }

    for (const title of titles) {
      if (!title) continue;

      const key = kvKey(src.lang, title, 'short');

      // KV에 이미 존재하면 스킵 (AI 호출 0)
      const existing = await env.SUMMARY_KV.get(key);
      if (existing) {
        skipped++;
        continue;
      }

      try {
        const summary = await generateSummary(env, title, src.name, src.lang);
        if (summary) {
          await env.SUMMARY_KV.put(key, JSON.stringify({ summary }), { expirationTtl: 86400 });
          generated++;
        }
      } catch {
        console.error(`[cron] AI failed: ${title.slice(0, 40)}`);
      }

      // 연속 요청 간격 (Workers AI 레이트리밋 방지)
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`[cron] done — generated: ${generated}, skipped (cached): ${skipped}`);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env));
  },
};
