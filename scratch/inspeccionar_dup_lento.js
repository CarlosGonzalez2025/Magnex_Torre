import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const dupId = '8f715c9e-315d-48da-9a51-b6db0d00db53';
  const condId = '6da015fd-ef6f-4477-a6cc-3c1906b63f86';

  const { count: repsDup } = await supabase.from('reportes_conductores').select('*', {count:'exact', head:true}).eq('conductor_id', dupId);
  const { count: dailyDup } = await supabase.from('coltrack_datos_conductor').select('*', {count:'exact', head:true}).eq('conductor_id', dupId);
  const { count: alertsDup } = await supabase.from('alertas_diarias_gps').select('*', {count:'exact', head:true}).eq('conductor_id', dupId);
  console.log(`Duplicado ${dupId}: reportes=${repsDup}, diarios=${dailyDup}, alertas=${alertsDup}`);

  const { count: repsCond } = await supabase.from('reportes_conductores').select('*', {count:'exact', head:true}).eq('conductor_id', condId);
  const { count: dailyCond } = await supabase.from('coltrack_datos_conductor').select('*', {count:'exact', head:true}).eq('conductor_id', condId);
  console.log(`Oficial ${condId}: reportes=${repsCond}, diarios=${dailyCond}`);
}
main().catch(e => console.error(e));
