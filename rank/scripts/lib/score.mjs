// 랭킹 점수 계산 순수 모듈 — collect-rank.mjs 와 tests/rank-collect.test.mjs 가 사용.
// 설계: docs/HOTRANK-DESIGN.md §3

export function hoursSince(dateIso, now = Date.now()) {
  const t = Date.parse(dateIso);
  if (Number.isNaN(t)) return Infinity;
  return Math.max(0, (now - t) / 3_600_000);
}

// 신선도: exp(-age_hours / 12) * 8  (12시간 반감기)
export function freshnessScore(publishedAt, now = Date.now()) {
  return Math.exp(-hoursSince(publishedAt, now) / 12) * 8;
}

// 소스 다양성: 여러 소스에서 동시 화제일수록 가산 (조작/단일 소스 폭주 방지)
export function diversityScore(sourceLabels) {
  return new Set(sourceLabels).size * 6;
}

// 저퀄 제목 패턴 — 카메라 기본 파일명(DSC_1234, IMG_5678 등)은 콘텐츠 정보가 없어 랭킹 품질을 떨어뜨림
const LOW_EFFORT_TITLE = /^(dsc[_-]?\d+|img[_-]?\d+|dscn\d+|p\d{6,}|20\d{6}[_-]|photo|untitled|untitled[- ]\d+|new photo|_mg_\d+)/i;
export function isLowEffortTitle(title) {
  const head = String(title).trim().slice(0, 24);
  return LOW_EFFORT_TITLE.test(head) || /^[\w\-_]*\d{3,}[\w\-_ ]*(wm|edit|copy)?$/i.test(head);
}

// 항목 점수: 신선도 + 소스 다양성 (+ 인물 화제 부스트, − 저퀄 제목 페널티)
export function itemScore({ publishedAt, sourceLabels = [], personMentions = 0, title = "" }, now = Date.now()) {
  const base = freshnessScore(publishedAt, now) + diversityScore(sourceLabels) + Math.min(personMentions, 5) * 2;
  return isLowEffortTitle(title) ? base - 8 : base;
}

// 인물 점수: 언급량 * 10 + 신선도 평균 + 소스 다양성
export function personScore({ mentions = 0, latestAt, sourceLabels = [] }, now = Date.now()) {
  return mentions * 10 + freshnessScore(latestAt, now) + diversityScore(sourceLabels);
}

