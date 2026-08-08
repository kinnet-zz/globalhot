import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// dist HTML 에서 버전 부여할 로컬 asset 들. source 루트 기준 파일명.
const VERSIONED_ASSETS = ["portal.css", "home.css", "info.css", "portal.js", "analytics.js"];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function hashAsset(projectRoot, name) {
  const buf = await readFile(path.join(projectRoot, name));
  return createHash("sha256").update(buf).digest("hex").slice(0, 10);
}

export async function applyCacheBust({ projectRoot, distDir, htmlFiles }) {
  // 1. 각 asset 의 내용 해시를 한 번씩 계산
  const hashes = {};
  for (const name of VERSIONED_ASSETS) {
    hashes[name] = await hashAsset(projectRoot, name);
  }
  // 2. 각 HTML 에서 /<asset>(?v=...)? 를 /<asset>?v=<hash> 로 치환
  const used = {}; // 어떤 해시가 실제로 쓰였는지(테스트/디버그용)
  for (const htmlName of htmlFiles) {
    const htmlPath = path.join(distDir, htmlName);
    let html = await readFile(htmlPath, "utf8");
    for (const name of VERSIONED_ASSETS) {
      const re = new RegExp("(/" + escapeRegex(name) + ")(\\?v=[^\"'\\s]*)?", "g");
      html = html.replace(re, (m, p1) => { used[name] = hashes[name]; return p1 + "?v=" + hashes[name]; });
    }
    await writeFile(htmlPath, html, "utf8");
  }
  return { hashes, used };
}
