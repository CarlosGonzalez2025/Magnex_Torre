import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkDuplicates() {
  console.log("=== COMPROBANDO REGISTROS DUPLICADOS EN LA TABLA CONDUCTORES ===");
  try {
    // Buscar los conductores que coinciden con "Diego Alejandro Alarcon Luna"
    const { data: conds, error: err } = await supabase
      .from('conductores')
      .select('*, contratos(nombre)')
      .ilike('nombres', '%Diego Alejandro Alarcon Luna%');
      
    if (err) throw err;
    console.log("Registores de Diego Alejandro Alarcon Luna:");
    conds.forEach(c => {
      console.log(`- ID: ${c.id} | Cedula: ${c.cedula} | Nombres: "${c.nombres}" | contrato_id: ${c.contrato_id} (${c.contratos?.nombre}) | Estado: ${c.estado}`);
    });

    // Buscar "Gilberto Polo Arguello"
    const { data: conds2 } = await supabase
      .from('conductores')
      .select('*, contratos(nombre)')
      .ilike('nombres', '%Gilberto Polo Arguello%');
    console.log("\nRegistores de Gilberto Polo Arguello:");
    conds2.forEach(c => {
      console.log(`- ID: ${c.id} | Cedula: ${c.cedula} | Nombres: "${c.nombres}" | contrato_id: ${c.contrato_id} (${c.contratos?.nombre}) | Estado: ${c.estado}`);
    });

  } catch (err) {
    console.error("Error:", err.message);
  }
}

checkDuplicates();
