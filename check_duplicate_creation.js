import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const contratoId = '3b2b1604-4b6d-4786-a077-04c1d4be39cc'; // ECOPETROL VRC-TIBU

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

async function inspectCreation() {
  console.log("=== INSPECCIÓN DE CREACIÓN DE CONDUCTORES DUPLICADOS ===");
  try {
    const allDrivers = await fetchAllRows(supabase.from('conductores').select('*'));
    const condsVrcTibu = allDrivers.filter(c => c.contrato_id === contratoId);

    const normName = (name) =>
      String(name ?? '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, ' ');

    const mapNombreACond = new Map();
    allDrivers.forEach(d => {
      const key = normName(d.nombres);
      if (!mapNombreACond.has(key)) {
        mapNombreACond.set(key, []);
      }
      mapNombreACond.get(key).push(d);
    });

    for (const cond of condsVrcTibu) {
      const key = normName(cond.nombres);
      const matches = mapNombreACond.get(key) || [];
      const duplicates = matches.filter(m => m.id !== cond.id);

      if (duplicates.length > 0) {
        console.log(`\nConductor: "${cond.nombres}"`);
        console.log(`  OFICIAL   -> ID: ${cond.id} | Cédula: ${cond.cedula} | iButton: ${cond.ibutton} | Creado: ${cond.created_at}`);
        
        for (const dup of duplicates) {
          console.log(`  DUPLICADO -> ID: ${dup.id} | Cédula: ${dup.cedula} | iButton: ${dup.ibutton} | Creado: ${dup.created_at} | Estado: ${dup.estado}`);
        }
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

inspectCreation();
