const LATEST_MANIFEST_URL = './data/latest.json';
const FALLBACK_QUIZ_DATE = '2026-07-18';
const HISTORY_KEY = 'gh-quiz-history-v1';
const PUBLIC_SAMPLE_MINIMUM = 30;

const elements = {
  edition: document.getElementById('quizEdition'),
  title: document.getElementById('quiz-title'),
  dek: document.getElementById('quizDek'),
  step: document.getElementById('quizStep'),
  timer: document.getElementById('quizTimer'),
  startPanel: document.getElementById('startPanel'),
  startButton: document.getElementById('startButton'),
  retryButton: document.getElementById('retryButton'),
  loadError: document.getElementById('loadError'),
  questionSection: document.getElementById('questionSection'),
  questionNumber: document.getElementById('questionNumber'),
  questionPrompt: document.getElementById('questionPrompt'),
  choiceList: document.getElementById('choiceList'),
  answerStatus: document.getElementById('answerStatus'),
  progressBar: document.getElementById('progressBar'),
  resultSection: document.getElementById('resultSection'),
  resultScore: document.getElementById('resultScore'),
  resultKicker: document.getElementById('resultKicker'),
  resultTitle: document.getElementById('resultTitle'),
  resultMeta: document.getElementById('resultMeta'),
  crowdSummary: document.getElementById('crowdSummary'),
  explanationList: document.getElementById('explanationList'),
  shareImageButton: document.getElementById('shareImageButton'),
  shareXButton: document.getElementById('shareXButton'),
  copyResultButton: document.getElementById('copyResultButton'),
  retryQuizButton: document.getElementById('retryQuizButton'),
  shareStatus: document.getElementById('shareStatus'),
  sourceList: document.getElementById('sourceList'),
  disclaimer: document.getElementById('quizDisclaimer'),
  cookieBanner: document.getElementById('cookieBanner'),
  cookieAccept: document.getElementById('cookieAccept')
};

const state = {
  quiz: null,
  currentIndex: 0,
  answers: [],
  answerLocked: false,
  startedAt: 0,
  timerId: 0,
  elapsedSeconds: 0,
  score: 0,
  streak: 0,
  answerStats: []
};

function track(eventName, params = {}) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, {
      quiz_id: state.quiz?.id || 'unknown',
      quiz_date: state.quiz?.date || 'unknown',
      ...params
    });
  }
}

function validateQuiz(data) {
  if (!data || typeof data !== 'object') throw new Error('퀴즈 데이터가 없습니다.');
  if (typeof data.id !== 'string' || typeof data.date !== 'string') throw new Error('퀴즈 식별자가 없습니다.');
  if (!Array.isArray(data.questions) || data.questions.length !== 3) throw new Error('퀴즈는 정확히 3문제여야 합니다.');
  data.questions.forEach((question) => {
    if (typeof question.id !== 'string' || !/^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]{2,80}$/.test(question.id)) {
      throw new Error('문항 식별자가 올바르지 않습니다.');
    }
    if (typeof question.prompt !== 'string') throw new Error('문항이 올바르지 않습니다.');
    if (!Array.isArray(question.choices) || question.choices.length < 2) throw new Error('선택지가 올바르지 않습니다.');
    if (!Number.isInteger(question.answerIndex) || question.answerIndex < 0 || question.answerIndex >= question.choices.length) {
      throw new Error('정답 번호가 올바르지 않습니다.');
    }
    if (typeof question.explanation !== 'string') throw new Error('해설이 없습니다.');
  });
  return data;
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '');
}

