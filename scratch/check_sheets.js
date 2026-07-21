import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch'; // Wait, let's check if we can use global fetch in Node 18+ (Node 22 is in package.json devDependencies, so global fetch is definitely available). If not, we'll write standard code.

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DRIVERS_SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSWnrFQgrot22f8B5ByeHSH5Jt_AdnEvXDpcHZAi3sCdX3JnSdQ0xkXiujUtkw9PHc2DhRCw9eNg8Lx/pub?gid=0&single=true&output=csv';
const VEHICLES_SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRgi_mZfm-IlKYs7R7B2B4023qhLuywBkYRdO52uVCXEpa-qrNQENrqzMWJ6K_ddg3SlJbFrHLt7Saq/pub?gid=0&single=true&output=csv';

function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  function parseLine(line) {
    const fields = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim()); current = '';
      } else { current += ch; }
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== ''));
}

async function analyze() {
  console.log("=== DESCARGANDO DATOS DE GOOGLE SHEETS ===");
  
  // 1. Fetch Drivers Sheet
  console.log("Fetching Drivers Sheet...");
  const resDrivers = await fetch(DRIVERS_SHEET);
  const textDrivers = await resDrivers.text();
  const driversRows = parseCSV(textDrivers);
  console.log(`Cargadas ${driversRows.length} filas de conductores del Google Sheet.`);

  // 2. Fetch Vehicles Sheet
  console.log("Fetching Vehicles Sheet...");
  const resVehicles = await fetch(VEHICLES_SHEET);
  const textVehicles = await resVehicles.text();
  const vehiclesRows = parseCSV(textVehicles);
  console.log(`Cargadas ${vehiclesRows.length} filas de vehículos del Google Sheet.`);

  // 3. Fetch Supabase Data
  console.log("Cargando base de datos Supabase...");
  const { data: dbConductores, error: eC } = await supabase
    .from('conductores')
    .select('*');
  if (eC) throw eC;

  const { data: dbVehiculos, error: eV } = await supabase
    .from('vehiculos')
    .select('*');
  if (eV) throw eV;

  console.log(`En Supabase: ${dbConductores.length} conductores, ${dbVehiculos.length} vehículos.`);

  // Maps para cruces
  const dbCondsByCedula = new Map();
  const dbCondsByName = new Map();
  dbConductores.forEach(c => {
    if (c.cedula) dbCondsByCedula.set(String(c.cedula).trim(), c);
    dbCondsByName.set(normalizeName(c.nombres), c);
  });

  const dbVehsByPlaca = new Map();
  dbVehiculos.forEach(v => {
    if (v.placa) dbVehsByPlaca.set(String(v.placa).trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), v);
  });

  // 4. Buscar Conductor 1005181554 en Google Sheets
  console.log("\n=== BUSCANDO DRIVER 1005181554 EN EL GOOGLE SHEET ===");
  const targetId = '1005181554';
  
  // Buscar por cualquier columna en la fila que contenga el targetId
  const matchInSheets = driversRows.filter(row => {
    return Object.values(row).some(val => String(val).includes(targetId));
  });

  if (matchInSheets.length > 0) {
    console.log(`¡ENCONTRADO en el Google Sheet!`, matchInSheets);
  } else {
    console.log(`No se encontró la cédula ${targetId} en el Google Sheet de Conductores.`);
    // Busquemos coincidencia parcial o por nombre
    console.log("Buscando cédulas parecidas:");
    driversRows.forEach((row, index) => {
      const ced = String(row['NO_CEDULA_CIUDADANIA'] || row['CEDULA'] || '');
      if (ced.includes(targetId.substring(0, 6))) {
        console.log(`  Row ${index+2}: Nombre=${row['NOMBRES']}, Cedula=${ced}`);
      }
    });
  }

  // 5. Cruce de todos los conductores de Google Sheets vs Supabase
  console.log("\n=== COMPROBANDO CONDUCTORES EN GOOGLE SHEETS QUE NO ESTÁN EN SUPABASE ===");
  const missingDrivers = [];
  driversRows.forEach((row, idx) => {
    const nombres = row['NOMBRES'] || '';
    const cedula = String(row['NO_CEDULA_CIUDADANIA'] || row['CEDULA'] || '').trim();
    const estado = row['ESTADO_DEL_CONDUCTOR'] || row['ESTADO'] || 'ACTIVO';
    
    if (!cedula) return; // Saltamos si no tiene cédula

    let matched = dbCondsByCedula.get(cedula);
    if (!matched) {
      matched = dbCondsByName.get(normalizeName(nombres));
    }

    if (!matched) {
      missingDrivers.push({
        rowNum: idx + 2,
        nombres,
        cedula,
        estado
      });
    }
  });

  console.log(`Total conductores del Google Sheet que NO están en Supabase: ${missingDrivers.length}`);
  console.log("Muestra (primeros 20):");
  missingDrivers.slice(0, 20).forEach(md => {
    console.log(`  Fila ${md.rowNum}: ${md.nombres} | Cédula: ${md.cedula} | Estado: ${md.estado}`);
  });

  // 6. Cruce de todos los vehículos de Google Sheets vs Supabase
  console.log("\n=== COMPROBANDO VEHÍCULOS EN GOOGLE SHEETS QUE NO ESTÁN EN SUPABASE ===");
  const missingVehicles = [];
  vehiclesRows.forEach((row, idx) => {
    const placa = String(row['PLACA'] || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const marca = row['MARCA'] || '';
    const tipo = row['TIPO_ACTIVO'] || '';
    const contrato = row['CONTRATO_ASOCIADO'] || '';

    if (!placa) return;

    const matched = dbVehsByPlaca.get(placa);
    if (!matched) {
      missingVehicles.push({
        rowNum: idx + 2,
        placa,
        marca,
        tipo,
        contrato
      });
    }
  });

  console.log(`Total vehículos del Google Sheet que NO están en Supabase: ${missingVehicles.length}`);
  console.log("Muestra (primeros 20):");
  missingVehicles.slice(0, 20).forEach(mv => {
    console.log(`  Fila ${mv.rowNum}: Placa: ${mv.placa} | Marca: ${mv.marca} | Tipo: ${mv.tipo} | Contrato: ${mv.contrato}`);
  });
}

analyze();
