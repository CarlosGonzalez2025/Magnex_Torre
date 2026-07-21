const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const vehiculoId = '0aa1db2d-a157-462a-a906-b5445876876a'; // NPY967
const fechaInicio = '2026-04-29';
const fechaFin = '2026-05-28';

function sumar(arr, key) {
  return arr.reduce((acc, d) => acc + Number(d[key] || 0), 0);
}

function promedio(arr, key) {
  if (arr.length === 0) return 0;
  return sumar(arr, key) / arr.length;
}

async function run() {
  console.log("=== MIGRANDO LOGICA DE getReporteVehiculo ===");

  const { data: veh, error: eVeh } = await supabase
    .from('vehiculos')
    .select('*, contratos(*)')
    .eq('id', vehiculoId)
    .single();
  if (eVeh || !veh) {
    console.error("Vehiculo no encontrado:", eVeh);
    return;
  }

  const { data: metricsRaw } = await supabase
    .from('coltrack_datos_vehiculo')
    .select('*')
    .eq('vehiculo_id', vehiculoId)
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin);

  const { data: ralentiRaw } = await supabase
    .from('ralentis')
    .select('*')
    .eq('vehiculo_id', vehiculoId)
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin);

  let metrics = (metricsRaw ?? []);
  let ralentisData = (ralentiRaw ?? []);

  console.log(`metricsRaw.length = ${metrics.length}`);
  console.log(`ralentiRaw.length = ${ralentisData.length}`);

  if (metrics.length === 0) {
    console.log("metrics es vacío, consultando reportes_vehiculos...");
    const { data: reportesRaw } = await supabase
      .from('reportes_vehiculos')
      .select('*')
      .eq('vehiculo_id', vehiculoId)
      .lte('periodo_inicio', fechaFin)
      .gte('periodo_fin', fechaInicio);
    
    console.log(`reportesRaw devuelto: ${reportesRaw ? reportesRaw.length : 0} registros`);
    if (reportesRaw) {
      reportesRaw.forEach((r, idx) => {
        console.log(`Reporte ${idx+1}: ID = ${r.id}, Periodo = ${r.periodo_inicio} a ${r.periodo_fin}, kms = ${r.kms}`);
      });
    }

    metrics = (reportesRaw ?? []).map(r => ({
      ...r,
      aceleraciones: r.aceleraciones ?? r.aceleraciones_bruscas,
      frenadas: r.frenadas ?? r.frenadas_bruscas,
      fecha: r.periodo_inicio,
    }));

    if (ralentisData.length === 0 && reportesRaw && reportesRaw.length > 0) {
      ralentisData = reportesRaw.map(r => ({
        ...r,
        kms_recorridos: r.kms ?? r.km_recorridos_ralenti,
        horas_motor_ralenti: r.horas_motor_ralenti,
        horas_motor_encendido: r.horas_motor_encendido,
        consumo_combustible: r.consumo_combustible,
      }));
    }
  }

  const calificacion = metrics.length > 0 ? promedio(metrics, 'calificacion') : 0;
  
  const metricas = {
    calificacion: Math.round(calificacion * 100) / 100,
    kms: Math.round(sumar(metrics, 'kms') * 100) / 100,
    horas_conduccion: Math.round(sumar(metrics, 'horas_conduccion') * 100) / 100,
    excesos_10_kph: sumar(metrics, 'excesos_10_kph'),
    excesos_20_kph: sumar(metrics, 'excesos_20_kph'),
    excesos_30_kph: sumar(metrics, 'excesos_30_kph'),
    excesos_40_kph: sumar(metrics, 'excesos_40_kph'),
    excesos_50_kph: sumar(metrics, 'excesos_50_kph'),
    excesos_60_kph: sumar(metrics, 'excesos_60_kph'),
    excesos_80_kph: sumar(metrics, 'excesos_80_kph'),
    aceleraciones: sumar(metrics, 'aceleraciones'),
    frenadas: sumar(metrics, 'frenadas'),
    dias_evaluados: metrics.length,
    dispositivo_gps: metrics.length > 0 ? String(metrics[0].gps_proveedor ?? metrics[0].dispositivo_gps ?? '') : '',
    estado_gps: '',
    base: veh.lugar ?? '',
    maxima_vel_80_kph: metrics.length > 0 ? Math.max(...metrics.map(m => Number(m.maxima_vel_80_kph ?? 0))) : 0,
  };

  console.log("\nRESULTADO FINAL DE METRICAS:");
  console.log(JSON.stringify(metricas, null, 2));
}

run();
