import fs from 'fs';

function inspect() {
  const f1 = 'coltrack/Consolidado_Faltas_Por_Vehículo_Coltrack.csv';
  const f2 = 'coltrack/Ralenti_Coltrack.csv';

  console.log(`=== ${f1} ===`);
  const lines1 = fs.readFileSync(f1, 'utf8').split('\n');
  console.log("Line 1 (Header):", lines1[0]);
  console.log("Line 2:", lines1[1]);
  console.log("Delimiter detected: ", lines1[0].includes('|') ? 'pipe (|)' : lines1[0].includes(';') ? 'semicolon (;)' : 'comma (,)');

  console.log(`\n=== ${f2} ===`);
  const lines2 = fs.readFileSync(f2, 'utf8').split('\n');
  console.log("Line 1 (Header):", lines2[0]);
  console.log("Line 2:", lines2[1]);
  console.log("Delimiter detected: ", lines2[0].includes('|') ? 'pipe (|)' : lines2[0].includes(';') ? 'semicolon (;)' : 'comma (,)');
}

inspect();
