import assert from 'node:assert/strict';
import test from 'node:test';
import { nameTokensContain, titleMatchesModel } from '../scripts/publish-discovery.mjs';
import { titleCarriesIdentity } from '../scripts/verify-matches.mjs';

test('nameTokensContain requires the full name as a contiguous token run', () => {
  assert.equal(nameTokensContain('Kang In-kyung in Tokyo', 'Kang In-kyung'), true);
  assert.equal(nameTokensContain('Photo of Kang In-kyung smiling', 'Kang In-kyung'), true);
  // Tokens shared with a lookalike name, in the same title but not as the
  // model's contiguous run, must NOT match (the politician conflation case).
  assert.equal(nameTokensContain('Kang Kyung-wha in Tokyo', 'Kang In-kyung'), false);
  assert.equal(nameTokensContain('Kang Kyung-wha at the UN', 'Kang In-kyung'), false);
  assert.equal(nameTokensContain('In-kyung poses for Kang', 'Kang In-kyung'), false);
});

test('nameTokensContain accepts a reversed full-name run (surname default)', () => {
  // Commons files sometimes list "Surname Given" (e.g. Momotsuki Nashiko).
  assert.equal(nameTokensContain('Nashiko Momotsuki red carpet', 'Momotsuki Nashiko'), true);
  assert.equal(nameTokensContain('Momotsuki Nashiko at premiere', 'Momotsuki Nashiko'), true);
  assert.equal(nameTokensContain('Aoi Sora', 'Sora Aoi'), true);
});

test('titleMatchesModel never matches a lookalike via a shared surname token', () => {
  const kag = { name: 'Kang In-kyung', altName: '강인경' };
  assert.equal(titleMatchesModel('Kang In-kyung dance', kag), true);
  assert.equal(titleMatchesModel('Kang Kyung-wha in Tokyo', kag), false);
  assert.equal(titleMatchesModel('Kang Kyung-wha UN', kag), false);
});

test('titleCarriesIdentity rejects a conflation and keeps a real match', () => {
  const hyun = { name: 'Kang In-kyung', altName: '강인경' };
  assert.equal(titleCarriesIdentity('Kang In-kyung release event', hyun), true);
  assert.equal(titleCarriesIdentity('Kang Kyung-wha in Tokyo', hyun), false);
});