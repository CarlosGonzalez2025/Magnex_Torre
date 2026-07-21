import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  const officialId = '2bab521f-ae19-4856-ab9e-bd9cf592df0a'; // Official ID of Mardory Pineda Jiménez
  
  console.log(`Checking reportes_conductores for official ID: ${officialId}...`);
  const { data, error } = await supabase
    .from('reportes_conductores')
    .select('*, conductores(nombres, cedula)')
    .eq('conductor_id', officialId);
    
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  console.log(`Found ${data.length} reports for official ID:`);
  data.forEach(r => {
    console.log(`  - Periodo: ${r.periodo_inicio} a ${r.periodo_fin} | Kms: ${r.kms} | Calificacion: ${r.calificacion} | Conductor: ${r.conductores?.nombres}`);
  });
}

check();
