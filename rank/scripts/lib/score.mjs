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

// 항목 점수: 신선도 + 소스 다양성 (+ 인물 화제 부스트)
export function itemScore({ publishedAt, sourceLabels = [], personMentions = 0 }, now = Date.now()) {
  return freshnessScore(publishedAt, now) + diversityScore(sourceLabels) + Math.min(personMentions, 5) * 2;
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
