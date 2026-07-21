const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const S = '2026-05-16', E = '2026-05-31';
const UMBRAL = { COLTRACK: 600, FAGOR: 300 };
const umbral = p => UMBRAL[(p||'').toUpperCase().trim()] ?? 300;

async function fetchAll(table, select, build) {
  const ps = 1000; let all = [];
  for (let p = 0; ; p++) {
    let q = supabase.from(table).select(select).range(p*ps, p*ps+ps-1);
    q = build(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || !data.length) break;
    all = all.concat(data); if (data.length < ps) break;
  }
  return all;
}

async function metricas(label, contratoId) {
  // ralentis_periodos -> Tiempo Total en Ralentí
  const per = await fetchAll('ralentis_periodos',
    contratoId ? 'horas_motor_ralenti, vehiculos!inner(contrato_id)' : 'horas_motor_ralenti',
    q => { q = q.gte('periodo_inicio', S).lte('periodo_fin', E); if (contratoId) q = q.eq('vehiculos.contrato_id', contratoId); return q; });
  const totalRalenti = per.reduce((a,r)=>a+(Number(r.horas_motor_ralenti)||0),0);

  // ralentis_eventos -> Ralentí > umbral (alertEvents)
  const ev = await fetchAll('ralentis_eventos',
    contratoId ? 'duracion_segundos, proveedor, vehiculos!inner(contrato_id)' : 'duracion_segundos, proveedor',
    q => { q = q.gte('fecha_inicio', `${S}T00:00:00Z`).lte('fecha_inicio', `${E}T23:59:59Z`); if (contratoId) q = q.eq('vehiculos.contrato_id', contratoId); return q; });
  const alert = ev.filter(e => (Number(e.duracion_segundos)||0) >= umbral(e.proveedor));
  const horasMas5 = alert.reduce((a,e)=>a+(Number(e.duracion_segundos)||0),0)/3600;

  console.log(`\n[${label}]`);
  console.log(`  filas periodos=${per.length} | Tiempo Total Ralentí = ${totalRalenti.toFixed(2)} h`);
  console.log(`  eventos=${ev.length} | alertas(>=umbral)=${alert.length} | Ralentí>5min = ${horasMas5.toFixed(2)} h`);
  return { totalRalenti, horasMas5 };
}

(async () => {
  const sin = await metricas('SIN FILTRO (toda la flota)', null);

  const { data: contratos } = await supabase.from('contratos').select('id, nombre').order('nombre').limit(3);
  for (const c of contratos) {
    await metricas(`CONTRATO: ${c.nombre}`, c.id);
  }
  console.log(`\n=> Si las cifras por contrato son menores y distintas al total, ambas son dinámicas con el filtro.`);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
