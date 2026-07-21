const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const contratoId = '78d4f5be-239a-4117-b387-a2e74f5c6631'; // ENEL ZIII

async function run() {
  console.log("=== CALCULANDO SUMATORIAS DE KILOMETRAJE ===");

  // 1. Obtener vehículos del contrato
  const { data: vehs } = await supabase
    .from('vehiculos')
    .select('*')
    .eq('contrato_id', contratoId);

  const vehIds = vehs.map(v => v.id);

  // 2. Sumar para Abril (2026-03-29 a 2026-04-28)
  const { data: repsApril } = await supabase
    .from('reportes_vehiculos')
    .select('kms')
    .in('vehiculo_id', vehIds)
    .lte('periodo_inicio', '2026-04-28')
    .gte('periodo_fin', '2026-03-29');

  const totalApril = repsApril.reduce((acc, r) => acc + Number(r.kms || 0), 0);
  console.log(`\nSuma total de KMs en ABRIL (29/03 a 28/04): ${totalApril}`);
  console.log(`Número de registros de vehículos en Abril: ${repsApril.length}`);

  // 3. Sumar para Mayo (2026-04-29 a 2026-05-28)
  const { data: repsMay } = await supabase
    .from('reportes_vehiculos')
    .select('kms')
    .in('vehiculo_id', vehIds)
    .lte('periodo_inicio', '2026-05-28')
    .gte('periodo_fin', '2026-04-29');

  const totalMay = repsMay.reduce((acc, r) => acc + Number(r.kms || 0), 0);
  console.log(`\nSuma total de KMs en MAYO (29/04 a 28/05): ${totalMay}`);
  console.log(`Número de registros de vehículos en Mayo: ${repsMay.length}`);
}

run();
