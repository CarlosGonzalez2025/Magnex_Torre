const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchAll(table, select) {
  const pageSize = 1000;
  let all = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase.from(table).select(select).range(page*pageSize, page*pageSize + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
  }
  return all;
}

function isQuincena(inicio, fin) {
  const [yi, mi, di] = inicio.split('-').map(Number);
  const [yf, mf, df] = fin.split('-').map(Number);
  if (yi !== yf || mi !== mf) return false;
  const ultimoDia = new Date(yi, mi, 0).getDate();
  return (di === 1 && df === 15) || (di === 16 && df === ultimoDia);
}

(async () => {
  const rows = await fetchAll('ralentis_periodos', 'periodo_inicio, periodo_fin, horas_motor_encendido, horas_motor_ralenti');
  const q = rows.filter(r => isQuincena(r.periodo_inicio, r.periodo_fin));
  const g = new Map();
  for (const r of q) {
    const k = `${r.periodo_inicio} -> ${r.periodo_fin}`;
    const o = g.get(k) || { filas:0, enc:0, ral:0, encZero:0, ralPos:0, encPos:0, encGEral:0 };
    const enc = Number(r.horas_motor_encendido)||0;
    const ral = Number(r.horas_motor_ralenti)||0;
    o.filas++; o.enc += enc; o.ral += ral;
    if (enc === 0) o.encZero++;
    if (ral > 0) o.ralPos++;
    if (enc > 0) o.encPos++;
    if (enc >= ral) o.encGEral++;
    g.set(k, o);
  }
  const g2 = new Map();
  for (const r of q) {
    const enc = Number(r.horas_motor_encendido)||0;
    const ral = Number(r.horas_motor_ralenti)||0;
    if (enc <= 0) continue;
    const k = `${r.periodo_inicio} -> ${r.periodo_fin}`;
    const o = g2.get(k) || { enc:0, ral:0 };
    o.enc += enc; o.ral += ral;
    g2.set(k, o);
  }
  const keys = [...g.keys()].sort();
  console.log('=== ACTUAL (suma sobre TODAS las filas, enc=0 incluidas) ===');
  console.log('periodo                         | filas | enc=0 | enc>0 | conduccion(enc-ral) |  %ralenti | sum_enc  | sum_ral');
  for (const k of keys) {
    const o = g.get(k);
    const cond = o.enc - o.ral;
    const pct = o.enc>0 ? (o.ral/o.enc*100) : 0;
    console.log(`${k.padEnd(31)} | ${String(o.filas).padStart(5)} | ${String(o.encZero).padStart(5)} | ${String(o.encPos).padStart(5)} | ${cond.toFixed(1).padStart(19)} | ${pct.toFixed(2).padStart(8)}% | ${o.enc.toFixed(0).padStart(8)} | ${o.ral.toFixed(0).padStart(8)}`);
  }
  console.log('\n=== CORREGIDO (solo filas con enc>0 = cobertura real de horas motor) ===');
  console.log('periodo                         | veh c/motor | conduccion(enc-ral) |  %ralenti | sum_enc  | sum_ral');
  for (const k of keys) {
    const o = g2.get(k); if (!o) continue;
    const cond = o.enc - o.ral;
    const pct = o.enc>0 ? (o.ral/o.enc*100) : 0;
    console.log(`${k.padEnd(31)} | ${String(g.get(k).encPos).padStart(11)} | ${cond.toFixed(1).padStart(19)} | ${pct.toFixed(2).padStart(8)}% | ${o.enc.toFixed(0).padStart(8)} | ${o.ral.toFixed(0).padStart(8)}`);
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
