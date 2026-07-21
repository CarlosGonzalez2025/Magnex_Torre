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
  try {
    const allDrivers = await fetchAllRows(supabase.from('conductores').select('*'));
    const oficiales = allDrivers.filter(c => c.contrato_id !== null && c.estado === 'ACTIVO');
    
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

    let countWithDuplicates = 0;
    for (const cond of oficiales) {
      const key = normName(cond.nombres);
      const matches = mapNombreACond.get(key) || [];
      const duplicates = matches.filter(m => {
        if (m.id === cond.id) return false;
        const esNulo = m.contrato_id === null;
        const esPendiente = String(m.estado ?? '').toUpperCase() === 'PENDIENTE GOOGLE SHEETS';
        const esCedulaTemp = String(m.cedula ?? '').startsWith('TEMP_CC_') || String(m.cedula ?? '').startsWith('-');
        return esNulo || esPendiente || esCedulaTemp;
      });
      if (duplicates.length > 0) {
        countWithDuplicates++;
      }
    }
    console.log(`TOTAL_WITH_DUPLICATES: ${countWithDuplicates}`);
  } catch (err) {
    console.error(err);
  }
}

run();
