import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { data: dbByName, error } = await supabase
    .from('conductores')
    .select('id, nombres, cedula, created_at')
    .or('nombres.ilike.%Mardory%,nombres.ilike.%Pineda%');
    
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  console.log(`Found ${dbByName.length} drivers:`);
  console.log(dbByName);
}

run();
