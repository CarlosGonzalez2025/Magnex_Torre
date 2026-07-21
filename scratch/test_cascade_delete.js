import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testCascade() {
  console.log("=== PROBANDO CASCADE DELETE EN BASE DE DATOS ===");
  try {
    // 1. Obtener una carga
    const { data: uploads, error: uErr } = await supabase
      .from('file_uploads')
      .select('id, filename')
      .limit(1);

    if (uErr) throw uErr;
    if (!uploads || uploads.length === 0) {
      console.log("No hay cargas en file_uploads para probar.");
      return;
    }

    const targetUpload = uploads[0];
    console.log(`Carga seleccionada para prueba: ID=${targetUpload.id}, Archivo=${targetUpload.filename}`);

    // 2. Contar alertas asociadas
    const { count: beforeCount, error: countErr } = await supabase
      .from('batch_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('upload_id', targetUpload.id);

    if (countErr) throw countErr;
    console.log(`Alertas asociadas antes de eliminar: ${beforeCount}`);

    // 3. Eliminar la carga
    console.log("Eliminando la carga...");
    const { error: delErr } = await supabase
      .from('file_uploads')
      .delete()
      .eq('id', targetUpload.id);

    if (delErr) throw delErr;
    console.log("Carga eliminada con éxito de 'file_uploads'.");

    // 4. Verificar que las alertas asociadas se eliminaron automáticamente
    const { count: afterCount, error: countErr2 } = await supabase
      .from('batch_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('upload_id', targetUpload.id);

    if (countErr2) throw countErr2;
    console.log(`Alertas asociadas después de eliminar: ${afterCount}`);

    if (afterCount === 0) {
      console.log("✅ CONFIRMADO: El delete cascade funciona perfectamente!");
    } else {
      console.log("❌ ALERTA: Las alertas siguen existiendo, cascade delete no funcionó.");
    }

  } catch (err) {
    console.error("Error durante la prueba:", err.message);
  }
}

testCascade();
