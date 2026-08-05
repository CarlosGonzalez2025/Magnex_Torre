/**
 * ¿La API de Geotab puede reemplazar al Excel "Reporte avanzado de viajes en detalle"?
 * Compara el agregado de la entidad Trip vía API contra las cifras del archivo,
 * y busca reglas de ralentí que permitirían eventos individuales.
 */
require('dotenv').config({ path: '.env.local' });
const DATABASE = process.env.GEOTAB_DATABASE, USER = process.env.GEOTAB_USER, PASSWORD = process.env.GEOTAB_PASSWORD;

async function rpc(server, method, params) {
  const res = await fetch(`https://${server}/apiv1`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const json = await res.json();
  if (json.error) { const e = new Error(json.error.message || 'Geotab error'); e.geotab = json.error; throw e; }
  return json.result;
}
const durationToHours = s => {
  if (!s || typeof s !== 'string') return 0;
  let days = 0, rest = s;
  const d = s.indexOf('.'), c = s.indexOf(':');
  if (d !== -1 && c !== -1 && d < c) { days = Number(s.slice(0, d)) || 0; rest = s.slice(d + 1); }
  const [h = 0, m = 0, sec = 0] = rest.split(':').map(Number);
  return days * 24 + h + m / 60 + sec / 3600;
};

(async () => {
  const login = await rpc('my.geotab.com', 'Authenticate', { database: DATABASE, userName: USER, password: PASSWORD });
  const server = login.path && login.path !== 'ThisServer' ? login.path : 'my.geotab.com';
  const creds = login.credentials;
  console.log(`Login OK @ ${server} (db=${DATABASE})\n`);

  // 1) Reglas relacionadas con ralentí
  const rules = await rpc(server, 'Get', { typeName: 'Rule', credentials: creds });
  const idlingRules = rules.filter(r => /ralent|idl/i.test(r.name || ''));
  console.log(`Reglas totales: ${rules.length}`);
  console.log(`Reglas de RALENTÍ encontradas: ${idlingRules.length}`);
  idlingRules.forEach(r => console.log(`   • "${r.name}"  id=${r.id}  activa=${r.activeFrom ? 'sí' : '?'}`));

  // 2) Trip en el mismo rango del Excel (Q2 julio, hora local Colombia -05:00)
  const fromDate = '2026-07-16T05:00:00.000Z';
  const toDate   = '2026-08-01T05:00:00.000Z';
  console.log(`\nDescargando Trip ${fromDate} → ${toDate} …`);
  let trips = [], fromVersion, total = 0;
  for (let i = 0; i < 50; i++) {
    const r = await rpc(server, 'GetFeed', { typeName: 'Trip', search: { fromDate, toDate }, fromVersion, resultsLimit: 50000, credentials: creds });
    const data = r?.data || [];
    trips.push(...data); total += data.length;
    fromVersion = r?.toVersion;
    if (data.length < 50000 || !fromVersion) break;
  }
  let idle = 0, drive = 0, dist = 0, stop = 0;
  const devs = new Set();
  for (const t of trips) {
    idle += durationToHours(t.idlingDuration);
    drive += durationToHours(t.drivingDuration);
    stop += durationToHours(t.stopDuration);
    dist += Number(t.distance) || 0;
    if (t.device?.id) devs.add(t.device.id);
  }
  console.log(`\n--- API (entidad Trip) ---`);
  console.log(`  viajes=${total}  dispositivos=${devs.size}`);
  console.log(`  ralentí=${idle.toFixed(1)} h · conducción=${drive.toFixed(1)} h · distancia=${dist.toFixed(0)} km`);
  console.log(`  motor derivado=${(idle + drive).toFixed(1)} h → % ralentí=${(idle / (idle + drive) * 100).toFixed(2)}%`);
  console.log(`\n--- Excel "Reporte avanzado de viajes en detalle" ---`);
  console.log(`  viajes=66042  dispositivos=279`);
  console.log(`  ralentí=8902.0 h · conducción=14189.5 h · distancia=326841 km · % ralentí=38.55%`);

  // 3) ¿Hay ExceptionEvent de ralentí en el período?
  if (idlingRules.length) {
    const ev = await rpc(server, 'Get', {
      typeName: 'ExceptionEvent',
      search: { fromDate, toDate, ruleSearch: { id: idlingRules[0].id } },
      resultsLimit: 10000, credentials: creds,
    });
    console.log(`\nExceptionEvent de "${idlingRules[0].name}" en el período: ${ev.length}`);
    if (ev[0]) console.log(`   ejemplo: device=${ev[0].device?.id} from=${ev[0].activeFrom} to=${ev[0].activeTo} duración=${ev[0].duration}`);
  }
})().catch(e => { console.error('FALLÓ:', e.message); if (e.geotab) console.error(JSON.stringify(e.geotab).slice(0, 500)); process.exit(1); });
