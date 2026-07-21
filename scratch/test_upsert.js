import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  try {
    // 1. Get 1 Coltrack event
    const { data: events, error } = await supabase
      .from('ralentis_eventos')
      .select('*')
      .eq('proveedor', 'COLTRACK')
      .limit(1);
    
    if (error) throw error;
    if (events.length === 0) {
      console.log('No Coltrack events found to test.');
      return;
    }

    const original = events[0];
    console.log('Original Row:', JSON.stringify(original));

    // 2. Perform test upsert with only id, duracion_segundos, and fecha_fin
    const testUpdate = {
      id: original.id,
      duracion_segundos: original.duracion_segundos, // keep it same for test
      fecha_fin: original.fecha_fin, // keep it same for test
      updated_at: new Date().toISOString()
    };

    console.log('\nPerforming test upsert...');
    const { data: upsertResult, error: upsertErr } = await supabase
      .from('ralentis_eventos')
      .upsert(testUpdate)
      .select('*');
    
    if (upsertErr) throw upsertErr;
    console.log('Upsert result:', JSON.stringify(upsertResult));

    // 3. Fetch again to double check
    const { data: fetchedAgain, error: fetchErr } = await supabase
      .from('ralentis_eventos')
      .select('*')
      .eq('id', original.id)
      .single();
    
    if (fetchErr) throw fetchErr;
    console.log('\nFetched Again Row:', JSON.stringify(fetchedAgain));

    // Compare
    const fields = ['placa', 'conductor_nombre', 'fecha_inicio', 'proveedor', 'ubicacion', 'latitud', 'longitud'];
    let allMatch = true;
    fields.forEach(f => {
      if (fetchedAgain[f] !== original[f] && !(fetchedAgain[f] === null && original[f] === null)) {
        console.log(`Mismatch in field "${f}": original=${original[f]}, new=${fetchedAgain[f]}`);
        allMatch = false;
      }
    });

    if (allMatch) {
      console.log('\nSUCCESS! Upserting with partial fields does NOT modify or nullify other fields in Supabase.');
    } else {
      console.log('\nWARNING: Partial upsert modified other fields!');
    }

  } catch (err) {
    console.error('Error during test:', err);
  }
}

run();
