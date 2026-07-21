const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { data: cDup1 } = await supabase
    .from('conductores')
    .select('*')
    .eq('id', 'f514eba7-99ad-45d5-8c0f-6373be675d27')
    .single();

  console.log("DUP1 name:", JSON.stringify(cDup1.nombres));
  console.log("DUP1 chars:", [...cDup1.nombres].map(c => c.charCodeAt(0)));
}

run();
