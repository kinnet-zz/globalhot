import fs from 'fs';

function findSof(buf) {
  for (let i = 3; i < buf.length - 10; i++) {
    if (buf[i] === 0xFF && (buf[i + 1] >= 0xC0 && buf[i + 1] <= 0xCF)) {
      const marker = buf[i + 1];
      const name = { 0xC0: 'SOF0', 0xC1: 'SOF1', 0xC2: 'SOF2', 0xC3: 'SOF3', 0xC4: 'DHT', 0xC5: 'Huffman', 0xC6: 'JPG', 0xC7: 'DAC', 0xC8: 'JPGn', 0xC9: 'JPGn', 0xCA: 'JPGn', 0xCB: 'JPGn', 0xCC: 'DACn', 0xCD: 'JPGn', 0xCE: 'JPGn', 0xCF: 'JPGn' };
      const markerName = name[marker] || ('0x' + marker.toString(16));
      const h = (buf[i + 5] << 8) | buf[i + 6];
      const w = (buf[i + 7] << 8) | buf[i + 8];
      console.log('  Found ' + markerName + ' at ' + i + ': ' + w + 'x' + h);
    }
  }
}

const files = ['aya-asahina', 'w-adriana', 'w-barbara', 'w-naomi'];
files.forEach(id => {
  const buf = fs.readFileSync('assets/profiles/' + id + '.jpg');
  console.log(id, '| size:', buf.length, '| header:', buf.slice(0, 8).toString('hex'));
  findSof(buf);
});
