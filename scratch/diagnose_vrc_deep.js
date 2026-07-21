import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const fechaInicio = '2026-05-29';
const fechaFin = '2026-06-28';
const contratoAdmin = '4bbd8493-20e0-4818-917c-ede4e001a676';
const contratoTibu = '3b2b1604-4b6d-4786-a077-04c1d4be39cc';

async function fetchAllRows(query) {
  const allRows = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    allRows.push(...(data ?? []));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

async function main() {
  // 1. Los 2 reportes de conductores existentes para VRC-ADMIN
  const condsAdmin = await fetchAllRows(supabase.from('conductores').select('*').eq('contrato_id', contratoAdmin));
  const condIdsAdmin = condsAdmin.map(c => c.id);
  const repCondAdmin = await fetchAllRows(
    supabase.from('reportes_conductores').select('*').in('conductor_id', condIdsAdmin).eq('periodo_inicio', fechaInicio).eq('periodo_fin', fechaFin)
  );
  console.log('=== Reportes de conductores existentes (VRC-ADMIN) ===');
  repCondAdmin.forEach(r => {
    const c = condsAdmin.find(cc => cc.id === r.conductor_id);
    console.log(JSON.stringify({ nombre: c?.nombres, cedula: c?.cedula, ...r }, null, 0));
  });

  // 2. Telemetria diaria cruda coltrack_datos_conductor para conductores VRC-ADMIN y VRC-TIBU en el periodo
  const condsTibu = await fetchAllRows(supabase.from('conductores').select('*').eq('contrato_id', contratoTibu));
  const condIdsTibu = condsTibu.map(c => c.id);

  for (const [label, ids] of [['VRC-ADMIN', condIdsAdmin], ['VRC-TIBU', condIdsTibu]]) {
    const daily = await fetchAllRows(
      supabase.from('coltrack_datos_conductor').select('*').in('conductor_id', ids).gte('fecha', fechaInicio).lte('fecha', fechaFin)
    );
    const sumKms = daily.reduce((s, r) => s + Number(r.kms ?? 0), 0);
    console.log(`\n=== coltrack_datos_conductor diario para ${label} en el periodo ===`);
    console.log(`Registros: ${daily.length} | Suma Kms: ${sumKms.toFixed(2)}`);
  }

  // 3. Cargas excel recientes (para ver que se subio en el periodo)
  const cargas = await fetchAllRows(
    supabase.from('cargas_excel').select('*').gte('created_at', '2026-05-29').order('created_at', { ascending: false })
  );
  console.log(`\n=== Cargas Excel desde 2026-05-29 (${cargas.length}) ===`);
  cargas.slice(0, 40).forEach(c => {
    console.log(`- ${c.created_at} | archivo: ${c.nombre_archivo ?? c.archivo_nombre ?? '?'} | tipo: ${c.tipo ?? c.tipo_carga ?? '?'} | estado: ${c.estado_validacion} | periodo: ${c.periodo_inicio ?? '?'} - ${c.periodo_fin ?? '?'}`);
  });

  // 4. Vehiculos de VRC-TIBU y VRC-ADMIN: ver si tienen conductor_actual asignado
  console.log('\n=== Vehiculos VRC-ADMIN: campo conductor asignado ===');
  const vehsAdmin = await fetchAllRows(supabase.from('vehiculos').select('*').eq('contrato_id', contratoAdmin));
  vehsAdmin.forEach(v => console.log(`  Placa ${v.placa} | conductor_id: ${v.conductor_id ?? v.conductor_actual_id ?? 'N/A'} | estado: ${v.estado}`));

  console.log('\n=== Vehiculos VRC-TIBU: campo conductor asignado (primeros 25) ===');
  const vehsTibu = await fetchAllRows(supabase.from('vehiculos').select('*').eq('contrato_id', contratoTibu));
  vehsTibu.slice(0, 25).forEach(v => console.log(`  Placa ${v.placa} | conductor_id: ${v.conductor_id ?? v.conductor_actual_id ?? 'N/A'} | estado: ${v.estado}`));
}

main().catch(err => console.error('Error:', err.message, err));
