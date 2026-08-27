// 빌드 타임 랭킹 페이지 생성기 — build-pages.mjs 에서 호출.
// 입력: rank/data/ranking.json, rank/data/history.jsonl, data/models.json
// 출력: dist/r/<slug>.html (TOP50 상세), dist/t/<id>.html (인물 216명), dist/sitemap-pages.xml
// 정적 생성이므로 매시간 집계→배포 주기에 따라 자동 갱신됨.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// 메인(index.html)과 동일한 FNV-1a 8hex — 클라이언트와 슬러그 일치 필수
export function slugOf(url) {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 디자인 시스템: Hands-On-Vibe-Coding/ToDoList — 밝은 테마, gray-50/흰 카드, blue-600 프라이머리 (index.html 과 동일)
const CSS = `
  :root { --bg:#f9fafb; --card:#ffffff; --card-hover:#f3f4f6; --border:#e5e7eb; --primary:#2563eb; --primary-hover:#1d4ed8; --primary-soft:#dbeafe; --accent:#dc2626; --gold:#d97706; --down:#0284c7; --text:#111827; --muted:#6b7280; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:var(--bg); color:var(--text); font-family:'Inter','Segoe UI','Apple SD Gothic Neo','Malgun Gothic',sans-serif; }
  .wrap { max-width:860px; margin:0 auto; padding:20px; }
  header { border-bottom:1px solid var(--border); background:rgba(255,255,255,.92); position:sticky; top:0; z-index:10; backdrop-filter:blur(8px); }
  .header-in { max-width:860px; margin:0 auto; padding:14px 20px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
  .logo { font-size:20px; font-weight:800; text-decoration:none; color:inherit; }
  .logo .fire { color:var(--primary); }
  nav { margin-left:auto; display:flex; gap:14px; font-size:13px; align-items:center; }
  nav a { color:var(--muted); text-decoration:none; font-weight:500; }
  nav a:hover { color:var(--primary); }
  h1 { font-size:20px; line-height:1.45; margin:18px 0 10px; font-weight:800; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px; box-shadow:0 1px 2px rgba(0,0,0,.04); }
  .meta { display:flex; gap:14px; flex-wrap:wrap; font-size:13px; color:var(--muted); margin-bottom:12px; }
  .thumb { width:100%; max-width:480px; border-radius:10px; display:block; margin:0 auto 12px; border:1px solid var(--border); }
  .rankline { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
  .rank-n { font-size:28px; font-weight:800; color:var(--gold); }
  .badge { font-size:12px; font-weight:700; padding:2px 10px; border-radius:6px; background:var(--primary-soft); color:#1e40af; }
  .why { background:var(--card); border:1px solid var(--border); border-left:3px solid var(--primary); border-radius:8px; padding:12px 14px; font-size:14px; line-height:1.7; margin:14px 0; box-shadow:0 1px 2px rgba(0,0,0,.04); }
  .section { font-size:14px; font-weight:700; margin:20px 0 10px; color:var(--text); }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th, td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--border); }
  th { color:var(--muted); font-weight:600; }
  ul.related { list-style:none; display:flex; flex-direction:column; gap:8px; }
  ul.related a { display:flex; gap:10px; align-items:center; background:var(--card); border:1px solid var(--border); border-radius:10px; padding:10px 12px; text-decoration:none; color:var(--text); box-shadow:0 1px 2px rgba(0,0,0,.04); }
  ul.related a:hover { border-color:var(--primary); background:var(--card-hover); }
  ul.related .rn { font-weight:800; color:var(--gold); min-width:26px; }
  ul.related .tt { font-size:13px; line-height:1.4; }
  .tags { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0; }
  .rtag { font-size:11px; background:var(--primary-soft); color:#1e40af; padding:2px 8px; border-radius:5px; text-decoration:none; }
  a.rtag:hover { background:#bfdbfe; }
  .out { display:inline-block; margin-top:14px; background:var(--primary); color:#fff; font-weight:600; font-size:14px; padding:11px 22px; border-radius:10px; text-decoration:none; }
  .out:hover { background:var(--primary-hover); }
  .person-head { display:flex; gap:18px; align-items:center; flex-wrap:wrap; margin:16px 0; }
  .person-photo { width:110px; height:110px; border-radius:50%; object-fit:cover; border:2px solid var(--border); }
  .bio { font-size:14px; line-height:1.8; color:#374151; }
  .sns { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
  .sns a { font-size:13px; border:1px solid var(--border); border-radius:8px; padding:7px 14px; color:var(--primary); text-decoration:none; background:#fff; }
  .sns a:hover { background:var(--primary-soft); }
  .lang-switch { display:flex; gap:2px; border:1px solid var(--border); border-radius:8px; overflow:hidden; background:#fff; }
  .lang-switch button { background:none; border:none; color:var(--muted); font-size:12px; font-weight:700; padding:6px 10px; cursor:pointer; }
  .lang-switch button.active { background:var(--primary); color:#fff; }
  footer { padding:30px 20px; text-align:center; color:var(--muted); font-size:12px; border-top:1px solid var(--border); line-height:1.8; margin-top:30px; }
  footer a { color:inherit; }
  [data-i18n] { }
  .hidden { display:none; }
`;

const NAV = `
  <header><div class="header-in">
    <a href="/" class="logo">🔥 global<span class="fire">hot</span><span style="font-size:12px;color:var(--muted);font-weight:400">.net</span></a>
    <nav>
      <a href="/" data-i18n="navRank"></a>
      <a href="/models.html" data-i18n="navModels"></a>
      <a href="/issue/" data-i18n="navIssue"></a>
      <div class="lang-switch" id="langSwitch">
        <button data-lang="ko">한</button><button data-lang="en">EN</button><button data-lang="ja">日</button>
      </div>
    </nav>
  </div></header>`;

const I18N_JS = `
const I18N = {
  ko: { navRank:"실시간 랭킹", navModels:"모델 프로필", navIssue:"이슈", whyTitle:"왜 화제인가요?", historyTitle:"순위 이력", relatedTitle:"같은 카테고리 화제", outBtn:"원본 보기 ↗", personsTitle:"인물 정보", latestTitle:"관련 최신 화제", noRelated:"관련 화제가 아직 없습니다.", footer:"모든 항목은 원 출처로의 링크만 제공하며 콘텐츠를 복제·저장하지 않습니다" },
  en: { navRank:"Live Ranking", navModels:"Model Profiles", navIssue:"Issues", whyTitle:"Why is it trending?", historyTitle:"Rank History", relatedTitle:"Related Topics", outBtn:"View original ↗", personsTitle:"Profile", latestTitle:"Related Latest Topics", noRelated:"No related topics yet.", footer:"All items link to the original source only — no content is copied or stored" },
  ja: { navRank:"リアルタイムランキング", navModels:"モデルプロフィール", navIssue:"イシュー", whyTitle:"なぜ話題？", historyTitle:"順位履歴", relatedTitle:"同じカテゴリの話題", outBtn:"元を見る ↗", personsTitle:"プロフィール", latestTitle:"関連の最新話題", noRelated:"関連する話題はまだありません。", footer:"すべての項目は元ソースへのリンクのみ提供し、コンテンツの複製・保存は行いません" },
};
const urlLang = new URLSearchParams(location.search).get("lang");
let lang = ["ko","en","ja"].includes(urlLang) ? urlLang : (localStorage.getItem("gh-lang") || "ko");
const t = (k) => (I18N[lang] && I18N[lang][k]) || I18N.ko[k] || k;
document.documentElement.lang = lang;
document.title = document.documentElement.dataset.title || document.title;
for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll("[data-sum-lang]")) el.hidden = el.dataset.sumLang !== lang;
for (const b of document.querySelectorAll("#langSwitch button")) {
  b.classList.toggle("active", b.dataset.lang === lang);
  b.onclick = () => { localStorage.setItem("gh-lang", b.dataset.lang); const u = new URL(location); u.searchParams.set("lang", b.dataset.lang); location.href = u; };
}`;

function pageShell({ title, bodyHtml, canonical }) {
  return `<!DOCTYPE html>
<html lang="ko" data-title="${esc(title)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="globalhot.net — 실시간 화제 랭킹 / Trending topics, updated hourly.">
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" href="/favicon.svg">
<script src="/analytics.js?v=20260718-2" defer></script>
<script src="/ads.js" defer></script>
<style>${CSS}</style>
</head>
<body>
${NAV}
<div class="wrap">
${bodyHtml}
</div>
<footer><span data-i18n="footer"></span> · <a href="/privacy.html">Privacy</a></footer>
<script>${I18N_JS}</script>
</body>
</html>`;
}

// "왜 화제?" 요약 (규칙 기반 — P1. AI 요약은 P1 후반)
function whyHot(item, lang) {
  const ageH = item.publishedAt ? Math.max(0, Math.round((Date.now() - Date.parse(item.publishedAt)) / 3.6e6)) : null;
  const n = (item.sources ?? []).length;
  const badge = item.badge?.label ?? "NEW";
  if (lang === "en")
    return `Mentioned across <b>${n}</b> source${n > 1 ? "s" : ""}${ageH !== null ? ` in the last ${ageH}h` : ""} · trending score <b>${item.score}</b> · rank change <b>${badge}</b>. Ranked #${item.rank} on globalhot.net live ranking.`;
  if (lang === "ja")
    return `<b>${n}</b>個のソース${ageH !== null ? `（直近${ageH}時間）` : ""}で同時に話題 · スコア <b>${item.score}</b> · 順位変動 <b>${badge}</b>。globalhot.net ライブランキング第<b>${item.rank}</b>位。`;
  return `<b>${n}</b>개 소스${ageH !== null ? ` (직근 ${ageH}시간 내)` : ""}에서 동시 화제 · 점수 <b>${item.score}</b> · 순위변동 <b>${badge}</b> — globalhot.net 실시간 랭킹 <b>${item.rank}위</b>`;
}

async function loadJson(p) {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return null;
  }
}

