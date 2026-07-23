import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const DIRECT_ADVICE = /지금\s*(사|매수)|매수하라|매도하라|분할\s*매수\s*(하|가)|비중을\s*(늘려|줄여|높여|낮춰)|포지션을\s*(늘려|줄여)|수익을\s*보장/i;

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function requireRule(condition, message) {
  if (!condition) failures.push(message);
}

const index = read('index.html');
const about = read('about.html');
const sources = read('sources.html');
const quiz = read('quiz/index.html');
const sitemap = read('sitemap.xml');
const workflow = read('.github/workflows/daily-post.yml');
const quarantinedPages = [
  ...readdirSync(root).filter((name) => /^analysis-.*\.html$/.test(name)),
  'guide.html',
  'market-indicators.html',
  'investing-guide.html',
  'etf-guide.html',
  'fed-rate.html',
  'forex.html',
  'recession.html',
  'portfolio.html',
];

requireRule(index.includes('거리의악사'), '홈페이지에 책임 편집자 이름이 없습니다.');
requireRule(!index.includes('href="/quiz/"'), '홈페이지에 검토 중인 퀴즈 링크가 남아 있습니다.');
requireRule(!index.includes('오늘의 경제·시장 브리핑'), '홈페이지에 오래된 오늘 브리핑 표현이 남아 있습니다.');
requireRule((index.match(/class="rank-cell"/g) || []).length === 5, '홈페이지의 Global Hot 5 순위가 완성되지 않았습니다.');
requireRule((index.match(/class="why-hot"/g) || []).length === 5, 'Hot 5 항목의 한국 영향 설명이 부족합니다.');
requireRule((index.match(/class="rank-sources"/g) || []).length === 5, 'Hot 5 항목의 근거 링크 묶음이 부족합니다.');
requireRule(!index.includes('EDITORIAL TRUST') && !index.includes('글보다 먼저'), '홈페이지에 심사 대응형 홍보 문구가 다시 노출됐습니다.');
requireRule(about.includes('id="editor"'), '소개 페이지에 편집자 프로필 앵커가 없습니다.');
requireRule(about.includes('AI') && about.includes('초안'), 'AI 보조 작성 원칙이 공개되지 않았습니다.');
requireRule(!about.includes('pagead2.googlesyndication.com'), '소개 페이지에 광고 코드가 남아 있습니다.');
requireRule(!sources.includes('pagead2.googlesyndication.com'), '출처 페이지에 광고 코드가 남아 있습니다.');
requireRule(/name="robots" content="noindex, nofollow"/i.test(quiz), '퀴즈 페이지가 noindex가 아닙니다.');
requireRule(!quiz.includes('pagead2.googlesyndication.com'), '퀴즈 페이지에 광고 코드가 남아 있습니다.');
requireRule(!sitemap.includes('/quiz/'), '사이트맵에 퀴즈 URL이 남아 있습니다.');
requireRule(workflow.includes("cron: '30 21 * * 1,4'"), '발행 초안 일정이 주 2회가 아닙니다.');
requireRule(workflow.includes('gh pr create'), '자동 공개 대신 PR을 만드는 단계가 없습니다.');
for (const file of quarantinedPages) {
  const html = read(file);
  requireRule(/name="robots" content="noindex, nofollow"/i.test(html), `${file}: 검토 전 콘텐츠가 noindex가 아닙니다.`);
  requireRule(!html.includes('pagead2.googlesyndication.com'), `${file}: 검토 전 콘텐츠에 광고 코드가 남아 있습니다.`);
  requireRule(!sitemap.includes(`/${file}`), `${file}: 검토 전 콘텐츠가 사이트맵에 남아 있습니다.`);
  requireRule(!index.includes(`href="/${file}"`), `${file}: 검토 전 콘텐츠가 홈페이지에 노출됩니다.`);
}

const htmlFiles = readdirSync(root)
  .filter((name) => name.endsWith('.html'))
  .concat(readdirSync(join(root, 'posts')).filter((name) => name.endsWith('.html')).map((name) => `posts/${name}`));
for (const file of htmlFiles) {
  requireRule(!read(file).includes('GlobalHot 운영자'), `${file}: 이전 작성자 표기가 남아 있습니다.`);
}

for (const file of readdirSync(join(root, 'posts')).filter((name) => name.endsWith('.html') && name !== 'index.html')) {
  const html = read(`posts/${file}`);
  if (/^\d{4}-\d{2}-\d{2}\.html$/.test(file)) {
    requireRule(/name="robots" content="noindex, nofollow"/i.test(html), `${file}: 이전 자동 브리핑이 noindex가 아닙니다.`);
    requireRule(!html.includes('pagead2.googlesyndication.com'), `${file}: 이전 자동 브리핑에 광고 코드가 남아 있습니다.`);
    requireRule(!sitemap.includes(`/posts/${file}`), `${file}: 이전 자동 브리핑이 사이트맵에 남아 있습니다.`);
  }
  if (/name="robots" content="[^"]*noindex/i.test(html)) continue;
  requireRule(html.includes('"@type": "Person"') && html.includes('"name": "거리의악사"'), `${file}: 책임 편집자 구조화 데이터가 없습니다.`);
  requireRule(html.includes('자동화 도구를 사용했습니다'), `${file}: 자동화 보조 사실을 공개하지 않았습니다.`);
  requireRule(html.includes('EDITORIAL_REVIEW_REQUIRED'), `${file}: 사람 검토 게이트 표시가 없습니다.`);
  requireRule((html.match(/class="source-notes"/g) || []).length >= 4, `${file}: 문단별 근거 링크가 부족합니다.`);
  requireRule(!DIRECT_ADVICE.test(html.replace(/<[^>]+>/g, ' ')), `${file}: 직접 투자 행동 지시가 포함되어 있습니다.`);
}

if (failures.length) {
  console.error(`편집 품질 검사 실패 (${failures.length}건)`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('편집 품질 검사 통과: 작성자, 발행 일정, 광고, 색인, PR 승인 구조를 확인했습니다.');
