const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

const normName = (name) =>
  normalizeText(name)
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');

const normCedula = (cedula) => {
  if (cedula === undefined || cedula === null) return '';
  return String(cedula)
    .replace(/[^A-Z0-9]/gi, '')
    .trim()
    .toUpperCase();
};

async function fetchAllRows(query) {
  const allRows = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    allRows.push(...(data ?? []));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

async function run() {
  console.log("=== SIMULANDO LÓGICA DE ASOCIACIÓN CON PAGINACIÓN ===");

  // 1. Cargar maestros (como en importarDatosPlanosColtrack)
  const dbConductores = await fetchAllRows(
    supabase
      .from('conductores')
      .select('id, nombres, cedula, ibutton, proyecto, estado')
  );
  console.log(`Total de conductores cargados de la base de datos: ${dbConductores.length}`);

  // Indexar maestros
  const conductPorCedula = new Map();
  const conductPorNombreNorm = new Map();
  dbConductores.forEach(c => {
    if (c.cedula) conductPorCedula.set(normCedula(c.cedula), c);
    conductPorNombreNorm.set(normName(c.nombres), c);
  });

  // 2. Cargar mapeo de iButtons
  const driverMap = new Map();
  const driversContent = fs.readFileSync('coltrack/Conductores_Coltrack.csv', 'utf-8');
  const dLines = driversContent.split('\n').filter(l => l.trim().length > 0);
  for (let i = 1; i < dLines.length; i++) {
    const cols = dLines[i].split('|');
    if (cols.length >= 5) {
      const nombre = cols[0] ?? '';
      const apellido = cols[1] ?? '';
      const ibutton = cols[2] ?? '';
      const cedula = cols[4] ?? '';
      const fullNameNorm = normName(`${nombre} ${apellido}`);
      driverMap.set(fullNameNorm, { ibutton, cedula });
    }
  }

  // 3. Procesar Conductor en Consolidado
  const condContent = fs.readFileSync('coltrack/Consolidado_Faltas_Por_Conductor_Coltrack.csv', 'utf-8');
  const cLines = condContent.split('\n').filter(l => l.trim().length > 0);
  const cHeaders = cLines[0].split(';').map(h => h.trim());

  const targetDriver = "Diego Alejandro Alarcon Luna";
  const targetNorm = normName(targetDriver);

  console.log(`\nBúsqueda para: "${targetDriver}" (norm: "${targetNorm}")`);
  
  // Buscar en conductPorNombreNorm
  const fromNombreNorm = conductPorNombreNorm.get(targetNorm);
  if (fromNombreNorm) {
    console.log(`Encontrado en conductPorNombreNorm: ID: ${fromNombreNorm.id} | Nombres: "${fromNombreNorm.nombres}" | Cédula: "${fromNombreNorm.cedula}" | Estado: "${fromNombreNorm.estado}"`);
  } else {
    console.log("NO encontrado en conductPorNombreNorm");
  }

  // Buscar en driverMap
  const mapped = driverMap.get(targetNorm);
  if (mapped) {
    console.log(`Encontrado en driverMap: Cédula: "${mapped.cedula}" | iButton: "${mapped.ibutton}"`);
    
    // Buscar por cédula mapeada
    const fromCedMapped = conductPorCedula.get(normCedula(mapped.cedula));
    if (fromCedMapped) {
      console.log(`Encontrado en conductPorCedula usando la cédula mapeada: ID: ${fromCedMapped.id} | Nombres: "${fromCedMapped.nombres}" | Cédula: "${fromCedMapped.cedula}"`);
    } else {
      console.log(`NO encontrado en conductPorCedula usando la cédula mapeada "${mapped.cedula}"`);
    }
  } else {
    console.log("NO encontrado en driverMap");
  }

  // Coincidencias en dbConductores
  const dbMatches = dbConductores.filter(c => normName(c.nombres) === targetNorm);
  console.log(`\nCoincidencias en dbConductores de memoria (${dbMatches.length}):`);
  dbMatches.forEach(m => {
    console.log(`- ID: ${m.id} | Nombres: "${m.nombres}" | Cédula: "${m.cedula}" | iButton: "${m.ibutton}" | Estado: "${m.estado}"`);
  });
}

run();
