import fs from 'fs';

function inspect() {
  const filePath = 'coltrack/Conductores_Coltrack.csv';
  console.log(`Checking file size: ${fs.statSync(filePath).size} bytes`);
  const buf = fs.readFileSync(filePath);
  
  // Check BOM
  console.log("First 10 bytes:", buf.slice(0, 10));
  
  // Try reading as UTF-16LE, UTF-8, and ISO-8859-1
  const utf8Text = buf.toString('utf8');
  const utf16leText = buf.toString('utf16le');
  const latin1Text = buf.toString('latin1');
  
  console.log("utf8 index of '1005181554':", utf8Text.indexOf('1005181554'));
  console.log("utf16le index of '1005181554':", utf16leText.indexOf('1005181554'));
  console.log("latin1 index of '1005181554':", latin1Text.indexOf('1005181554'));
  
  // Also search for partials
  console.log("utf8 index of '181554':", utf8Text.indexOf('181554'));
  console.log("utf8 index of '1005181':", utf8Text.indexOf('1005181'));
  
  // Let's print the first 500 characters of the UTF-8 text
  console.log("\nFirst 500 chars (utf8):\n", utf8Text.slice(0, 500));
}

inspect();
