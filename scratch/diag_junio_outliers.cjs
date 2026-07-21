const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchAll(table, select, build) {
  const pageSize = 1000; let all = [];
  for (let page = 0; ; page++) {
    let q = supabase.from(table).select(select).range(page*pageSize, page*pageSize + pageSize - 1);
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
  }
  return all;
}

// dias del periodo (quincena = 15 dias)
function analiza(rows, label) {
  const conMotor = rows.filter(r => (Number(r.horas_motor_encendido)||0) > 0);
  const encs = conMotor.map(r => Number(r.horas_motor_encendido)||0).sort((a,b)=>a-b);
  const sum = encs.reduce((a,b)=>a+b,0);
  const n = encs.length;
  const mediaDia = (sum/n)/15;
  const p50 = encs[Math.floor(n*0.5)];
  const p95 = encs[Math.floor(n*0.95)];
  const max = encs[n-1];
  // cuantos vehiculos superan 15h/dia (físicamente sospechoso para 1 vehiculo)
  const susp = conMotor.filter(r => (Number(r.horas_motor_encendido)||0)/15 > 15).length;
  const susp24 = conMotor.filter(r => (Number(r.horas_motor_encendido)||0)/15 > 24).length;
  console.log(`\n=== ${label} ===`);
  console.log(`veh c/motor=${n} | sum enc=${sum.toFixed(0)} h | media=${(sum/n).toFixed(1)} h/veh (${mediaDia.toFixed(2)} h/día)`);
  console.log(`enc por veh: p50=${p50.toFixed(1)}  p95=${p95.toFixed(1)}  max=${max.toFixed(1)} h  (max=${(max/15).toFixed(1)} h/día)`);
  console.log(`veh con >15 h/día encendido: ${susp}   | veh con >24 h/día (imposible): ${susp24}`);
  // top 5 outliers
  const top = [...conMotor].sort((a,b)=>(Number(b.horas_motor_encendido)||0)-(Number(a.horas_motor_encendido)||0)).slice(0,5);
  console.log('top5 enc:', top.map(r=>`${r.vehiculo_id.slice(0,8)}:${(Number(r.horas_motor_encendido)||0).toFixed(0)}h`).join('  '));
}

(async () => {
  const abr = await fetchAll('ralentis_periodos', 'vehiculo_id, horas_motor_encendido, horas_motor_ralenti',
    q => q.eq('periodo_inicio','2026-04-01').eq('periodo_fin','2026-04-15'));
  const jun = await fetchAll('ralentis_periodos', 'vehiculo_id, horas_motor_encendido, horas_motor_ralenti',
    q => q.eq('periodo_inicio','2026-06-01').eq('periodo_fin','2026-06-15'));
  analiza(abr, 'Q1 Abril 2026 (BASE)');
  analiza(jun, 'Q1 Junio 2026 (ACTUAL)');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
