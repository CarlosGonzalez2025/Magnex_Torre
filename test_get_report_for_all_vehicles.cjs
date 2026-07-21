const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const contratoId = '78d4f5be-239a-4117-b387-a2e74f5c6631'; // ENEL ZIII
const fechaInicio = '2026-04-29';
const fechaFin = '2026-05-28';

function sumar(arr, key) {
  return arr.reduce((acc, d) => acc + Number(d[key] || 0), 0);
}

async function run() {
  console.log("=== DIAGNOSTICO DE REPORTES DE VEHICULOS ENEL ZIII ===");

  // 1. Obtener vehículos del contrato
  const { data: vehs, error: eVeh } = await supabase
    .from('vehiculos')
    .select('*')
    .eq('contrato_id', contratoId);

  if (eVeh) {
    console.error("Error al obtener vehículos:", eVeh);
    return;
  }

  console.log(`Total vehículos del contrato en la BD: ${vehs.length}`);

  // 2. Mapear cada vehículo al formato de getReporteVehiculo
  const reportes = [];
  for (const v of vehs) {
    const { data: reportesRaw } = await supabase
      .from('reportes_vehiculos')
      .select('*')
      .eq('vehiculo_id', v.id)
      .lte('periodo_inicio', fechaFin)
      .gte('periodo_fin', fechaInicio);

    if (reportesRaw && reportesRaw.length > 0) {
      const r = reportesRaw[0];
      reportes.push({
        placa: v.placa,
        kms: r.kms,
        frenadas: r.frenadas_bruscas,
        horas: r.horas_conduccion,
        periodo: `${r.periodo_inicio} a ${r.periodo_fin}`,
        dispositivo_gps: r.dispositivo_gps
      });
    }
  }

  console.log(`Total reportes obtenidos en el periodo ${fechaInicio} a ${fechaFin}: ${reportes.length}`);
  
  // Buscar placa NPY967
  const match = reportes.find(r => r.placa === 'NPY967');
  if (match) {
    console.log("\n✅ ENCONTRADA PLACA NPY967 EN EL PERIODO DE MAYO:");
    console.log(JSON.stringify(match, null, 2));
  } else {
    console.log("\n❌ NO SE ENCONTRÓ PLACA NPY967 EN EL PERIODO DE MAYO");
  }

  console.log("\nLista de todos los reportes de vehículos en este periodo:");
  reportes.forEach((r, idx) => {
    console.log(`${idx+1}. Placa: ${r.placa}, KMs: ${r.kms}, Horas: ${r.horas}, Frenadas: ${r.frenadas}, Periodo: ${r.periodo}`);
  });
}

run();
