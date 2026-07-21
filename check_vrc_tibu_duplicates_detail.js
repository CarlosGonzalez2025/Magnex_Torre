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

async function diagnoseDuplicates() {
  console.log("=== DIAGNÓSTICO DETALLADO DE DUPLICADOS PARA ECOPETROL VRC-TIBU ===");
  try {
    // 1. Fetch all drivers
    console.log("Obteniendo todos los conductores...");
    const allDrivers = await fetchAllRows(
      supabase.from('conductores').select('*')
    );
    console.log(`Total conductores en DB: ${allDrivers.length}`);

    const condsVrcTibu = allDrivers.filter(c => c.contrato_id === contratoId);
    console.log(`Conductores asignados a ECOPETROL VRC-TIBU: ${condsVrcTibu.length}`);

    const normName = (name) =>
      String(name ?? '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, ' ');

    // Group drivers by normalized name
    const mapNombreACond = new Map();
    allDrivers.forEach(d => {
      const key = normName(d.nombres);
      if (!mapNombreACond.has(key)) {
        mapNombreACond.set(key, []);
      }
      mapNombreACond.get(key).push(d);
    });

    let totalRepsCount = 0;
    let totalRepsKms = 0;
    let totalDailyCount = 0;
    let totalDailyKms = 0;
    let matchedDuplicatesCount = 0;

    console.log("\nBuscando duplicados para los conductores de ECOPETROL VRC-TIBU:");
    for (const cond of condsVrcTibu) {
      const key = normName(cond.nombres);
      const matches = mapNombreACond.get(key) || [];
      const duplicates = matches.filter(m => m.id !== cond.id);

      if (duplicates.length > 0) {
        console.log(`\n--------------------------------------------------`);
        console.log(`OFICIAL: Nombres: "${cond.nombres}" | ID: ${cond.id} | Cédula: ${cond.cedula} | Estado: ${cond.estado}`);
        
        for (const dup of duplicates) {
          matchedDuplicatesCount++;
          console.log(`  DUPLICADO: ID: ${dup.id} | Cédula: ${dup.cedula} | contrato_id: ${dup.contrato_id} | Estado: ${dup.estado}`);

          // Check monthly reports for this duplicate in the period
          const { data: reps, error: repErr } = await supabase
            .from('reportes_conductores')
            .select('*')
            .eq('conductor_id', dup.id)
            .eq('periodo_inicio', fechaInicio)
            .eq('periodo_fin', fechaFin);
          
          if (repErr) throw repErr;

          let repKms = 0;
          if (reps && reps.length > 0) {
            repKms = reps.reduce((s, r) => s + Number(r.kms ?? 0), 0);
            totalRepsCount += reps.length;
            totalRepsKms += repKms;
            console.log(`    -> ${reps.length} reporte(s) mensual(es) en periodo: ${repKms.toFixed(2)} Kms`);
          } else {
            console.log(`    -> 0 reportes mensuales en periodo`);
          }

          // Check daily telemetry for this duplicate in the period
          const { data: daily, error: dailyErr } = await supabase
            .from('coltrack_datos_conductor')
            .select('*')
            .eq('conductor_id', dup.id)
            .gte('fecha', fechaInicio)
            .lte('fecha', fechaFin);
          
          if (dailyErr) throw dailyErr;

          let dailyKms = 0;
          if (daily && daily.length > 0) {
            dailyKms = daily.reduce((s, r) => s + Number(r.kms ?? 0), 0);
            totalDailyCount += daily.length;
            totalDailyKms += dailyKms;
            console.log(`    -> ${daily.length} registro(s) diario(s) en periodo: ${dailyKms.toFixed(2)} Kms`);
          } else {
            console.log(`    -> 0 registros diarios en periodo`);
          }
        }
      }
    }

    console.log(`\n==================================================`);
    console.log(`RESUMEN DIAGNÓSTICO:`);
    console.log(`- Duplicados encontrados: ${matchedDuplicatesCount}`);
    console.log(`- Total Reportes Mensuales huérfanos del período: ${totalRepsCount} (${totalRepsKms.toFixed(2)} km)`);
    console.log(`- Total Registros Diarios huérfanos del período: ${totalDailyCount} (${totalDailyKms.toFixed(2)} km)`);
    console.log(`==================================================`);

  } catch (err) {
    console.error("❌ Error en el diagnóstico:", err.message);
  }
}

diagnoseDuplicates();
