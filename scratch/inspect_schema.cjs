const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://cmzeijcyykzdmvisojte.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME'
);
(async () => {
  for (const t of ['vehiculos', 'contratos', 'ralentis_periodos', 'ralentis_eventos', 'conductores']) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) { console.log(`\n[${t}] ERROR: ${error.message}`); continue; }
    console.log(`\n[${t}] columns: ${data && data[0] ? Object.keys(data[0]).join(', ') : '(sin filas)'}`);
  }
})();
