import { createClient } from '@supabase/supabase-js';
const s = createClient('https://cmzeijcyykzdmvisojte.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME');
const N = v => Number(v) || 0;

// Filas físicamente imposibles o sospechosas en TODAS las quincenas
const PAGE = 1000, rows = [];
for (let p = 0; ; p++) {
  const { data, error } = await s.from('ralentis_periodos')
    .select('vehiculo_id, periodo_inicio, periodo_fin, horas_motor_encendido, horas_motor_ralenti, kms_recorridos, consumo_combustible, ralentis_excesivos, fuente, vehiculos(placa, cliente, tipo_activo)')
    .range(p*PAGE, (p+1)*PAGE-1);
  if (error) { console.log('ERR ' + error.message); break; }
  if (!data || !data.length) break;
  rows.push(...data); if (data.length < PAGE) break;
}
console.log(`Analizando ${rows.length} filas de ralentis_periodos\n`);

const HORAS_MAX = { 15: 15*24, 16: 16*24 }; // tope físico de la quincena
const dias = (a,b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;

const sospechosas = [];
for (const r of rows) {
  const d = dias(r.periodo_inicio, r.periodo_fin);
  const tope = d * 24;
  const enc = N(r.horas_motor_encendido), ral = N(r.horas_motor_ralenti);
  const motivos = [];
  if (ral > tope) motivos.push(`ralentí ${ral.toFixed(0)} h > tope físico del período (${tope} h)`);
  if (enc > tope) motivos.push(`motor ${enc.toFixed(0)} h > tope físico (${tope} h)`);
  if (enc > 0 && ral > enc * 1.02) motivos.push(`ralentí (${ral.toFixed(1)}) > motor (${enc.toFixed(1)})`);
  if (enc === 0 && ral > 100) motivos.push(`ralentí ${ral.toFixed(0)} h SIN horas de motor`);
  if (motivos.length) sospechosas.push({ r, d, motivos });
}
sospechosas.sort((a,b) => N(b.r.horas_motor_ralenti) - N(a.r.horas_motor_ralenti));
console.log(`Filas sospechosas: ${sospechosas.length}\n`);
for (const { r, d, motivos } of sospechosas.slice(0, 12)) {
  console.log(`  ${r.vehiculos?.placa ?? '??'}  ${r.periodo_inicio}→${r.periodo_fin} (${d} d)  fuente=${r.fuente ?? 'NULL'}`);
  console.log(`     motor=${N(r.horas_motor_encendido).toFixed(1)} h  ralentí=${N(r.horas_motor_ralenti).toFixed(1)} h  km=${N(r.kms_recorridos).toFixed(0)}  gal=${N(r.consumo_combustible).toFixed(1)}  excesivos=${N(r.ralentis_excesivos)}`);
  console.log(`     cliente=${r.vehiculos?.cliente ?? '-'}  tipo=${r.vehiculos?.tipo_activo ?? '-'}`);
  motivos.forEach(m => console.log(`     ⚠ ${m}`));
}
