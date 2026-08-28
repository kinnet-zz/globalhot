// 실시간 화제 랭킹 수집기 (P0 MVP)
// - rank/config/rank-sources.json 의 소스를 매시간 수집 (rss + booru-json)
// - rank/scripts/lib/score.mjs 점수식으로 TOP 50 + 인물 TOP 10 산출
// - rank/data/ranking.json 갱신 (0건이면 이전 데이터 유지 — issue 스크레이퍼 규칙 동일)
// 사용: node rank/scripts/collect-rank.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { itemScore, personScore, normalizeTitle, matchPersons, rankBadge, isCleanTitle, hasAdultRating, applyQuotas, cleanBooruTitle } from "./lib/score.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..", "..");
const SOURCES_PATH = path.join(projectRoot, "rank", "config", "rank-sources.json");
const MODELS_PATH = path.join(projectRoot, "data", "models.json");
const OUT_PATH = path.join(projectRoot, "rank", "data", "ranking.json");

const TOP_N = 50;
// 동적 윈도우: 후보 중 [24,48,72,168]h 중 30건 이상 확보되는 가장 좁은 창. 없으면 168h.
const WINDOW_CANDIDATES = [24, 48, 72, 168];
const MIN_ITEMS = 30;

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "globalhot-rank/1.0 (+https://globalhot.net)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// 경량 RSS 파서 (의존성 없음) — title/link/pubDate + 썸네일(media:thumbnail/media:content/enclosure) 추출.
// Mastodon 태그 피드는 <title> 이 없으므로 <description> 에서 제목을 만든다.
function parseRss(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/g) ?? [];
  const pick = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    if (!m) return "";
    return m[1]
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]+>/g, "")
      .trim();
  };
  // 썸네일: media:thumbnail url=... | media:content url=...(image) | enclosure url=...(image)
  const pickThumb = (block) => {
    const media = block.match(/<media:(?:thumbnail|content)[^>]*\burl="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"[^>]*>/i);
    if (media) return media[1].replace(/&amp;/g, "&");
    const enc = block.match(/<enclosure[^>]*\burl="([^"]+)"[^>]*\btype="image\/[^"]*"[^>]*>/i)
      ?? block.match(/<enclosure[^>]*\btype="image\/[^"]*"[^>]*\burl="([^"]+)"[^>]*>/i);
    if (enc) return enc[1].replace(/&amp;/g, "&");
    return "";
  };
  const unescapeEntities = (s) =>
    s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
     .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
     .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
  for (const block of blocks) {
    // 성인 등급 표시(mature/adult)가 있는 RSS 항목은 제외 (DeviantArt 등)
    if (hasAdultRating(block)) continue;
    let title = unescapeEntities(pick(block, "title")).replace(/\s+/g," ").trim();
    const link = pick(block, "link");
    if (!title) {
      const desc = unescapeEntities(pick(block, "description"))
        .replace(/<[^>]+>/g, " ") // unescape 로 드러난 태그 제거
        .replace(/\s+/g, " ")
        .trim();
      if (desc) title = desc.slice(0, 120) + (desc.length > 120 ? "…" : "");
    }
    const pubDate = pick(block, "pubDate");
    const parsed = pubDate ? Date.parse(pubDate) : NaN;
    if (title && link) {
      items.push({ title, url: link, publishedAt: Number.isNaN(parsed) ? "" : new Date(parsed).toISOString(), thumb: pickThumb(block) });
    }
  }
  // Atom(<entry>) 지원 — Reddit 등. link 는 href 속성, 날짜는 updated/published
  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/g) ?? [];
  for (const block of entryBlocks) {
    const title = unescapeEntities(pick(block, "title")).replace(/\s+/g, " ").trim();
    const linkM = block.match(/<link[^>]*\brel="alternate"[^>]*\bhref="([^"]+)"/i)
      ?? block.match(/<link[^>]*\bhref="([^"]+)"/i);
    const dateRaw = pick(block, "updated") || pick(block, "published");
    const parsed = dateRaw ? Date.parse(dateRaw) : NaN;
    if (title && linkM) {
      items.push({
        title,
        url: linkM[1].replace(/&amp;/g, "&"),
        publishedAt: Number.isNaN(parsed) ? "" : new Date(parsed).toISOString(),
        thumb: pickThumb(block),
      });
    }
  }
  return items;
}

