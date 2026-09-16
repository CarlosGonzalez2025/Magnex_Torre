/**
 * Reparación del histórico de Geotab del módulo de ralentí (sep-2026).
 *
 * CONTEXTO
 * --------
 * `api/geotab-sync.ts` pedía el feed de Trip desde un instante a mitad de día
 * (`Date.now() - days*24h`). El feed respeta ese límite inferior, así que del día más
 * viejo de la ventana devolvía solo la cola; el agregado se guardaba igual contra el día
 * local completo y pisaba la fila buena escrita en una corrida anterior. Como el cron
 * corre cada hora, la ÚLTIMA escritura de cada día era siempre la más truncada.
 *
 * Resultado medido el 2026-09-16: `geotab_daily_metrics` conservaba ~30% de los km y las
 * horas reales desde el 2026-08-02. Ejemplo: el 05-ago la tabla decía 3.274 km y Geotab
 * reporta 24.709 km, con los mismos 291 vehículos.
 *
 * ALCANCE — deliberadamente acotado
 * ---------------------------------
 * La carga automática por API arrancó en AGOSTO; lo anterior (mar–jul) es un backfill
 * puntual hecho el 05-ago y está intacto (los días de julio traen 16.000–24.000 km, no
 * hay truncamiento). Este operativo NO lo toca.
 *
 *   • Se reescribe:  geotab_daily_metrics   del 2026-08-01 en adelante.
 *   • Se reagrega:   ralentis_periodos / ralentis_eventos de las quincenas de ago-sep,
 *                    y SOLO las filas cuya `fuente` es GEOTAB — la precedencia de
 *                    `geotab-ralenti-sync` protege lo de Coltrack y Fagor.
 *   • No se toca:    reportes_vehiculos, reportes_conductores, alertas, ni ningún
 *                    período anterior al 2026-08-01.
 *
 * REQUISITO: el fix de `fromDate` debe estar desplegado. La Fase 1 lo verifica y aborta
 * si no lo está — sin eso el backfill volvería a escribir datos truncados.
 *
 * USO
 *   node scratch/geotab_backfill_ralenti.cjs                 # simulacro, no escribe nada
 *   node scratch/geotab_backfill_ralenti.cjs --ejecutar      # aplica
 *   CRON_SECRET=xxx node scratch/geotab_backfill_ralenti.cjs --ejecutar
 */

const APP = 'https://magnex-torre.vercel.app';
const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co/rest/v1';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const EJECUTAR = process.argv.includes('--ejecutar');
const SECRET = process.env.CRON_SECRET || '';

// Tramos del re-sync diario y quincenas a reagregar. Alineados a propósito: cada tramo
// del sync es exactamente la quincena que después se reagrega.
const HOY = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const QUINCENAS = [
  { inicio: '2026-08-01', fin: '2026-08-15', estado: 'cerrada' },
  { inicio: '2026-08-16', fin: '2026-08-31', estado: 'cerrada' },
  { inicio: '2026-09-01', fin: '2026-09-15', estado: 'cerrada' },
  { inicio: '2026-09-16', fin: '2026-09-30', estado: 'en curso' },
].filter(q => q.inicio <= HOY);

const N = v => Number(v) || 0;
const pausa = ms => new Promise(r => setTimeout(r, ms));

