// AI 요약 생성기 — rank-hourly 워크플로우에서 collect 후 실행 (GEMINI_API_KEY 필요).
// ranking.json TOP 항목 중 요약 없는 신규 URL만 Gemini 로 요약 (ko/en/ja) → rank/data/summaries.json 캐시.
// 키가 없으면 스킵 (로컬 빌드 영향 없음). 캐시는 500개로 트림.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..", "..");
const RANKING_PATH = path.join(projectRoot, "rank", "data", "ranking.json");
const OUT_PATH = path.join(projectRoot, "rank", "data", "summaries.json");

const MAX_NEW = 20; // 실행당 신규 요약 한도 (비용/레이트 보호)
const CACHE_MAX = 500;

async function callGemini(apiKey, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {}
    }
    return null;
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const ranking = JSON.parse(await readFile(RANKING_PATH, "utf8"));
  let cache = {};
  try {
    cache = JSON.parse(await readFile(OUT_PATH, "utf8"));
  } catch {
    /* 최초 */
  }

  const targets = ranking.top.filter((t) => !cache[t.url]).slice(0, MAX_NEW);
  if (!targets.length) {
    console.log("summaries: no new items");
    return;
  }
  if (!apiKey) {
    console.log(`summaries: GEMINI_API_KEY 없음 — ${targets.length}건 스킵 (템플릿 폴백 사용)`);
    return;
  }

  let ok = 0;
  for (const item of targets) {
    const prompt = `아래는 화제 랭킹 사이트의 항목이다. 왜 화제인지 1~2문장으로 요약해 3개 언어(JSON)로 답하라. 사실 과장 금지, 제목 정보만 근거. 키워드: ${JSON.stringify({
      title: item.title.slice(0, 150),
      sources: item.sources,
      categories: item.categories,
      publishedAt: item.publishedAt,
    })}
출력 형식: {"ko":"...","en":"...","ja":"..."}`;
    try {
      const text = await callGemini(apiKey, prompt);
      const parsed = parseJsonLoose(text);
      if (parsed?.ko && parsed?.en && parsed?.ja) {
        cache[item.url] = { ko: parsed.ko, en: parsed.en, ja: parsed.ja, ts: new Date().toISOString() };
        ok++;
      } else {
        console.warn(`[skip] parse failed: ${item.url}`);
      }
    } catch (e) {
      console.warn(`[skip] ${item.url}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500)); // 레이트 완충
  }

  // 캐시 트림 (최근 순 500)
  const entries = Object.entries(cache).sort((a, b) => (b[1].ts ?? "").localeCompare(a[1].ts ?? "")).slice(0, CACHE_MAX);
  await writeFile(OUT_PATH, JSON.stringify(Object.fromEntries(entries), null, 2) + "\n", "utf8");
  console.log(`summaries: +${ok}/${targets.length} (cache ${entries.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