// 제목 정규화 — 중복 뉴스(통신사 재배포) 묶음용
export function normalizeTitle(title) {
  return String(title)
    .toLowerCase()
    .replace(/\|.*$/, "")
    .replace(/[-–—]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 인물명 매칭: models.json 의 name/altName/sns 핸들이 제목에 등장하면 매칭.
// 개선: 단어 경계 매칭(부분 문자열 오매칭 방지) + 구두점 정규화 + 대소문자 무시.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function matchPersons(title, persons) {
  const hay = " " + String(title).toLowerCase().replace(/[.,!?'"“”『』「」()·|]/g, " ").replace(/\s+/g, " ") + " ";
  const hits = [];
  for (const p of persons) {
    const candidates = [p.name, p.altName].filter(Boolean);
    const xHandle = p.sns?.x ? String(p.sns.x).split("/").pop() : null;
    if (xHandle) candidates.push("@" + xHandle);
    for (const name of candidates) {
      const needle = String(name).toLowerCase().trim();
      if (needle.length < 3) continue;
      // 단어 경계 매칭 — 부분 문자열 오매칭 방지 (일본어 등 경계 없는 문자는 포함 검사)
      if (new RegExp(`(^|\\s)${escapeRe(needle)}($|\\s|[!?.,:])`).test(hay) || /[\u3040-\u30ff\uac00-\ud7af]/.test(needle) && hay.includes(needle)) {
        hits.push({ id: p.id, name: p.name });
        break;
      }
    }
  }
  return hits;
}

// 순위 변동 배지: prevRank 대비 new/up/down
export function rankBadge(rank, prevRank) {
  if (!prevRank) return { kind: "new", label: "NEW" };
  if (prevRank > rank) return { kind: "up", label: `▲ ${prevRank - rank}` };
  if (prevRank < rank) return { kind: "down", label: `▼ ${rank - prevRank}` };
  return { kind: "same", label: "—" };
}

// ── 성인 콘텐츠 차단 ─────────────────────────────────────
// 본 사이트는 포르노 사이트가 아님 — 노출/성인 항목은 수집 단계에서 제외.
// 제목·태그 기반 키워드 차단 + (제공 시) 피드 등급(mature/adult) 차단.
const BLOCKED_TERMS = [
  // 영어
  "porn", "porno", "xxx", "nsfw", "nude", "nudes", "nudity", "naked", "topless",
  "explicit", "hardcore", "softcore", "erotic", "sex", "sexual", "orgasm",
  "fetish", "bdsm", "bondage", "dildo", "vagina", "pussy", "penis", "cum",
  "blowjob", "handjob", "milf", "hentai", "onlyfans leak", "leaked nudes",
  // 한국어
  "누드", "포르노", "성인물", "노출", "야동", "섹스", "음란",
  // 일본어
  "ヌード", "ポルノ", "アダルト", "エロ", "セックス",
];

export function isCleanTitle(title) {
  const t = String(title ?? "").toLowerCase();
  return !BLOCKED_TERMS.some((term) => t.includes(term));
}

// RSS 항목 블록의 성인 등급 표시 감지 (DeviantArt media:rating 속성·요소 텍스트 모두)
export function hasAdultRating(itemBlockXml) {
  const xml = String(itemBlockXml ?? "");
  return (
    /<media:rating[^>]*>(adult|mature)</i.test(xml) ||
    /<media:rating[^>]*(adult|mature)/i.test(xml) ||
    /rating="(adult|mature)"/i.test(xml)
  );
}

// ── 랭킹 균형 룰 ────────────────────────────────────────
// 1) 애니 쿼터: booru 계열(일러스트 중심) 항목은 TOP의 MAX_BOORU_RATIO 까지만.
//    실사(사진·화보·뉴스)가 메인인 사이트 성격 유지.
// 2) 작가 캡: 동일 Flickr 작가/Mastodon 계정은 MAX_PER_AUTHOR 건까지 — 특정 계정 도배 방지.
// 3) 피드 캡: 동일 소스 피드는 MAX_PER_FEED 건까지 — 특정 뉴스 쿼리 하나가 랭킹을 잠식하는 것 방지.
export const MAX_BOORU_RATIO = 0.3;
export const MAX_PER_AUTHOR = 2;
export const MAX_PER_FEED = 4;

const BOORU_PLATFORMS = new Set(["yandere", "safebooru", "danbooru", "konachan", "gelbooru"]);

// URL에서 작가/계정 키 추출 (Flickr 작가, Mastodon 핸들)
export function authorKeyOf(url, platforms) {
  const u = String(url ?? "");
  let m = u.match(/flickr\.com\/photos\/([^\/]+)/);
  if (m) return "flickr:" + m[1];
  if (platforms?.some((p) => p === "mastodon") && (m = u.match(/\/@([^\/]+)/))) return "masto:@" + m[1];
  return null;
}

// 정렬된 scored 배열에 쿼터 적용해 상위 TOP_N 선택
export function applyQuotas(scored, topN) {
  const maxBooru = Math.round(topN * MAX_BOORU_RATIO);
  let booruCount = 0;
  const authorCounts = new Map();
  const feedCounts = new Map();
  const selected = [];
  for (const item of scored) {
    if (selected.length >= topN) break;
    const isBooru = (item.platforms ?? []).some((p) => BOORU_PLATFORMS.has(p));
    if (isBooru && booruCount >= maxBooru) continue;
    const author = authorKeyOf(item.url, item.platforms);
    if (author) {
      const c = authorCounts.get(author) ?? 0;
      if (c >= MAX_PER_AUTHOR) continue;
      authorCounts.set(author, c + 1);
    }
    // 피드 캡: 소스 라벨(피드)별 최대 MAX_PER_FEED 건
    const feed = (item.sources ?? [])[0];
    if (feed) {
      const fc = feedCounts.get(feed) ?? 0;
      if (fc >= MAX_PER_FEED) continue;
      feedCounts.set(feed, fc + 1);
    }
    if (isBooru) booruCount++;
    selected.push(item);
  }
  // 2차 패스: 피드 캵 때문에 topN 을 못 채웠으면 나머지는 피드 캡 없이라도 채운다 (빈 랭킹 방지).
  // 작가 캡·booru 쿼터는 2차에서도 유지.
  if (selected.length < topN) {
    const chosen = new Set(selected);
    for (const item of scored) {
      if (selected.length >= topN) break;
      if (chosen.has(item)) continue;
      const isBooru = (item.platforms ?? []).some((p) => BOORU_PLATFORMS.has(p));
      if (isBooru && booruCount >= maxBooru) continue;
      const author = authorKeyOf(item.url, item.platforms);
      if (author) {
        const c = authorCounts.get(author) ?? 0;
        if (c >= MAX_PER_AUTHOR) continue;
        authorCounts.set(author, c + 1);
      }
      if (isBooru) booruCount++;
      selected.push(item);
    }
  }
  return selected;
}

// booru 태그 제목 정리 — 메타 태그 제거 후 의미 태그만 (예: "[Safebooru] 코스프레 #hatsune_miku")
const BOORU_META_TAGS = new Set([
  "1girl", "2girls", "3girls", "1boy", "2boys", "absurdres", "highres", "hi_res",
  "large_filesize", "long_image", "multiple_views", "commentary", "translated",
  "commentary_request", "bad_id", "duplicate", "cosplay_request", "photo_set",
  "landscape", "portrait", "close-up", "english_commentary",
]);
export function cleanBooruTitle(tagString) {
  const tags = String(tagString ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !BOORU_META_TAGS.has(t) && !/^:?[;d]/i.test(t))
    .slice(0, 3)
    .join(" ");
  return tags;
}