/** Lee todas las páginas (PostgREST corta en 1.000 filas sin avisar). */
async function sbAll(table, select, filtro) {
  const PAGE = 1000;
  const out = [];
  for (let p = 0; ; p++) {
    const r = await fetch(`${SUPABASE_URL}/${table}?select=${select}&${filtro}`, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        Range: `${p * PAGE}-${(p + 1) * PAGE - 1}`,
        'Range-Unit': 'items',
      },
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
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
  try { body = await r.json(); } catch { body = { error: 'respuesta no JSON' }; }
  return { status: r.status, ms, body };
}

/** Lo que Geotab dice HOY para un rango — el patrón contra el que se compara. */
async function verdadGeotab(inicio, fin) {
  const r = await fetch(`${APP}/api/geotab`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'dailyMetrics',
      fromDate: `${inicio}T00:00:00.000-05:00`,
      toDate: `${fin}T23:59:59.999-05:00`,
    }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(`Geotab dailyMetrics: ${JSON.stringify(j).slice(0, 200)}`);
  const m = j.data.metrics.filter(x => x.date >= inicio && x.date <= fin);
  return {
    km: m.reduce((s, x) => s + N(x.km), 0),
    conduccion: m.reduce((s, x) => s + N(x.drivingHours), 0),
    ralenti: m.reduce((s, x) => s + N(x.idlingHours), 0),
    placas: new Set(m.map(x => x.plate)).size,
  };
}

/** Lo que la tabla tiene guardado para el mismo rango. */
async function loQueHayGuardado(inicio, fin) {
  const filas = await sbAll(
    'geotab_daily_metrics',
    'fecha,placa,km,horas_conduccion,horas_ralenti',
    `fecha=gte.${inicio}&fecha=lte.${fin}&order=fecha.asc`
  );
  return {
    km: filas.reduce((s, f) => s + N(f.km), 0),
    conduccion: filas.reduce((s, f) => s + N(f.horas_conduccion), 0),
    ralenti: filas.reduce((s, f) => s + N(f.horas_ralenti), 0),
    placas: new Set(filas.map(f => f.placa)).size,
    dias: new Set(filas.map(f => f.fecha)).size,
  };
}

async function periodosGeotab(inicio, fin) {
  const filas = await sbAll(
    'ralentis_periodos',
    'horas_motor_encendido,horas_motor_ralenti,kms_recorridos,ralentis_excesivos',
    `periodo_inicio=eq.${inicio}&periodo_fin=eq.${fin}&fuente=eq.GEOTAB&order=vehiculo_id.asc`
  );
  return {
    filas: filas.length,
    motor: filas.reduce((s, f) => s + N(f.horas_motor_encendido), 0),
    ralenti: filas.reduce((s, f) => s + N(f.horas_motor_ralenti), 0),
    km: filas.reduce((s, f) => s + N(f.kms_recorridos), 0),
    excesivos: filas.reduce((s, f) => s + N(f.ralentis_excesivos), 0),
  };
}

const pct = (a, b) => (b > 0 ? `${(100 * a / b).toFixed(0)}%` : '--');

(async () => {
  console.log('='.repeat(78));
  console.log(EJECUTAR
    ? 'MODO EJECUCIÓN - se escribirá en la base'
    : 'SIMULACRO - no se escribe nada (use --ejecutar para aplicar)');
  console.log(`Alcance: ${QUINCENAS[0].inicio} -> ${QUINCENAS[QUINCENAS.length - 1].fin}   ·   hoy (Colombia) = ${HOY}`);
  console.log('='.repeat(78));

  // ── FASE 1: ¿está desplegado el fix? ──────────────────────────────────────
  //
  // La sonda solo corre en modo ejecución, y a propósito: CUALQUIER GET a
  // /api/geotab-sync dispara una sincronización. En una versión sin el fix, `inicio` y
  // `fin` se ignoran y la llamada corre el sync normal de 3 días con el anclaje viejo.
  // No hay forma de preguntar la versión sin escribir, así que el simulacro no pregunta
  // — se queda en la foto del antes y no toca nada. En modo ejecución ese riesgo es
  // aceptable: los días que tocaría (los 3 últimos) están dentro del alcance y la
  // Fase 3 los reescribe completos acto seguido.
  if (!EJECUTAR) {
    console.log('\n[1/5] Verificación de despliegue: se omite en simulacro (consultarla escribiría).');
  } else {
    console.log('\n[1/5] Verificando que el fix de `fromDate` esté desplegado...');
    const sonda = await app('/api/geotab-sync?inicio=2026-08-05&fin=2026-08-05');
    if (sonda.status === 401) {
      console.error('  x 401: CRON_SECRET está definido en Vercel. Reejecute con CRON_SECRET=<valor>.');
      process.exit(1);
    }
    if (!sonda.body || !sonda.body.rango) {
      console.error('  x La versión desplegada NO entiende `inicio`/`fin`: el fix todavía no está en producción.');
      console.error('    Esta llamada acaba de correr un sync de 3 días con el anclaje viejo; despliegue');
      console.error('    el fix y reejecute, que la Fase 3 lo deja bien.');
      console.error(`    Respuesta: ${JSON.stringify(sonda.body).slice(0, 300)}`);
      process.exit(1);
    }
    console.log(`  ok Fix desplegado. La sonda del 05-ago devolvió ${sonda.body.rows} filas en ${(sonda.ms / 1000).toFixed(1)} s.`);
  }

  // ── FASE 2: foto del antes ────────────────────────────────────────────────
  console.log('\n[2/5] Estado ANTES (tabla diaria vs. lo que Geotab reporta hoy):');
  const antes = {};
  for (const q of QUINCENAS) {
    const fin = q.fin > HOY ? HOY : q.fin;
    const real = await verdadGeotab(q.inicio, fin);
    const guardado = await loQueHayGuardado(q.inicio, fin);
    const per = await periodosGeotab(q.inicio, q.fin);
    antes[q.inicio] = { real, guardado, per };
    console.log(`  ${q.inicio} -> ${q.fin} (${q.estado})`);
    console.log(`     km        real ${real.km.toFixed(0).padStart(7)}  guardado ${guardado.km.toFixed(0).padStart(7)}  (${pct(guardado.km, real.km)})`);
    console.log(`     ralenti h real ${real.ralenti.toFixed(0).padStart(7)}  guardado ${guardado.ralenti.toFixed(0).padStart(7)}  (${pct(guardado.ralenti, real.ralenti)})`);
    console.log(`     ralentis_periodos: ${per.filas} filas · motor ${per.motor.toFixed(0)} h · ralenti ${per.ralenti.toFixed(0)} h · km ${per.km.toFixed(0)}`);
  }

  if (!EJECUTAR) {
    console.log('\nSimulacro terminado. Nada se escribió. Repita con --ejecutar para aplicar.');
    return;
  }

  // ── FASE 3: re-sync de la tabla diaria, tramo por tramo ───────────────────
  console.log('\n[3/5] Re-sincronizando geotab_daily_metrics por tramos...');
  for (const q of QUINCENAS) {
    const fin = q.fin > HOY ? HOY : q.fin;
    const r = await app(`/api/geotab-sync?inicio=${q.inicio}&fin=${fin}`);
    if (r.status !== 200 || !r.body || !r.body.success) {
      console.error(`  x ${q.inicio} -> ${fin}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 220)}`);
      console.error('    Abortando: no se reagregan quincenas sobre datos diarios incompletos.');
      process.exit(1);
    }
    const dias = r.body.rango ? r.body.rango.diasConDatos : '?';
    console.log(`  ok ${q.inicio} -> ${fin}: ${r.body.rows} filas, ${dias} días con datos, ${(r.ms / 1000).toFixed(1)} s`);
    await pausa(2000); // no atropellar la API de Geotab entre tramos
  }

  // ── FASE 4: verificación intermedia antes de reagregar ────────────────────
  console.log('\n[4/5] Verificando la tabla diaria contra Geotab...');
  let ok = true;
  for (const q of QUINCENAS) {
    const fin = q.fin > HOY ? HOY : q.fin;
    const real = await verdadGeotab(q.inicio, fin);
    const guardado = await loQueHayGuardado(q.inicio, fin);
    const desvio = real.km > 0 ? Math.abs(guardado.km - real.km) / real.km : 0;
    if (desvio > 0.02) ok = false;
    console.log(`  ${desvio <= 0.02 ? 'ok' : ' x'} ${q.inicio} -> ${fin}: km guardado ${guardado.km.toFixed(0)} vs real ${real.km.toFixed(0)} (desvío ${(desvio * 100).toFixed(1)}%)`);
  }
  if (!ok) {
    console.error('\n  Algún tramo quedó fuera del 2% de tolerancia. NO se reagregan las quincenas.');
    console.error('  Reejecute el script: el upsert es idempotente y se puede repetir sin daño.');
    process.exit(1);
  }

  // ── FASE 5: reagregar quincenas y foto del después ────────────────────────
  console.log('\n[5/5] Reagregando ralentis_periodos / ralentis_eventos...');
  for (const q of QUINCENAS) {
    const r = await app(`/api/geotab-ralenti-sync?inicio=${q.inicio}&fin=${q.fin}`);
    if (r.status !== 200 || !r.body || !r.body.success) {
      console.error(`  x ${q.inicio} -> ${q.fin}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 220)}`);
      continue;
    }
    const v = r.body.vehiculos || {};
    const ev = r.body.eventos || {};
    console.log(`  ok ${q.inicio} -> ${q.fin}: ${v.escritos} vehículos escritos, ${v.omitidosPorPrecedencia} respetados (Coltrack/Fagor), ${ev.escritos || 0} eventos`);
    (r.body.avisos || []).forEach(a => console.log(`      aviso: ${a}`));
    await pausa(2000);
  }

  console.log('\n' + '='.repeat(78));
  console.log('RESULTADO - ralentis_periodos (solo filas fuente=GEOTAB)');
  console.log('='.repeat(78));
  console.log('quincena                  filas   motor h (antes->despues)   ralenti h (antes->despues)      km (antes->despues)');
  for (const q of QUINCENAS) {
    const d = await periodosGeotab(q.inicio, q.fin);
    const a = antes[q.inicio].per;
    console.log(
      `${q.inicio} -> ${q.fin}  ${String(d.filas).padStart(4)}   ` +
      `${a.motor.toFixed(0).padStart(7)} -> ${d.motor.toFixed(0).padStart(7)}   ` +
      `${a.ralenti.toFixed(0).padStart(7)} -> ${d.ralenti.toFixed(0).padStart(7)}   ` +
      `${a.km.toFixed(0).padStart(8)} -> ${d.km.toFixed(0).padStart(8)}`
    );
  }
  console.log('\nRecuerde: combustible, CO2, costo y conductor siguen en cero para Geotab.');
  console.log('Eso no lo arregla este operativo - se resuelve cargando Coltrack/Fagor o con la');
  console.log('vía de StatusData (ver scratch/geotab_probe_combustible.cjs).');
})().catch(e => { console.error('\nFALLÓ:', e.message); process.exit(1); });
