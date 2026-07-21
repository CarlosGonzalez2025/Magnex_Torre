const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const fechaInicio = '2026-04-29';
const fechaFin = '2026-05-28';

async function run() {
  console.log("=== COMPROBANDO REPORTES CON KMS > 0 ===");
  try {
    const { data: reportes, error } = await supabase
      .from('reportes_conductores')
      .select('*, conductores(*)')
      .eq('periodo_inicio', fechaInicio)
      .eq('periodo_fin', fechaFin)
      .gt('kms', 0);

    if (error) throw error;

    console.log(`Encontrados ${reportes.length} reportes con Kms > 0`);
    reportes.forEach(r => {
      console.log(`Conductor: "${r.conductores?.nombres}" | ID Conductor: ${r.conductor_id} | Cédula: "${r.conductores?.cedula}" | Contrato ID: ${r.conductores?.contrato_id} | Estado: ${r.conductores?.estado} | Kms: ${r.kms}`);
    });

  } catch (err) {
    console.error("Error:", err.message);
  }
}

run();
