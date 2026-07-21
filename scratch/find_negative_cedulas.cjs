const fs = require('fs');

async function run() {
  const content = fs.readFileSync('coltrack/Conductores_Coltrack.csv', 'utf-8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  
  console.log("=== COMPROBANDO CÉDULAS NEGATIVAS EN EL CSV ===");
  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('|');
    if (cols.length >= 5) {
      const nombre = cols[0];
      const apellido = cols[1];
      const ibutton = cols[2];
      const cedula = cols[4];
      
      if (cedula && cedula.startsWith('-')) {
        count++;
        console.log(`Fila ${i+1}: ${nombre} ${apellido} | iButton: ${ibutton} | Cédula: ${cedula}`);
      }
    }
  }
  console.log(`Total filas con cédula negativa: ${count}`);
}

run();
