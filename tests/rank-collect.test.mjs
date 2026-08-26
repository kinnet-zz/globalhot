import assert from "node:assert/strict";
import test from "node:test";
import {
  hoursSince,
  freshnessScore,
  diversityScore,
  itemScore,
  personScore,
  normalizeTitle,
  matchPersons,
  rankBadge,
} from "../rank/scripts/lib/score.mjs";

const NOW = Date.parse("2026-08-26T12:00:00Z");

test("hoursSince computes age in hours and rejects invalid dates", () => {
  assert.equal(hoursSince("2026-08-26T09:00:00Z", NOW), 3);
  assert.equal(hoursSince("not-a-date", NOW), Infinity);
  // 미래 발행 시계 오차는 0으로 클램프
  assert.equal(hoursSince("2026-08-26T13:00:00Z", NOW), 0);
});

test("freshnessScore decays with a 12h half-life scale", () => {
  const fresh = freshnessScore("2026-08-26T11:00:00Z", NOW);
  const old = freshnessScore("2026-08-25T00:00:00Z", NOW);
  assert.ok(fresh > 7 && fresh <= 8, `fresh in (7,8]: ${fresh}`);
  assert.ok(old < 0.5, `old < 0.5: ${old}`);
});

test("diversityScore counts distinct sources only", () => {
  assert.equal(diversityScore(["A", "A", "B"]), 12);
  assert.equal(diversityScore(["A"]), 6);
});

test("itemScore combines freshness, diversity, capped person boost", () => {
  const s = itemScore({ publishedAt: "2026-08-26T11:00:00Z", sourceLabels: ["A", "B"], personMentions: 9 }, NOW);
  assert.ok(s > 0);
  // personMentions 상한 5
  const capped = itemScore({ publishedAt: "2026-08-26T11:00:00Z", sourceLabels: [], personMentions: 5 }, NOW);
  const more = itemScore({ publishedAt: "2026-08-26T11:00:00Z", sourceLabels: [], personMentions: 50 }, NOW);
  assert.equal(capped, more);
});

test("personScore weights mentions heaviest", () => {
  const many = personScore({ mentions: 5, latestAt: "2026-08-26T11:00:00Z", sourceLabels: ["A"] }, NOW);
  const few = personScore({ mentions: 1, latestAt: "2026-08-26T11:00:00Z", sourceLabels: ["A", "B"] }, NOW);
  assert.ok(many > few, "5 mentions should beat 1 mention despite diversity");
});

test("normalizeTitle strips boilerplate for dedupe grouping", () => {
  assert.equal(normalizeTitle("Hot Story | Some Newspaper"), normalizeTitle("hot story"));
  assert.equal(normalizeTitle("A–B  Photo!!"), normalizeTitle("a b photo"));
});

test("matchPersons finds model names and ignores short tokens", () => {
  const persons = [
    { id: "enako", name: "Enako", altName: "えなこ" },
    { id: "xx", name: "Ana", altName: "" }, // 3글자 미만 무시는 3자 미만 — "Ana"는 3자라 매칭됨
  ];
  const hits = matchPersons("Enako reveals new photobook", persons);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, "enako");
  assert.deepEqual(matchPersons("unrelated headline", persons), []);
});

test("rankBadge reports new/up/down/same", () => {
  assert.deepEqual(rankBadge(3, undefined), { kind: "new", label: "NEW" });
  assert.deepEqual(rankBadge(2, 5), { kind: "up", label: "▲ 3" });
  assert.deepEqual(rankBadge(7, 5), { kind: "down", label: "▼ 2" });
  assert.deepEqual(rankBadge(4, 4), { kind: "same", label: "—" });
});
