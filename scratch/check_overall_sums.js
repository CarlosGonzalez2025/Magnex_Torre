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
  console.log("=== CALCULANDO SUMAS GENERALES DE RALENTÍ EN LA DB (CON PAGINACIÓN) ===");
  
  // 1. Sum of detailed events > 5 mins
  const events = await fetchAllRows(
    supabase
      .from('ralentis_eventos')
      .select('duracion_segundos, proveedor')
  );
  
  let totalEventDuration = 0;
  let totalExcessiveEventDuration = 0;
  let eventCount = 0;
  let excessiveEventCount = 0;
  
  events.forEach(e => {
    totalEventDuration += e.duracion_segundos;
    eventCount++;
    if (e.duracion_segundos > 300) {
      totalExcessiveEventDuration += e.duracion_segundos;
      excessiveEventCount++;
    }
  });
  
  console.log(`\nEventos Detallados (Total):`);
  console.log(`- Cantidad total de eventos: ${eventCount}`);
  console.log(`- Duración total de eventos: ${(totalEventDuration / 3600).toFixed(2)} horas`);
  console.log(`- Cantidad de eventos > 5 min (excesivos): ${excessiveEventCount}`);
  console.log(`- Duración de eventos > 5 min (excesivos): ${(totalExcessiveEventDuration / 3600).toFixed(2)} horas`);
  
  // 2. Sum of period summaries
  const periodos = await fetchAllRows(
    supabase
      .from('ralentis_periodos')
      .select('horas_motor_ralenti, horas_motor_encendido')
  );
  
  let totalPeriodRalentiHours = 0;
  let totalPeriodEngineHours = 0;
  
  periodos.forEach(p => {
    totalPeriodRalentiHours += Number(p.horas_motor_ralenti || 0);
    totalPeriodEngineHours += Number(p.horas_motor_encendido || 0);
  });
  
  console.log(`\nResumen de Períodos (Sumas de ralentis_periodos):`);
  console.log(`- Total Horas de Ralentí (Sumado): ${totalPeriodRalentiHours.toFixed(2)} horas`);
  console.log(`- Total Horas Motor Encendido (Sumado): ${totalPeriodEngineHours.toFixed(2)} horas`);
}

run();
