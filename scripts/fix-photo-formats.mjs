// 1회성 복구: .jpg 확장자를 가진 비(非)JPEG 파일(PNG 등)을 실제 JPEG로 변환.
// sharp로 재인코딩하므로 용량도 사진에 맞는 수준으로 내려간다.
// 사용: node scripts/fix-photo-formats.mjs [--dry-run]

import { readdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { sniffFormat } from "./photo-quality.mjs";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const dir = path.join(projectRoot, "assets", "profiles");
const dryRun = process.argv.includes("--dry-run");

const files = (await readdir(dir)).filter((f) => f.endsWith(".jpg"));
let converted = 0, savedKb = 0;

for (const f of files) {
  const full = path.join(dir, f);
  const buf = await readFile(full);
  const fmt = sniffFormat(buf);
  if (!fmt || fmt === "jpeg") continue;
  const out = await sharp(buf).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const beforeKb = Math.round(buf.length / 1024);
  const afterKb = Math.round(out.length / 1024);
  savedKb += beforeKb - afterKb;
  converted += 1;
  const id = f.replace(/\.jpg$/, "");
  console.log(`${dryRun ? "[dry] " : ""}${id}: ${fmt} ${beforeKb}KB -> JPEG ${afterKb}KB`);
  if (!dryRun) {
    const tmp = `${full}.tmp`;
    await writeFile(tmp, out);
    await rename(tmp, full);
  }
}

console.log(`\n${dryRun ? "[dry-run] " : ""}변환 ${converted}건 · 절감 ${savedKb}KB`);
