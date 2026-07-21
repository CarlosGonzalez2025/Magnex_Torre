import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const contratosObjetivo = [
  '4bbd8493-20e0-4818-917c-ede4e001a676', // ECOPETROL VRC-ADMINISTRACIÓN
  '3b2b1604-4b6d-4786-a077-04c1d4be39cc', // ECOPETROL VRC-TIBU
];

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

const normName = (name) =>
  String(name ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');

async function runCleanup() {
  console.log('=== RECONCILIACIÓN DE DUPLICADOS: ECOPETROL VRC-TIBU + VRC-ADMINISTRACIÓN ===');

  const allDrivers = await fetchAllRows(supabase.from('conductores').select('*'));
  console.log(`Total conductores en BD: ${allDrivers.length}`);

  // Oficiales: los que están asignados a alguno de los 2 contratos objetivo (cualquier estado)
  const oficiales = allDrivers.filter(c => contratosObjetivo.includes(c.contrato_id));
  console.log(`Conductores oficiales en los 2 contratos: ${oficiales.length}`);

  const mapNombreACond = new Map();
  allDrivers.forEach(d => {
    const key = normName(d.nombres);
    if (!mapNombreACond.has(key)) mapNombreACond.set(key, []);
    mapNombreACond.get(key).push(d);
  });

  let reassignmentsReps = 0, mergesReps = 0;
  let reassignmentsDaily = 0, mergesDaily = 0;
  let reassignmentsAlerts = 0;
  let deletes = 0, inactivated = 0;

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

    if (duplicates.length === 0) continue;

    console.log(`\nConsolidando: "${cond.nombres}" (Oficial ID: ${cond.id})`);

    for (const dup of duplicates) {
      console.log(`  -> Duplicado ID: ${dup.id} | contrato_id: ${dup.contrato_id ?? 'NULL'} | estado: ${dup.estado}`);

      // 1. reportes_conductores: fusionar/reasignar respetando (periodo_inicio, periodo_fin, fuente)
      const { data: reps, error: repErr } = await supabase
        .from('reportes_conductores').select('*').eq('conductor_id', dup.id);
      if (repErr) throw repErr;

      for (const r of (reps ?? [])) {
        const { data: officialRep, error: offErr } = await supabase
          .from('reportes_conductores').select('*')
          .eq('conductor_id', cond.id)
          .eq('periodo_inicio', r.periodo_inicio)
          .eq('periodo_fin', r.periodo_fin)
          .eq('fuente', r.fuente ?? 'COLTRACK')
          .maybeSingle();
        if (offErr) throw offErr;

        if (officialRep) {
          const totalKms = Number(officialRep.kms ?? 0) + Number(r.kms ?? 0);
          const mergedCalificacion = totalKms > 0
            ? Math.round((Number(officialRep.calificacion ?? 100) * Number(officialRep.kms ?? 0) + Number(r.calificacion ?? 100) * Number(r.kms ?? 0)) / totalKms)
            : Math.round((Number(officialRep.calificacion ?? 100) + Number(r.calificacion ?? 100)) / 2);

          const { error: updErr } = await supabase.from('reportes_conductores').update({
            kms: totalKms,
            horas_conduccion: Number(officialRep.horas_conduccion ?? 0) + Number(r.horas_conduccion ?? 0),
            calificacion: mergedCalificacion,
            excesos_10_kph: Number(officialRep.excesos_10_kph ?? 0) + Number(r.excesos_10_kph ?? 0),
            excesos_20_kph: Number(officialRep.excesos_20_kph ?? 0) + Number(r.excesos_20_kph ?? 0),
            excesos_30_kph: Number(officialRep.excesos_30_kph ?? 0) + Number(r.excesos_30_kph ?? 0),
            excesos_40_kph: Number(officialRep.excesos_40_kph ?? 0) + Number(r.excesos_40_kph ?? 0),
            excesos_50_kph: Number(officialRep.excesos_50_kph ?? 0) + Number(r.excesos_50_kph ?? 0),
            excesos_60_kph: Number(officialRep.excesos_60_kph ?? 0) + Number(r.excesos_60_kph ?? 0),
            excesos_80_kph: Number(officialRep.excesos_80_kph ?? 0) + Number(r.excesos_80_kph ?? 0),
            aceleraciones_bruscas: Number(officialRep.aceleraciones_bruscas ?? 0) + Number(r.aceleraciones_bruscas ?? 0),
            frenadas_bruscas: Number(officialRep.frenadas_bruscas ?? 0) + Number(r.frenadas_bruscas ?? 0),
          }).eq('id', officialRep.id);
          if (updErr) throw updErr;

          const { error: delRepErr } = await supabase.from('reportes_conductores').delete().eq('id', r.id);
          if (delRepErr) throw delRepErr;
          mergesReps++;
          console.log(`     Fusionado reporte ${r.periodo_inicio}/${r.periodo_fin} fuente=${r.fuente} (+${r.kms} km)`);
        } else {
          const { error: updErr } = await supabase.from('reportes_conductores').update({ conductor_id: cond.id }).eq('id', r.id);
          if (updErr) throw updErr;
          reassignmentsReps++;
          console.log(`     Reasignado reporte ${r.periodo_inicio}/${r.periodo_fin} fuente=${r.fuente} (${r.kms} km)`);
        }
      }

      // 2. coltrack_datos_conductor: fusionar/reasignar por fecha
      const { data: daily, error: dailyErr } = await supabase
        .from('coltrack_datos_conductor').select('*').eq('conductor_id', dup.id);
      if (dailyErr) throw dailyErr;

      for (const d of (daily ?? [])) {
        const { data: officialDaily, error: offDErr } = await supabase
          .from('coltrack_datos_conductor').select('*')
          .eq('conductor_id', cond.id).eq('fecha', d.fecha).maybeSingle();
        if (offDErr) throw offDErr;

        if (officialDaily) {
          const totalKms = Number(officialDaily.kms ?? 0) + Number(d.kms ?? 0);
          const { error: updErr } = await supabase.from('coltrack_datos_conductor').update({
            kms: totalKms,
            horas_conduccion: Number(officialDaily.horas_conduccion ?? 0) + Number(d.horas_conduccion ?? 0),
          }).eq('id', officialDaily.id);
          if (updErr) throw updErr;
          const { error: delErr } = await supabase.from('coltrack_datos_conductor').delete().eq('id', d.id);
          if (delErr) throw delErr;
          mergesDaily++;
        } else {
          const { error: updErr } = await supabase.from('coltrack_datos_conductor').update({ conductor_id: cond.id }).eq('id', d.id);
          if (updErr) throw updErr;
          reassignmentsDaily++;
        }
      }

      // 3. alertas_diarias_gps: reasignar
      const { data: alerts, error: alertErr } = await supabase
        .from('alertas_diarias_gps').select('id').eq('conductor_id', dup.id);
      if (alertErr) throw alertErr;
      for (const a of (alerts ?? [])) {
        const { error: updErr } = await supabase.from('alertas_diarias_gps')
          .update({ conductor_id: cond.id, conductor_identificado: true }).eq('id', a.id);
        if (updErr) throw updErr;
        reassignmentsAlerts++;
      }

      // 4. Eliminar el duplicado
      const { error: delErr } = await supabase.from('conductores').delete().eq('id', dup.id);
      if (delErr) {
        console.log(`     No se pudo eliminar (${delErr.message}); marcando INACTIVO.`);
        await supabase.from('conductores').update({ estado: 'INACTIVO', updated_at: new Date().toISOString() }).eq('id', dup.id);
        inactivated++;
      } else {
        deletes++;
      }
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log(`Reportes mensuales: ${reassignmentsReps} reasignados, ${mergesReps} fusionados`);
  console.log(`Registros diarios:  ${reassignmentsDaily} reasignados, ${mergesDaily} fusionados`);
  console.log(`Alertas GPS reasignadas: ${reassignmentsAlerts}`);
  console.log(`Duplicados eliminados: ${deletes} | marcados INACTIVO (no se pudo borrar): ${inactivated}`);
}

runCleanup().catch(e => console.error('ERROR:', e.message, e));