async function resolveQuizDataUrl() {
  const requestedDate = new URLSearchParams(location.search).get('date');
  if (isDate(requestedDate)) return `./data/${requestedDate}.json`;

  try {
    const response = await fetch(LATEST_MANIFEST_URL, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const manifest = await response.json();
    const match = typeof manifest?.dataUrl === 'string'
      ? manifest.dataUrl.match(/^\.\/data\/(\d{4}-\d{2}-\d{2})\.json$/)
      : null;
    if (!match || !isDate(manifest.date) || match[1] !== manifest.date) throw new Error('invalid manifest');
    return manifest.dataUrl;
  } catch (error) {
    console.warn('[quiz] latest manifest failed, using fallback', error);
    return `./data/${FALLBACK_QUIZ_DATE}.json`;
  }
}

async function loadQuiz() {
  elements.startButton.disabled = true;
  elements.loadError.hidden = true;
  try {
    const dataUrl = await resolveQuizDataUrl();
    const response = await fetch(dataUrl, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    state.quiz = validateQuiz(await response.json());
    state.answerStats = [];
    renderQuizHeader();
    renderSources();
    await initializeTextLayout();
    elements.startButton.disabled = false;
  } catch (error) {
    console.error('[quiz] load failed', error);
    elements.edition.textContent = 'QUIZ LOAD ERROR';
    elements.title.textContent = '퀴즈를 불러오지 못했습니다';
    elements.dek.textContent = '연결 상태를 확인하고 다시 시도해주세요.';
    elements.loadError.hidden = false;
  }
}

function renderQuizHeader() {
  elements.edition.textContent = state.quiz.editionLabel;
  elements.title.textContent = state.quiz.title;
  elements.dek.textContent = state.quiz.dek;
  elements.disclaimer.textContent = state.quiz.disclaimer;
}

function renderSources() {
  elements.sourceList.replaceChildren();
  for (const source of state.quiz.sources || []) {
    let url;
    try {
      url = new URL(source.url);
      if (url.protocol !== 'https:') continue;
    } catch {
      continue;
    }
    const item = document.createElement('li');
    const content = document.createElement('div');
    const link = document.createElement('a');
    const note = document.createElement('small');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = source.label;
    note.textContent = source.note;
    content.append(link, note);
    item.append(content);
    elements.sourceList.append(item);
  }
}

function startQuiz() {
  if (!state.quiz) return;
  clearInterval(state.timerId);
  state.currentIndex = 0;
  state.answers = [];
  state.answerLocked = false;
  state.startedAt = Date.now();
  state.elapsedSeconds = 0;
  state.score = 0;
  state.answerStats = [];
  elements.startPanel.hidden = true;
  elements.resultSection.hidden = true;
  elements.questionSection.hidden = false;
  elements.timer.classList.remove('is-overtime');
  elements.timer.textContent = '60초';
  elements.shareStatus.textContent = '';
  state.timerId = window.setInterval(updateTimer, 250);
  updateTimer();
  renderQuestion();
  track('quiz_start');
  elements.questionSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateTimer() {
  if (!state.startedAt) return;
  state.elapsedSeconds = Math.floor((Date.now() - state.startedAt) / 1000);
  const remaining = 60 - state.elapsedSeconds;
  if (remaining >= 0) {
    elements.timer.textContent = remaining + '초';
    elements.timer.setAttribute('aria-label', '남은 시간 ' + remaining + '초');
  } else {
    elements.timer.textContent = '+' + Math.abs(remaining) + '초';
    elements.timer.classList.add('is-overtime');
    elements.timer.setAttribute('aria-label', '목표 시간보다 ' + Math.abs(remaining) + '초 초과');
  }
}

function renderQuestion() {
  const question = state.quiz.questions[state.currentIndex];
  const total = state.quiz.questions.length;
  state.answerLocked = false;
  elements.step.textContent = (state.currentIndex + 1) + ' / ' + total;
  elements.questionNumber.textContent = 'QUESTION ' + String(state.currentIndex + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
  elements.questionPrompt.textContent = question.prompt;
  elements.answerStatus.textContent = '';
  elements.progressBar.style.width = (state.currentIndex / total * 100) + '%';
  elements.choiceList.replaceChildren();

  question.choices.forEach((choice, choiceIndex) => {
    const button = document.createElement('button');
    const index = document.createElement('span');
    const label = document.createElement('span');
    button.type = 'button';
    button.className = 'choice-button';
    button.dataset.choiceIndex = String(choiceIndex);
    index.className = 'choice-index';
    index.textContent = String(choiceIndex + 1).padStart(2, '0');
    label.textContent = choice;
    button.append(index, label);
    button.addEventListener('click', () => selectChoice(choiceIndex, button));
    elements.choiceList.append(button);
  });

  requestAnimationFrame(() => elements.questionPrompt.focus({ preventScroll: true }));
}

function selectChoice(choiceIndex, selectedButton) {
  if (state.answerLocked) return;
  state.answerLocked = true;
  const question = state.quiz.questions[state.currentIndex];
  state.answers[state.currentIndex] = choiceIndex;
  elements.choiceList.querySelectorAll('button').forEach((button) => {
    button.disabled = true;
    button.classList.toggle('is-selected', button === selectedButton);
  });
  elements.answerStatus.textContent = '선택했습니다. 다음 문제로 이동합니다.';
  track('quiz_answer', {
    question_number: state.currentIndex + 1,
    is_correct: choiceIndex === question.answerIndex
  });
  void recordAnswer(question, choiceIndex, state.currentIndex);

  window.setTimeout(() => {
    state.currentIndex += 1;
    if (state.currentIndex < state.quiz.questions.length) {
      renderQuestion();
    } else {
      finishQuiz();
    }
  }, 480);
}

async function recordAnswer(question, choiceIndex, questionIndex) {
  try {
    const response = await fetch('/api/quiz-answer', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        quizId: state.quiz.id,
        questionId: question.id,
        choiceIndex
      })
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const stats = await response.json();
    const validCounts = stats.choiceCounts === null
      || (Array.isArray(stats.choiceCounts)
        && stats.choiceCounts.length === 3
        && stats.choiceCounts.every((count) => Number.isInteger(count) && count >= 0));
    if (!Number.isInteger(stats.total) || !validCounts) throw new Error('invalid stats');
    state.answerStats[questionIndex] = stats;
    track('quiz_answer_aggregated', {
      question_number: questionIndex + 1,
      sample_size: stats.total,
      duplicate: Boolean(stats.duplicate)
    });
    if (!elements.resultSection.hidden) {
      renderCrowdSummary();
      renderExplanations();
    }
  } catch (error) {
    console.warn('[quiz] answer stats unavailable', error);
  }
}

function finishQuiz() {
  clearInterval(state.timerId);
  updateTimer();
  elements.progressBar.style.width = '100%';
  state.score = state.quiz.questions.reduce((score, question, index) => {
    return score + (state.answers[index] === question.answerIndex ? 1 : 0);
  }, 0);
  state.streak = saveCompletion(state.quiz.date, state.score, state.elapsedSeconds);
  elements.questionSection.hidden = true;
  renderResult();
  elements.resultSection.hidden = false;
  track('quiz_complete', {
    score: state.score,
    elapsed_seconds: state.elapsedSeconds,
    overtime: state.elapsedSeconds > 60
  });
  requestAnimationFrame(() => {
    elements.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    elements.resultTitle.focus({ preventScroll: true });
  });
}

function resultMessage(score) {
  if (score === 3) return '변동성을 방향으로 착각하지 않았습니다.';
  if (score === 2) return '핵심은 잡았습니다. 틀린 한 문제만 확인하세요.';
  return '한 지표로 방향을 단정하지 않는 연습이 필요합니다.';
}

function renderResult() {
  elements.resultScore.textContent = state.score + '/' + state.quiz.questions.length;
  elements.resultKicker.textContent = state.elapsedSeconds <= 60 ? '60초 안에 완료' : '끝까지 완료';
  elements.resultTitle.textContent = resultMessage(state.score);
  elements.resultMeta.textContent = state.elapsedSeconds + '초 완료 · 연속 ' + state.streak + '일 · 기록은 이 기기에만 저장';
  elements.step.textContent = '완료';
  renderCrowdSummary();
  renderExplanations();
}

function correctRate(stats, answerIndex) {
  if (!stats || stats.total < PUBLIC_SAMPLE_MINIMUM || !Array.isArray(stats.choiceCounts)) return null;
  const correctCount = Number(stats.choiceCounts?.[answerIndex]) || 0;
  return Math.round(correctCount / stats.total * 100);
}

function renderCrowdSummary() {
  const rates = state.quiz.questions.map((question, index) => ({
    index,
    rate: correctRate(state.answerStats[index], question.answerIndex),
    total: state.answerStats[index]?.total || 0
  })).filter((item) => item.rate !== null);
  if (rates.length === 0) {
    elements.crowdSummary.textContent = '참여자 정답률은 문항별 30명부터 공개됩니다.';
    return;
  }
  const hardest = rates.reduce((lowest, item) => item.rate < lowest.rate ? item : lowest);
  elements.crowdSummary.textContent = `가장 어려운 문제는 ${hardest.index + 1}번 · 참여자 정답률 ${hardest.rate}% (${hardest.total}명)`;
}

function renderExplanations() {
  elements.explanationList.replaceChildren();
  state.quiz.questions.forEach((question, index) => {
    const userIndex = state.answers[index];
    const isCorrect = userIndex === question.answerIndex;
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const number = document.createElement('span');
    const title = document.createElement('span');
    const status = document.createElement('span');
    const body = document.createElement('div');
    const answer = document.createElement('p');
    const explanation = document.createElement('p');
    const crowd = document.createElement('p');

    details.className = 'explanation-item';
    details.open = !isCorrect;
    number.className = 'explanation-number';
    title.className = 'explanation-title';
    status.className = 'explanation-state ' + (isCorrect ? 'is-correct' : 'is-wrong');
    body.className = 'explanation-body';
    answer.className = 'explanation-answer';
    crowd.className = 'explanation-crowd';

    number.textContent = String(index + 1).padStart(2, '0');
    title.textContent = question.prompt;
    status.textContent = isCorrect ? '정답' : '오답';
    answer.textContent = '정답: ' + question.choices[question.answerIndex];
    explanation.textContent = question.explanation;
    const rate = correctRate(state.answerStats[index], question.answerIndex);
    crowd.textContent = rate === null
      ? '참여 데이터 집계 중 · 30명부터 정답률 공개'
      : `참여자 정답률 ${rate}% · ${state.answerStats[index].total}명`;
    summary.append(number, title, status);
    body.append(answer, explanation, crowd);
    details.append(summary, body);
    elements.explanationList.append(details);
  });
}

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function saveCompletion(date, score, elapsedSeconds) {
  const history = readHistory();
  history[date] = {
    score,
    elapsedSeconds,
    completedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    return 1;
  }
  return calculateStreak(Object.keys(history));
}

function calculateStreak(dates) {
  const sorted = dates
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort()
    .reverse();
  if (sorted.length === 0) return 0;
  let streak = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = Date.parse(sorted[index - 1] + 'T00:00:00Z');
    const current = Date.parse(sorted[index] + 'T00:00:00Z');
    if (previous - current !== 86400000) break;
    streak += 1;
  }
  return streak;
}

function shareUrl() {
  const url = new URL('https://globalhot.net/quiz/');
  url.searchParams.set('date', state.quiz.date);
  url.searchParams.set('utm_source', 'share');
  url.searchParams.set('utm_medium', 'quiz_result');
  url.searchParams.set('utm_campaign', state.quiz.id);
  return url.href;
}

function shareText(includeUrl = true) {
  const rates = state.quiz.questions.map((question, index) => ({
    index,
    rate: correctRate(state.answerStats[index], question.answerIndex)
  })).filter((item) => item.rate !== null);
  const hardest = rates.length ? rates.reduce((lowest, item) => item.rate < lowest.rate ? item : lowest) : null;
  return 'GlobalHot 오늘의 폭락 60초\n' +
    state.quiz.title + '\n' +
    state.score + '/' + state.quiz.questions.length + ' 정답 · ' + state.elapsedSeconds + '초\n' +
    (hardest ? `가장 어려운 ${hardest.index + 1}번, 참여자 정답률 ${hardest.rate}%\n` : '') +
    (includeUrl ? shareUrl() : '');
}

function shareOnX() {
  const url = new URL('https://x.com/intent/post');
  url.searchParams.set('text', shareText(false));
  url.searchParams.set('url', shareUrl());
  window.open(url.href, '_blank', 'noopener,noreferrer');
  elements.shareStatus.textContent = 'X 공유 창을 열었습니다.';
  track('quiz_share', { method: 'x_intent', score: state.score });
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = [...text];
  let line = '';
  let lines = 0;
  for (let index = 0; index < words.length; index += 1) {
    const testLine = line + words[index];
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, y + lines * lineHeight);
      line = words[index];
      lines += 1;
      if (lines >= maxLines - 1) break;
    } else {
      line = testLine;
    }
  }
  if (lines < maxLines) context.fillText(line, x, y + lines * lineHeight);
}

