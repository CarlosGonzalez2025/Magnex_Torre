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

console.log(`Total rows in Coltrack CSV: ${rows.length}`);

// Sort by Metros numeric value
const sortedByMetros = [...rows].sort((a, b) => {
  const valA = parseInt(a['Metros'], 10) || 0;
  const valB = parseInt(b['Metros'], 10) || 0;
  return valB - valA;
});

console.log('\n--- TOP 10 ROWS BY "Metros" ---');
for (let i = 0; i < 10; i++) {
  const r = sortedByMetros[i];
  if (!r) break;
  console.log(`Rank ${i+1}: Veh=${r['Nombre']}, Cond=${r['Conductor']}, Hora=${r['Hora Reporte']}, Metros=${r['Metros']}, Evento=${r['Evento']}, Detalle=${r['Detalle']}, Lugar=${r['Lugar']}`);
}

// Check if there are other columns, and check unique Evento values
const uniqueEvents = new Set(rows.map(r => r['Evento']));
console.log('\nUnique values in Evento column:', Array.from(uniqueEvents));

const uniqueDetails = new Set(rows.map(r => r['Detalle']));
console.log('\nUnique values in Detalle column (first 20):', Array.from(uniqueDetails).slice(0, 20));
