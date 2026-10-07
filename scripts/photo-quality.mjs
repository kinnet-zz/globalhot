// 사진 품질 공용 모듈 — 매직바이트 스니핑, 해상도 파싱, 품질 게이트.
// gravure-add / 사진 업그레이드 스크립트 / 테스트가 같은 기준을 공유한다.
// AGENTS.md: .jpg 확장자로 저장하는 파일은 반드시 실제 JPEG여야 한다.

export function sniffFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buffer.toString("ascii", 0, 3) === "GIF") return "gif";
  return null;
}

// JPEG SOF 스캔. 세그먼트 길이 기반 스킵이라 압축 데이터 내부의 우연한
// 0xFFC? 시퀀스에 속지 않는다. PNG는 IHDR, WebP는 VP8 계열 헤더에서 읽는다.
export function imageDimensions(buffer) {
  const fmt = sniffFormat(buffer);
  if (fmt === "png") return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) };
  if (fmt === "webp") {
    if (buffer.toString("ascii", 12, 16) === "VP8 ") {
      return { w: buffer.readUInt16LE(26) & 0x3fff, h: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (buffer.toString("ascii", 12, 16) === "VP8L") {
      const b = buffer.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
    if (buffer.toString("ascii", 12, 16) === "VP8X") {
      return { w: 1 + (buffer.readUIntLE(24, 3)), h: 1 + (buffer.readUIntLE(27, 3)) };
    }
    return null;
  }
  if (fmt !== "jpeg") return null;
  let i = 2;
  while (i < buffer.length - 9) {
    if (buffer[i] !== 0xff) { i += 1; continue; }
    const m = buffer[i + 1];
    if (m === 0xff) { i += 1; continue; }
    if (m === 0x00 || m === 0xd8 || (m >= 0xd0 && m <= 0xd9) || m === 0x01) { i += 2; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buffer.readUInt16BE(i + 5), w: buffer.readUInt16BE(i + 7) };
    }
    const len = buffer.readUInt16BE(i + 2);
    if (len < 2) return null;
    i += len;
  }
  return null;
}

// 표시 최대(모달 ~500px, og:image 640px)의 retina 여유 기준.
export const MIN_WIDTH = 600;
export const MIN_HEIGHT = 800;

// .jpg 로 저장하기에 문제가 있으면 이유 문자열, 없으면 null.
// bpp(lower=better 압축, 지나치면 뭉개짐)는 jpeg 기준으로만 검사한다.
export function photoQualityIssue(buffer, { minWidth = MIN_WIDTH, minHeight = MIN_HEIGHT } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2048) return "file too small (<2KB)";
  const fmt = sniffFormat(buffer);
  if (!fmt) return "unknown image format";
  if (fmt !== "jpeg") return `format is ${fmt}, not jpeg`;
  const dim = imageDimensions(buffer);
  if (!dim || !dim.w || !dim.h) return "dimensions unparseable";
  if (dim.w < minWidth || dim.h < minHeight) {
    return `${dim.w}x${dim.h} below minimum ${minWidth}x${minHeight}`;
  }
  const bpp = buffer.length / (dim.w * dim.h);
  if (bpp < 0.04) return `over-compressed (${bpp.toFixed(3)} bytes/pixel)`;
  return null;
}

// 표시에 쓸 만한 해상도인가. 세로형 600x800 이상이면 통과,
// 가로형은 양변 500px 이상 + 0.5MP 이상이면 통과.
export function dimensionsMeetMin(dim) {
  if (!dim || !dim.w || !dim.h) return false;
  return (dim.w >= MIN_WIDTH && dim.h >= MIN_HEIGHT) ||
    (dim.w >= 500 && dim.h >= 500 && dim.w * dim.h >= 500000);
}
