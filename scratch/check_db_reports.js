import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PERIODO_INICIO = '2026-04-29';
const PERIODO_FIN = '2026-05-28';

async function run() {
  console.log(`=== ANALIZANDO REPORTES DE CONDUCTORES EN SUPABASE PARA EL PERIODO ${PERIODO_INICIO} AL ${PERIODO_FIN} ===`);
  
  const { data: reports, error } = await supabase
    .from('reportes_conductores')
    .select('*, conductores(nombres, cedula, contrato_id)')
    .eq('periodo_inicio', PERIODO_INICIO)
    .eq('periodo_fin', PERIODO_FIN);
    
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  console.log(`Total reportes de conductores encontrados: ${reports.length}`);
  
  // Contemos cuántos tienen kms > 0, y cuántos son de cada contrato/proyecto
  const projects = {};
  reports.forEach(r => {
    const proj = r.proyecto || r.conductores?.proyecto || 'SIN_PROYECTO';
    if (!projects[proj]) projects[proj] = 0;
    projects[proj]++;
  });
  
  console.log("\nReportes por proyecto:");
  console.log(JSON.stringify(projects, null, 2));

  console.log("\nMuestra de reportes (primeros 10):");
  reports.slice(0, 10).forEach((r, idx) => {
    console.log(`  [${idx+1}] Driver: ${r.conductores?.nombres} | Cedula: ${r.conductores?.cedula} | Kms: ${r.kms} | Calificacion: ${r.calificacion}`);
  });
}

run();
