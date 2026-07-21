const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const contratoId = '78d4f5be-239a-4117-b387-a2e74f5c6631'; // ENEL ZIII
const fechaInicio = '2026-03-29'; // April period
const fechaFin = '2026-04-28';

async function run() {
  console.log("=== DIAGNOSTICO DE REPORTES DE VEHICULOS ENEL ZIII - ABRIL ===");

  const { data: vehs, error: eVeh } = await supabase
    .from('vehiculos')
    .select('*')
    .eq('contrato_id', contratoId);

  if (eVeh) {
    console.error("Error:", eVeh);
    return;
  }

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
        horas: r.horas_conduccion,
        periodo: `${r.periodo_inicio} a ${r.periodo_fin}`
      });
    }
  }

  console.log(`Total reportes obtenidos en el periodo ${fechaInicio} a ${fechaFin}: ${reportes.length}`);
  
  // Buscar placas especificas
  const platesToCheck = ['LBB99G', 'GZH66G', 'JLU80G', 'VKD76F', 'PHC31G', 'NPY967', 'NPY972'];
  console.log("\nComparación de placas específicas en ABRIL:");
  platesToCheck.forEach(plate => {
    const match = reportes.find(r => r.placa === plate);
    if (match) {
      console.log(`- Placa: ${plate}, KMs: ${match.kms}, Horas: ${match.horas}, Periodo: ${match.periodo}`);
    } else {
      console.log(`- Placa: ${plate} no tiene registro en Abril.`);
    }
  });
}

run();
