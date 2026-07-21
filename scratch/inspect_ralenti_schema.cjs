const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
(async () => {
  for (const t of ['ralentis_periodos', 'reportes_vehiculos']) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) { console.log(`${t}: ERROR ${error.message}`); continue; }
    console.log(`\n=== ${t} columnas ===`);
    console.log(Object.keys(data[0] || {}).join(', '));
    console.log('sample:', JSON.stringify(data[0], null, 1).slice(0, 900));
  }
  // Un vehículo Jun Q1 con km para ver relación km/velocidad
  const { data: s } = await supabase.from('ralentis_periodos')
    .select('vehiculo_id, kms_recorridos, horas_motor_encendido, horas_motor_ralenti, consumo_combustible')
    .eq('periodo_inicio', '2026-06-01').eq('periodo_fin', '2026-06-15')
    .gt('kms_recorridos', 0).limit(3);
  console.log('\n=== Jun Q1 con km ===', JSON.stringify(s, null, 1));
})().catch(e => console.error(e.message));
