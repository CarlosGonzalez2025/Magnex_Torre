import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
async function main() {
  const { count: cPending } = await supabase.from('conductores').select('*', { count: 'exact', head: true }).eq('proyecto', 'PENDIENTE GOOGLE SHEETS');
  console.log('Conductores PENDIENTE GOOGLE SHEETS:', cPending);
  const { count: vPending } = await supabase.from('vehiculos').select('*', { count: 'exact', head: true }).eq('cliente', 'PENDIENTE GOOGLE SHEETS');
  console.log('Vehiculos PENDIENTE GOOGLE SHEETS:', vPending);
  const { count: vTotal } = await supabase.from('vehiculos').select('*', { count: 'exact', head: true });
  console.log('Vehiculos TOTAL:', vTotal);
}
main().catch(e => console.error(e));
