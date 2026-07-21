import fs from 'fs';

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

const largeEvents = rows.filter(r => {
  const metros = parseInt(r['Metros'], 10) || 0;
  return metros > 18000; // > 5 hours
});

console.log(`Total rows with Metros > 5 hours (18000s): ${largeEvents.length}`);
largeEvents.sort((a, b) => (parseInt(b['Metros'], 10) - parseInt(a['Metros'], 10))).forEach((r, idx) => {
  const metros = parseInt(r['Metros'], 10);
  const hours = (metros / 3600).toFixed(2);
  console.log(`[${idx+1}] Veh: ${r['Nombre']}, Cond: ${r['Conductor']}, Date: ${r['Hora Reporte']}, Metros: ${r['Metros']} (${hours} h), Lugar: ${r['Lugar']}`);
});
