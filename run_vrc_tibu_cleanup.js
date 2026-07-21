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

async function runCleanup() {
  console.log("=== EJECUTANDO CONSOLIDACIÓN DE DUPLICADOS PARA ECOPETROL VRC-TIBU ===");
  try {
    const allDrivers = await fetchAllRows(
      supabase.from('conductores').select('*')
    );
    
    const condsVrcTibu = allDrivers.filter(c => c.contrato_id === contratoId);
    console.log(`Conductores oficiales en VRC-TIBU: ${condsVrcTibu.length}`);
    
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

    let reassignmentsReps = 0;
    let reassignmentsDaily = 0;
    let reassignmentsAlerts = 0;
    let deletes = 0;

    for (const cond of condsVrcTibu) {
      const key = normName(cond.nombres);
      const matches = mapNombreACond.get(key) || [];
      // Filtrar los duplicados del conductor oficial
      const duplicates = matches.filter(m => {
        if (m.id === cond.id) return false;
        
        // Criterio estricto de duplicado temporal:
        // contrato_id es nulo, o estado es PENDIENTE GOOGLE SHEETS, o cédula es temporal/numérica negativa
        const esNulo = m.contrato_id === null;
        const esPendiente = String(m.estado ?? '').toUpperCase() === 'PENDIENTE GOOGLE SHEETS';
        const esCedulaTemp = String(m.cedula ?? '').startsWith('TEMP_CC_') || String(m.cedula ?? '').startsWith('-');
        
        return esNulo || esPendiente || esCedulaTemp;
      });
      
      if (duplicates.length > 0) {
        console.log(`\nConsolidando conductor: "${cond.nombres}" (ID Oficial: ${cond.id}, Cédula: ${cond.cedula})`);
        
        for (const dup of duplicates) {
          console.log(`  -> Procesando duplicado ID: ${dup.id} | Cédula: ${dup.cedula} | Estado: ${dup.estado}`);
          
          // 1. Reasignar en reportes_conductores
          const { data: reps, error: repErr } = await supabase
            .from('reportes_conductores')
            .select('id, kms, periodo_inicio, periodo_fin')
            .eq('conductor_id', dup.id);
            
          if (repErr) throw repErr;
          
          if (reps && reps.length > 0) {
            const sumKms = reps.reduce((s, r) => s + Number(r.kms ?? 0), 0);
            console.log(`     Reasignando ${reps.length} reporte(s) mensual(es) (${sumKms.toFixed(2)} km)...`);
            for (const r of reps) {
              const { error: updErr } = await supabase
                .from('reportes_conductores')
                .update({ conductor_id: cond.id })
                .eq('id', r.id);
              if (updErr) throw updErr;
            }
            reassignmentsReps += reps.length;
          }

          // 2. Reasignar en coltrack_datos_conductor
          const { data: daily, error: dailyErr } = await supabase
            .from('coltrack_datos_conductor')
            .select('id, kms, fecha')
            .eq('conductor_id', dup.id);
            
          if (dailyErr) throw dailyErr;
          
          if (daily && daily.length > 0) {
            const sumDailyKms = daily.reduce((s, r) => s + Number(r.kms ?? 0), 0);
            console.log(`     Reasignando ${daily.length} registro(s) diario(s) (${sumDailyKms.toFixed(2)} km)...`);
            for (const d of daily) {
              const { error: updDailyErr } = await supabase
                .from('coltrack_datos_conductor')
                .update({ conductor_id: cond.id })
                .eq('id', d.id);
              if (updDailyErr) throw updDailyErr;
            }
            reassignmentsDaily += daily.length;
          }

          // 3. Reasignar en alertas_diarias_gps
          const { data: alerts, error: alertErr } = await supabase
            .from('alertas_diarias_gps')
            .select('id, fecha_dia')
            .eq('conductor_id', dup.id);
            
          if (alertErr) throw alertErr;
          
          if (alerts && alerts.length > 0) {
            console.log(`     Reasignando ${alerts.length} alerta(s) de GPS...`);
            for (const a of alerts) {
              const { error: updAlertErr } = await supabase
                .from('alertas_diarias_gps')
                .update({ conductor_id: cond.id, conductor_identificado: true })
                .eq('id', a.id);
              if (updAlertErr) throw updAlertErr;
            }
            reassignmentsAlerts += alerts.length;
          }

          // 4. Eliminar el conductor duplicado
          console.log(`     Eliminando duplicado de la base de datos...`);
          const { error: delErr } = await supabase
            .from('conductores')
            .delete()
            .eq('id', dup.id);
            
          if (delErr) {
            console.log(`     ⚠️ No se pudo eliminar de inmediato (${delErr.message}). Marcándolo como INACTIVO.`);
            const { error: inactErr } = await supabase
              .from('conductores')
              .update({ estado: 'INACTIVO', updated_at: new Date().toISOString() })
              .eq('id', dup.id);
            if (inactErr) throw inactErr;
          } else {
            console.log(`     ✅ Duplicado eliminado con éxito.`);
            deletes++;
          }
        }
      }
    }

    console.log(`\n=== CONSOLIDACIÓN COMPLETADA ===`);
    console.log(`- Reportes mensuales reasignados: ${reassignmentsReps}`);
    console.log(`- Registros diarios reasignados:  ${reassignmentsDaily}`);
    console.log(`- Alertas GPS reasignadas:        ${reassignmentsAlerts}`);
    console.log(`- Conductores duplicados borrados: ${deletes}`);

  } catch (err) {
    console.error("❌ Error en la consolidación:", err.message);
  }
}

runCleanup();
