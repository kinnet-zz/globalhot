// 빌드타임 프로필 사진 WebP 변형 생성.
// dist/assets/profiles/*.jpg 마다 w480/w960 WebP를 만든다(원본은 유지).
// 카드(~240px)·히어로(300px)·레티나를 srcset으로 커버해 전송량을 줄인다.
// withoutEnlargement 이므로 원본이 변형폭보다 작으면 그 폭 그대로 나온다 —
// 캐노니컬 폭 레이블과 실제 폭이 달라도 브라우저 선택에 문제 없고 404가 없다.

import sharp from "sharp";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const VARIANT_WIDTHS = [480, 960];

export async function generateProfileVariants({ distDir }) {
  const dir = path.join(distDir, "assets", "profiles");
  const jpgs = (await readdir(dir)).filter((f) => f.endsWith(".jpg"));
  let files = 0;
  let bytes = 0;
  for (const f of jpgs) {
    const buf = await readFile(path.join(dir, f));
    const id = f.replace(/\.jpg$/, "");
    for (const width of VARIANT_WIDTHS) {
      const out = await sharp(buf)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      await writeFile(path.join(dir, `${id}.w${width}.webp`), out);
      files += 1;
      bytes += out.length;
    }
  }
  return { files, sources: jpgs.length, kb: Math.round(bytes / 1024) };
}
