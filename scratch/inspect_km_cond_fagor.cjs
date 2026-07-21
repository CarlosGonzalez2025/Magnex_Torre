const XLSX = require('xlsx');

async function run() {
  try {
    const wb = XLSX.readFile('fagor/Km_Conductor_Fagor 1.xlsx');
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log("=== INSPECCIONANDO KM CONDUCTOR FAGOR ===");
    console.log("Total filas:", rows.length);
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      console.log(`Fila ${i}:`, JSON.stringify(rows[i]));
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

run();
