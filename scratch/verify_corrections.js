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
  console.log("=== INICIANDO VERIFICACIÓN DE DATOS CORREGIDOS ===");
  try {
    // 1. Fetch all COLTRACK events
    const coltrackEvents = await fetchAllRows(
      supabase
        .from('ralentis_eventos')
        .select('*')
        .eq('proveedor', 'COLTRACK')
    );
    console.log(`Total eventos Coltrack en DB: ${coltrackEvents.length}`);

    // 2. Count values > 2 hours and > 24 hours
    const countOver2h = coltrackEvents.filter(e => e.duracion_segundos > 7200).length;
    const countOver24h = coltrackEvents.filter(e => e.duracion_segundos > 86400).length;

    console.log(`Eventos Coltrack > 2 horas: ${countOver2h}`);
    console.log(`Eventos Coltrack > 24 horas: ${countOver24h}`);

    // 3. Find event for Luis Fernando Angarita Parra
    const angaritaEvents = coltrackEvents.filter(e => e.conductor_nombre.includes("Angarita"));
    console.log(`\nEventos para Luis Fernando Angarita Parra (Total: ${angaritaEvents.length}):`);
    angaritaEvents.forEach((e, idx) => {
      const hours = (e.duracion_segundos / 3600).toFixed(2);
      console.log(`  [${idx+1}] Date: ${e.fecha_inicio} | Duration: ${e.duracion_segundos}s (${hours}h) | Lugar: ${e.ubicacion}`);
    });

    // 4. Print general top 5 largest events now
    const sorted = [...coltrackEvents].sort((a, b) => b.duracion_segundos - a.duracion_segundos);
    console.log('\nNuevo Top 5 de Eventos Coltrack más grandes en DB:');
    sorted.slice(0, 5).forEach((e, idx) => {
      const hours = (e.duracion_segundos / 3600).toFixed(2);
      console.log(`  [${idx+1}] Veh: ${e.placa}, Conductor: ${e.conductor_nombre}, Date: ${e.fecha_inicio}, Duration: ${e.duracion_segundos}s (${hours}h)`);
    });

  } catch (err) {
    console.error("Error running verification:", err);
  }
}

run();