async function createResultImage() {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext('2d');
  context.fillStyle = '#f5f5f1';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#c93427';
  context.fillRect(0, 0, canvas.width, 24);
  context.fillStyle = '#171714';
  context.font = '900 54px "Noto Serif KR", serif';
  context.fillText('Global', 84, 116);
  context.fillStyle = '#c93427';
  context.fillText('Hot', 252, 116);
  context.fillStyle = '#66665f';
  context.font = '800 28px "Noto Sans KR", sans-serif';
  context.fillText('오늘의 폭락 60초', 84, 190);
  context.fillStyle = '#171714';
  context.font = '900 64px "Noto Serif KR", serif';
  wrapCanvasText(context, state.quiz.title, 84, 320, 912, 88, 3);
  context.strokeStyle = '#171714';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(84, 610);
  context.lineTo(996, 610);
  context.stroke();
  context.fillStyle = '#c93427';
  context.font = '900 170px Georgia, serif';
  context.fillText(state.score + '/3', 84, 820);
  context.fillStyle = '#171714';
  context.font = '800 34px "Noto Sans KR", sans-serif';
  context.fillText(state.elapsedSeconds + '초 완료 · 연속 ' + state.streak + '일', 84, 894);
  context.fillStyle = '#66665f';
  context.font = '500 25px "Noto Sans KR", sans-serif';
  context.fillText('교육용 퀴즈 · 투자 조언 아님', 84, 970);
  context.fillStyle = '#245ca5';
  context.fillText('globalhot.net/quiz/', 84, 1018);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('이미지 생성 실패')), 'image/png');
  });
}

