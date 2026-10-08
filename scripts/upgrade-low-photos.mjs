// 저해상도 프로필 사진 업그레이드 + 무사진 모델 커버리지 탐색.
//
// 동작:
//   1) assets/profiles/*.jpg 중 MIN(600x800) 미만 파일의 모델을 찾는다
//      (--missing 면 photoAvailable=false 모델 전체).
//   2) Wikimedia Commons에서 이름/altName으로 후보를 검색하고,
//      AGENTS.md 사진 검증 규칙(풀네임 연속 토큰, 정순/역순)을 적용한다.
//   3) CC 라이선스 + 최소 해상도를 통과한 최고 화소 후보를 1280px 썸네일로
//      받아 sharp로 JPEG 재인코딩(q88) 후 게이트(photo-quality)를 재검증한다.
//   4) models.json의 license/creditText/creditUrl을 실제 파일 기준으로 갱신하고,
//      --missing이면 photoAvailable=true로 바꾼다.
//
// 사용:
//   node scripts/upgrade-low-photos.mjs              # 저해상도 리포트만
//   node scripts/upgrade-low-photos.mjs --apply      # 실제 반영
//   node scripts/upgrade-low-photos.mjs --missing    # 무사진 87명 탐색 리포트
//   node scripts/upgrade-low-photos.mjs --missing --apply

import { readFile, writeFile, rename, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { imageDimensions, dimensionsMeetMin, MIN_WIDTH, MIN_HEIGHT } from "./photo-quality.mjs";

const UA = { "User-Agent": "globalhot-pipeline/1.0 (globalhot.net)" };
const TARGET_WIDTH = 1280; // 모달 500px·og:image 640px의 retina 상한
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const profilesDir = path.join(root, "assets", "profiles");
const cachePath = path.join(root, "data", ".photo-candidates-cache.json");
const apply = process.argv.includes("--apply");
const missingMode = process.argv.includes("--missing");

// Commons API 스로틀 대응: 비-JSON 응답(429/HTML)이면 대기 후 1회 재시도.
let cache = {};
try { cache = JSON.parse(await readFile(cachePath, "utf8")); } catch { cache = {}; }
const saveCache = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => writeFileAtomic(cachePath, JSON.stringify(cache)).catch(() => {}), 500); }; })();

async function commonsApi(params) {
  const url = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: 2, ...params });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(url, { headers: UA });
    const text = await res.text();
    if (text.startsWith("{")) return JSON.parse(text);
    if (attempt === 0) { console.log("    (스로틀 대기 30s)"); await sleep(30000); }
  }
  throw new Error("commons api throttled");
}

async function searchCandidates(name, altName) {
  const queries = [name, altName].filter(Boolean);
  const titles = new Set();
  for (const q of queries) {
    const key = `search:${q}`;
    let found = cache[key];
    if (!found) {
      try {
        const json = await commonsApi({ action: "query", list: "search", srsearch: `${q} filetype:bitmap`, srnamespace: 6, srlimit: 12 });
        found = (json?.query?.search || []).map((s) => s.title);
        cache[key] = found; saveCache();
      } catch { found = []; }
      await sleep(1100);
    }
    for (const t of found || []) titles.add(t);
  }
  return [...titles];
}

async function writeFileAtomic(p, contents) {
  const tmp = `${p}.tmp`;
  await writeFile(tmp, contents);
  await rename(tmp, p);
}

// AGENTS.md: 풀네임 전체가 제목에 연속 토큰으로(정순 또는 성-이름 역순) 등장해야 한다.
function nameTokensContain(title, name, altName) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const t = norm(title.replace(/^File:/i, ""));
  if (altName && t.includes(norm(altName))) return true;
  const tokens = norm(name).split(" ").filter(Boolean);
  if (!tokens.length) return false;
  if (tokens.length === 1) return t.includes(tokens[0]);
  return t.includes(tokens.join(" ")) || t.includes([...tokens].reverse().join(" "));
}

function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

async function fileInfo(title) {
  const key = `info:${title}`;
  if (cache[key]) return cache[key];
  const json = await commonsApi({
    action: "query", titles: title, prop: "imageinfo",
    iiprop: "url|size|extmetadata", iiurlwidth: TARGET_WIDTH,
  });
  const page = json?.query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!info) { cache[key] = null; saveCache(); return null; }
  const meta = info.extmetadata || {};
  const license = stripHtml(meta.LicenseShortName?.value) || "";
  const result = {
    title, width: info.width, height: info.height,
    thumburl: info.thumburl || info.url,
    descriptionurl: info.descriptionurl || "",
    artist: stripHtml(meta.Artist?.value),
    license,
    isFree: /^cc\b/i.test(license) || /public domain|pd\b/i.test(license),
  };
  cache[key] = result; saveCache();
  await sleep(700);
  return result;
}

// 게이트: 세로형 600x800 이상, 또는 가로형도 허용(500px 이상 양변 + 0.5MP).
function meetsMin(f) {
  return (f.width >= MIN_WIDTH && f.height >= MIN_HEIGHT) ||
    (f.width >= 500 && f.height >= 500 && f.width * f.height >= 500000);
}

