import fs from 'fs';

function search() {
  const files = [
    'coltrack/Conductores_Coltrack.csv',
    'coltrack/Consolidado_Faltas_Por_Conductor_Coltrack.csv'
  ];
  
  files.forEach(file => {
    console.log(`\n=== SEARCHING IN ${file} ===`);
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      let found = false;
      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes('mardory') || line.toLowerCase().includes('pineda')) {
          console.log(`Line ${idx + 1}: ${line.trim()}`);
          found = true;
        }
      });
      if (!found) {
        console.log("No records found containing 'mardory' or 'pineda'.");
      }
    } catch (e) {
      console.error(e.message);
    }
  });
}

search();
