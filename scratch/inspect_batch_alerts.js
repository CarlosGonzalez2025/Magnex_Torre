import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspect() {
  console.log("=== INSPECCIONANDO AUDITORÍA DE FLOTA ===");
  try {
    const { count: alertsCount, error: alertsErr } = await supabase
      .from('batch_alerts')
      .select('*', { count: 'exact', head: true });

    if (alertsErr) {
      console.error("Error al contar batch_alerts:", JSON.stringify(alertsErr, null, 2));
    } else {
      console.log(`Total de alertas en 'batch_alerts': ${alertsCount}`);
    }

    const { count: uploadsCount, error: uploadsErr } = await supabase
      .from('file_uploads')
      .select('*', { count: 'exact', head: true });

    if (uploadsErr) {
      console.error("Error al contar file_uploads:", JSON.stringify(uploadsErr, null, 2));
    } else {
      console.log(`Total de cargas en 'file_uploads': ${uploadsCount}`);
    }

  } catch (err) {
    console.error("Error:", err.message);
  }
}

inspect();
