const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchAll(table, select, build) {
  const pageSize = 1000; let all = [];
  for (let page = 0; ; page++) {
    let q = supabase.from(table).select(select).range(page*pageSize, page*pageSize+pageSize-1);
    q = build(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
  }
  return all;
}

(async () => {
  const rows = await fetchAll('ralentis_periodos', 'vehiculo_id, horas_motor_ralenti, horas_motor_encendido',
    q => q.eq('periodo_inicio', '2026-05-16').eq('periodo_fin', '2026-05-31'));
  const ids = new Set(rows.map(r => r.vehiculo_id));
  const sumR = rows.reduce((a,r)=>a+(Number(r.horas_motor_ralenti)||0),0);
  const sumE = rows.reduce((a,r)=>a+(Number(r.horas_motor_encendido)||0),0);
  console.log(`Filas=${rows.length} | vehiculos distintos=${ids.size} | (¿duplicados? ${rows.length!==ids.size})`);
  console.log(`Suma horas_motor_ralenti=${sumR.toFixed(2)} h`);
  console.log(`Suma horas_motor_encendido=${sumE.toFixed(2)} h`);
  console.log(`% ralenti sobre encendido=${sumE>0?(sumR/sumE*100).toFixed(1):'-'}%`);

  // Top 5 vehiculos por ralenti para sanity check de valores individuales
  const top = [...rows].sort((a,b)=>(Number(b.horas_motor_ralenti)||0)-(Number(a.horas_motor_ralenti)||0)).slice(0,5);
  console.log('\nTop 5 vehiculos por horas_motor_ralenti en la quincena:');
  top.forEach(r=>console.log(`  veh=${r.vehiculo_id.slice(0,8)} ralenti=${Number(r.horas_motor_ralenti).toFixed(1)}h encendido=${Number(r.horas_motor_encendido).toFixed(1)}h`));
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
