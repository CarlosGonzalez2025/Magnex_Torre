import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const email = 'torre_control_admin@magnex.com';
const password = 'MagnexTorre2026!';

async function test() {
  console.log("=== PROBANDO AUTENTICACIÓN Y ESCRITURA ===");
  try {
    // 1. Intentar registrar al usuario por si no existe
    console.log(`Intentando registrar usuario: ${email}...`);
    const { data: regData, error: regErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: 'Control Admin',
          role: 'admin'
        }
      }
    });

    if (regErr) {
      console.log("Registro omitido/fallido (probablemente ya existe):", regErr.message);
    } else {
      console.log("Usuario registrado con éxito!");
    }

    // 2. Iniciar sesión para obtener un JWT válido (authenticated)
    console.log(`Iniciando sesión como: ${email}...`);
    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (loginErr) {
      throw loginErr;
    }
    console.log("Sesión iniciada con éxito! Token recibido.");

    // 3. Probar inserción con el cliente autenticado
    console.log("Insertando fila de prueba en reportes_conductores con usuario autenticado...");
    // Busquemos primero un conductor real para evitar error de llave foránea
    const { data: realCond } = await supabase.from('conductores').select('id').limit(1).single();
    if (!realCond) {
      console.log("No se encontró ningún conductor real en DB para probar.");
      return;
    }

    const { data: insData, error: insErr } = await supabase
      .from('reportes_conductores')
      .insert({
        conductor_id: realCond.id,
        periodo_inicio: '2026-04-29',
        periodo_fin: '2026-05-28',
        calificacion: 100,
        kms: 100,
        horas_conduccion: 10,
        mes: '2026-04',
        ibutton: 'TEST_IBUTTON',
        estado_conductor: 'ACTIVO',
        proyecto: 'TEST_PROYECTO',
        fecha_reporte: '2026-05-28'
      });

    if (insErr) {
      console.error("Error al insertar fila:", insErr.message);
    } else {
      console.log("Inserción exitosa con usuario autenticado!");
      // Limpiar fila de prueba
      await supabase.from('reportes_conductores').delete().eq('ibutton', 'TEST_IBUTTON');
      console.log("Fila de prueba limpiada.");
    }

  } catch (err) {
    console.error("Error fatal en la prueba:", err.message);
  }
}

test();
