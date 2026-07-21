const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  console.log("=== BUSCANDO DUPLICADOS CON KMS > 0 EN OTROS CONTRATOS ===");
  try {
    // 1. Obtener todos los conductores con paginación
    const allDrivers = await fetchAllRows(
      supabase.from('conductores').select('*')
    );
    console.log(`Total conductores en DB: ${allDrivers.length}`);

    // 2. Obtener todos los contratos
    const { data: allContracts, error: cErr } = await supabase
      .from('contratos')
      .select('*');
    if (cErr) throw cErr;

    const contractMap = new Map(allContracts.map(c => [c.id, c.nombre]));

    const normName = (name) =>
      String(name ?? '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, ' ');

    // Agrupar conductores oficiales (con contrato_id) e inactivos/duplicados (sin contrato_id o estado PENDIENTE)
    const oficiales = allDrivers.filter(d => d.contrato_id !== null && d.estado === 'ACTIVO');
    const duplicados = allDrivers.filter(d => d.contrato_id === null || d.estado === 'PENDIENTE GOOGLE SHEETS');

    const oficialesMap = new Map();
    oficiales.forEach(d => {
      oficialesMap.set(normName(d.nombres), d);
    });

    console.log(`Conductores Oficiales Activos: ${oficiales.length}`);
    console.log(`Conductores Duplicados/Pendientes: ${duplicados.length}`);

    // Buscar reportes con kms > 0 vinculados a duplicados
    const affectedContracts = new Map(); // contratoId -> { name, count, totalKms, drivers: [] }

    // Haremos consultas por lotes (para no hacer miles de peticiones individuales)
    const dupIds = duplicados.map(d => d.id);
    const allDupReps = [];
    
    // Paginación por lotes de 100 ids
    const BATCH_SIZE = 100;
    for (let i = 0; i < dupIds.length; i += BATCH_SIZE) {
      const batch = dupIds.slice(i, i + BATCH_SIZE);
      const { data: reps, error: rErr } = await supabase
        .from('reportes_conductores')
        .select('*')
        .in('conductor_id', batch)
        .gt('kms', 0);
      if (rErr) throw rErr;
      allDupReps.push(...(reps ?? []));
    }

    console.log(`Total reportes huérfanos con Kms > 0: ${allDupReps.length}`);

    // Mapear cada reporte a su conductor oficial
    const dupMap = new Map(duplicados.map(d => [d.id, d]));
    
    for (const rep of allDupReps) {
      const dup = dupMap.get(rep.conductor_id);
      if (!dup) continue;
      
      const official = oficialesMap.get(normName(dup.nombres));
      if (official) {
        const cId = official.contrato_id;
        const cName = contractMap.get(cId) || 'Contrato Desconocido';
        
        if (!affectedContracts.has(cId)) {
          affectedContracts.set(cId, { name: cName, count: 0, totalKms: 0, drivers: [] });
        }
        
        const info = affectedContracts.get(cId);
        info.count++;
        info.totalKms += Number(rep.kms ?? 0);
        
        // Agregar si no existe ya
        let dInfo = info.drivers.find(d => d.nombre === official.nombres);
        if (!dInfo) {
          dInfo = { nombre: official.nombres, kms: 0, repsCount: 0 };
          info.drivers.push(dInfo);
        }
        dInfo.kms += Number(rep.kms ?? 0);
        dInfo.repsCount++;
      }
    }

    console.log("\n=== CONTRATOS AFECTADOS POR DUPLICADOS CON KILOMETRAJE ===");
    if (affectedContracts.size === 0) {
      console.log("No se encontraron otros contratos con telemetría huérfana en duplicados.");
    } else {
      affectedContracts.forEach((info, cId) => {
        console.log(`\nContrato: "${info.name}" (ID: ${cId})`);
        console.log(`  Reportes Huérfanos: ${info.count} | Kilómetros Afectados: ${info.totalKms.toFixed(2)} km`);
        console.log(`  Conductores implicados:`);
        info.drivers.forEach(d => {
          console.log(`    - "${d.nombre}" | Kms en duplicado: ${d.kms.toFixed(2)} km (${d.repsCount} reporte/s)`);
        });
      });
    }

  } catch (err) {
    console.error("Error:", err.message);
  }
}

run();
