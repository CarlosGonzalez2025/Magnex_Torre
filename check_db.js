import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  console.log("=== VERIFICANDO CONEXIÓN A SUPABASE ===");
  try {
    const { count: condCount, error: condErr } = await supabase
      .from('conductores')
      .select('*', { count: 'exact', head: true });
    
    if (condErr) throw condErr;
    console.log(`Conductores en DB: ${condCount}`);

    const { count: vehCount, error: vehErr } = await supabase
      .from('vehiculos')
      .select('*', { count: 'exact', head: true });
      
    if (vehErr) throw vehErr;
    console.log(`Vehículos en DB: ${vehCount}`);

    const { count: repCondCount, error: repCondErr } = await supabase
      .from('reportes_conductores')
      .select('*', { count: 'exact', head: true });
    
    if (repCondErr) throw repCondErr;
    console.log(`Reportes de Conductores en DB: ${repCondCount}`);

    const { count: repVehCount, error: repVehErr } = await supabase
      .from('reportes_vehiculos')
      .select('*', { count: 'exact', head: true });
      
    if (repVehErr) throw repVehErr;
    console.log(`Reportes de Vehículos en DB: ${repVehCount}`);

  } catch (err) {
    console.error("Error consultando DB:", err.message);
  }
}

check();
