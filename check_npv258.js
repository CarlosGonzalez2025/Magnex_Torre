import * as XLSX from 'xlsx';
import * as fs from 'fs';

function getNPVSpeeds(filepath) {
  if (!fs.existsSync(filepath)) return [];
  const fileBuffer = fs.readFileSync(filepath);
  const wb = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  
  const npvRows = rows.filter(r => String(r['Matricula'] ?? '').toUpperCase().replace(/\s+/g, '') === 'NPV258');
  return npvRows.map(r => {
    const vel = parseInt(String(r['Velocidad'] ?? r['VelocidadVehiculoTaco'] ?? '0'), 10) || 0;
    return { file: filepath, velocity: vel, conductor: r['Conductor'] };
  });
}

const allNPVRows = [
  ...getNPVSpeeds('fagor/Excesos.xlsx'),
  ...getNPVSpeeds('fagor/Excesos (2).xlsx'),
  ...getNPVSpeeds('fagor/Excesos (3).xlsx')
];

console.log(`=== TODOS LOS EXCESOS DE NPV258 (${allNPVRows.length} filas en total) ===`);
console.log("Desglose de velocidades:");

const speedGroups = {
  '10-19': 0,
  '20-29': 0,
  '30-39': 0,
  '40-49': 0,
  '50-59': 0,
  '60-79': 0,
  '80+': 0
};

allNPVRows.forEach(r => {
  const v = r.velocity;
  if (v >= 80) speedGroups['80+']++;
  else if (v >= 60) speedGroups['60-79']++;
  else if (v >= 50) speedGroups['50-59']++;
  else if (v >= 40) speedGroups['40-49']++;
  else if (v >= 30) speedGroups['30-39']++;
  else if (v >= 20) speedGroups['20-29']++;
  else if (v >= 10) speedGroups['10-19']++;
});

console.log(speedGroups);

console.log("\nLista de todas las velocidades:");
allNPVRows.forEach((r, idx) => {
  console.log(`  [${idx+1}] File: ${r.file}, Velocidad: ${r.velocity}, Conductor: ${r.conductor}`);
});
