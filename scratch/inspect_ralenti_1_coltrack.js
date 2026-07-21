import fs from 'fs';
const content = fs.readFileSync('ralentis flota/Documento Ralenti 1 primera quincena Abril 2026 Coltrack.csv', 'utf-8');
const lines = content.split('\n');
console.log('Headers of Ralenti 1 Coltrack:');
console.log(lines[0]);
console.log('Sample rows of Ralenti 1 Coltrack:');
for (let i = 1; i < Math.min(lines.length, 5); i++) {
  console.log(lines[i]);
}
