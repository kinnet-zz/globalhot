import fs from 'fs';
const data = JSON.parse(fs.readFileSync('data/models.json', 'utf8'));

const htmlPattern = /<a rel="nofollow" class="external text" href="[^"]*">([^<]+)<\/a>(?: from [^,]+)?/;

let count = 0;
for (const m of data.models) {
  if (m.creditText && htmlPattern.test(m.creditText)) {
    const cleaned = m.creditText.replace(htmlPattern, '$1');
    m.creditText = cleaned.trim();
    count++;
  }
}

fs.writeFileSync('data/models.json', JSON.stringify(data, null, '  ') + '\n', 'utf8');
console.log(`Cleaned ${count} entries`);
