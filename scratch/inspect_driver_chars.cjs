const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { data: cOfficial, error: e1 } = await supabase
    .from('conductores')
    .select('*')
    .eq('id', '7aea223b-7966-4a87-b6eb-928920434b10')
    .single();

  const { data: cDup2, error: e2 } = await supabase
    .from('conductores')
    .select('*')
    .eq('id', 'd0a41112-9491-47bb-965e-6b16fba22f11')
    .single();

  console.log("OFFICIAL name:", JSON.stringify(cOfficial.nombres));
  console.log("OFFICIAL chars:", [...cOfficial.nombres].map(c => c.charCodeAt(0)));
  console.log("DUP2 name:", JSON.stringify(cDup2.nombres));
  console.log("DUP2 chars:", [...cDup2.nombres].map(c => c.charCodeAt(0)));
}

run();
