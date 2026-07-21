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

async function run() {
  console.log("=== SIMULANDO CORRECCIÓN DE EVENTOS COLTRACK EN LA DB ===");
  try {
    // 1. Fetch all COLTRACK events
    console.log("Cargando todos los eventos de Coltrack...");
    const coltrackEvents = await fetchAllRows(
      supabase
        .from('ralentis_eventos')
        .select('id, vehiculo_id, placa, conductor_nombre, duracion_segundos, fecha_inicio, periodo_inicio, periodo_fin')
        .eq('proveedor', 'COLTRACK')
    );
    console.log(`Total eventos Coltrack cargados: ${coltrackEvents.length}`);

    // 2. Fetch all ralentis_periodos (consolidated metrics)
    console.log("Cargando todos los registros de ralentis_periodos...");
    const periodos = await fetchAllRows(
      supabase
        .from('ralentis_periodos')
        .select('vehiculo_id, periodo_inicio, periodo_fin, horas_motor_ralenti, ralentis_excesivos')
    );
    console.log(`Total ralentis_periodos cargados: ${periodos.length}`);

    // Create a lookup map for periodos: key = vehiculo_id_periodo_inicio_periodo_fin
    const periodosMap = new Map();
    periodos.forEach(p => {
      const key = `${p.vehiculo_id}_${p.periodo_inicio}_${p.periodo_fin}`;
      periodosMap.set(key, p);
    });

    // Group events by vehicle and period to count how many events we have per period
    const eventsGroupCount = new Map();
    coltrackEvents.forEach(e => {
      const key = `${e.vehiculo_id}_${e.periodo_inicio}_${e.periodo_fin}`;
      eventsGroupCount.set(key, (eventsGroupCount.get(key) || 0) + 1);
    });

    // 3. Analyze correction
    let countGlitched = 0;
    let countFixed = 0;
    let maxNewDuration = 0;
    const sampleCorrections = [];

    coltrackEvents.forEach(e => {
      const key = `${e.vehiculo_id}_${e.periodo_inicio}_${e.periodo_fin}`;
      const periodData = periodosMap.get(key);
      
      let duracionSegundos = 300; // default 5 minutes
      let method = 'DEFAULT (5 MIN)';
      
      if (periodData) {
        const totalHours = Number(periodData.horas_motor_ralenti || 0);
        const totalEvents = eventsGroupCount.get(key) || Number(periodData.ralentis_excesivos || 1);
        if (totalHours > 0 && totalEvents > 0) {
          duracionSegundos = Math.round((totalHours * 3600) / totalEvents);
          method = `DISTRIBUTED (${totalHours}h / ${totalEvents} events)`;
        }
      }

      if (e.duracion_segundos !== duracionSegundos) {
        countFixed++;
        if (e.duracion_segundos > 7200) { // > 2 hours is glitched
          countGlitched++;
          if (sampleCorrections.length < 10) {
            sampleCorrections.push({
              placa: e.placa,
              conductor: e.conductor_nombre,
              old: e.duracion_segundos,
              new: duracionSegundos,
              method
            });
          }
        }
      }

      if (duracionSegundos > maxNewDuration) {
        maxNewDuration = duracionSegundos;
      }
    });

    console.log(`\nEventos que cambiarían de duración: ${countFixed}`);
    console.log(`Eventos con duraciones glitched (>2h) que serán corregidos: ${countGlitched}`);
    console.log(`Máxima nueva duración calculada: ${(maxNewDuration / 3600).toFixed(2)}h (${maxNewDuration}s)`);

    console.log('\n--- MUESTRA DE CORRECCIONES ---');
    sampleCorrections.forEach((s, idx) => {
      console.log(`[${idx+1}] Veh: ${s.placa}, Conductor: ${s.conductor}, Old: ${(s.old/3600).toFixed(2)}h, New: ${(s.new/3600).toFixed(2)}h (${s.new}s) - Method: ${s.method}`);
    });

  } catch (err) {
    console.error("Error running simulation:", err);
  }
}

run();
