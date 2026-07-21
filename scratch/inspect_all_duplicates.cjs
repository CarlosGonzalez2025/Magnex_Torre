const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { data: dups } = await supabase
    .from('conductores')
    .select('id, nombres, cedula, ibutton, created_at')
    .eq('estado', 'PENDIENTE GOOGLE SHEETS')
    .order('created_at', { ascending: false });

  console.log("=== TODOS LOS DUPLICADOS EN LA BASE DE DATOS ===");
  dups.forEach(d => {
    console.log(`ID: ${d.id} | Nombres: "${d.nombres}" | Cédula: "${d.cedula}" | iButton: "${d.ibutton}" | Creado: ${d.created_at}`);
  });
}

run();
