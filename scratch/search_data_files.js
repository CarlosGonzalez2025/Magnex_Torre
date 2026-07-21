import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const searchId = '1005181554';

function searchInCSV(filePath) {
  console.log(`Searching in CSV: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(searchId)) {
    console.log(`  -> FOUND in raw CSV content!`);
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes(searchId)) {
        console.log(`    Line ${idx + 1}: ${line}`);
      }
    });
  } else {
    // Let's do a case-insensitive, space-insensitive check or partial
    const cleanContent = content.replace(/[\s-]/g, '');
    if (cleanContent.includes(searchId)) {
      console.log(`  -> FOUND in raw CSV content with spaces/dashes removed!`);
    }
  }
}

function searchInXLSX(filePath) {
  console.log(`Searching in XLSX: ${filePath}`);
  try {
    const workbook = XLSX.readFile(filePath);
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet);
      json.forEach((row, idx) => {
        const rowStr = JSON.stringify(row);
        if (rowStr.includes(searchId)) {
          console.log(`  -> FOUND in sheet "${sheetName}", row ${idx + 2}: ${rowStr}`);
        }
      });
    });
  } catch (err) {
    console.error(`  Error reading ${filePath}:`, err.message);
  }
}

function traverse(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        traverse(fullPath);
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.csv') {
        searchInCSV(fullPath);
      } else if (ext === '.xlsx') {
        searchInXLSX(fullPath);
      }
    }
  }
}

console.log(`Starting search for ID: "${searchId}" in all CSV and XLSX files...\n`);
traverse('.');
console.log("\nSearch finished.");