// 게이트: 이름 검증 + 자유 라이선스 + 최소 해상도. 최고 화소순.
// 제목에 이런 단어가 있으면 인물 사진이 아니다(사인·인형·로고 등 실제 사고 사례).
const BAD_TITLE = /signature|autograph|logo|statue|wax|figure\b|madame tussauds|graffiti|mural|montage|サイン|署名|直筆/i;

async function pickBest(model, candidates) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const nameTokens = norm(model.name).split(" ").filter(Boolean);
  const verified = candidates.filter((t) => {
    if (BAD_TITLE.test(t)) return false;
    if (nameTokens.length < 2) {
      // 단일 토큰 이름(예: Kyoka)은 동음이의어 위험이 커서 altName(CJK) 정확
      // 포함일 때만 인정한다(시가집 狂歌 같은 오매칭 방지).
      return Boolean(model.altName) && norm(t).includes(norm(model.altName));
    }
    return nameTokensContain(t, model.name, model.altName);
  });
  if (!verified.length) return { reason: "no name-verified candidate" };
  const infos = [];
  for (const t of verified.slice(0, 6)) {
    try { const fi = await fileInfo(t); if (fi) infos.push(fi); } catch { /* skip */ }
  }
  const free = infos.filter((f) => f.isFree);
  if (!free.length) return { reason: `no free-license candidate (${infos.length} verified)` };
  const bigEnough = free.filter(meetsMin);
  if (!bigEnough.length) {
    const best = free.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    return { reason: `best free candidate only ${best.width}x${best.height}` };
  }
  return { pick: bigEnough.sort((a, b) => b.width * b.height - a.width * a.height)[0] };
}

async function downloadAndEncode(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return sharp(buf)
    .rotate() // EXIF 방향 자동 반영
    .resize({ width: TARGET_WIDTH, height: TARGET_WIDTH * 1.5, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

// ── 대상 수집 ──
const modelsData = JSON.parse(await readFile(path.join(root, "data", "models.json"), "utf8"));
const models = modelsData.models;

let targets;
if (missingMode) {
  targets = models.filter((m) => m.photoAvailable === false && (m.bio || "").trim().length >= 20);
} else {
  const ids = new Set();
  for (const f of (await readdir(profilesDir)).filter((f) => f.endsWith(".jpg"))) {
    const dim = imageDimensions(await readFile(path.join(profilesDir, f)));
    if (!dim || !dimensionsMeetMin(dim)) ids.add(f.replace(/\.jpg$/, ""));
  }
  targets = models.filter((m) => ids.has(m.id));
}

console.log(`대상 ${targets.length}명 (${missingMode ? "무사진" : "저해상도"} · ${apply ? "APPLY" : "dry-run"})\n`);

const upgraded = [], skipped = [];
for (const m of targets) {
  const candidates = await searchCandidates(m.name, m.altName);
  const result = await pickBest(m, candidates);
  if (!result.pick) {
    skipped.push({ id: m.id, reason: result.reason });
    console.log(`  ✗ ${m.id}: ${result.reason}`);
    continue;
  }
  const p = result.pick;
  try {
    const encoded = await downloadAndEncode(p.thumburl);
    const dim0 = imageDimensions(encoded);
    const enough = dim0 && dim0.w >= 500 && dim0.h >= 500 && dim0.w * dim0.h >= 500000;
    const issue = enough ? null : `encoded ${dim0 ? dim0.w + "x" + dim0.h : "?"} below effective minimum`;
    if (issue) { skipped.push({ id: m.id, reason: issue }); console.log(`  ✗ ${m.id}: ${issue}`); continue; }
    const dim = imageDimensions(encoded);
    if (!apply) {
      console.log(`  [dry] ${m.id}: ${p.title} (${p.width}x${p.height}, ${p.license}) -> ${dim.w}x${dim.h} ${Math.round(encoded.length / 1024)}KB`);
      continue;
    }
    await writeFileAtomic(path.join(profilesDir, `${m.id}.jpg`), encoded);
    const model = models.find((x) => x.id === m.id);
    model.license = p.license || model.license;
    model.creditText = p.artist || "Wikimedia Commons";
    model.creditUrl = p.descriptionurl || model.creditUrl;
    if (missingMode) model.photoAvailable = true;
    upgraded.push(m.id);
    console.log(`  ✓ ${m.id}: ${p.title} (${p.width}x${p.height}, ${p.license}) -> ${dim.w}x${dim.h} ${Math.round(encoded.length / 1024)}KB`);
  } catch (e) {
    skipped.push({ id: m.id, reason: e.message });
    console.log(`  ✗ ${m.id}: ${e.message}`);
  }
  await sleep(400);
}

if (apply && upgraded.length) {
  await writeFileAtomic(path.join(root, "data", "models.json"), JSON.stringify(modelsData, null, 2) + "\n");
}

console.log(`\n완료: 업그레이드 ${upgraded.length} · 건너뜀 ${skipped.length}`);