async function shareResultImage() {
  elements.shareImageButton.disabled = true;
  elements.shareStatus.textContent = '결과 이미지를 만드는 중입니다.';
  try {
    const blob = await createResultImage();
    const file = new File([blob], 'globalhot-quiz-' + state.quiz.date + '.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: '오늘의 폭락 60초',
        text: shareText(),
        files: [file]
      });
      elements.shareStatus.textContent = '공유 화면을 열었습니다.';
      track('quiz_share', { method: 'native_image' });
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
      elements.shareStatus.textContent = '결과 이미지를 저장했습니다.';
      track('quiz_share', { method: 'image_download' });
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error('[quiz] share failed', error);
      elements.shareStatus.textContent = '이미지 공유에 실패했습니다. 결과 문구 복사를 이용해주세요.';
    }
  } finally {
    elements.shareImageButton.disabled = false;
  }
}

function copyWithHiddenTextarea(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.inset = '0 auto auto -9999px';
  document.body.append(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('브라우저 복사 명령 실패');
}

async function copyResult() {
  const text = shareText();
  try {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        copyWithHiddenTextarea(text);
      }
    } else {
      copyWithHiddenTextarea(text);
    }
    elements.shareStatus.textContent = '결과 문구를 복사했습니다.';
    track('quiz_share', { method: 'text_copy' });
  } catch {
    elements.shareStatus.textContent = '복사하지 못했습니다. 주소창의 링크를 복사해주세요.';
  }
}

async function initializeTextLayout() {
  await document.fonts.ready;
  const editableMode = new URLSearchParams(location.search).get('edit') === '1';
  document.querySelectorAll('[data-pretext]').forEach((element) => {
    if (editableMode && element.hasAttribute('data-editable')) {
      element.contentEditable = 'true';
      element.spellcheck = false;
    }
  });
}

function initializeCookieBanner() {
  if (!elements.cookieBanner || !elements.cookieAccept) return;
  if (!localStorage.getItem('cookie-ok')) elements.cookieBanner.style.display = 'flex';
  elements.cookieAccept.addEventListener('click', () => {
    localStorage.setItem('cookie-ok', '1');
    elements.cookieBanner.style.display = 'none';
  });
}

elements.startButton.addEventListener('click', startQuiz);
elements.retryButton.addEventListener('click', loadQuiz);
elements.retryQuizButton.addEventListener('click', startQuiz);
elements.shareImageButton.addEventListener('click', shareResultImage);
elements.shareXButton.addEventListener('click', shareOnX);
elements.copyResultButton.addEventListener('click', copyResult);

initializeCookieBanner();
loadQuiz();
