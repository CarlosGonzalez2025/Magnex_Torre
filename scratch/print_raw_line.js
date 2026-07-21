import fs from 'fs';

const filePath = 'ralentis flota/Documento Ralenti 2 primera quincena Abril 2026 Coltrack.csv';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('70049319')) {
    console.log(`Line ${i+1}: ${lines[i]}`);
  }
}
