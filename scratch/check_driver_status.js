import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

async function runCheck() {
  console.log("=== 1. CARGANDO MAESTRO DE CONDUCTORES DESDE SUPABASE ===");
  const { data: dbConductores, error: eC } = await supabase
    .from('conductores')
    .select('id, nombres, cedula, ibutton, proyecto, estado, contrato_id');
  if (eC) {
    console.error("Error cargando conductores de Supabase:", eC);
    return;
  }
  console.log(`Cargados ${dbConductores.length} conductores de Supabase.`);

  const conductPorCedula = new Map();
  const conductPorNombreNorm = new Map();
  dbConductores.forEach(c => {
    if (c.cedula) conductPorCedula.set(String(c.cedula).trim(), c);
    conductPorNombreNorm.set(normalizeName(c.nombres), c);
  });

  console.log("\n=== 2. ANALIZANDO EL CONDUCTOR ESPÉCIFICO 1005181554 ===");
  const targetId = '1005181554';
  const dbMatchById = conductPorCedula.get(targetId);
  if (dbMatchById) {
    console.log(`Encontrado en Supabase por ID: ID=${dbMatchById.id}, Nombre=${dbMatchById.nombres}, Cedula=${dbMatchById.cedula}, Estado=${dbMatchById.estado}, Proyecto=${dbMatchById.proyecto}`);
  } else {
    console.log(`NO se encontró el conductor con cédula ${targetId} en la base de datos Supabase ('conductores').`);
  }

  // --- BUSCAR EN COLTRACK CONDUCTORES CSV ---
  console.log("\n=== 3. BUSCANDO EN coltrack/Conductores_Coltrack.csv ===");
  const coltrackDrivers = [];
  try {
    const driversContent = fs.readFileSync('coltrack/Conductores_Coltrack.csv', 'utf-8');
    const dLines = driversContent.split('\n').filter(l => l.trim().length > 0);
    console.log(`Leídas ${dLines.length} líneas de Conductores_Coltrack.csv.`);
    
    // Header check
    console.log("Header:", dLines[0]);
    
    for (let i = 1; i < dLines.length; i++) {
      const cols = dLines[i].split('|');
      if (cols.length >= 5) {
        const nombre = cols[0];
        const apellido = cols[1];
        const ibutton = cols[2];
        const cedula = cols[4] ? String(cols[4]).trim() : '';
        const fullName = `${nombre} ${apellido}`;
        const fullNameNorm = normalizeName(fullName);
        
        coltrackDrivers.push({ nombre, apellido, fullName, fullNameNorm, ibutton, cedula, line: i + 1 });
        
        if (cedula === targetId || fullName.includes(targetId) || ibutton.includes(targetId)) {
          console.log(`Línea ${i + 1} coincidente: Nombre=${nombre}, Apellido=${apellido}, iButton=${ibutton}, Cédula=${cedula}`);
        }
      }
    }
  } catch (err) {
    console.error("Error al leer Conductores_Coltrack.csv:", err.message);
  }

  // --- BUSCAR EN COLTRACK CONSOLIDADO FALTAS CSV ---
  console.log("\n=== 4. BUSCANDO EN coltrack/Consolidado_Faltas_Por_Conductor_Coltrack.csv ===");
  const coltrackFaltas = [];
  try {
    const condContent = fs.readFileSync('coltrack/Consolidado_Faltas_Por_Conductor_Coltrack.csv', 'utf-8');
    const cLines = condContent.split('\n').filter(l => l.trim().length > 0);
    const cHeaders = cLines[0].split('|').map(h => h.trim());
    console.log(`Leídas ${cLines.length} líneas del Consolidado de Faltas Coltrack.`);
    for (let i = 1; i < cLines.length; i++) {
      const cols = cLines[i].split('|');
      if (cols.length >= 2) {
        const row = {};
        cHeaders.forEach((h, idx) => {
          row[h] = cols[idx];
        });
        coltrackFaltas.push(row);
        
        const condName = row['Conductor'];
        const kms = row['kms'];
        if (condName && (condName.includes(targetId) || String(row['kms']).includes(targetId))) {
          console.log(`Encontrado en faltas: ${JSON.stringify(row)}`);
        }
      }
    }
  } catch (err) {
    console.error("Error al leer Consolidado_Faltas_Por_Conductor_Coltrack.csv:", err.message);
  }

  // Vamos a ver si el conductor targetId está de alguna manera mapeado en los conductores del consolidado
  console.log("\n=== 5. ANALIZANDO SI EL CONDUCTOR TIENE REGISTROS EN EL CONSOLIDADO DE FALTAS DE COLTRACK ===");
  // Buscamos si el conductor targetId o su nombre normalizado está en los reportes de kilómetros
  const targetInDriversFile = coltrackDrivers.find(d => d.cedula === targetId);
  if (targetInDriversFile) {
    console.log(`El conductor ${targetId} existe en Conductores_Coltrack.csv como: ${targetInDriversFile.fullName}`);
    // Busquemos este nombre en el Consolidado de Faltas
    const matchedFaltas = coltrackFaltas.filter(f => normalizeName(f['Conductor']) === targetInDriversFile.fullNameNorm);
    if (matchedFaltas.length > 0) {
      console.log(`Se encontraron registros de kilómetros/faltas para ${targetInDriversFile.fullName} en Consolidado de Faltas:`, matchedFaltas);
    } else {
      console.log(`NO se encontraron registros en el Consolidado de Faltas Coltrack para el nombre normalizado: ${targetInDriversFile.fullNameNorm}`);
    }
  } else {
    console.log(`El conductor ${targetId} no fue hallado en Conductores_Coltrack.csv buscando por cédula exacta.`);
    // Busquemos si hay alguna cédula parecida o nombre parecido
    console.log("Buscando cédulas parciales:");
    coltrackDrivers.forEach(d => {
      if (d.cedula.includes(targetId.slice(0, 6))) {
        console.log(`  Coincidencia parcial cédula: ${d.fullName} (Cédula: ${d.cedula})`);
      }
    });
  }

  // --- CRUCE GLOBAL DE CONDUCTORES ---
  console.log("\n=== 6. CRUCE GLOBAL: CONDUCTORES EN ARCHIVOS VS SUPABASE ===");
  console.log("--- A. CONDUCTORES DE COLTRACK (Conductores_Coltrack.csv) ---");
  let coltrackUnmatched = 0;
  const coltrackUnmatchedList = [];
  
  // Agrupar conductores únicos en Conductores_Coltrack.csv (algunos nombres podrían repetirse)
  const uniqueColtrackDrivers = new Map();
  coltrackDrivers.forEach(d => {
    uniqueColtrackDrivers.set(d.fullNameNorm, d);
  });

  console.log(`Conductores únicos en Conductores_Coltrack.csv: ${uniqueColtrackDrivers.size}`);
  
  for (const [normName, d] of uniqueColtrackDrivers.entries()) {
    let dbCond = conductPorNombreNorm.get(normName);
    if (!dbCond && d.cedula) {
      dbCond = conductPorCedula.get(d.cedula);
    }
    
    // Verifiquemos si este conductor tiene kilómetros en el consolidado antes de reportarlo
    const tieneKms = coltrackFaltas.some(f => normalizeName(f['Conductor']) === normName);
    
    if (!dbCond) {
      coltrackUnmatched++;
      coltrackUnmatchedList.push({
        nombre: d.fullName,
        cedula: d.cedula,
        ibutton: d.ibutton,
        tieneKms: tieneKms ? 'SÍ' : 'NO',
        origen: 'Coltrack (Conductores)'
      });
    }
  }
  
  console.log(`Conductores de Conductores_Coltrack.csv que NO están en Supabase: ${coltrackUnmatched}`);
  if (coltrackUnmatched > 0) {
    console.log("Muestra de conductores no encontrados:");
    coltrackUnmatchedList.slice(0, 15).forEach(u => {
      console.log(`  - ${u.nombre} | Cédula: ${u.cedula} | iButton: ${u.ibutton} | ¿Tiene registros de kms/faltas?: ${u.tieneKms}`);
    });
  }

  console.log("\n--- B. CONDUCTORES DE FAGOR (Conductores_Fagor.xlsx) ---");
  const fagorDrivers = [];
  try {
    const wbCond = XLSX.readFile('fagor/Conductores_Fagor.xlsx');
    const sheetCond = wbCond.Sheets[wbCond.SheetNames[0]];
    const rowsCond = XLSX.utils.sheet_to_json(sheetCond);
    rowsCond.forEach(row => {
      const nombre = row['Nombre'] ?? '';
      const primerAp = row['Primer Apellido'] ?? '';
      const segundoAp = row['Segundo Apellido'] ?? '';
      const fullName = `${nombre} ${primerAp} ${segundoAp}`.replace(/\s+/g, ' ').trim();
      const fullNameNorm = normalizeName(fullName);
      const ibutton = String(row['Código iButton'] ?? '').trim();
      const cedula = String(row['DNI'] ?? '').trim();
      fagorDrivers.push({ fullName, fullNameNorm, ibutton, cedula });
    });

    const uniqueFagorDrivers = new Map();
    fagorDrivers.forEach(d => {
      uniqueFagorDrivers.set(d.fullNameNorm, d);
    });

    console.log(`Conductores únicos en Conductores_Fagor.xlsx: ${uniqueFagorDrivers.size}`);
    
    // Cargar Km Conductor Fagor
    const wbKmCond = XLSX.readFile('fagor/Km_Conductor_Fagor 1.xlsx');
    const sheetKmCond = wbKmCond.Sheets[wbKmCond.SheetNames[0]];
    const rawRowsKmCond = XLSX.utils.sheet_to_json(sheetKmCond, { header: 1 });
    const headersKmCond = rawRowsKmCond[2].map(h => String(h ?? '').trim());
    const fagorKmsList = [];
    for (let i = 3; i < rawRowsKmCond.length; i++) {
      const rowData = rawRowsKmCond[i];
      if (rowData.length > 1) {
        const row = {};
        headersKmCond.forEach((h, idx) => {
          row[h] = rowData[idx];
        });
        if (row['Conductor'] && row['Conductor'] !== 'N/A') {
          fagorKmsList.push(row);
        }
      }
    }

    let fagorUnmatched = 0;
    const fagorUnmatchedList = [];
    for (const [normName, d] of uniqueFagorDrivers.entries()) {
      let dbCond = conductPorNombreNorm.get(normName);
      if (!dbCond && d.cedula) {
        dbCond = conductPorCedula.get(d.cedula);
      }
      
      const tieneKms = fagorKmsList.some(f => normalizeName(f['Conductor']) === normName);
      
      if (!dbCond) {
        fagorUnmatched++;
        fagorUnmatchedList.push({
          nombre: d.fullName,
          cedula: d.cedula,
          ibutton: d.ibutton,
          tieneKms: tieneKms ? 'SÍ' : 'NO',
          origen: 'Fagor (Conductores)'
        });
      }
    }

    console.log(`Conductores de Conductores_Fagor.xlsx que NO están en Supabase: ${fagorUnmatched}`);
    if (fagorUnmatched > 0) {
      console.log("Muestra de conductores no encontrados:");
      fagorUnmatchedList.slice(0, 15).forEach(u => {
        console.log(`  - ${u.nombre} | Cédula: ${u.cedula} | iButton: ${u.ibutton} | ¿Tiene registros de kms/faltas?: ${u.tieneKms}`);
      });
    }
  } catch (err) {
    console.error("Error procesando Fagor:", err.message);
  }
}

runCheck();
