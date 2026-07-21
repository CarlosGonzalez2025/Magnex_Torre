const XLSX = require('xlsx');

async function run() {
  try {
    const wb = XLSX.readFile('fagor/Conductores_Fagor.xlsx');
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);
    console.log("=== BUSCANDO POR DNI EN FAGOR EXCEL ===");
    
    const matches = rows.filter(r => {
      return String(r['DNI'] ?? '') === '26378865';
    });

    matches.forEach(r => {
      console.log(JSON.stringify(r, null, 2));
    });
  } catch (err) {
    console.error("Error:", err.message);
  }
}

run();