// booru-json 파서 — post 배열을 링크 항목으로 (이미지 복제 없음, 원글 페이지 링크 + 미리보기 썸네일만)
const BOORU_POST_URL = {
  yandere: (id) => `https://yande.re/post/show/${id}`,
  konachan: (id) => `https://konachan.com/post/show/${id}`,
  danbooru: (id) => `https://danbooru.donmai.us/posts/${id}`,
  gelbooru: (id) => `https://gelbooru.com/index.php?page=post&s=view&id=${id}`,
  safebooru: (id) => `https://safebooru.org/index.php?page=post&s=view&id=${id}`,
};
function parseBooru(jsonText, src) {
  const posts = JSON.parse(jsonText);
  const items = [];
  for (const p of posts) {
    const id = p.id;
    if (!id) continue;
    const buildUrl = BOORU_POST_URL[src.platform];
    if (!buildUrl) continue;
    // 발행일: 플랫폼별 unix 초/밀리초 또는 ISO 문자열
    let publishedAt = "";
    if (typeof p.created_at === "number" && p.created_at > 1_000_000_000) {
      publishedAt = new Date(p.created_at * (p.created_at < 1e11 ? 1000 : 1)).toISOString();
    } else if (typeof p.created_at === "string" && !Number.isNaN(Date.parse(p.created_at))) {
      publishedAt = new Date(p.created_at).toISOString();
    }
    items.push({
      title: `[${src.label}] ${cleanBooruTitle(p.tags) || `post ${id}`}`,
      url: buildUrl(id),
      publishedAt,
      thumb: String(p.preview_url ?? p.preview_file_url ?? "").startsWith("http") ? p.preview_url ?? p.preview_file_url : "",
    });
  }
  return items;
}

