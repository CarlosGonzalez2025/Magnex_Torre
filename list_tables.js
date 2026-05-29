import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspect() {
  console.log("=== LISTANDO TABLAS Y PERMISOS DE LA BASE DE DATOS ===");
  try {
    // 1. Consultar si hay una tabla de usuarios
    const { data: users, error: uErr } = await supabase
      .from('user_profiles') // o profiles, o usuarios
      .select('*')
      .limit(10);
      
    if (uErr) {
      console.log("Error consultando user_profiles:", uErr.message);
      // Probemos con 'usuarios'
      const { data: users2, error: uErr2 } = await supabase
        .from('usuarios')
        .select('*')
        .limit(10);
      if (uErr2) {
        console.log("Error consultando usuarios:", uErr2.message);
      } else {
        console.log("Usuarios encontrados:", users2);
      }
    } else {
      console.log("User profiles encontrados:", users);
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

inspect();
