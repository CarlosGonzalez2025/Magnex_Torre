const XLSX = require('xlsx');

async function run() {
  try {
    const wb = XLSX.readFile('fagor/Conductores_Fagor.xlsx');
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);
    console.log("=== BUSCANDO POR NOMBRE EN FAGOR EXCEL ===");
    
    const matches = rows.filter(r => {
      const name = `${r['Nombre'] ?? ''} ${r['Primer Apellido'] ?? ''} ${r['Segundo Apellido'] ?? ''}`;
      return name.toUpperCase().includes('DIEGO');
    });

    matches.forEach(r => {
      console.log(JSON.stringify(r, null, 2));
    });
  } catch (err) {
    console.error("Error:", err.message);
  }
}

run();