async function main() {
  const sourcesCfg = JSON.parse(await readFile(SOURCES_PATH, "utf8"));
  const modelsRaw = JSON.parse(await readFile(MODELS_PATH, "utf8"));
  const persons = (Array.isArray(modelsRaw) ? modelsRaw : modelsRaw.models) ?? [];

  const enabled = sourcesCfg.sources.filter((s) => s.enabled);
  const now = Date.now();
  const collected = []; // { title, url, publishedAt, source, category }

  await Promise.all(
    enabled.map(async (src) => {
      try {
        const text = await fetchText(src.feed);
        const items = src.type === "booru-json" ? parseBooru(text, src) : parseRss(text);
        for (const it of items) {
          collected.push({ ...it, source: src.label, category: src.category, platform: src.platform });
        }
        console.log(`[ok] ${src.label}: ${items.length} items`);
      } catch (e) {
        console.warn(`[skip] ${src.label}: ${e.message}`);
      }
    }),
  );

  console.log(`collected raw: ${collected.length}`);

  // 성인 키워드 필터 — 포르노/노출 항목 제외 (차단 건수 로그)
  const beforeAdultFilter = collected.length;
  for (let i = collected.length - 1; i >= 0; i--) {
    if (!isCleanTitle(collected[i].title)) collected.splice(i, 1);
  }
  if (collected.length !== beforeAdultFilter) {
    console.log(`adult filter: removed ${beforeAdultFilter - collected.length} items`);
  }

  if (!collected.length) {
    console.log("0 items — keep previous ranking.json");
    return;
  }

  // 발행일 있는 항목만 윈도우 후보로 (없는 항목은 최근으로 간주해 유지하되 후보 계산에서 제외)
  const dated = collected.filter((c) => c.publishedAt);
  let windowHours = WINDOW_CANDIDATES[WINDOW_CANDIDATES.length - 1];
  for (const h of WINDOW_CANDIDATES) {
    if (dated.filter((c) => Date.parse(c.publishedAt) > now - h * 3_600_000).length >= MIN_ITEMS) {
      windowHours = h;
      break;
    }
  }
  const cutoff = now - windowHours * 3_600_000;
  const windowed = collected.filter((c) => !c.publishedAt || Date.parse(c.publishedAt) > cutoff);
  console.log(`window: ${windowHours}h → ${windowed.length} items`);

  // 중복(동일 정규화 제목) 묶기 → 소스 다양성 점수로 연결
  const groups = new Map(); // normTitle -> { title, url, publishedAt, thumb, sources:Set, categories:Set }
  for (const c of windowed) {
    const key = normalizeTitle(c.title).slice(0, 80);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = { title: c.title, url: c.url, publishedAt: c.publishedAt, thumb: c.thumb || "", sources: new Set(), categories: new Set() };
      groups.set(key, g);
    }
    if (c.thumb && !g.thumb) g.thumb = c.thumb;
    g.sources.add(c.source);
    g.categories.add(c.category);
    g.platforms = g.platforms ?? new Set();
    if (c.platform) g.platforms.add(c.platform);
    if (c.publishedAt && (!g.publishedAt || Date.parse(c.publishedAt) > Date.parse(g.publishedAt))) g.publishedAt = c.publishedAt;
  }

  // 인물 집계
  const personAgg = new Map(); // id -> { id, name, mentions, latestAt, sources:Set }
  for (const g of groups.values()) {
    const hits = matchPersons(g.title, persons);
    for (const h of hits) {
      let a = personAgg.get(h.id);
      if (!a) {
        a = { id: h.id, name: h.name, mentions: 0, latestAt: g.publishedAt, sources: new Set() };
        personAgg.set(h.id, a);
      }
      a.mentions += 1;
      if (g.publishedAt && Date.parse(g.publishedAt) > Date.parse(a.latestAt || 0)) a.latestAt = g.publishedAt;
      for (const s of g.sources) a.sources.add(s);
    }
    g.persons = hits;
  }

  // 점수·순위
  const scored = [...groups.values()].map((g) => ({
    title: g.title,
    url: g.url,
    thumb: g.thumb,
    publishedAt: g.publishedAt,
    sources: [...g.sources],
    platforms: [...(g.platforms ?? [])],
    categories: [...g.categories],
    persons: g.persons,
    score: Math.round(itemScore({ publishedAt: g.publishedAt || new Date(now).toISOString(), sourceLabels: g.sources, personMentions: g.persons.length }, now) + g.sources.size * 4),
  }));
  scored.sort((a, b) => b.score - a.score);
  const top = applyQuotas(scored, TOP_N);

  const personsScored = [...personAgg.values()]
    .map((a) => ({ id: a.id, name: a.name, mentions: a.mentions, score: Math.round(personScore({ mentions: a.mentions, latestAt: a.latestAt, sourceLabels: a.sources }, now)) }))
    .sort((a, b) => b.score - a.score);
  const personsTop = personsScored.slice(0, 10);

  // 이전 순위와 비교 (URL 기준)
  let prevByUrl = new Map();
  try {
    const prev = JSON.parse(await readFile(OUT_PATH, "utf8"));
    prevByUrl = new Map((prev.top ?? []).map((t, i) => [t.url, i + 1]));
  } catch {
    /* 최초 실행 */
  }

  const output = {
    generated_at: new Date(now).toISOString(),
    window_hours: windowHours,
    collected_count: collected.length,
    top: top.map((t, i) => ({ rank: i + 1, ...t, badge: rankBadge(i + 1, prevByUrl.get(t.url)) })),
    persons_top: personsTop,
  };

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`ranking.json updated: top=${output.top.length} persons=${output.persons_top.length}`);

  // 히스토리 스냅샷 적재 (상세페이지 순위 이력용) — 시간당 1줄, 30일 초과분은 앞에서 잘라냄
  const HISTORY_PATH = path.join(projectRoot, "rank", "data", "history.jsonl");
  const MAX_LINES = 24 * 30;
  let lines = [];
  try {
    lines = (await readFile(HISTORY_PATH, "utf8")).split("\n").filter(Boolean);
  } catch {
    /* 최초 */
  }
  lines.push(JSON.stringify({ ts: output.generated_at, items: output.top.map((t) => ({ rank: t.rank, url: t.url, score: t.score, title: t.title, thumb: t.thumb || "", categories: t.categories || [], sources: (t.sources || []).slice(0, 3) })) }));
  if (lines.length > MAX_LINES) lines = lines.slice(lines.length - MAX_LINES);
  await writeFile(HISTORY_PATH, lines.join("\n") + "\n", "utf8");
  console.log(`history.jsonl: ${lines.length} snapshots`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
