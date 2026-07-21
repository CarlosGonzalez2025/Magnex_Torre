import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const targetId = '1005181554';
  
  console.log(`Querying Supabase for cedula = '${targetId}'...`);
  const { data: dbDrivers, error } = await supabase
    .from('conductores')
    .select('*')
    .eq('cedula', targetId);
    
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  console.log("Drivers found:", dbDrivers);
  
  if (dbDrivers && dbDrivers.length > 0) {
    const driver = dbDrivers[0];
    console.log(`Querying reportes_conductores for driver_id = '${driver.id}'...`);
    const { data: reports, error: rError } = await supabase
      .from('reportes_conductores')
      .select('*')
      .eq('conductor_id', driver.id);
      
    if (rError) {
      console.error("Error fetching reports:", rError);
    } else {
      console.log("Reports found:", reports);
    }
  } else {
    // Let's search by name "Mardory Pineda" in Supabase
    console.log("Searching by name 'Mardory Pineda' in Supabase...");
    const { data: dbByName, error: eName } = await supabase
      .from('conductores')
      .select('*')
      .ilike('nombres', '%Mardory%');
    console.log("Search by name result:", dbByName);
  }
}

test();
