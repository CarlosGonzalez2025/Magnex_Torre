/**
 * ¿Geotab (magnex_col) puede aportar GALONES DE RALENTÍ reales al informe?
 *
 * El informe necesita `consumo_combustible` = combustible quemado MIENTRAS el vehículo
 * está en ralentí. Coltrack y Fagor lo entregan por evento; Geotab no lo exporta en
 * ningún archivo (verificado contra Cumplimiento_y_Utilización y Scorecard: no traen
 * ninguna columna de combustible).
 *
 * La única vía posible es la ECU: si el vehículo publica un diagnóstico ACUMULATIVO de
 * combustible, la resta entre la lectura al cierre y al inicio de cada episodio de
 * ralentí da los galones reales de ese episodio — medición, no estimación.
 *
 * Esta sonda responde tres preguntas, en orden:
 *   1. ¿Existen diagnósticos de combustible en la base?
 *   2. ¿Cuántos de los vehículos reales publican datos de esos diagnósticos?
 *   3. ¿La resta sobre un episodio de ralentí concreto da un número creíble?
 *
 * Uso:  node scratch/geotab_probe_combustible.cjs
 * Requiere GEOTAB_DATABASE / GEOTAB_USER / GEOTAB_PASSWORD en .env.local
 * (hoy GEOTAB_PASSWORD está vacío en local; en Vercel sí está definido).
 */
require('dotenv').config({ path: '.env.local' });
const DATABASE = process.env.GEOTAB_DATABASE, USER = process.env.GEOTAB_USER, PASSWORD = process.env.GEOTAB_PASSWORD;

async function rpc(server, method, params) {
  const res = await fetch(`https://${server}/apiv1`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const json = await res.json();
  if (json.error) { const e = new Error(json.error?.errors?.[0]?.message || json.error.message); e.geotab = json.error; throw e; }
  return json.result;
}

// Litros -> galones US (Geotab normaliza el volumen a litros).
const L_A_GAL = 0.264172;

(async () => {
  if (!PASSWORD) {
    console.error('GEOTAB_PASSWORD está vacío en .env.local. Complételo (o ejecute la sonda\n' +
                  'desde un entorno que tenga la credencial) y vuelva a correr.');
    process.exit(1);
  }
  const login = await rpc('my.geotab.com', 'Authenticate', { database: DATABASE, userName: USER, password: PASSWORD });
  const server = login.path && login.path !== 'ThisServer' ? login.path : 'my.geotab.com';
  const creds = login.credentials;
  const get = (typeName, extra = {}) => rpc(server, 'Get', { typeName, ...extra, credentials: creds });
  console.log(`Login OK @ ${server} (db=${DATABASE})\n`);

  // ── 1. Diagnósticos de combustible declarados en la base ────────────────────
  const diags = await get('Diagnostic');
  const fuel = diags.filter(d => /fuel|combustib/i.test(d.name || ''));
  console.log(`Diagnósticos totales: ${diags.length} · relacionados con combustible: ${fuel.length}`);
  for (const d of fuel) {
    console.log(`   • ${String(d.name).padEnd(46)} id=${d.id}  unidad=${d.unitOfMeasure?.id ?? '-'}`);
  }
  if (!fuel.length) {
    console.log('\nSin diagnósticos de combustible: ninguna ECU de la flota publica el dato.');
    console.log('=> Ni por código ni por archivo se pueden obtener galones reales de Geotab.');
    return;
  }

  // Los acumulativos son los que sirven para restar entre dos instantes.
  const acumulativos = fuel.filter(d => /total|used|usado|consumid/i.test(d.name || ''));
  console.log(`\nAcumulativos (sirven para la resta inicio→fin): ${acumulativos.length || 'ninguno'}`);
  acumulativos.forEach(d => console.log(`   • ${d.name}  id=${d.id}`));

  // ── 2. ¿Cuántos vehículos publican realmente esos diagnósticos? ─────────────
  const devices = await get('Device');
  const toDate = new Date().toISOString();
  const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`\nDispositivos en la base: ${devices.length}. Midiendo cobertura de los últimos 7 días…`);

  for (const d of (acumulativos.length ? acumulativos : fuel).slice(0, 3)) {
    let filas = [];
    try {
      filas = await get('StatusData', {
        search: { diagnosticSearch: { id: d.id }, fromDate, toDate },
        resultsLimit: 50000,
      });
    } catch (e) {
      console.log(`   ${d.name}: consulta rechazada (${e.message})`);
      continue;
    }
    const conDato = new Set(filas.map(f => f.device?.id).filter(Boolean));
    const pct = devices.length ? (100 * conDato.size / devices.length).toFixed(1) : '0';
    console.log(`   ${String(d.name).padEnd(46)} lecturas=${String(filas.length).padStart(6)}  vehículos con dato=${conDato.size}/${devices.length} (${pct}%)`);
  }

  // ── 3. Prueba sobre un episodio de ralentí real ─────────────────────────────
  const rules = await get('Rule');
  const idlingRule = rules.find(r => /^idling$/i.test(r.name || '')) ?? rules.find(r => /ralent|idl/i.test(r.name || ''));
  if (!idlingRule || !acumulativos.length) return;

  const eventos = await get('ExceptionEvent', {
    search: { fromDate, toDate, ruleSearch: { id: idlingRule.id } },
    resultsLimit: 500,
  });
  console.log(`\nEpisodios de "${idlingRule.name}" en los últimos 7 días: ${eventos.length}`);

  const diag = acumulativos[0];
  let probados = 0;
  for (const ev of eventos) {
    if (probados >= 5) break;
    if (!ev.device?.id || !ev.activeFrom || !ev.activeTo) continue;
    const filas = await get('StatusData', {
      search: {
        diagnosticSearch: { id: diag.id },
        deviceSearch: { id: ev.device.id },
        fromDate: ev.activeFrom, toDate: ev.activeTo,
      },
      resultsLimit: 5000,
    });
    if (filas.length < 2) continue;
    const ordenadas = filas.slice().sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
    const litros = Number(ordenadas[ordenadas.length - 1].data) - Number(ordenadas[0].data);
    const minutos = (new Date(ev.activeTo) - new Date(ev.activeFrom)) / 60000;
    console.log(`   device=${ev.device.id}  ${minutos.toFixed(0)} min de ralentí  lecturas=${filas.length}` +
                `  Δ=${litros.toFixed(2)} L = ${(litros * L_A_GAL).toFixed(3)} gal` +
                `  (${(litros * L_A_GAL / (minutos / 60)).toFixed(2)} gal/h)`);
    probados++;
  }
  if (!probados) console.log('   Ningún episodio tuvo dos lecturas del diagnóstico: la ECU no muestrea con esa frecuencia.');
})().catch(e => { console.error('FALLÓ:', e.message); if (e.geotab) console.error(JSON.stringify(e.geotab).slice(0, 500)); process.exit(1); });
