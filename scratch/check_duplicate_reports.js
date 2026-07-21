import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const duplicateDriverIds = [
  '96a2965c-4c36-4e58-ba7d-07a455fc6fe5',
  'b5296283-dd9d-4f3f-a6a1-ad28ce7444ce'
];

async function run() {
  console.log("=== BUSCANDO REPORTES DE TELEMETRIA PARA LOS CONDUCTORES DUPLICADOS ===");
  
  for (const driverId of duplicateDriverIds) {
    const { data: driver } = await supabase
      .from('conductores')
      .select('*')
      .eq('id', driverId)
      .single();
      
    const { data: reports, error } = await supabase
      .from('reportes_conductores')
      .select('*')
      .eq('conductor_id', driverId);
      
    if (error) {
      console.error(`Error para ${driverId}:`, error);
      continue;
    }
    
    console.log(`\nConductor: ${driver?.nombres} | Cédula: ${driver?.cedula} | ID: ${driverId}`);
    console.log(`Reportes encontrados (${reports.length}):`);
    reports.forEach(r => {
      console.log(`  - Periodo: ${r.periodo_inicio} a ${r.periodo_fin} | Kms: ${r.kms} | Calificacion: ${r.calificacion}`);
    });
  }
}

run();
