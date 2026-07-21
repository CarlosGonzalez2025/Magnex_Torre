import { createClient } from '@supabase/supabase-js';

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

async function runCleanup() {
  console.log("=== EJECUTANDO CONSOLIDACIÓN GLOBAL DE DUPLICADOS CON FUSIÓN (MERGE) ===");
  try {
    const allDrivers = await fetchAllRows(
      supabase.from('conductores').select('*')
    );
    console.log(`Total conductores cargados de la base de datos: ${allDrivers.length}`);
    
    // Conductores oficiales activos (tienen contrato y estado activo)
    const oficiales = allDrivers.filter(c => c.contrato_id !== null && c.estado === 'ACTIVO');
    console.log(`Conductores oficiales activos encontrados: ${oficiales.length}`);
    
    const normName = (name) =>
      String(name ?? '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, ' ');

    // Agrupar a todos los conductores por nombre normalizado
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

    for (const cond of oficiales) {
      const key = normName(cond.nombres);
      const matches = mapNombreACond.get(key) || [];
      
      // Filtrar duplicados: son perfiles con el mismo nombre pero que no son el oficial,
      // y cumplen condiciones de duplicado temporal (contrato nulo, o estado PENDIENTE, o cedula temporal)
      const duplicates = matches.filter(m => {
        if (m.id === cond.id) return false;
        
        const esNulo = m.contrato_id === null;
        const esPendiente = String(m.estado ?? '').toUpperCase() === 'PENDIENTE GOOGLE SHEETS';
        const esCedulaTemp = String(m.cedula ?? '').startsWith('TEMP_CC_') || String(m.cedula ?? '').startsWith('-');
        
        return esNulo || esPendiente || esCedulaTemp;
      });
      
      if (duplicates.length > 0) {
        console.log(`\nConsolidando conductor: "${cond.nombres}" (ID Oficial: ${cond.id}, Cédula: ${cond.cedula})`);
        
        for (const dup of duplicates) {
          console.log(`  -> Procesando duplicado ID: ${dup.id} | Cédula: ${dup.cedula} | Estado: ${dup.estado}`);
          
          // 1. Reasignar o fusionar en reportes_conductores
          const { data: reps, error: repErr } = await supabase
            .from('reportes_conductores')
            .select('*')
            .eq('conductor_id', dup.id);
            
          if (repErr) throw repErr;
          
          if (reps && reps.length > 0) {
            console.log(`     Procesando ${reps.length} reporte(s) mensual(es)...`);
            for (const r of reps) {
              // Buscar si el oficial ya tiene un reporte para este periodo
              const { data: officialRep, error: offRepErr } = await supabase
                .from('reportes_conductores')
                .select('*')
                .eq('conductor_id', cond.id)
                .eq('periodo_inicio', r.periodo_inicio)
                .eq('periodo_fin', r.periodo_fin)
                .maybeSingle();
              
              if (offRepErr) throw offRepErr;
              
              if (officialRep) {
                // FUSIONAR: ya existe reporte del oficial para este periodo
                console.log(`     -> Fusionando reporte del duplicado en reporte oficial existente (${r.periodo_inicio} a ${r.periodo_fin})`);
                const mergedKms = Number(officialRep.kms ?? 0) + Number(r.kms ?? 0);
                const mergedHoras = Number(officialRep.horas_conduccion ?? 0) + Number(r.horas_conduccion ?? 0);
                
                // Calificación promedio ponderada por kms
                let mergedCalificacion = Number(officialRep.calificacion ?? 100);
                const totalKms = Number(officialRep.kms ?? 0) + Number(r.kms ?? 0);
                if (totalKms > 0) {
                  mergedCalificacion = Math.round(
                    (Number(officialRep.calificacion ?? 100) * Number(officialRep.kms ?? 0) +
                     Number(r.calificacion ?? 100) * Number(r.kms ?? 0)) / totalKms
                  );
                }
                
                const { error: updErr } = await supabase
                  .from('reportes_conductores')
                  .update({
                    kms: mergedKms,
                    horas_conduccion: mergedHoras,
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
                  })
                  .eq('id', officialRep.id);
                
                if (updErr) throw updErr;
                
                // Borrar el reporte del duplicado (porque ya se fusionó con el oficial)
                const { error: delRepErr } = await supabase
                  .from('reportes_conductores')
                  .delete()
                  .eq('id', r.id);
                
                if (delRepErr) throw delRepErr;
              } else {
                // REASIGNAR: no existe reporte del oficial, simplemente actualizar conductor_id
                console.log(`     -> Reasignando reporte al oficial (${r.periodo_inicio} a ${r.periodo_fin})...`);
                const { error: updErr } = await supabase
                  .from('reportes_conductores')
                  .update({ conductor_id: cond.id })
                  .eq('id', r.id);
                if (updErr) throw updErr;
              }
              reassignmentsReps++;
            }
          }

          // 2. Reasignar o fusionar en coltrack_datos_conductor
          const { data: daily, error: dailyErr } = await supabase
            .from('coltrack_datos_conductor')
            .select('*')
            .eq('conductor_id', dup.id);
            
          if (dailyErr) throw dailyErr;
          
          if (daily && daily.length > 0) {
            console.log(`     Procesando ${daily.length} registro(s) diario(s)...`);
            for (const d of daily) {
              const { data: officialDaily, error: offDailyErr } = await supabase
                .from('coltrack_datos_conductor')
                .select('*')
                .eq('conductor_id', cond.id)
                .eq('fecha', d.fecha)
                .maybeSingle();
              
              if (offDailyErr) throw offDailyErr;
              
              if (officialDaily) {
                // FUSIONAR: ya existe registro del oficial para esta fecha
                console.log(`     -> Fusionando registro diario del duplicado en registro oficial existente (${d.fecha})`);
                const mergedKms = Number(officialDaily.kms ?? 0) + Number(d.kms ?? 0);
                const mergedHoras = Number(officialDaily.horas_conduccion ?? 0) + Number(d.horas_conduccion ?? 0);
                
                let mergedCalificacion = Number(officialDaily.calificacion ?? 100);
                const totalKms = Number(officialDaily.kms ?? 0) + Number(d.kms ?? 0);
                if (totalKms > 0) {
                  mergedCalificacion = Math.round(
                    (Number(officialDaily.calificacion ?? 100) * Number(officialDaily.kms ?? 0) +
                     Number(d.calificacion ?? 100) * Number(d.kms ?? 0)) / totalKms
                  );
                }
                
                const { error: updDailyErr } = await supabase
                  .from('coltrack_datos_conductor')
                  .update({
                    kms: mergedKms,
                    horas_conduccion: mergedHoras,
                    calificacion: mergedCalificacion,
                    excesos_10_kph: Number(officialDaily.excesos_10_kph ?? 0) + Number(d.excesos_10_kph ?? 0),
                    excesos_20_kph: Number(officialDaily.excesos_20_kph ?? 0) + Number(d.excesos_20_kph ?? 0),
                    excesos_30_kph: Number(officialDaily.excesos_30_kph ?? 0) + Number(d.excesos_30_kph ?? 0),
                    excesos_40_kph: Number(officialDaily.excesos_40_kph ?? 0) + Number(d.excesos_40_kph ?? 0),
                    excesos_50_kph: Number(officialDaily.excesos_50_kph ?? 0) + Number(d.excesos_50_kph ?? 0),
                    excesos_60_kph: Number(officialDaily.excesos_60_kph ?? 0) + Number(d.excesos_60_kph ?? 0),
                    excesos_80_kph: Number(officialDaily.excesos_80_kph ?? 0) + Number(d.excesos_80_kph ?? 0),
                    aceleraciones: Number(officialDaily.aceleraciones ?? 0) + Number(d.aceleraciones ?? 0),
                    frenadas: Number(officialDaily.frenadas ?? 0) + Number(d.frenadas ?? 0),
                  })
                  .eq('id', officialDaily.id);
                
                if (updDailyErr) throw updDailyErr;
                
                // Borrar el registro del duplicado
                const { error: delDailyErr } = await supabase
                  .from('coltrack_datos_conductor')
                  .delete()
                  .eq('id', d.id);
                
                if (delDailyErr) throw delDailyErr;
              } else {
                // REASIGNAR: simplemente actualizar conductor_id
                console.log(`     -> Reasignando registro diario al oficial (${d.fecha})...`);
                const { error: updDailyErr } = await supabase
                  .from('coltrack_datos_conductor')
                  .update({ conductor_id: cond.id })
                  .eq('id', d.id);
                if (updDailyErr) throw updDailyErr;
              }
              reassignmentsDaily++;
            }
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

    console.log(`\n=== CONSOLIDACIÓN GLOBAL COMPLETADA ===`);
    console.log(`- Reportes mensuales reasignados/fusionados: ${reassignmentsReps}`);
    console.log(`- Registros diarios reasignados/fusionados:  ${reassignmentsDaily}`);
    console.log(`- Alertas GPS reasignadas:        ${reassignmentsAlerts}`);
    console.log(`- Conductores duplicados borrados: ${deletes}`);

  } catch (err) {
    console.error("❌ Error en la consolidación:", err.message);
  }
}

runCleanup();
