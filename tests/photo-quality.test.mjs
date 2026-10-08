// 사진 품질 게이트 단위 테스트 + assets/profiles 전수 감사.
// AGENTS.md: .jpg 확장자로 저장되는 파일은 항상 실제 JPEG이어야 하고,
// 썸네일급 저해상도 사진이 새로 유입되면 배포가 실패해야 한다.

import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { sniffFormat, imageDimensions, photoQualityIssue, dimensionsMeetMin } from "../scripts/photo-quality.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profilesDir = path.join(projectRoot, "assets", "profiles");

// 감사에서 썸네일급으로 내려가는 것을 허용된 예외 — Commons에서 이름 검증 +
// 자유 라이선스 + 최소 해상도를 모두 통과한 후보가 없는 모델
// (upgrade-low-photos.mjs 재실행으로 확인됨). 더 나은 후보가 생기면 제거한다.
const ALLOWED_SUB_FLOOR = new Set([
  "sayaka-isoyama", // Commons 최고 자유 후보 226x226 — 더 큰 무료 사진 없음
  "w-alix",         // Commons 최고 자유 후보 220x330 — 더 큰 무료 사진 없음
]);

// 최장변 400px 미만은 썸네일급으로 본다 (모달 ~500px 표시 기준 하한).
const FLOOR_LONGEST_SIDE = 400;

test("sniffFormat detects real formats regardless of extension", async () => {
  const jpeg = await sharp({ create: { width: 40, height: 60, channels: 3, background: "#f00" } }).jpeg().toBuffer();
  const png = await sharp({ create: { width: 40, height: 60, channels: 3, background: "#0f0" } }).png().toBuffer();
  const webp = await sharp({ create: { width: 40, height: 60, channels: 3, background: "#00f" } }).webp().toBuffer();
  assert.equal(sniffFormat(jpeg), "jpeg");
  assert.equal(sniffFormat(png), "png");
  assert.equal(sniffFormat(webp), "webp");
  assert.equal(sniffFormat(Buffer.from("not an image at all!!!")), null);
  assert.equal(sniffFormat(Buffer.alloc(8)), null);
});

test("imageDimensions reads dimensions for jpeg and png", async () => {
  const jpeg = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#123" } }).jpeg().toBuffer();
  const png = await sharp({ create: { width: 320, height: 200, channels: 3, background: "#456" } }).png().toBuffer();
  assert.deepEqual(imageDimensions(jpeg), { w: 640, h: 480 });
  assert.deepEqual(imageDimensions(png), { w: 320, h: 200 });
  assert.equal(imageDimensions(Buffer.from("xxxxxxxxxxxx")), null);
});

test("dimensionsMeetMin enforces portrait and landscape floors", () => {
  assert.equal(dimensionsMeetMin({ w: 600, h: 800 }), true, "portrait minimum passes");
  assert.equal(dimensionsMeetMin({ w: 800, h: 600 }), false, "landscape 600x600-class fails (0.36MP)");
  assert.equal(dimensionsMeetMin({ w: 700, h: 720 }), true, "landscape 0.5MP+ passes");
  assert.equal(dimensionsMeetMin({ w: 500, h: 500 }), false, "square 0.25MP fails");
  assert.equal(dimensionsMeetMin({ w: 220, h: 330 }), false, "thumbnail grade fails");
  assert.equal(dimensionsMeetMin(null), false);
  assert.equal(dimensionsMeetMin({ w: 0, h: 100 }), false);
});

test("photoQualityIssue reports format and size problems", async () => {
  const png = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#789" } }).png().toBuffer();
  assert.match(photoQualityIssue(png), /^format is png/);
  assert.match(photoQualityIssue(Buffer.alloc(1024)), /too small/);
  assert.match(photoQualityIssue(Buffer.alloc(4096, 7)), /unknown image format/);
});

test("assets/profiles contains only real JPEGs above the thumbnail floor", async () => {
  const files = (await readdir(profilesDir)).filter((f) => f.endsWith(".jpg"));
  assert.ok(files.length >= 100, "expected the profile photo set to be present");

  const offenders = [];
  for (const f of files) {
    const id = f.replace(/\.jpg$/, "");
    const buf = await readFile(path.join(profilesDir, f));
    const fmt = sniffFormat(buf);
    if (fmt !== "jpeg") {
      offenders.push(`${f}: format is ${fmt || "unknown"} (must be real JPEG)`);
      continue;
    }
    const dim = imageDimensions(buf);
    if (!dim || !dim.w || !dim.h) {
      offenders.push(`${f}: dimensions unparseable`);
      continue;
    }
    const longest = Math.max(dim.w, dim.h);
    if (longest < FLOOR_LONGEST_SIDE && !ALLOWED_SUB_FLOOR.has(id)) {
      offenders.push(`${f}: ${dim.w}x${dim.h} below ${FLOOR_LONGEST_SIDE}px floor`);
    }
  }
  assert.deepEqual(offenders, [], `profile photo quality violations:\n  ${offenders.join("\n  ")}`);
});
