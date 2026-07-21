// Auditoría de integridad de datos — módulo Informe de Ralentí / Análisis General.
// Read-only. Fuente: Supabase (misma tabla que lee el frontend: ralentis_periodos + ralentis_eventos).
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchAll(table, select, build) {
  const pageSize = 1000; let all = [];
  for (let page = 0; ; page++) {
    let q = supabase.from(table).select(select).range(page * pageSize, page * pageSize + pageSize - 1);
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
  }
  return all;
}

const N = v => Number(v) || 0;

function isQuincena(inicio, fin) {
  const [yi, mi, di] = inicio.split('-').map(Number);
  const [yf, mf, df] = fin.split('-').map(Number);
  if (yi !== yf || mi !== mf) return false;
  const ultimoDia = new Date(yi, mi, 0).getDate();
  return (di === 1 && df === 15) || (di === 16 && df === ultimoDia);
}
function diasPeriodo(inicio, fin) {
  const a = new Date(inicio + 'T00:00:00Z'), b = new Date(fin + 'T00:00:00Z');
  return Math.round((b - a) / 86400000) + 1;
}

(async () => {
  const periodos = await fetchAll('ralentis_periodos',
    'vehiculo_id, periodo_inicio, periodo_fin, horas_motor_encendido, horas_motor_ralenti, consumo_combustible, ralentis_excesivos, kms_recorridos');
  const eventos = await fetchAll('ralentis_eventos',
    'vehiculo_id, periodo_inicio, periodo_fin, duracion_segundos, proveedor, conductor_nombre');

  console.log(`\nTOTAL filas ralentis_periodos = ${periodos.length}`);
  console.log(`TOTAL filas ralentis_eventos   = ${eventos.length}`);

  // Agrupar por periodo (solo quincenas reales, igual que el frontend)
  const byPer = new Map();
  for (const r of periodos) {
    if (!isQuincena(r.periodo_inicio, r.periodo_fin)) continue;
    const k = `${r.periodo_inicio}_${r.periodo_fin}`;
    if (!byPer.has(k)) byPer.set(k, []);
    byPer.get(k).push(r);
  }
  const evByPer = new Map();
  const UMBRAL = { COLTRACK: 600, FAGOR: 300 };
  const umbral = p => UMBRAL[(p || '').toUpperCase().trim()] ?? 300;
  for (const e of eventos) {
    if (!isQuincena(e.periodo_inicio, e.periodo_fin)) continue;
    if ((e.conductor_nombre || '').toUpperCase().includes('TALLER')) continue;
    if (N(e.duracion_segundos) < umbral(e.proveedor)) continue;
    const k = `${e.periodo_inicio}_${e.periodo_fin}`;
    evByPer.set(k, (evByPer.get(k) || 0) + 1);
  }

  const keys = [...byPer.keys()].sort();
  console.log('\n============ AUDITORÍA POR QUINCENA ============');
  for (const k of keys) {
    const rows = byPer.get(k);
    const [ini, fin] = k.split('_');
    const dias = diasPeriodo(ini, fin);

    // Duplicados matrícula(vehiculo_id)-periodo
    const cnt = new Map();
    rows.forEach(r => cnt.set(r.vehiculo_id, (cnt.get(r.vehiculo_id) || 0) + 1));
    const dups = [...cnt.values()].filter(c => c > 1).length;
    const filasDupExtra = [...cnt.values()].reduce((a, c) => a + (c > 1 ? c - 1 : 0), 0);

    const sumEnc = rows.reduce((a, r) => a + N(r.horas_motor_encendido), 0);
    const sumRal = rows.reduce((a, r) => a + N(r.horas_motor_ralenti), 0);
    const conduccion = Math.max(sumEnc - sumRal, 0);
    const pctRal = sumEnc > 0 ? (sumRal / sumEnc) * 100 : 0;

    const conMotor = rows.filter(r => N(r.horas_motor_encendido) > 0);
    const vehSet = new Set(rows.map(r => r.vehiculo_id)).size;
    const vehMotor = new Set(conMotor.map(r => r.vehiculo_id)).size;

    // Filas patológicas
    const encCeroRalPos = rows.filter(r => N(r.horas_motor_encendido) === 0 && N(r.horas_motor_ralenti) > 0).length;
    const ralMayorEnc = rows.filter(r => N(r.horas_motor_ralenti) > N(r.horas_motor_encendido) && N(r.horas_motor_encendido) > 0).length;
    const encMayor24dia = conMotor.filter(r => N(r.horas_motor_encendido) / dias > 24).length;
    const encMayor18dia = conMotor.filter(r => N(r.horas_motor_encendido) / dias > 18).length;

    // Cuánto ralentí vive en filas SIN encendido (inflan el %)
    const ralHuerfano = rows.filter(r => N(r.horas_motor_encendido) === 0)
      .reduce((a, r) => a + N(r.horas_motor_ralenti), 0);

    console.log(`\n### ${ini} → ${fin}  (${dias} días)`);
    console.log(`  filas=${rows.length}  vehículos únicos=${vehSet}  con motor>0=${vehMotor}`);
    console.log(`  DUPLICADOS veh-periodo: ${dups} vehículos (${filasDupExtra} filas extra)`);
    console.log(`  Σ H.Motor Enc = ${sumEnc.toFixed(1)} h | Σ Ralentí = ${sumRal.toFixed(1)} h | Conducción(derivada) = ${conduccion.toFixed(1)} h`);
    console.log(`  % Ralentí (flota) = ${pctRal.toFixed(2)}%`);
    console.log(`  media enc/veh(c-motor) = ${(sumEnc / vehMotor).toFixed(1)} h  (${(sumEnc / vehMotor / dias).toFixed(2)} h/día)`);
    console.log(`  eventos-alerta (umbral proveedor) = ${evByPer.get(k) || 0}`);
    console.log(`  --- PATOLOGÍAS ---`);
    console.log(`  filas enc=0 & ralentí>0 = ${encCeroRalPos}  (ralentí huérfano=${ralHuerfano.toFixed(1)} h → infla %)`);
    console.log(`  filas ralentí>encendido = ${ralMayorEnc}`);
    console.log(`  filas enc >24h/día (imposible) = ${encMayor24dia} | >18h/día = ${encMayor18dia}`);
  }

  // Chequeo global identidad por vehículo (donde hay encendido>0)
  console.log('\n============ IDENTIDAD Motor = Conducción + Ralentí ============');
  console.log('(Nota: la tabla NO almacena conducción; se deriva. Verificamos ralentí<=encendido por fila)');
  let viol = 0, tot = 0;
  for (const r of periodos) {
    if (!isQuincena(r.periodo_inicio, r.periodo_fin)) continue;
    if (N(r.horas_motor_encendido) <= 0) continue;
    tot++;
    if (N(r.horas_motor_ralenti) > N(r.horas_motor_encendido) + 0.01) viol++;
  }
  console.log(`  filas con encendido>0 = ${tot} | ralentí>encendido (violación física) = ${viol} (${(viol/tot*100).toFixed(2)}%)`);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