export async function buildRankPages({ projectRoot, distDir }) {
  const ranking = await loadJson(path.join(projectRoot, "rank", "data", "ranking.json"));
  if (!ranking?.top?.length) throw new Error("ranking.json missing or empty — run: node rank/scripts/collect-rank.mjs");
  const summaries = (await loadJson(path.join(projectRoot, "rank", "data", "summaries.json"))) ?? {};

  // 히스토리 로드
  let history = [];
  try {
    history = (await readFile(path.join(projectRoot, "rank", "data", "history.jsonl"), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    /* 없으면 이력 생략 */
  }

  const modelsRaw = await loadJson(path.join(projectRoot, "data", "models.json"));
  const models = (Array.isArray(modelsRaw) ? modelsRaw : modelsRaw.models) ?? [];

  const generated = ranking.generated_at ?? new Date().toISOString();
  const urls = [];

  // ── 상세 페이지 /r/<slug> ──
  const slugMap = new Map(); // url -> slug
  await mkdir(path.join(distDir, "r"), { recursive: true });
  for (const item of ranking.top) {
    const slug = slugOf(item.url);
    slugMap.set(item.url, slug);
    const related = ranking.top.filter((r) => r !== item && (r.categories ?? []).some((c) => (item.categories ?? []).includes(c))).slice(0, 6);
    const hist = history
      .map((snap) => ({ ts: snap.ts, rank: (snap.items ?? []).find((x) => x.url === item.url)?.rank }))
      .filter((h) => h.rank)
      .slice(-24);
    const personLinks = (item.persons ?? []).map((p) => `<a class="rtag" href="/t/${esc(p.id)}">${esc(p.name)}</a>`).join(" ");

    const body = `
    <div class="rankline"><span class="rank-n">#${item.rank}</span><span class="badge">${esc(item.badge?.label ?? "NEW")}</span><span style="color:var(--muted);font-size:13px">${esc((item.sources ?? []).join(" · "))}</span></div>
    <h1>${esc(item.title)}</h1>
    ${item.thumb ? `<img class="thumb" src="${esc(item.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ""}
    <div class="tags">${(item.categories ?? []).map((c) => `<span class="rtag">#${esc(c)}</span>`).join(" ")} ${personLinks}</div>
    ${(() => {
      // "왜 화제?" 요약은 뉴스성 항목(소스 2개 이상 언급 = 실제 스토리 존재)에만 표시.
      // 사진 단일 포스트는 스토리가 없어 요약이 메타데이터 반복에 그치므로 생략 (2026-08-27 제거 결정).
      const s = summaries[item.url];
      const hasStory = s && (item.sources?.length ?? 0) >= 2;
      if (!hasStory) return "";
      return `<div class="why"><b><span data-i18n="whyTitle"></span> <span style="font-size:11px;color:var(--blue)">AI</span></b><br><span data-sum-lang="ko">${esc(s.ko)}</span><span data-sum-lang="en" hidden>${esc(s.en)}</span><span data-sum-lang="ja" hidden>${esc(s.ja)}</span></div>`;
    })()}
    ${hist.length > 1 ? `<div class="section" data-i18n="historyTitle"></div><div class="card"><table><tr>${hist.map((h) => `<th>${new Date(h.ts).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit" })}시</th>`).join("")}</tr><tr>${hist.map((h) => `<td><b>${h.rank}</b>위</td>`).join("")}</tr></table></div>` : ""}
    <div class="section" data-i18n="relatedTitle"></div>
    <ul class="related">
      ${related.length ? related.map((r) => `<a href="/r/${slugOf(r.url)}"><span class="rn">${r.rank}</span><span class="tt">${esc(r.title.slice(0, 90))}</span></a>`).join("") : `<li style="color:var(--muted);font-size:13px" data-i18n="noRelated"></li>`}
    </ul>
    <a class="out" href="${esc(item.url)}" target="_blank" rel="noopener nofollow" data-i18n="outBtn"></a>`;

    await writeFile(path.join(distDir, "r", `${slug}.html`), pageShell({ title: `${item.title.slice(0, 60)} — globalhot.net`, bodyHtml: body, canonical: `https://globalhot.net/r/${slug}` }), "utf8");
    urls.push(`https://globalhot.net/r/${slug}`);
  }

  // ── 인물 페이지 /t/<id> ──
  await mkdir(path.join(distDir, "t"), { recursive: true });
  const nameOf = (m) => [m.name, m.altName].filter(Boolean);
  for (const m of models) {
    const related = ranking.top.filter((item) => {
      const hay = ` ${item.title.toLowerCase()} `;
      return nameOf(m).some((n) => n.length >= 3 && hay.includes(n.toLowerCase()));
    }).slice(0, 8);
    const photo = m.photoAvailable ? `/assets/profiles/${m.id}.jpg` : null;
    const sns = Object.entries(m.sns ?? {}).filter(([, v]) => v);
    const body = `
    <div class="person-head">
      ${photo ? `<img class="person-photo" src="${esc(photo)}" alt="${esc(m.name)}" loading="lazy">` : ""}
      <div>
        <h1 style="margin:0">${esc(m.name)}${m.altName ? ` <span style="font-size:14px;color:var(--muted)">${esc(m.altName)}</span>` : ""}</h1>
        <div style="color:var(--muted);font-size:13px;margin-top:4px">${esc(m.country ?? "")}</div>
        <div class="tags">${String(m.tags ?? "").split(/\s+/).filter(Boolean).map((t) => `<span class="rtag">#${esc(t)}</span>`).join(" ")}</div>
      </div>
    </div>
    ${m.bio ? `<div class="section" data-i18n="personsTitle"></div><p class="bio">${esc(m.bio)}</p>` : ""}
    <div class="sns">
      ${sns.map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener nofollow">${esc(k.toUpperCase())} ↗</a>`).join(" ")}
      ${m.officialUrl ? `<a href="${esc(m.officialUrl)}" target="_blank" rel="noopener nofollow">OFFICIAL ↗</a>` : ""}
    </div>
    <div class="section" data-i18n="latestTitle"></div>
    <ul class="related">
      ${related.length ? related.map((r) => `<a href="/r/${slugMap.get(r.url) ?? slugOf(r.url)}"><span class="rn">${r.rank}</span><span class="tt">${esc(r.title.slice(0, 90))}</span></a>`).join("") : `<li style="color:var(--muted);font-size:13px" data-i18n="noRelated"></li>`}
    </ul>
    <p style="margin-top:16px"><a href="/" style="color:var(--blue);font-size:13px" data-i18n="navRank"></a></p>`;

    await writeFile(path.join(distDir, "t", `${m.id}.html`), pageShell({ title: `${m.name} — 최신 화제 | globalhot.net`, bodyHtml: body, canonical: `https://globalhot.net/t/${m.id}` }), "utf8");
    urls.push(`https://globalhot.net/t/${m.id}`);
  }

  // ── 아카이브 페이지 /archive/weekly.html, /archive/monthly.html ──
  // history.jsonl 스냅샷을 URL별 집계: 평균 순위(낮을수록 상위) + 등장 횟수가 많은 항목 = 기간 내 최고 화제
  await mkdir(path.join(distDir, "archive"), { recursive: true });
  const rankedList = ranking.top; // 제목·썸네일 메타 소스
  for (const [dir, days] of [["weekly", 7], ["monthly", 30]]) {
    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    const acc = new Map(); // url -> {sum, count, best}
    for (const snap of history) {
      if (Date.parse(snap.ts) < cutoff) continue;
      for (const it of snap.items ?? []) {
        let a = acc.get(it.url);
        if (!a) {
          a = { sum: 0, count: 0, best: 999 };
          acc.set(it.url, a);
        }
        a.sum += it.rank;
        a.count++;
        a.best = Math.min(a.best, it.rank);
      }
    }
    const meta = new Map(rankedList.map((r) => [r.url, r]));
    const top = [...acc.entries()]
      .map(([url, a]) => ({ url, avg: a.sum / a.count, count: a.count, best: a.best, item: meta.get(url) }))
      .sort((x, y) => y.count * 60 - y.avg - (x.count * 60 - x.avg)) // 등장수 우선, 평균순위 보정
      .slice(0, 20);
    const body = `
    <h1>${days === 7 ? "주간" : "월간"} 화제 TOP 20</h1>
    <p style="color:var(--muted);font-size:13px;margin:6px 0 16px">${history.length}개 스냅샷 집계 (최근 ${days}일)</p>
    <ul class="related">
      ${top.length ? top.map((x, i) => `<a href="/r/${slugOf(x.url)}"><span class="rn">${i + 1}</span><span class="tt">${esc((x.item?.title ?? x.url).slice(0, 90))}<br><span style="color:var(--muted);font-size:11px">최고 ${x.best}위 · ${x.count}회 노출</span></span></a>`).join("") : `<li style="color:var(--muted);font-size:13px" data-i18n="noRelated"></li>`}
    </ul>
    <p style="margin-top:16px"><a href="/" style="color:var(--blue);font-size:13px" data-i18n="navRank"></a></p>`;
    await writeFile(path.join(distDir, "archive", `${dir}.html`), pageShell({ title: `${days === 7 ? "주간" : "월간"} 화제 TOP 20 — globalhot.net`, bodyHtml: body, canonical: `https://globalhot.net/archive/${dir}` }), "utf8");
    urls.push(`https://globalhot.net/archive/${dir}`);
  }
  const today = generated.slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod><changefreq>hourly</changefreq><priority>${u.includes("/t/") ? "0.6" : "0.8"}</priority></url>`).join("\n")}
</urlset>
`;
  await writeFile(path.join(distDir, "sitemap-pages.xml"), sitemap, "utf8");

  return { detailPages: ranking.top.length, personPages: models.length, sitemapUrls: urls.length };
}
