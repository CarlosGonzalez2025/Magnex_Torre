const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://cmzeijcyykzdmvisojte.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME');
const N = v => Number(v)||0;
(async () => {
  // reportes_vehiculos para Jun Q1 quincena: hay filas? consumo = total?
  const { data: rv } = await supabase.from('reportes_vehiculos')
    .select('vehiculo_id, consumo_combustible, kms, horas_conduccion, fuente, periodo_inicio, periodo_fin')
    .eq('periodo_inicio','2026-06-01').eq('periodo_fin','2026-06-15');
  console.log(`reportes_vehiculos Jun Q1 quincena: ${rv?.length||0} filas`);
  const fuentes = {}; (rv||[]).forEach(r=>fuentes[r.fuente]=(fuentes[r.fuente]||0)+1);
  console.log('fuentes:', JSON.stringify(fuentes));
  const sumConsumoRV = (rv||[]).reduce((a,r)=>a+N(r.consumo_combustible),0);
  console.log('Σ consumo reportes_vehiculos =', sumConsumoRV.toFixed(1));

  const { data: rp } = await supabase.from('ralentis_periodos')
    .select('vehiculo_id, consumo_combustible')
    .eq('periodo_inicio','2026-06-01').eq('periodo_fin','2026-06-15');
  const sumConsumoRP = (rp||[]).reduce((a,r)=>a+N(r.consumo_combustible),0);
  console.log('Σ consumo ralentis_periodos (ralentí gal) =', sumConsumoRP.toFixed(1), `(${rp?.length} filas)`);

  // ¿reportes tiene periodos quincenales en general o solo mensuales?
  const { data: pers } = await supabase.from('reportes_vehiculos')
    .select('periodo_inicio, periodo_fin').limit(2000);
  const uniq = new Set((pers||[]).map(p=>`${p.periodo_inicio}_${p.periodo_fin}`));
  console.log('\nperiodos distintos en reportes_vehiculos:', [...uniq].sort().join('  '));
})().catch(e=>console.error(e.message));
