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

// Filter for LHT939 and sort by date
const lhtRows = rows.filter(r => r['Nombre'] === 'LHT939').sort((a, b) => {
  return new Date(a['Hora Reporte']).getTime() - new Date(b['Hora Reporte']).getTime();
});

console.log(`=== LHT939 CHRONOLOGICAL ROWS (Total: ${lhtRows.length}) ===`);
lhtRows.forEach((r, idx) => {
  console.log(`[${idx+1}] Date: ${r['Hora Reporte']} | Evento: ${r['Evento']} | Metros: ${r['Metros']} | odo: ${r['odo']} | Lat/Lon: ${r['Lat']}/${r['Lon']} | Lugar: ${r['Lugar']}`);
});
