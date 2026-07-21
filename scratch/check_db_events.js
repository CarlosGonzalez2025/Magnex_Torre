import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  console.log("=== ANALIZANDO EVENTOS DE RALENTÍ EN LA BASE DE DATOS ===");
  try {
    // Total count of events
    const { count, error } = await supabase
      .from('ralentis_eventos')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    console.log(`Total ralentis_eventos: ${count}`);

    // Count by provider
    const { data: countByProvider, error: pErr } = await supabase
      .from('ralentis_eventos')
      .select('proveedor');
    if (pErr) throw pErr;

    const providers = {};
    countByProvider.forEach(r => {
      providers[r.proveedor] = (providers[r.proveedor] || 0) + 1;
    });
    console.log('Events by provider:', providers);

    // Top 10 largest events in DB
    const { data: topEvents, error: topErr } = await supabase
      .from('ralentis_eventos')
      .select('id, placa, conductor_nombre, duracion_segundos, proveedor, fecha_inicio')
      .order('duracion_segundos', { ascending: false })
      .limit(10);
    if (topErr) throw topErr;

    console.log('\n--- TOP 10 LARGEST EVENTS IN DB ---');
    topEvents.forEach((e, idx) => {
      const hours = (e.duracion_segundos / 3600).toFixed(2);
      console.log(`[${idx+1}] ID: ${e.id}, Veh: ${e.placa}, Conductor: ${e.conductor_nombre}, Provider: ${e.proveedor}, Date: ${e.fecha_inicio}, Duration: ${e.duracion_segundos}s (${hours}h)`);
    });

    // Check if there are Fagor events with > 24 hours
    const { data: largeFagor, error: fagorErr } = await supabase
      .from('ralentis_eventos')
      .select('id, placa, conductor_nombre, duracion_segundos, fecha_inicio')
      .eq('proveedor', 'FAGOR')
      .gt('duracion_segundos', 86400);
    if (fagorErr) throw fagorErr;
    console.log(`\nFagor events > 24 hours: ${largeFagor.length}`);
    largeFagor.slice(0, 5).forEach((e, idx) => {
      const hours = (e.duracion_segundos / 3600).toFixed(2);
      console.log(`  - Veh: ${e.placa}, Conductor: ${e.conductor_nombre}, Date: ${e.fecha_inicio}, Duration: ${e.duracion_segundos}s (${hours}h)`);
    });

  } catch (err) {
    console.error("Error connecting or querying:", err);
  }
}

check();
