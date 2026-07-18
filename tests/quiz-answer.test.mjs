import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createSignedVisitor,
  onRequestPost,
  readSignedVisitor,
  validateAnswerPayload,
} from '../functions/api/quiz-answer.js';
import { ALLOWED_QUIZ_FACT_IDS } from '../functions/_shared/quiz-facts.js';

const bank = JSON.parse(await readFile(new URL('../quiz/bank/concepts.json', import.meta.url), 'utf8'));

class FakeD1 {
  rows = [];

  prepare(sql) {
    return {
      bind: (...values) => ({
        run: async () => {
          if (sql.includes('INSERT INTO quiz_answers')) {
            const [quizId, questionId, visitorHash, choiceIndex, createdAt] = values;
            const duplicate = this.rows.some((row) => row.quizId === quizId && row.questionId === questionId && row.visitorHash === visitorHash);
            if (!duplicate) this.rows.push({ quizId, questionId, visitorHash, choiceIndex, createdAt });
            return { meta: { changes: duplicate ? 0 : 1 } };
          }
          if (sql.includes('DELETE FROM quiz_answers')) {
            this.rows = this.rows.filter((row) => row.createdAt >= values[0]);
            return { meta: { changes: 0 } };
          }
          throw new Error('unexpected run query');
        },
        all: async () => {
          const [quizId, questionId] = values;
          const counts = new Map();
          for (const row of this.rows.filter((item) => item.quizId === quizId && item.questionId === questionId)) {
            counts.set(row.choiceIndex, (counts.get(row.choiceIndex) || 0) + 1);
          }
          return { results: [...counts].map(([choiceIndex, count]) => ({ choiceIndex, count })) };
        },
      }),
    };
  }
}

test('answer payload accepts only bounded quiz identifiers and a valid choice', () => {
  assert.deepEqual(validateAnswerPayload({
    quizId: 'daily-market-2026-07-18',
    questionId: '2026-07-18-vix-near-term-volatility',
    choiceIndex: 2,
  }), {
    quizId: 'daily-market-2026-07-18',
    questionId: '2026-07-18-vix-near-term-volatility',
    choiceIndex: 2,
  });
});

test('answer payload rejects malformed ids and out-of-range choices', () => {
  assert.throws(() => validateAnswerPayload({
    quizId: '../escape',
    questionId: 'question',
    choiceIndex: 1,
  }), /quizId/);
  assert.throws(() => validateAnswerPayload({
    quizId: 'daily-market-2026-07-18',
    questionId: '2026-07-18-vix-near-term-volatility',
    choiceIndex: 3,
  }), /choiceIndex/);
  assert.throws(() => validateAnswerPayload({
    quizId: 'daily-market-2026-07-19',
    questionId: '2026-07-18-vix-near-term-volatility',
    choiceIndex: 1,
  }), /quizId/);
  assert.throws(() => validateAnswerPayload({
    quizId: 'daily-market-2026-99-99',
    questionId: '2026-99-99-vix-near-term-volatility',
    choiceIndex: 1,
  }, new Date('2026-07-18T00:00:00Z')), /날짜/);
  assert.throws(() => validateAnswerPayload({
    quizId: 'daily-market-2026-07-18',
    questionId: '2026-07-18-made-up-question',
    choiceIndex: 1,
  }, new Date('2026-07-18T00:00:00Z')), /문제은행/);
});

test('API fact allowlist stays synchronized with the verified bank', () => {
  assert.deepEqual(new Set(bank.map((card) => card.id)), ALLOWED_QUIZ_FACT_IDS);
});

test('visitor cookie is signed and tampering is rejected', async () => {
  const secret = 'test-secret-that-is-long-enough';
  const signed = await createSignedVisitor(secret, '00000000-0000-4000-8000-000000000001');
  assert.equal(await readSignedVisitor(signed, secret), '00000000-0000-4000-8000-000000000001');
  assert.equal(await readSignedVisitor(`${signed.slice(0, -1)}x`, secret), null);
  assert.equal(await readSignedVisitor(signed, 'different-secret'), null);
});

