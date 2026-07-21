import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const { count: totalConductores } = await supabase.from('conductores').select('*', { count: 'exact', head: true });
  console.log('Total conductores en DB:', totalConductores);

  const { count: totalRepCond, error } = await supabase
    .from('reportes_conductores')
    .select('*', { count: 'exact', head: true })
    .eq('periodo_inicio', '2026-05-29')
    .eq('periodo_fin', '2026-06-28')
    .eq('fuente', 'COLTRACK');
  console.log('Total reportes_conductores COLTRACK periodo 2026-05-29/2026-06-28:', totalRepCond, error);

  // distribución por created_at (para ver si hubo 1 sola carga o varias pisandose)
  const { data: sample } = await supabase
    .from('reportes_conductores')
    .select('created_at')
    .eq('periodo_inicio', '2026-05-29')
    .eq('periodo_fin', '2026-06-28')
    .eq('fuente', 'COLTRACK')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Muestra created_at mas recientes:', sample);

  // Cuantos con kms > 0 en todo el sistema para ese periodo/fuente
  const { count: withKms } = await supabase
    .from('reportes_conductores')
    .select('*', { count: 'exact', head: true })
    .eq('periodo_inicio', '2026-05-29')
    .eq('periodo_fin', '2026-06-28')
    .eq('fuente', 'COLTRACK')
    .gt('kms', 0);
  console.log('Con kms > 0:', withKms);
}

main().catch(e => console.error(e));
