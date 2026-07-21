import fs from 'fs';
import path from 'path';

const filePath = 'ralentis flota/Documento Ralenti 2 primera quincena Abril 2026 Coltrack.csv';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');
const header = lines[0].trim().split('|');

const rows = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const cols = line.split('|');
  const obj = {};
  header.forEach((h, idx) => {
    obj[h] = cols[idx];
  });
  rows.push(obj);
}

// Find rows for LHT939
const lhtRows = rows.filter(r => r['Nombre'] === 'LHT939');
console.log(`\n=== ROWS FOR LHT939 (Total: ${lhtRows.length}) ===`);
lhtRows.slice(0, 5).forEach((r, idx) => {
  console.log(`Row ${idx+1}:`, JSON.stringify(r));
});

// Find rows for a vehicle with small Metros, e.g. TAV985
const tavRows = rows.filter(r => r['Nombre'] === 'TAV985');
console.log(`\n=== ROWS FOR TAV985 (Total: ${tavRows.length}) ===`);
tavRows.slice(0, 5).forEach((r, idx) => {
  console.log(`Row ${idx+1}:`, JSON.stringify(r));
});

// Let's check if the column name "Metros" in Coltrack actually contains duration.
// In many GPS platforms, the duration of an alarm/event is stored in a column like "Duración", "Tiempo", "Segundos", "Metros"???
// Wait, is it possible that "Metros" means "duration in seconds" but some rows have garbage or odometer values?
// Let's check what the values are.
console.log('\n=== SOME OTHER VEHICLES SUMMARY ===');
const vehiclesSample = Array.from(new Set(rows.map(r => r['Nombre']))).slice(0, 10);
vehiclesSample.forEach(v => {
  const vRows = rows.filter(r => r['Nombre'] === v);
  const metrosValues = vRows.map(r => parseInt(r['Metros'], 10) || 0);
  console.log(`Vehicle ${v}: Rows=${vRows.length}, Metros range=[${Math.min(...metrosValues)}, ${Math.max(...metrosValues)}]`);
});
