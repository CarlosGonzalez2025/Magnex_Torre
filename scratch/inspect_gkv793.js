import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log("=== BUSCANDO INFORMACIÓN DE VEHÍCULO GKV793 ===");
  
  // 1. Get vehicle info
  const { data: veh, error: vErr } = await supabase
    .from('vehiculos')
    .select('*')
    .eq('placa', 'GKV793');
  
  if (vErr) {
    console.error("Error fetching vehicle:", vErr);
    return;
  }
  console.log("Vehículos encontrados:", veh);
  
  if (veh.length === 0) return;
  const vehId = veh[0].id;
  
  // 2. Get period summaries
  console.log("\n--- Períodos de Ralentí ---");
  const { data: periodos, error: pErr } = await supabase
    .from('ralentis_periodos')
    .select('*')
    .eq('vehiculo_id', vehId);
    
  if (pErr) console.error(pErr);
  else console.log(periodos);
  
  // 3. Get detailed events for April
  console.log("\n--- Eventos de Ralentí en Abril 2026 ---");
  const { data: events, error: eErr } = await supabase
    .from('ralentis_eventos')
    .select('*')
    .eq('vehiculo_id', vehId);
    
  if (eErr) console.error(eErr);
  else {
    console.log(`Total events for this vehicle: ${events.length}`);
    const aprilEvents = events.filter(e => e.fecha_inicio.includes('2026-04'));
    console.log(`Events in April: ${aprilEvents.length}`);
    
    // Sum of durations
    const sumDurations = aprilEvents.reduce((sum, e) => sum + e.duracion_segundos, 0);
    console.log(`Sum of durations in April: ${sumDurations} seconds (${(sumDurations / 3600).toFixed(2)} hours)`);
    
    // Sample events
    console.log("Muestra de eventos (primeros 5):");
    aprilEvents.slice(0, 5).forEach((e, idx) => {
      console.log(`  [${idx+1}] Date: ${e.fecha_inicio} | Duration: ${e.duracion_segundos}s (${(e.duracion_segundos/3600).toFixed(2)}h) | Provider: ${e.proveedor} | Location: ${e.ubicacion}`);
    });
  }
}

run();
