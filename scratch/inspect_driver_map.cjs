const fs = require('fs');

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

const normName = (name) =>
  normalizeText(name)
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');

async function run() {
  const content = fs.readFileSync('coltrack/Conductores_Coltrack.csv', 'utf-8');
  const dLines = content.split('\n').filter(l => l.trim().length > 0);
  
  console.log("=== SIMULANDO DRIVER MAP ===");
  let count = 0;
  for (let i = 1; i < dLines.length; i++) {
    const cols = dLines[i].split('|');
    if (cols.length >= 5) {
      const nombre = cols[0] ?? '';
      const apellido = cols[1] ?? '';
      const ibutton = cols[2] ?? '';
      const cedula = cols[4] ?? '';
      const fullNameNorm = normName(`${nombre} ${apellido}`);
      
      // If the ibutton contains characters or the cedula is negative
      if (ibutton.toUpperCase().includes('DIEGO') || cedula.startsWith('-')) {
        count++;
        console.log(`Fila ${i+1}: NameNorm: "${fullNameNorm}" | ibutton: "${ibutton}" | cedula: "${cedula}"`);
      }
    }
  }
  console.log(`Total coincidencias: ${count}`);
}

run();
