/**
 * run_migration.js
 * Ejecuta la migración SQL para las tablas del Procesador Satelital Directo.
 * 
 * CÓMO USAR:
 *   node run_migration.js
 * 
 * REQUISITOS:
 *   - El admin debe estar autenticado con credenciales que tengan permisos DDL.
 *   - Alternativamente, copia el contenido de migrations/reports_telemetry_plana_v1.sql
 *     y pégalo en el SQL Editor de Supabase (https://supabase.com/dashboard).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
// Anon key - suficiente para verificar, pero el DDL requiere service_role key
// Si tienes la service_role key, reemplázala aquí.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkTablesExist() {
  console.log('\n🔍 Verificando existencia de tablas en Supabase...\n');

  // Verificar reportes_conductores
  const { error: e1 } = await supabase
    .from('reportes_conductores')
    .select('id')
    .limit(1);

  const conductoresOk = !e1 || !e1.message.includes('does not exist');

  // Verificar reportes_vehiculos
  const { error: e2 } = await supabase
    .from('reportes_vehiculos')
    .select('id')
    .limit(1);

  const vehiculosOk = !e2 || !e2.message.includes('does not exist');

  console.log(`  ✅ reportes_conductores: ${conductoresOk ? 'EXISTE' : '❌ NO EXISTE'}`);
  if (!conductoresOk) console.log(`     Error: ${e1?.message}`);
  
  console.log(`  ✅ reportes_vehiculos:   ${vehiculosOk ? 'EXISTE' : '❌ NO EXISTE'}`);
  if (!vehiculosOk) console.log(`     Error: ${e2?.message}`);

  if (!conductoresOk || !vehiculosOk) {
    console.log('\n⚠️  Las tablas NO existen. Debes ejecutar la migración manualmente.');
    console.log('\n📋 INSTRUCCIONES:');
    console.log('   1. Ve a: https://supabase.com/dashboard/project/cmzeijcyykzdmvisojte/sql/new');
    console.log('   2. Copia el contenido de: migrations/reports_telemetry_plana_v1.sql');
    console.log('   3. Pégalo en el SQL Editor y haz clic en "Run"');
    console.log('\n   ── O usa este atajo: abre el archivo SQL ──');
    const sqlPath = path.resolve(__dirname, 'migrations', 'reports_telemetry_plana_v1.sql');
    console.log(`   Archivo: ${sqlPath}`);
    
    // Mostrar el SQL completo para copiar
    try {
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      console.log('\n══════════════════════ SQL A EJECUTAR ══════════════════════');
      console.log(sql);
      console.log('═══════════════════════════════════════════════════════════\n');
    } catch (err) {
      console.error('No se pudo leer el archivo SQL:', err.message);
    }
  } else {
    console.log('\n✅ ¡Ambas tablas existen! El módulo de telemetría satelital está listo.\n');

    // Contar registros existentes
    const { count: c1 } = await supabase
      .from('reportes_conductores')
      .select('*', { count: 'exact', head: true });
    
    const { count: c2 } = await supabase
      .from('reportes_vehiculos')
      .select('*', { count: 'exact', head: true });

    console.log(`  📊 reportes_conductores: ${c1 ?? 0} registro(s)`);
    console.log(`  📊 reportes_vehiculos:   ${c2 ?? 0} registro(s)`);
  }
}

checkTablesExist().catch(console.error);
