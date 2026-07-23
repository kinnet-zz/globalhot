/**
 * GlobalHot twice-weekly editorial draft generator.
 *
 * This script prepares a pull request candidate. It never publishes directly.
 * Merging the generated pull request is the human editorial approval step.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const SITE_URL = process.env.SITE_URL || 'https://globalhot.net';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const KST = new Date(Date.now() + 9 * 3_600_000);
const TODAY = KST.toISOString().slice(0, 10);
const DATE_KO = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
}).format(new Date());

const FEEDS = [
  { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/rss/topfinstories', kind: 'market' },
  { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', kind: 'market' },
  { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', kind: 'economy' },
  { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', kind: 'market' },
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', kind: 'digital-assets' },
  { name: '한국경제', url: 'https://www.hankyung.com/feed/economy', kind: 'korea' },
  { name: '매일경제', url: 'https://www.mk.co.kr/rss/50200011/', kind: 'korea' },
];

const RELEVANT = /경제|금융|증시|코스피|코스닥|주가|금리|환율|원화|달러|수출|무역|관세|반도체|기업|실적|물가|고용|채권|투자|은행|가계부채|인공지능|AI|\b(stock|stocks|market|earnings|economy|economic|inflation|gdp|trade|tariff|employment|jobs|central bank|federal reserve|interest rate|recession|currency|dollar|oil|gold|bond|treasury|yield|semiconductor|artificial intelligence|bitcoin|crypto)\b/i;
const LOW_VALUE = /연예|스포츠|축구|야구|날씨|맛집|여행|\b(celebrity|movie|recipe|football|baseball|soccer|weather)\b/i;
const DIRECT_ADVICE = /지금\s*(사|매수)|매수하라|매도하라|분할\s*매수\s*(하|가)|비중을\s*(늘려|줄여|높여|낮춰)|포지션을\s*(늘려|줄여)|수익을\s*보장/i;

function decodeEntities(value = '') {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripMarkup(value = '') {
  return decodeEntities(value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFeed(xml, feed) {
  return [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)]
    .map((match) => {
      const body = match[1];
      const title = stripMarkup(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
      const rawUrl =
        body.match(/<link[^>]*>\s*(?:<!\[CDATA\[)?\s*(https?:\/\/[^\s<\]]+)/i)?.[1] ||
        body.match(/<guid[^>]*>(?:<!\[CDATA\[)?(https?:\/\/[^\s<\]]+)/i)?.[1] ||
        '';
      const published = stripMarkup(body.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || '');
      const description = stripMarkup(
        body.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || '',
      ).slice(0, 500);

      let url = '';
      try {
        const parsed = new URL(rawUrl);
        parsed.hash = '';
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach((key) =>
          parsed.searchParams.delete(key),
        );
        url = parsed.toString();
      } catch {
        return null;
      }

      const date = new Date(published);
      return {
        source: feed.name,
        kind: feed.kind,
        title,
        url,
        description,
        publishedAt: Number.isFinite(date.getTime()) ? date.toISOString() : null,
      };
    })
    .filter(Boolean);
}

async function fetchFeed(feed) {
  try {
    const response = await fetch(feed.url, {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'User-Agent': 'GlobalHot/3.0 editorial-research (+https://globalhot.net/about.html)',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseFeed(await response.text(), feed);
  } catch (error) {
    console.warn(`[source] ${feed.name}: ${error.message}`);
    return [];
  }
}

function candidateScore(article) {
  const ageHours = article.publishedAt
    ? Math.max(0, (Date.now() - new Date(article.publishedAt).getTime()) / 3_600_000)
    : 96;
  const recency = Math.max(0, 96 - ageHours);
  const impactWords = (article.title.match(
    /연준|금리|환율|관세|반도체|실적|물가|고용|AI|인공지능|Fed|rate|tariff|inflation|earnings|semiconductor|Nvidia/gi,
  ) || []).length;
  return recency + impactWords * 12 + (article.description.length > 120 ? 8 : 0);
}

async function collectCandidates() {
  const settled = await Promise.all(FEEDS.map(fetchFeed));
  const cutoff = Date.now() - 96 * 3_600_000;
  const seen = new Set();

  return settled
    .flat()
    .filter((article) => {
      const text = `${article.title} ${article.description}`;
      if (!article.title || !article.url || LOW_VALUE.test(text) || !RELEVANT.test(text)) return false;
      if (article.publishedAt && new Date(article.publishedAt).getTime() < cutoff) return false;
      const key = article.title.toLowerCase().replace(/\W/g, '').slice(0, 70);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => candidateScore(b) - candidateScore(a))
    .slice(0, 24)
    .map((article, index) => ({ ...article, id: `S${index + 1}` }));
}

function parseModelJson(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const object = cleaned.match(/\{[\s\S]*\}/)?.[0];
    return object ? JSON.parse(object) : null;
  }
}

function articleText(article) {
  return [
    article.title,
    article.deck,
    article.thesis,
    ...(article.keyPoints || []),
    ...(article.sections || []).flatMap((section) => [section.heading, ...(section.paragraphs || [])]),
    ...(article.watchItems || []),
    article.limitations,
  ]
    .filter(Boolean)
    .join(' ');
}

function validateArticle(article, sourceById) {
  if (!article || typeof article !== 'object') throw new Error('AI 응답이 객체가 아닙니다.');
  if (String(article.title || '').length < 18) throw new Error('제목이 너무 짧습니다.');
  if (String(article.deck || '').length < 70) throw new Error('요약문이 너무 짧습니다.');
  if (!Array.isArray(article.sections) || article.sections.length < 4) {
    throw new Error('본문 섹션이 4개 미만입니다.');
  }
  if (!Array.isArray(article.sourceIds) || new Set(article.sourceIds).size < 3) {
    throw new Error('서로 다른 출처가 3개 미만입니다.');
  }
  const sourceNames = new Set(article.sourceIds.map((id) => sourceById.get(id)?.source).filter(Boolean));
  if (sourceNames.size < 3) throw new Error('독립 매체 기준으로 출처가 3개 미만입니다.');
  if (!Array.isArray(article.keyPoints) || article.keyPoints.length !== 3) {
    throw new Error('핵심 요약은 정확히 3개여야 합니다.');
  }
  if (!Array.isArray(article.watchItems) || article.watchItems.length < 3) {
    throw new Error('확인할 공개 지표가 3개 미만입니다.');
  }
  if (String(article.limitations || '').length < 60) {
    throw new Error('분석의 한계와 추가 검증 항목이 충분하지 않습니다.');
  }
  for (const id of article.sourceIds) {
    if (!sourceById.has(id)) throw new Error(`알 수 없는 출처 ID: ${id}`);
  }
  for (const section of article.sections) {
    if (!section.heading || !Array.isArray(section.paragraphs) || section.paragraphs.length < 2) {
      throw new Error('각 섹션에는 제목과 2개 이상의 문단이 필요합니다.');
    }
    if (!Array.isArray(section.sourceIds) || section.sourceIds.length === 0) {
      throw new Error(`섹션 출처가 없습니다: ${section.heading}`);
    }
    for (const id of section.sourceIds) {
      if (!sourceById.has(id)) throw new Error(`섹션의 알 수 없는 출처 ID: ${id}`);
    }
  }

  const text = articleText(article);
  const hangul = (text.match(/[가-힣]/g) || []).length;
  if (text.length < 2_600 || hangul < 900) throw new Error('분석 분량이 품질 기준에 미달합니다.');
  if (DIRECT_ADVICE.test(text)) throw new Error('직접적인 투자 권유 표현이 포함됐습니다.');
}

async function generateDraft(candidates) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY가 없어 초안을 생성할 수 없습니다.');

  const sourceText = candidates
    .map(
      (item) =>
        `[${item.id}] ${item.source} | ${item.publishedAt || '날짜 미상'}\n제목: ${item.title}\n요약: ${item.description || 'RSS 요약 없음'}\nURL: ${item.url}`,
    )
    .join('\n\n');

  const prompt = `당신은 GlobalHot의 조사 초안 작성 도구입니다. 최종 편집자는 "거리의악사"이며, 이 결과는 자동 공개되지 않고 사람의 원문 대조와 수치 검증을 거칩니다.

아래 RSS 후보만 근거로 경제·주식·기술 영역에서 한국 독자에게 가장 중요한 하나의 이슈를 선택하세요. 같은 사건을 다루는 복수 출처가 있으면 우선하고, 서로 다른 보도라면 하나의 공통 시장 변수를 중심으로 연결하세요.

${sourceText}

작성 규칙:
- 자연스럽고 절제된 한국어 경제 해설문으로 작성합니다.
- 원문을 번역하거나 문장 구조를 복제하지 않습니다.
- 후보에 없는 숫자, 발언, 직책, 날짜, 인과관계를 만들어내지 않습니다.
- 확인된 사실과 편집적 해석을 문장 안에서 구분합니다.
- "매수", "매도", "비중 확대", "수익 보장" 같은 개인 투자 행동 지시는 금지합니다.
- 한국 시장과의 연결은 환율, 수출, 산업 공급망, 금리 경로 등 확인 가능한 전달 경로로 설명합니다.
- 각 섹션에 근거로 사용한 sourceIds를 붙입니다.
- 출처가 뒷받침하지 않는 배경은 쓰지 말고 limitations에 검증할 항목을 적습니다.
- 과장된 제목, 공포 유도, SEO 키워드 나열을 금지합니다.
- 본문 전체는 공백 포함 2,600자 이상으로 작성합니다.

JSON만 반환하세요:
{
  "slug": "짧은 영문-kebab-slug",
  "category": "경제|주식|기술 중 하나",
  "title": "구체적이고 사실적인 제목",
  "deck": "무슨 일이 있었고 왜 한국 독자가 봐야 하는지 2문장",
  "thesis": "이 분석의 핵심 판단 2~3문장",
  "keyPoints": ["핵심 1", "핵심 2", "핵심 3"],
  "sections": [
    {
      "heading": "섹션 제목",
      "paragraphs": ["문단 1", "문단 2"],
      "sourceIds": ["S1", "S2"]
    }
  ],
  "watchItems": ["앞으로 확인할 공개 지표 1", "공개 지표 2", "공개 지표 3"],
  "limitations": "현재 공개 자료만으로 확정할 수 없는 부분과 편집자가 확인해야 할 사항",
  "sourceIds": ["S1", "S2", "S3"]
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 7_000,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini API ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }
  const payload = await response.json();
  const raw = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const article = parseModelJson(raw);
  const sourceById = new Map(candidates.map((item) => [item.id, item]));
  validateArticle(article, sourceById);
  return { article, sourceById };
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeSlug(value = '') {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'market-context';
}

function renderSourceLinks(ids, sourceById, className = 'source-notes') {
  const unique = [...new Set(ids)].filter((id) => sourceById.has(id));
  return `<div class="${className}" aria-label="이 단락의 근거 자료">${unique
    .map((id) => {
      const source = sourceById.get(id);
      return `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(id)} · ${escapeHtml(source.source)}</a>`;
    })
    .join('')}</div>`;
}

function renderPost(article, sourceById, fileName) {
  const canonical = `${SITE_URL}/posts/${fileName}`;
  const description = article.deck.slice(0, 155);
  const sections = article.sections
    .map(
      (section) => `<section class="article-section">
        <h2>${escapeHtml(section.heading)}</h2>
        ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n        ')}
        ${renderSourceLinks(section.sourceIds, sourceById)}
      </section>`,
    )
    .join('\n');

  const sources = [...new Set(article.sourceIds)]
    .map((id) => sourceById.get(id))
    .filter(Boolean);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="/analytics.js?v=20260718-2"></script>
  <title>${escapeHtml(article.title)} | GlobalHot</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="author" content="거리의악사" />
  <meta name="robots" content="index, follow" />
  <meta name="editorial-review" content="required-before-merge" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:title" content="${escapeHtml(article.title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <link rel="stylesheet" href="/style.css?v=20260724-1" />
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3314960461630607" crossorigin="anonymous"></script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "AnalysisNewsArticle",
    "headline": ${JSON.stringify(article.title)},
    "description": ${JSON.stringify(description)},
    "datePublished": "${TODAY}",
    "dateModified": "${TODAY}",
    "author": { "@type": "Person", "name": "거리의악사", "url": "${SITE_URL}/about.html#editor" },
    "publisher": { "@type": "Organization", "name": "GlobalHot", "url": "${SITE_URL}/" },
    "mainEntityOfPage": "${escapeHtml(canonical)}",
    "inLanguage": "ko"
  }
  </script>
  <style>
    .article-page { background:#f6f7f4; color:#1f211e; }
    .article-header { border-bottom:1px solid #d9ddd6; background:#fff; }
    .article-header-inner, .article-wrap { width:min(760px, calc(100% - 40px)); margin:0 auto; }
    .article-header-inner { min-height:64px; display:flex; align-items:center; justify-content:space-between; gap:20px; }
    .article-logo { color:#20221f; text-decoration:none; font-size:19px; font-weight:800; }
    .article-logo strong { color:#d6332f; }
    .article-header a:last-child { color:#62675f; font-size:13px; text-decoration:none; }
    .article-wrap { padding:54px 0 96px; }
    .article-kicker { color:#c52d29; font-size:12px; font-weight:800; text-transform:uppercase; margin:0 0 14px; }
    .article-wrap h1 { font-family:'Noto Serif KR',Georgia,serif; font-size:clamp(34px,7vw,54px); line-height:1.28; letter-spacing:0; margin:0; }
    .article-deck { color:#5e635c; font-size:18px; line-height:1.8; margin:22px 0; }
    .article-byline { display:flex; flex-wrap:wrap; gap:9px 16px; color:#737970; font-size:13px; padding:17px 0; border-top:1px solid #d9ddd6; border-bottom:1px solid #d9ddd6; }
    .article-byline strong { color:#252824; }
    .article-summary { padding:25px 0 8px; }
    .article-summary strong { display:block; font-size:15px; margin-bottom:12px; }
    .article-summary li { margin:8px 0; color:#3f433e; line-height:1.7; }
    .article-thesis { font-family:'Noto Serif KR',Georgia,serif; font-size:22px; line-height:1.8; border-top:3px solid #22251f; border-bottom:1px solid #cfd3cb; padding:24px 0; margin:28px 0 44px; }
    .article-section { margin:0 0 44px; }
    .article-section h2, .article-watch h2, .article-sources h2 { font-size:25px; line-height:1.4; margin:0 0 18px; }
    .article-section p { font-size:17px; line-height:2; margin:0 0 17px; color:#30342f; }
    .source-notes { display:flex; flex-wrap:wrap; gap:8px; padding-top:6px; }
    .source-notes a { color:#555f52; background:#e7ebe4; padding:5px 9px; border-radius:3px; font-size:11px; text-decoration:none; }
    .article-watch { border-top:1px solid #cfd3cb; border-bottom:1px solid #cfd3cb; padding:30px 0; margin:48px 0; }
    .article-watch li { margin:10px 0; line-height:1.75; }
    .article-limit { color:#636960; font-size:14px; line-height:1.8; }
    .article-sources { margin-top:48px; }
    .article-sources ol { padding-left:22px; }
    .article-sources li { margin:13px 0; line-height:1.65; }
    .article-sources a { color:#305a91; }
    .article-footer { margin-top:58px; padding-top:22px; border-top:1px solid #cfd3cb; color:#777d74; font-size:12px; line-height:1.7; }
    @media (max-width:600px) {
      .article-wrap { padding-top:36px; }
      .article-wrap h1 { font-size:34px; }
      .article-deck { font-size:16px; }
      .article-section p { font-size:16px; }
    }
  </style>
</head>
<body class="article-page">
  <!-- EDITORIAL_REVIEW_REQUIRED: verify every source, number and inference before merging. -->
  <header class="article-header">
    <div class="article-header-inner">
      <a class="article-logo" href="/">Global<strong>Hot</strong></a>
      <a href="/posts/">이슈 해설 아카이브</a>
    </div>
  </header>

  <main class="article-wrap">
    <article>
      <header>
        <p class="article-kicker">${escapeHtml(article.category)} · ISSUE ANALYSIS</p>
        <h1>${escapeHtml(article.title)}</h1>
        <p class="article-deck">${escapeHtml(article.deck)}</p>
        <div class="article-byline">
          <span>글 <strong><a href="/about.html#editor">거리의악사</a></strong></span>
          <time datetime="${TODAY}">${escapeHtml(DATE_KO)}</time>
        </div>
      </header>

      <section class="article-summary" aria-labelledby="summary-title">
        <strong id="summary-title">먼저 읽을 세 가지</strong>
        <ul>${article.keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>
      </section>

      <p class="article-thesis">${escapeHtml(article.thesis)}</p>
      ${sections}

      <section class="article-watch">
        <h2>다음으로 확인할 지표</h2>
        <ul>${article.watchItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </section>

      <p class="article-limit"><strong>분석의 한계:</strong> ${escapeHtml(article.limitations)}</p>

      <section class="article-sources" aria-labelledby="sources-title">
        <h2 id="sources-title">근거 자료</h2>
        <ol>${sources
          .map(
            (source) =>
              `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a> <small>(${escapeHtml(source.source)}, ${escapeHtml(source.publishedAt?.slice(0, 10) || '날짜 미상')})</small></li>`,
          )
          .join('')}</ol>
      </section>
    </article>

    <footer class="article-footer">
      본문은 정보 제공과 경제 교육을 위한 해설이며 특정 자산의 매수·매도를 권유하지 않습니다.
      오류 제보: <a href="mailto:kintube0001@gmail.com">kintube0001@gmail.com</a>
    </footer>
  </main>
</body>
</html>`;
}

function updateHomepage(article, sourceById, fileName) {
  const path = join(process.cwd(), 'index.html');
  let html = readFileSync(path, 'utf8');
  const marker = /<!-- EDITORIAL_LATEST_START -->[\s\S]*?<!-- EDITORIAL_LATEST_END -->/;
  if (!marker.test(html)) throw new Error('홈페이지 최신 글 마커를 찾을 수 없습니다.');

  const block = `<!-- EDITORIAL_LATEST_START -->
          <div class="feature-copy">
            <p class="feature-category">${escapeHtml(article.category)} · 최신 심층 해설 · ${escapeHtml(DATE_KO)}</p>
            <h2 id="feature-title"><a href="/posts/${escapeHtml(fileName)}">${escapeHtml(article.title)}</a></h2>
            <p>${escapeHtml(article.deck)}</p>
            <ul class="feature-points">
              ${article.keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join('\n              ')}
            </ul>
            <a class="hot-button" href="/posts/${escapeHtml(fileName)}">심층 분석 읽기 <span aria-hidden="true">→</span></a>
          </div>
          <!-- EDITORIAL_LATEST_END -->`;

  html = html.replace(marker, block);
  writeFileSync(path, html, 'utf8');
}

function extractMeta(html, pattern, fallback) {
  return html.match(pattern)?.[1]?.trim() || fallback;
}

function updatePostsIndex() {
  const postsDir = join(process.cwd(), 'posts');
  const entries = readdirSync(postsDir)
    .filter((file) => file.endsWith('.html') && file !== 'index.html')
    .map((file) => {
      const html = readFileSync(join(postsDir, file), 'utf8');
      if (/name="robots"\s+content="[^"]*noindex/i.test(html)) return null;
      return {
        file,
        title: extractMeta(html, /<title>(.*?)\s*\|\s*GlobalHot<\/title>/i, file),
        description: extractMeta(html, /<meta name="description" content="([^"]+)"/i, ''),
        date: file.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date));

  const cards = entries
    .map(
      (entry) => `<article class="archive-item">
        <time datetime="${entry.date}">${entry.date.replaceAll('-', '.')}</time>
        <h2><a href="/posts/${escapeHtml(entry.file)}">${escapeHtml(entry.title)}</a></h2>
        <p>${escapeHtml(entry.description)}</p>
      </article>`,
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="/analytics.js?v=20260718-2"></script>
  <title>글로벌 경제 이슈 해설 | GlobalHot</title>
  <meta name="description" content="거리의악사가 편집한 글로벌 경제·주식·기술 이슈 해설 아카이브입니다." />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${SITE_URL}/posts/" />
  <link rel="stylesheet" href="/style.css?v=20260724-1" />
  <style>
    .archive-page { background:#f6f7f4; color:#232622; }
    .archive-wrap { width:min(840px,calc(100% - 40px)); margin:0 auto; padding:52px 0 90px; }
    .archive-back { color:#666d63; text-decoration:none; font-size:13px; }
    .archive-wrap > h1 { font-family:'Noto Serif KR',Georgia,serif; font-size:40px; margin:32px 0 10px; }
    .archive-lead { color:#666d63; line-height:1.8; margin-bottom:38px; }
    .archive-item { border-top:1px solid #cfd4cc; padding:26px 0; }
    .archive-item time { color:#c52d29; font-size:12px; font-weight:700; }
    .archive-item h2 { font-size:22px; line-height:1.45; margin:8px 0; }
    .archive-item h2 a { color:#252824; text-decoration:none; }
    .archive-item p { color:#626860; line-height:1.75; margin:0; }
  </style>
</head>
<body class="archive-page">
  <main class="archive-wrap">
    <a class="archive-back" href="/">← GlobalHot 홈</a>
    <h1>이슈 해설 아카이브</h1>
    <p class="archive-lead">매주 화·금요일, 경제·주식·기술 분야에서 한국 독자가 확인할 핵심 맥락을 설명합니다.</p>
    ${cards || '<p>편집 검토를 마친 첫 분석을 준비하고 있습니다.</p>'}
  </main>
</body>
</html>`;
  writeFileSync(join(postsDir, 'index.html'), html, 'utf8');
}

function updateSitemap(fileName) {
  const path = join(process.cwd(), 'sitemap.xml');
  let xml = readFileSync(path, 'utf8');
  const postUrl = `${SITE_URL}/posts/${fileName}`;
  if (!xml.includes(`<loc>${SITE_URL}/posts/</loc>`)) {
    const archiveEntry = `  <url>
    <loc>${SITE_URL}/posts/</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
    xml = xml.replace('</urlset>', `${archiveEntry}</urlset>`);
  }
  if (!xml.includes(`<loc>${postUrl}</loc>`)) {
    const entry = `  <url>
    <loc>${postUrl}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>never</changefreq>
    <priority>0.8</priority>
  </url>
`;
    xml = xml.replace('</urlset>', `${entry}</urlset>`);
  }
  xml = xml.replace(
    /(<loc>https:\/\/globalhot\.net\/posts\/<\/loc>\s*)(?:<lastmod>[^<]+<\/lastmod>\s*)?/,
    `$1<lastmod>${TODAY}</lastmod>\n    `,
  );
  writeFileSync(path, xml, 'utf8');
}

function writeActionOutput(fileName) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  appendFileSync(output, `post_path=posts/${fileName}\npost_title=${fileName}\n`, 'utf8');
}

async function main() {
  console.log(`[editorial] ${DATE_KO} 조사 초안 생성을 시작합니다.`);
  const candidates = await collectCandidates();
  if (candidates.length < 8) {
    throw new Error(`후보 기사가 ${candidates.length}개뿐입니다. 최소 8개가 필요합니다.`);
  }
  console.log(`[editorial] 검증 가능한 후보 ${candidates.length}개를 수집했습니다.`);

  const { article, sourceById } = await generateDraft(candidates);
  const fileName = `${TODAY}-${safeSlug(article.slug)}.html`;
  const postsDir = join(process.cwd(), 'posts');
  mkdirSync(postsDir, { recursive: true });
  if (existsSync(join(postsDir, fileName))) throw new Error(`이미 존재하는 초안입니다: ${fileName}`);

  writeFileSync(join(postsDir, fileName), renderPost(article, sourceById, fileName), 'utf8');
  updateHomepage(article, sourceById, fileName);
  updatePostsIndex();
  updateSitemap(fileName);
  writeActionOutput(fileName);
  console.log(`[editorial] PR 검토용 초안을 생성했습니다: posts/${fileName}`);
}

main().catch((error) => {
  console.error(`[editorial] 실패: ${error.message}`);
  process.exitCode = 1;
});
