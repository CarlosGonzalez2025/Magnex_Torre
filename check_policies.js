import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  console.log("=== INSPECCIONANDO POLITICAS DE RLS EN pg_policies ===");
  try {
    // Para ver las políticas, podemos hacer una consulta RPC o ver si tenemos acceso a pg_policies?
    // Las políticas RLS restringen las filas devueltas. Sin embargo, no restringen el metadato.
    // Intentemos hacer una consulta directa a pg_policies. Pero pg_policies es una vista del catálogo del sistema.
    // ¿Supabase nos deja leer pg_policies desde el cliente anónimo? Probablemente no, porque está restringido.
    // Sin embargo, podemos consultar una función RPC si existe, o hacer un select a reportes_conductores.
    // Probemos a hacer un select a reportes_conductores.
    const { data, error } = await supabase
      .from('reportes_conductores')
      .select('*')
      .limit(1);
    
    if (error) {
      console.log("Error al hacer select en reportes_conductores:", error.message);
    } else {
      console.log("Select exitoso en reportes_conductores! Filas obtenidas:", data.length);
    }

    // Intentemos insertar una fila de prueba vacía/inválida para ver si dispara RLS o validación
    const { data: insData, error: insErr } = await supabase
      .from('reportes_conductores')
      .insert({
        conductor_id: '00000000-0000-0000-0000-000000000000',
        periodo_inicio: '2026-04-29',
        periodo_fin: '2026-05-28',
        calificacion: 100,
        kms: 100,
        horas_conduccion: 10,
        mes: '2026-04'
      });
      
    if (insErr) {
      console.log("Error al insertar fila de prueba:", insErr.message);
    } else {
      console.log("Inserción exitosa! Fila de prueba insertada:", insData);
    }
  } catch (err) {
    console.error("Error inesperado:", err.message);
  }
}

check();
