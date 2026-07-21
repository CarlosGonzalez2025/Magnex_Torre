import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

function inspectCSV(filePath, linesCount = 5) {
  console.log(`\n=== INSPECTIONING CSV: ${path.basename(filePath)} ===`);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < Math.min(lines.length, linesCount); i++) {
      console.log(`Row ${i + 1}: ${lines[i]}`);
    }
  } catch (err) {
    console.error(`Error reading CSV:`, err);
  }
}

function inspectXLSX(filePath, rowsCount = 5) {
  console.log(`\n=== INSPECTIONING XLSX: ${path.basename(filePath)} ===`);
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    console.log(`Sheet Name: ${sheetName}`);
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    for (let i = 0; i < Math.min(rawData.length, rowsCount); i++) {
      console.log(`Row ${i + 1}: ${JSON.stringify(rawData[i])}`);
    }
  } catch (err) {
    console.error(`Error reading XLSX:`, err);
  }
}

const coltrackPath = 'ralentis flota/Documento Ralenti 2 primera quincena Abril 2026 Coltrack.csv';
const fagorPath = 'ralentis flota/Documento Ralenti 2 primera quincena Abril 2026 Fagor.xlsx';

inspectCSV(coltrackPath);
inspectXLSX(fagorPath);
