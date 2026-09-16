/**
 * Backfill de los GALONES DE RALENTÍ de Geotab (sep-2026).
 *
 * POR QUÉ UN SCRIPT APARTE Y NO `geotab_backfill_ralenti.cjs`
 * -----------------------------------------------------------
 * Aquel recorre la historia en tramos de una quincena, que es el tamaño correcto para los
 * viajes. El combustible no cabe en ese tamaño: una quincena son ~143.000 lecturas de
 * `StatusData` y el tope de la API de Geotab es 50.000. Medido, un rango de 3 días ronda
 * las 19.000 lecturas con 200 vehículos, así que ese es el tramo que se usa aquí.
 *
 * DESDE CUÁNDO TIENE SENTIDO
 * --------------------------
 * La retención de las lecturas de la ECU llega al menos hasta mayo de 2026, así que el
 * límite NO es la retención: es la cobertura de Geotab, que fue creciendo.
 *
 *     1–3 may:  2.288 lecturas ·  17 vehículos · 0,25 gal/h
 *     1–3 jun:  2.237 lecturas ·  21 vehículos · 0,26 gal/h
 *     1–3 jul: 19.148 lecturas · 202 vehículos · 0,30 gal/h
 *
 * Antes de julio, Geotab medía menos de 25 vehículos: reconstruir esos meses aporta casi
 * nada y cuesta decenas de llamadas. Por eso el rango por defecto arranca el 1 de julio.
 *
 * (Los 0,25–0,30 gal/h coinciden con los 0,27 que reportaba Fagor sobre la misma flota con
 * sus propios sensores. Dos plataformas independientes, tres meses distintos.)
 *
 * QUÉ HACE
 * --------
 *   1. Verifica que la columna `galones_ralenti` exista y que el codigo desplegado la
 *      escriba. Si falta, aborta sin tocar nada.
 *   2. Re-sincroniza `geotab_daily_metrics` en tramos de 3 días, que trae los galones.
 *   3. Reagrega las quincenas afectadas hacia `ralentis_periodos`.
 *   4. Muestra el antes y el después.
 *
 * NO escribe en filas de Coltrack ni de Fagor: la precedencia de `geotab-ralenti-sync` las
 * protege, y aquí solo se leen para comparar.
 *
 * USO
 *   node scratch/geotab_backfill_combustible.cjs                       # simulacro
 *   node scratch/geotab_backfill_combustible.cjs --ejecutar
 *   node scratch/geotab_backfill_combustible.cjs --ejecutar --desde 2026-06-01
 */

const APP = 'https://magnex-torre.vercel.app';
const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co/rest/v1';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const EJECUTAR = process.argv.includes('--ejecutar');
const SECRET = process.env.CRON_SECRET || '';
const iDesde = process.argv.indexOf('--desde');
const DESDE = iDesde >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[iDesde + 1] || '')
  ? process.argv[iDesde + 1]
  : '2026-07-01';

const HOY = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const TRAMO_DIAS = 3;      // ~19.000 lecturas: holgado bajo el tope de 50.000
const PAUSA_MS = 2000;     // no atropellar la API de Geotab entre tramos

const N = v => Number(v) || 0;
const pausa = ms => new Promise(r => setTimeout(r, ms));
const H = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Tramos de TRAMO_DIAS días desde `desde` hasta `hasta`, inclusive. */
function tramos(desde, hasta) {
  const out = [];
  let a = desde;
  while (a <= hasta) {
    let b = sumarDias(a, TRAMO_DIAS - 1);
    if (b > hasta) b = hasta;
    out.push([a, b]);
    a = sumarDias(b, 1);
  }
  return out;
}

/** Quincenas tocadas por el rango. */
function quincenas(desde, hasta) {
  const out = [];
  let [y, m] = desde.split('-').map(Number);
  for (;;) {
    const mm = String(m).padStart(2, '0');
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (const [i, f] of [[`${y}-${mm}-01`, `${y}-${mm}-15`], [`${y}-${mm}-16`, `${y}-${mm}-${String(ultimo).padStart(2, '0')}`]]) {
      if (f >= desde && i <= hasta) out.push({ inicio: i, fin: f });
    }
    if (`${y}-${mm}-01` > hasta) break;
    m++; if (m > 12) { m = 1; y++; }
    if (out.length > 60) break; // salvaguarda
  }
  return out;
}