test('answer endpoint counts one response per signed anonymous visitor', async () => {
  const db = new FakeD1();
  const env = { QUIZ_DB: db, QUIZ_COOKIE_SECRET: 'integration-test-secret-long-enough' };
  const payload = {
    quizId: 'daily-market-2026-07-18',
    questionId: '2026-07-18-vix-near-term-volatility',
    choiceIndex: 1,
  };
  const first = await onRequestPost({
    request: new Request('https://globalhot.net/api/quiz-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://globalhot.net' },
      body: JSON.stringify(payload),
    }),
    env,
    waitUntil: () => {},
  });
  const firstBody = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstBody.accepted, true);
  assert.equal(firstBody.total, 1);
  assert.equal(firstBody.public, false);
  assert.equal(firstBody.choiceCounts, null);

  const cookie = first.headers.get('Set-Cookie').split(';')[0];
  const second = await onRequestPost({
    request: new Request('https://globalhot.net/api/quiz-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://globalhot.net', Cookie: cookie },
      body: JSON.stringify({ ...payload, choiceIndex: 2 }),
    }),
    env,
    waitUntil: () => {},
  });
  const secondBody = await second.json();
  assert.equal(secondBody.duplicate, true);
  assert.equal(secondBody.total, 1);
  assert.equal(secondBody.choiceCounts, null);
});

test('answer endpoint rejects malformed origins and bodies before D1 writes', async () => {
  const db = new FakeD1();
  const env = { QUIZ_DB: db, QUIZ_COOKIE_SECRET: 'integration-test-secret-long-enough' };
  const payload = JSON.stringify({
    quizId: 'daily-market-2026-07-18',
    questionId: '2026-07-18-vix-near-term-volatility',
    choiceIndex: 1,
  });
  const malformedOrigin = await onRequestPost({
    request: new Request('https://globalhot.net/api/quiz-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'not a url' },
      body: payload,
    }),
    env,
  });
  assert.equal(malformedOrigin.status, 403);

  const oversized = await onRequestPost({
    request: new Request('https://globalhot.net/api/quiz-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(3000) }),
    }),
    env,
  });
  assert.equal(oversized.status, 413);
  assert.equal(db.rows.length, 0);
});

test('answer endpoint fails closed when configuration, media type, or origin is invalid', async () => {
  const payload = JSON.stringify({
    quizId: 'daily-market-2026-07-18',
    questionId: '2026-07-18-vix-near-term-volatility',
    choiceIndex: 1,
  });
  const unconfigured = await onRequestPost({
    request: new Request('https://globalhot.net/api/quiz-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }),
    env: {},
  });
  assert.equal(unconfigured.status, 503);

  const env = { QUIZ_DB: new FakeD1(), QUIZ_COOKIE_SECRET: 'integration-test-secret-long-enough' };
  const wrongMedia = await onRequestPost({
    request: new Request('https://globalhot.net/api/quiz-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: payload,
    }),
    env,
  });
  assert.equal(wrongMedia.status, 415);

  const crossOrigin = await onRequestPost({
    request: new Request('https://globalhot.net/api/quiz-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
      body: payload,
    }),
    env,
  });
  assert.equal(crossOrigin.status, 403);
});

test('answer endpoint publishes choice counts only after 30 distinct visitors', async () => {
  const db = new FakeD1();
  const env = { QUIZ_DB: db, QUIZ_COOKIE_SECRET: 'integration-test-secret-long-enough' };
  const payload = JSON.stringify({
    quizId: 'daily-market-2026-07-18',
    questionId: '2026-07-18-vix-near-term-volatility',
    choiceIndex: 1,
  });
  let response;
  for (let index = 0; index < 30; index += 1) {
    response = await onRequestPost({
      request: new Request('https://globalhot.net/api/quiz-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://globalhot.net' },
        body: payload,
      }),
      env,
      waitUntil: () => {},
    });
  }
  const body = await response.json();
  assert.equal(body.public, true);
  assert.deepEqual(body.choiceCounts, [0, 30, 0]);
});

test('answer endpoint hides internal D1 failures behind a stable 503 response', async () => {
  const response = await onRequestPost({
    request: new Request('https://globalhot.net/api/quiz-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://globalhot.net' },
      body: JSON.stringify({
        quizId: 'daily-market-2026-07-18',
        questionId: '2026-07-18-vix-near-term-volatility',
        choiceIndex: 1,
      }),
    }),
    env: {
      QUIZ_COOKIE_SECRET: 'integration-test-secret-long-enough',
      QUIZ_DB: { prepare: () => { throw new Error('private database failure'); } },
    },
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'answer_stats_unavailable' });
});
