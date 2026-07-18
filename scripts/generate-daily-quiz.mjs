import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildDraftPrompt, createDailyQuiz, parseDraftResponse } from './quiz-core.mjs';

function atomicWriteJson(path, value) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

function quizContext(enriched) {
  return (Array.isArray(enriched) ? enriched : []).flatMap((category) => {
    return (Array.isArray(category?.posts) ? category.posts : []).map((post) => ({
      title: String(post?.title || '').trim().slice(0, 180),
      summary: String(post?.summary || post?.desc || '').trim().slice(0, 280),
      category: String(category?.id || category?.label || '').trim().slice(0, 40),
    }));
  }).filter((item) => item.title);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function updateHomepageQuiz(quiz, rootDir = process.cwd()) {
  const indexPath = join(rootDir, 'index.html');
  if (!existsSync(indexPath)) return false;
  let html = readFileSync(indexPath, 'utf8');
  const marker = /<!-- DAILY_QUIZ_START -->[\s\S]*?<!-- DAILY_QUIZ_END -->/;
  if (!marker.test(html)) {
    console.warn('[quiz] 홈페이지 퀴즈 마커가 없어 티저 갱신을 건너뜁니다.');
    return false;
  }
  const quizUrl = `/quiz/?date=${encodeURIComponent(quiz.date)}`;
  const block = `<!-- DAILY_QUIZ_START -->
    <section class="quiz-home-teaser" aria-labelledby="quiz-home-title">
      <div class="editorial-shell quiz-home-grid">
        <div class="quiz-home-copy">
          <p class="quiz-home-eyebrow">TODAY'S MARKET QUIZ · DAILY</p>
          <h2 id="quiz-home-title">${escapeHtml(quiz.title)}</h2>
          <p>${escapeHtml(quiz.dek)}</p>
          <ul class="quiz-home-facts" aria-label="퀴즈 정보">
            <li><strong>3</strong><span>문제</span></li>
            <li><strong>60</strong><span>초</span></li>
            <li><strong>0</strong><span>로그인</span></li>
          </ul>
        </div>
        <a class="quiz-home-cta" href="${quizUrl}" aria-label="오늘의 폭락 60초 퀴즈 시작">
          <span>오늘의 폭락 60초</span>
          <strong>바로 도전하기</strong>
          <b aria-hidden="true">→</b>
        </a>
      </div>
    </section>
    <!-- DAILY_QUIZ_END -->`;
  html = html.replace(marker, block);
  writeFileSync(indexPath, html, 'utf8');
  console.log(`[quiz] 홈페이지 티저 갱신: ${quiz.date}`);
  return true;
}

function recentFactIds(dataDir, date, days = 7) {
  if (!existsSync(dataDir)) return [];
  const cutoff = Date.parse(`${date}T00:00:00Z`) - days * 86400000;
  const ids = new Set();
  for (const file of readdirSync(dataDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))) {
    const fileDate = Date.parse(`${file.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(fileDate) || fileDate >= Date.parse(`${date}T00:00:00Z`) || fileDate < cutoff) continue;
    try {
      const quiz = JSON.parse(readFileSync(join(dataDir, file), 'utf8'));
      for (const question of quiz.questions || []) {
        if (typeof question.factId === 'string') ids.add(question.factId);
      }
    } catch (error) {
      console.warn(`[quiz] 최근 퀴즈 읽기 실패 ${file}: ${error.message}`);
    }
  }
  return [...ids];
}

async function requestGeminiDraft({ prompt, geminiKey, model, fetchImpl }) {
  if (!geminiKey) return null;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 2200,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt === 0) continue;
        console.warn(`[quiz] Gemini 초안 HTTP ${response.status}, 문제은행으로 대체`);
        return null;
      }
      const body = await response.json();
      const raw = body?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = parseDraftResponse(raw);
      if (!parsed) console.warn('[quiz] Gemini 초안 JSON 오류, 문제은행으로 대체');
      return parsed;
    } catch (error) {
      if (attempt === 0) continue;
      console.warn(`[quiz] Gemini 초안 실패, 문제은행으로 대체: ${error.message}`);
      return null;
    }
  }
  return null;
}

export async function generateDailyQuizFiles({
  date,
  enriched = [],
  geminiKey = '',
  model = 'gemini-3.1-flash-lite',
  rootDir = process.cwd(),
  fetchImpl = fetch,
}) {
  const bankPath = join(rootDir, 'quiz', 'bank', 'concepts.json');
  const dataDir = join(rootDir, 'quiz', 'data');
  const bank = JSON.parse(readFileSync(bankPath, 'utf8'));
  const context = quizContext(enriched);
  const usedRecently = recentFactIds(dataDir, date);
  const prompt = buildDraftPrompt({ date, bank, context, recentFactIds: usedRecently });
  const draftResponse = await requestGeminiDraft({ prompt, geminiKey, model, fetchImpl });
  const quiz = createDailyQuiz({ date, bank, context, draftResponse, recentFactIds: usedRecently });

  mkdirSync(dataDir, { recursive: true });
  atomicWriteJson(join(dataDir, `${date}.json`), quiz);
  atomicWriteJson(join(dataDir, 'latest.json'), {
    date,
    quizId: quiz.id,
    dataUrl: `./data/${date}.json`,
    generatedAt: new Date().toISOString(),
  });
  updateHomepageQuiz(quiz, rootDir);
  console.log(`[quiz] ${date} 퀴즈 생성: ${quiz.mode}, ${quiz.questions.map((item) => item.factId).join(', ')}`);
  return quiz;
}

export async function ensureDailyQuizFiles({ date, rootDir = process.cwd() }) {
  const dataDir = join(rootDir, 'quiz', 'data');
  const dailyPath = join(dataDir, `${date}.json`);
  if (existsSync(dailyPath)) {
    try {
      const quiz = JSON.parse(readFileSync(dailyPath, 'utf8'));
      if (quiz.date === date && typeof quiz.id === 'string' && Array.isArray(quiz.questions) && quiz.questions.length === 3) {
        atomicWriteJson(join(dataDir, 'latest.json'), {
          date,
          quizId: quiz.id,
          dataUrl: `./data/${date}.json`,
          generatedAt: new Date().toISOString(),
        });
        updateHomepageQuiz(quiz, rootDir);
        console.log(`[quiz] 기존 ${date} 퀴즈 유지, latest.json 확인 완료`);
        return quiz;
      }
    } catch (error) {
      console.warn(`[quiz] 기존 ${date} 파일 검증 실패, 문제은행으로 다시 생성: ${error.message}`);
    }
  }
  return generateDailyQuizFiles({ date, rootDir });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const kst = new Date(Date.now() + 9 * 3600000);
  const date = process.env.QUIZ_DATE || kst.toISOString().slice(0, 10);
  ensureDailyQuizFiles({ date }).catch((error) => {
    console.error(`[quiz] 독립 발행 실패: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}
