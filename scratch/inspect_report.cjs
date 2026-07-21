const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { data: cond } = await supabase
    .from('conductores')
    .select('*')
    .eq('id', 'd0a41112-9491-47bb-965e-6b16fba22f11')
    .single();

  const { data: rep } = await supabase
    .from('reportes_conductores')
    .select('*')
    .eq('conductor_id', 'd0a41112-9491-47bb-965e-6b16fba22f11')
    .single();

  console.log("--- CONDUCTORES TABLE ROW ---");
  console.log(JSON.stringify(cond, null, 2));

  console.log("\n--- REPORTES_CONDUCTORES TABLE ROW ---");
  console.log(JSON.stringify(rep, null, 2));
}

run();
