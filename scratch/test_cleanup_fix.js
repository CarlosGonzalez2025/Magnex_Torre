import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testCleanup() {
  console.log("=== INICIANDO VERIFICACIÓN DE LIMPIEZA MASIVA (FIX) ===");
  try {
    // 1. Obtener conteo inicial
    const { count: alertsCountBefore, error: cErr1 } = await supabase
      .from('batch_alerts')
      .select('*', { count: 'exact', head: true });

    if (cErr1) throw cErr1;
    console.log(`Alertas antes del vaciado: ${alertsCountBefore}`);

    // 2. Obtener todas las cargas
    const { data: uploads, error: uErr } = await supabase
      .from('file_uploads')
      .select('id, filename');

    if (uErr) throw uErr;
    console.log(`Cargas en file_uploads encontradas: ${uploads ? uploads.length : 0}`);

    // 3. Simular el bucle de borrado uno por uno de file_uploads (cascade delete)
    if (uploads && uploads.length > 0) {
      for (let i = 0; i < uploads.length; i++) {
        const upload = uploads[i];
        console.log(`🗑️ Borrando carga [${i + 1}/${uploads.length}]: ${upload.filename} (ID: ${upload.id})`);
        
        const startTime = Date.now();
        const { error: delErr } = await supabase
          .from('file_uploads')
          .delete()
          .eq('id', upload.id);

        if (delErr) {
          console.error(`❌ Error borrando carga ${upload.id}:`, delErr.message);
          throw delErr;
        }
        console.log(`   OK (tiempo: ${Date.now() - startTime}ms)`);
      }
    }

    // 4. Limpieza residual
    console.log("🧹 Limpiando remanentes de batch_alerts...");
    const { error: rErr1 } = await supabase.from('batch_alerts').delete().not('id', 'is', null);
    if (rErr1) console.warn("Aviso residual batch_alerts:", rErr1.message);

    console.log("🧹 Limpiando remanentes de file_uploads...");
    const { error: rErr2 } = await supabase.from('file_uploads').delete().not('id', 'is', null);
    if (rErr2) console.warn("Aviso residual file_uploads:", rErr2.message);

    // 5. Verificar conteo final
    const { count: alertsCountAfter, error: cErr2 } = await supabase
      .from('batch_alerts')
      .select('*', { count: 'exact', head: true });

    if (cErr2) throw cErr2;

    const { count: uploadsCountAfter, error: cErr3 } = await supabase
      .from('file_uploads')
      .select('*', { count: 'exact', head: true });

    if (cErr3) throw cErr3;

    console.log("\n=== CONTEO POST-LIMPIEZA ===");
    console.log(`Alertas en batch_alerts: ${alertsCountAfter}`);
    console.log(`Cargas en file_uploads: ${uploadsCountAfter}`);

    if (alertsCountAfter === 0 && uploadsCountAfter === 0) {
      console.log("\n✅ ÉXITO TOTAL: La limpieza secuencial completó correctamente sin timeouts!");
    } else {
      console.log("\n❌ ERROR: Quedaron registros sin eliminar.");
    }

  } catch (err) {
    console.error("❌ Fallo en la verificación:", err.message);
  }
}

testCleanup();
