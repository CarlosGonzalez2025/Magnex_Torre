/**
 * Auditoría: ¿el Análisis General está tomando Coltrack Y Fagor?
 *
 * ralentis_periodos NO tiene columna de proveedor, así que la procedencia de cada
 * fila se infiere cruzando (vehiculo_id, periodo) contra ralentis_eventos.proveedor.
 * Reproduce además el filtro de computeMotorMetrics (solo filas con motor>0).
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PAGE = 1000;
async function fetchAll(table, fields) {
  const { count, error } = await supabase.from(table).select(fields, { count: 'exact', head: true });
  if (error) throw error;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const out = [];
  for (let i = 0; i < pages; i++) {
    const { data, error: e } = await supabase.from(table).select(fields)
      .order('periodo_inicio', { ascending: true }).range(i * PAGE, (i + 1) * PAGE - 1);
    if (e) throw e;
    out.push(...(data ?? []));
  }
  return out;
}

const N = v => Number(v) || 0;
const ultimoDia = (y, m) => new Date(y, m, 0).getDate();
function isQuincena(inicio, fin) {
  const [yi, mi, di] = String(inicio).split('-').map(Number);
  const [yf, mf, df] = String(fin).split('-').map(Number);
  if (yi !== yf || mi !== mf) return false;
  return (di === 1 && df === 15) || (di === 16 && df === ultimoDia(yi, mi));
}

const periodos = await fetchAll('ralentis_periodos',
  'vehiculo_id, periodo_inicio, periodo_fin, horas_motor_encendido, horas_motor_ralenti, consumo_combustible, ralentis_excesivos, kms_recorridos');
const eventos = await fetchAll('ralentis_eventos',
  'vehiculo_id, periodo_inicio, periodo_fin, duracion_segundos, proveedor');

console.log(`ralentis_periodos: ${periodos.length} filas | ralentis_eventos: ${eventos.length} filas\n`);

// Proveedor por (vehiculo, periodo) según los eventos
const provPorClave = new Map();
const eventosPorProv = new Map();
for (const e of eventos) {
  const p = String(e.proveedor ?? 'SIN PROVEEDOR').toUpperCase();
  eventosPorProv.set(p, (eventosPorProv.get(p) ?? 0) + 1);
  const k = `${e.vehiculo_id}|${e.periodo_inicio}|${e.periodo_fin}`;
  if (!provPorClave.has(k)) provPorClave.set(k, new Set());
  provPorClave.get(k).add(p);
}
console.log('— Eventos por proveedor (tabla completa) —');
for (const [p, n] of [...eventosPorProv].sort((a, b) => b[1] - a[1])) console.log(`   ${p.padEnd(14)} ${n}`);

// Períodos quincenales
const quincenas = periodos.filter(r => isQuincena(r.periodo_inicio, r.periodo_fin));
const noQuincena = periodos.length - quincenas.length;
console.log(`\n— Filas de ralentis_periodos descartadas por NO ser quincena: ${noQuincena} —`);
const descartadasPorRango = new Map();
for (const r of periodos) {
  if (isQuincena(r.periodo_inicio, r.periodo_fin)) continue;
  const k = `${r.periodo_inicio} → ${r.periodo_fin}`;
  descartadasPorRango.set(k, (descartadasPorRango.get(k) ?? 0) + 1);
}
for (const [k, n] of [...descartadasPorRango].sort()) console.log(`   ${k}  (${n} filas)`);

// Por quincena: cobertura y aporte por proveedor
const byPeriod = new Map();
for (const r of quincenas) {
  const k = `${r.periodo_inicio}_${r.periodo_fin}`;
  if (!byPeriod.has(k)) byPeriod.set(k, []);
  byPeriod.get(k).push(r);
}

console.log('\n— Por quincena: filas de ralentis_periodos por proveedor y cobertura de motor —');
console.log('  (CUENTA = filas | MOTOR>0 = filas que SÍ entran al % Ralentí | H.RAL = horas ralentí)');
for (const [k, rows] of [...byPeriod].sort()) {
  const stats = new Map();
  for (const r of rows) {
    const key = `${r.vehiculo_id}|${r.periodo_inicio}|${r.periodo_fin}`;
    const provs = provPorClave.get(key);
    const prov = !provs ? 'SIN EVENTOS' : [...provs].sort().join('+');
    const s = stats.get(prov) ?? { filas: 0, conMotor: 0, horasRal: 0, horasRalConMotor: 0, gal: 0 };
    s.filas++;
    s.horasRal += N(r.horas_motor_ralenti);
    s.gal += N(r.consumo_combustible);
    if (N(r.horas_motor_encendido) > 0) { s.conMotor++; s.horasRalConMotor += N(r.horas_motor_ralenti); }
    stats.set(prov, s);
  }
  console.log(`\n  ${k.replace('_', ' → ')}   (${rows.length} vehículos)`);
  for (const [prov, s] of [...stats].sort()) {
    console.log(`     ${prov.padEnd(16)} filas=${String(s.filas).padStart(4)}  motor>0=${String(s.conMotor).padStart(4)}` +
      `  H.RAL total=${s.horasRal.toFixed(1).padStart(9)}  H.RAL que cuenta=${s.horasRalConMotor.toFixed(1).padStart(9)}` +
      `  galones=${s.gal.toFixed(1).padStart(9)}`);
  }
}

// Eventos por quincena y proveedor (lo que ve el bloque de "alertas")
console.log('\n— Eventos (alertas) por quincena y proveedor, aplicando el umbral nativo —');
const UMBRAL = { COLTRACK: 600, FAGOR: 300 };
const evAgg = new Map();
for (const e of eventos) {
  if (!isQuincena(e.periodo_inicio, e.periodo_fin)) continue;
  const prov = String(e.proveedor ?? '').toUpperCase();
  const k = `${e.periodo_inicio}_${e.periodo_fin}`;
  const s = evAgg.get(k) ?? {};
  s[prov] = s[prov] ?? { crudos: 0, alertas: 0 };
  s[prov].crudos++;
  if (N(e.duracion_segundos) >= (UMBRAL[prov] ?? 300)) s[prov].alertas++;
  evAgg.set(k, s);
}
for (const [k, s] of [...evAgg].sort()) {
  const detalle = Object.entries(s).map(([p, v]) => `${p}: ${v.alertas}/${v.crudos}`).join('   ');
  console.log(`  ${k.replace('_', ' → ')}   ${detalle}`);
}
