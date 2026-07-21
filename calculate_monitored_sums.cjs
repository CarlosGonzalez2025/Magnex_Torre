const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const contratoId = '78d4f5be-239a-4117-b387-a2e74f5c6631'; // ENEL ZIII

function tieneGpsConfigurado(valor) {
  const normalizado = String(valor ?? '').trim().toUpperCase();
  return Boolean(normalizado) && !['NO', 'N/A', 'NA', 'SIN GPS', 'NINGUNO', 'NO APLICA', '0'].includes(normalizado);
}

async function run() {
  console.log("=== CALCULANDO SUMATORIAS DE VEHICULOS MONITOREADOS ===");

  // 1. Obtener vehículos del contrato
  const { data: vehs } = await supabase
    .from('vehiculos')
    .select('*')
    .eq('contrato_id', contratoId);

  console.log(`Total vehículos contrato: ${vehs.length}`);

  // 2. Sumar para Abril (2026-03-29 a 2026-04-28)
  const reportesApril = [];
  for (const v of vehs) {
    const { data: reportesRaw } = await supabase
      .from('reportes_vehiculos')
      .select('*')
      .eq('vehiculo_id', v.id)
      .lte('periodo_inicio', '2026-04-28')
      .gte('periodo_fin', '2026-03-29');

    if (reportesRaw && reportesRaw.length > 0) {
      const r = reportesRaw[0];
      const tieneGps = Number(r.kms || 0) > 0 || Number(r.horas_conduccion || 0) > 0 || tieneGpsConfigurado(v.gps_compañia);
      if (tieneGps) {
        reportesApril.push(r);
      }
    }
  }

  const sumApril = reportesApril.reduce((acc, r) => acc + Number(r.kms || 0), 0);
  console.log(`\nSuma ABRIL Monitoreados: ${sumApril} km`);
  console.log(`Cantidad Monitoreados en Abril: ${reportesApril.length}`);

  // 3. Sumar para Mayo (2026-04-29 a 2026-05-28)
  const reportesMay = [];
  for (const v of vehs) {
    const { data: reportesRaw } = await supabase
      .from('reportes_vehiculos')
      .select('*')
      .eq('vehiculo_id', v.id)
      .lte('periodo_inicio', '2026-05-28')
      .gte('periodo_fin', '2026-04-29');

    if (reportesRaw && reportesRaw.length > 0) {
      const r = reportesRaw[0];
      const tieneGps = Number(r.kms || 0) > 0 || Number(r.horas_conduccion || 0) > 0 || tieneGpsConfigurado(v.gps_compañia);
      if (tieneGps) {
        reportesMay.push(r);
      }
    }
  }

  const sumMay = reportesMay.reduce((acc, r) => acc + Number(r.kms || 0), 0);
  console.log(`\nSuma MAYO Monitoreados: ${sumMay} km`);
  console.log(`Cantidad Monitoreados en Mayo: ${reportesMay.length}`);
}

run();
