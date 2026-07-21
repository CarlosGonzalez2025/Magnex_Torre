import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testCascadeWithData() {
  console.log("=== PROBANDO CASCADE DELETE CON DATOS REALES ===");
  try {
    // 1. Encontrar un upload_id en batch_alerts
    const { data: alerts, error: aErr } = await supabase
      .from('batch_alerts')
      .select('upload_id')
      .limit(1);

    if (aErr) throw aErr;
    if (!alerts || alerts.length === 0) {
      console.log("No hay alertas en batch_alerts.");
      return;
    }

    const uploadId = alerts[0].upload_id;
    console.log(`Encontrado uploadId con alertas: ${uploadId}`);

    // 2. Contar alertas asociadas
    const { count: beforeCount, error: countErr } = await supabase
      .from('batch_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('upload_id', uploadId);

    if (countErr) throw countErr;
    console.log(`Alertas asociadas antes de eliminar: ${beforeCount}`);

    // 3. Eliminar el file_upload
    console.log("Eliminando la carga...");
    const { error: delErr } = await supabase
      .from('file_uploads')
      .delete()
      .eq('id', uploadId);

    if (delErr) throw delErr;
    console.log("Carga eliminada con éxito.");

    // 4. Verificar alertas después
    const { count: afterCount, error: countErr2 } = await supabase
      .from('batch_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('upload_id', uploadId);

    if (countErr2) throw countErr2;
    console.log(`Alertas asociadas después de eliminar: ${afterCount}`);

    if (afterCount === 0) {
      console.log("✅ CONFIRMADO: Las alertas se eliminaron en cascada automáticamente!");
    } else {
      console.log("❌ ERROR: Las alertas no se eliminaron.");
    }

  } catch (err) {
    console.error("Error durante la prueba:", err.message);
  }
}

testCascadeWithData();
