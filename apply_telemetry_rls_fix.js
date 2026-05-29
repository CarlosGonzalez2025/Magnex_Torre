/**
 * apply_telemetry_rls_fix.js
 * Aplica las políticas RLS para el módulo de Procesador Satelital Directo.
 * 
 * Este script muestra el SQL que debe ejecutarse en Supabase Dashboard
 * porque las políticas DDL requieren la service_role key.
 * 
 * USO:
 *   node apply_telemetry_rls_fix.js
 * 
 * Luego copia el SQL mostrado y pégalo en:
 *   https://supabase.com/dashboard/project/cmzeijcyykzdmvisojte/sql/new
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log('\n🔍 Verificando estado actual de tablas y políticas...\n');

  // Test SELECT
  const { error: eReadCond } = await supabase.from('reportes_conductores').select('id').limit(1);
  const { error: eReadVeh } = await supabase.from('reportes_vehiculos').select('id').limit(1);
  console.log('  reportes_conductores SELECT:', eReadCond ? '❌ ' + eReadCond.message : '✅ OK');
  console.log('  reportes_vehiculos SELECT:', eReadVeh ? '❌ ' + eReadVeh.message : '✅ OK');

  // Test INSERT (debería fallar sin sesión por RLS)
  const { data: conds } = await supabase.from('conductores').select('id').limit(1);
  if (conds && conds.length > 0) {
    const { error: eInsertCond } = await supabase.from('reportes_conductores').insert({
      conductor_id: conds[0].id,
      periodo_inicio: '2026-04-29',
      periodo_fin: '2026-05-28',
      mes: '2026-05',
      fecha_reporte: '2026-05-29',
      calificacion: 0
    });
    
    if (eInsertCond) {
      console.log('\n⚠️  INSERT bloqueado por RLS:', eInsertCond.message);
      console.log('\n📋 SOLUCIÓN: Ejecuta el siguiente SQL en Supabase Dashboard:\n');
      console.log('   URL: https://supabase.com/dashboard/project/cmzeijcyykzdmvisojte/sql/new\n');
      
      const sqlPath = path.resolve(__dirname, 'migrations', 'fix_rls_telemetry_anon.sql');
      try {
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        console.log('══════════════════════ SQL A EJECUTAR ══════════════════════');
        console.log(sql);
        console.log('═══════════════════════════════════════════════════════════');
      } catch(e) {
        console.error('No se pudo leer el archivo:', e.message);
      }
    } else {
      console.log('\n✅ INSERT funciona correctamente — las políticas RLS ya permiten acceso.');
    }
  }
}

main().catch(console.error);
