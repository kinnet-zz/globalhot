import fs from 'fs';

function findJpegDim(buf) {
  // Check JPEG signature
  if (buf[0] !== 0xFF || buf[1] !== 0xD8 || buf[2] !== 0xFF) return null;
  
  for (let i = 3; i < buf.length - 10; i++) {
    if (buf[i] !== 0xFF) continue;
    const marker = buf[i + 1];
    // SOF0, SOF1, SOF2 markers
    if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
      const h = (buf[i + 5] << 8) | buf[i + 6];
      const w = (buf[i + 7] << 8) | buf[i + 8];
      return { w, h };
    }
  }
  return null;
}

function getPngDim(buf) {
  if (buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const files = fs.readdirSync('assets/profiles').filter(f => f.endsWith('.jpg'));
const results = [];

for (const f of files) {
  const buf = fs.readFileSync('assets/profiles/' + f);
  const stat = fs.statSync('assets/profiles/' + f);
  const id = f.replace('.jpg', '');
  const kb = Math.round(stat.size / 1024);
  
  let dim, format, status;
  
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    format = 'PNG';
    dim = getPngDim(buf);
  } else if (buf[0] === 0xFF && buf[1] === 0xD8) {
    format = 'JPEG';
    dim = findJpegDim(buf);
  } else {
    format = '???';
    dim = null;
  }
  
  if (!dim) status = 'FAIL';
  else if (dim.w < 400) status = 'LOW';
  else if (dim.w > 3000) status = 'HI';
  else status = 'OK';
  
  results.push({ id, kb, format, w: dim ? dim.w : 0, h: dim ? dim.h : 0, status });
}

// Sort: problems first, then by width
const order = { FAIL: 0, LOW: 1, HI: 2, OK: 3 };
results.sort((a, b) => (order[a.status] - order[b.status]) || (a.w - b.w));

console.log('=== 문제 파일 ===\n');
const bad = results.filter(r => r.status !== 'OK');
bad.forEach(r => console.log(`${r.status} | ${r.id.padEnd(20)} | ${r.kb}KB | ${r.w}x${r.h} | ${r.format}`));

console.log(`\n=== 요약 ===`);
console.log(`총 ${results.length}개 | OK: ${results.filter(r=>r.status==='OK').length} | LOW: ${results.filter(r=>r.status==='LOW').length} | FAIL: ${results.filter(r=>r.status==='FAIL').length} | PNG-as-JPG: ${results.filter(r=>r.format==='PNG').length}`);
