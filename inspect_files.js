import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

function inspectAllSheets(filePath, name) {
  console.log(`\n=== INSPECCIONANDO XLSX COMPLETO: ${name} ===`);
  try {
    const workbook = XLSX.readFile(filePath);
    console.log(`Hojas en el libro: ${workbook.SheetNames.join(', ')}`);
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      console.log(`  Hoja "${sheetName}" - Filas: ${rawData.length}`);
      if (rawData.length > 0) {
        console.log(`    Fila 1 (Cabecera): ${JSON.stringify(rawData[0])}`);
      }
      if (rawData.length > 1) {
        console.log(`    Fila 2: ${JSON.stringify(rawData[1])}`);
      }
      if (rawData.length > 2) {
        console.log(`    Fila 3: ${JSON.stringify(rawData[2])}`);
      }
      if (rawData.length > 3) {
        console.log(`    Fila 4: ${JSON.stringify(rawData[3])}`);
      }
    });
  } catch (err) {
    console.error(`Error leyendo ${name}:`, err.message);
  }
}

console.log("INICIANDO ANALISIS DE HOJAS ADICIONALES DE FAGOR...\n");

inspectAllSheets('fagor/Km_Conductor_Fagor 1.xlsx', 'Km_Conductor_Fagor 1.xlsx');
inspectAllSheets('fagor/Km_Vehículos_Fagor 1.xlsx', 'Km_Vehículos_Fagor 1.xlsx');
inspectAllSheets('fagor/Conductores_Fagor.xlsx', 'Conductores_Fagor.xlsx');
