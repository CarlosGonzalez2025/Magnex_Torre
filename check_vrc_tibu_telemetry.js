import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const fechaInicio = '2026-04-29';
const fechaFin = '2026-05-28';
const contratoId = '3b2b1604-4b6d-4786-a077-04c1d4be39cc'; // ECOPETROL VRC-TIBU

async function diagnose() {
  console.log("=== COMPROBANDO DATOS DE TELEMETRÍA (COLTRACK) PARA ECOPETROL VRC-TIBU ===");
  try {
    // 1. Obtener conductores de este contrato
    const { data: conds } = await supabase
      .from('conductores')
      .select('*')
      .eq('contrato_id', contratoId);
      
    console.log(`Conductores en DB para ECOPETROL VRC-TIBU: ${conds.length}`);
    const condIds = conds.map(c => c.id);
    
    // 2. Buscar registros en coltrack_datos_conductor
    const { data: coltrackConds, error: ccErr } = await supabase
      .from('coltrack_datos_conductor')
      .select('*')
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin)
      .in('conductor_id', condIds);
      
    if (ccErr) throw ccErr;
    console.log(`Registros de telemetría diarios en coltrack_datos_conductor: ${coltrackConds.length}`);
    
    if (coltrackConds.length > 0) {
      const sumKms = coltrackConds.reduce((sum, r) => sum + Number(r.kms ?? 0), 0);
      console.log(`Suma total de Kms diarios en coltrack_datos_conductor: ${sumKms.toFixed(2)} km`);
      
      // Agrupar por conductor
      const byCond = {};
      coltrackConds.forEach(r => {
        if (!byCond[r.conductor_id]) byCond[r.conductor_id] = 0;
        byCond[r.conductor_id] += Number(r.kms ?? 0);
      });
      console.log("Desglose de Kms por conductor en telemetría diaria:");
      conds.forEach(c => {
        const kms = byCond[c.id];
        if (kms > 0) {
          console.log(`- Conductor: "${c.nombres}" | Kms: ${kms.toFixed(2)}`);
        }
      });
    } else {
      console.log("❌ No se encontraron registros de telemetría diaria en coltrack_datos_conductor para estos conductores.");
    }
    
    // 3. Buscar en coltrack_datos_vehiculo para ver si hay vehículos asociados a este contrato con Kms
    const { data: vehs } = await supabase
      .from('vehiculos')
      .select('*')
      .eq('contrato_id', contratoId);
      
    console.log(`\nVehículos en DB para ECOPETROL VRC-TIBU: ${vehs.length}`);
    const vehIds = vehs.map(v => v.id);
    
    if (vehIds.length > 0) {
      const { data: coltrackVehs, error: cvErr } = await supabase
        .from('coltrack_datos_vehiculo')
        .select('*')
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin)
        .in('vehiculo_id', vehIds);
        
      if (cvErr) throw cvErr;
      console.log(`Registros de telemetría diarios en coltrack_datos_vehiculo: ${coltrackVehs.length}`);
      
      if (coltrackVehs.length > 0) {
        const sumKmsVeh = coltrackVehs.reduce((sum, r) => sum + Number(r.kms ?? 0), 0);
        console.log(`Suma total de Kms diarios en coltrack_datos_vehiculo: ${sumKmsVeh.toFixed(2)} km`);
      } else {
        console.log("❌ No se encontraron registros de telemetría diaria en coltrack_datos_vehiculo para estos vehículos.");
      }
    }

  } catch (err) {
    console.error("Error:", err.message);
  }
}

diagnose();
