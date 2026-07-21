import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const contratoId = '3b2b1604-4b6d-4786-a077-04c1d4be39cc'; // ECOPETROL VRC-TIBU
const fechaInicio = '2026-04-29';
const fechaFin = '2026-05-28';

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

async function diagnoseAlerts() {
  console.log("=== COMPROBACIÓN DE ALERTAS DIARIAS DE GPS PARA DUPLICADOS ===");
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

    let totalAlertsCount = 0;

    for (const cond of condsVrcTibu) {
      const key = normName(cond.nombres);
      const matches = mapNombreACond.get(key) || [];
      const duplicates = matches.filter(m => m.id !== cond.id);

      for (const dup of duplicates) {
        // Consultar alertas diarias asociadas a este duplicado
        const { count, error } = await supabase
          .from('alertas_diarias_gps')
          .select('*', { count: 'exact', head: true })
          .eq('conductor_id', dup.id);
        
        if (error) throw error;

        if (count > 0) {
          totalAlertsCount += count;
          console.log(`- Duplicado "${dup.nombres}" (ID: ${dup.id}, Cédula: ${dup.cedula}) tiene ${count} alerta(s) de GPS.`);
        }
      }
    }

    console.log(`\nTotal alertas de GPS encontradas para conductores duplicados: ${totalAlertsCount}`);
  } catch (err) {
    console.error("❌ Error en diagnóstico de alertas:", err.message);
  }
}

diagnoseAlerts();
