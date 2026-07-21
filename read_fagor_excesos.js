const XLSX = require('xlsx');
const path = require('path');

function inspectFile(filename) {
  const filepath = path.join(__dirname, 'fagor', filename);
  console.log(`\n=== INSPECCIONANDO: ${filename} ===`);
  try {
    const wb = XLSX.readFile(filepath);
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    console.log("Total filas:", rawRows.length);
    if (rawRows.length > 0) {
      console.log("Cabeceras (Fila 0):", rawRows[0]);
      if (rawRows[1]) console.log("Fila 1 (Datos):", rawRows[1]);
      if (rawRows[2]) console.log("Fila 2 (Datos):", rawRows[2]);
    }
  } catch (err) {
    console.error(`Error leyendo ${filename}:`, err.message);
  }
}

inspectFile('Excesos.xlsx');
inspectFile('Frenadas.xlsx');
inspectFile('Aceleraciones.xlsx');