async function sbAll(table, select, filtro) {
  const PAGE = 1000, out = [];
  for (let p = 0; ; p++) {
    const r = await fetch(`${SUPABASE_URL}/${table}?select=${select}&${filtro}`, {
      headers: { ...H, Range: `${p * PAGE}-${(p + 1) * PAGE - 1}`, 'Range-Unit': 'items' },
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const data = await r.json();
    if (!data.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function app(ruta) {
  const headers = SECRET ? { Authorization: `Bearer ${SECRET}` } : {};
  const t0 = Date.now();
  const r = await fetch(`${APP}${ruta}`, { headers });
  const ms = Date.now() - t0;
  let body;
  try { body = await r.json(); } catch { body = { error: 'respuesta no JSON (posible timeout de la función)' }; }
  return { status: r.status, ms, body };
}

async function galonesPorQuincena(q) {
  const filas = await sbAll('ralentis_periodos', 'consumo_combustible,horas_motor_ralenti',
    `periodo_inicio=eq.${q.inicio}&periodo_fin=eq.${q.fin}&fuente=eq.GEOTAB&order=vehiculo_id.asc`);
  const conGal = filas.filter(f => f.consumo_combustible !== null && N(f.consumo_combustible) > 0);
  return {
    filas: filas.length,
    conMedicion: conGal.length,
    galones: filas.reduce((s, f) => s + N(f.consumo_combustible), 0),
    horasRalenti: filas.reduce((s, f) => s + N(f.horas_motor_ralenti), 0),
  };
}

(async () => {
  const QS = quincenas(DESDE, HOY);
  const TR = tramos(DESDE, HOY);

  console.log('='.repeat(76));
  console.log(EJECUTAR ? 'MODO EJECUCIÓN - se escribirá en la base' : 'SIMULACRO - no se escribe nada (use --ejecutar)');
  console.log(`Rango: ${DESDE} -> ${HOY}  ·  ${TR.length} tramos de ${TRAMO_DIAS} días  ·  ${QS.length} quincenas`);
  console.log('='.repeat(76));

  console.log('\n[1/4] Estado ANTES (solo filas fuente=GEOTAB):');
  const antes = {};
  for (const q of QS) {
    const a = await galonesPorQuincena(q);
    antes[q.inicio] = a;
    console.log(`  ${q.inicio} -> ${q.fin}: ${String(a.filas).padStart(4)} filas · ${String(a.conMedicion).padStart(4)} con galones · ${a.galones.toFixed(1).padStart(9)} gal · ${a.horasRalenti.toFixed(0).padStart(6)} h ralentí`);
  }

  if (!EJECUTAR) {
    console.log(`\nSimulacro terminado. Se harían ${TR.length} llamadas de sincronización y ${QS.length} de reagregación.`);
    console.log('Repita con --ejecutar para aplicar.');
    return;
  }

  // ── Verificación previa: ¿existe la columna y la escribe el código desplegado? ──
  console.log('\n[2/4] Verificando que la columna exista y que el despliegue la escriba...');
  const sonda = await app(`/api/geotab-sync?inicio=${HOY}&fin=${HOY}`);
  if (sonda.status === 401) {
    console.error('  x 401: CRON_SECRET está definido en Vercel. Reejecute con CRON_SECRET=<valor>.');
    process.exit(1);
  }
  if (!sonda.body || !sonda.body.success) {
    console.error(`  x La sincronización falló: ${JSON.stringify(sonda.body).slice(0, 240)}`);
    process.exit(1);
  }
  if (!sonda.body.combustible) {
    console.error('  x La versión desplegada no calcula el combustible: falta mergear el PR de galones.');
    process.exit(1);
  }
  if (sonda.body.combustible.migracionPendiente) {
    console.error('  x Falta correr migrations/geotab_daily_galones_ralenti_v1.sql en Supabase.');
    console.error('    El sync siguió escribiendo km y horas, pero sin la columna no hay dónde guardar los galones.');
    process.exit(1);
  }
  console.log(`  ok Desplegado y migrado. Hoy: ${sonda.body.combustible.filasConMedicion} filas con medición, ${sonda.body.combustible.galones} gal.`);

  // ── Re-sincronización por tramos ──
  console.log(`\n[3/4] Re-sincronizando en ${TR.length} tramos de ${TRAMO_DIAS} días...`);
  let truncados = 0;
  for (const [a, b] of TR) {
    const r = await app(`/api/geotab-sync?inicio=${a}&fin=${b}`);
    if (r.status !== 200 || !r.body || !r.body.success) {
      console.error(`  x ${a} -> ${b}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 180)}`);
      console.error('    Abortando: reagregar sobre tramos incompletos daría galones a medias.');
      process.exit(1);
    }
    const c = r.body.combustible || {};
    if (c.truncado) truncados++;
    console.log(`  ok ${a} -> ${b}: ${r.body.rows} filas · ${c.filasConMedicion ?? 0} con galones · ${c.galones ?? 0} gal · ${(r.ms / 1000).toFixed(1)} s${c.truncado ? '  << TRUNCADO' : ''}`);
    await pausa(PAUSA_MS);
  }
  if (truncados > 0) {
    console.error(`\n  ${truncados} tramos alcanzaron el tope de 50.000 lecturas: sus galones quedaron cortos.`);
    console.error('  Baje TRAMO_DIAS y vuelva a correr; el upsert es idempotente.');
    process.exit(1);
  }

  // ── Reagregación por quincena ──
  console.log(`\n[4/4] Reagregando ${QS.length} quincenas...`);
  for (const q of QS) {
    const r = await app(`/api/geotab-ralenti-sync?inicio=${q.inicio}&fin=${q.fin}`);
    if (r.status !== 200 || !r.body || !r.body.success) {
      console.error(`  x ${q.inicio} -> ${q.fin}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 180)}`);
      continue;
    }
    const c = r.body.combustible || {};
    console.log(`  ok ${q.inicio} -> ${q.fin}: ${c.vehiculosConMedicion ?? '?'} vehículos con medición, ${c.vehiculosSinMedicion ?? '?'} sin ella, ${c.galones ?? '?'} gal`);
    await pausa(PAUSA_MS);
  }

  console.log('\n' + '='.repeat(76));
  console.log('RESULTADO - galones de ralentí en filas fuente=GEOTAB');
  console.log('='.repeat(76));
  console.log('quincena                  con medición (antes->después)      galones (antes->después)');
  for (const q of QS) {
    const d = await galonesPorQuincena(q);
    const a = antes[q.inicio];
    console.log(`${q.inicio} -> ${q.fin}  ${String(a.conMedicion).padStart(9)} -> ${String(d.conMedicion).padStart(5)} de ${String(d.filas).padEnd(5)}  ${a.galones.toFixed(1).padStart(12)} -> ${d.galones.toFixed(1).padStart(10)}`);
  }
  console.log('\nLos vehículos sin medición son los que no publican el contador de combustible');
  console.log('de la ECU (~16% de la flota). Quedan en NULL a propósito: el informe los declara');
  console.log('como "sin medición" en vez de contarlos como consumo cero.');
})().catch(e => { console.error('\nFALLÓ:', e.message); process.exit(1); });
