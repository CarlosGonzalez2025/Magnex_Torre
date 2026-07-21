/**
 * Smoke test Geotab — aislado, NO toca el sistema.
 * Valida: Authenticate -> federación (path) -> Device / User / Trip.
 *
 * Uso (PowerShell):
 *   $env:GEOTAB_DATABASE="magnex_col"
 *   $env:GEOTAB_USER="carlos.gonzalez@magnexgroup.com"
 *   $env:GEOTAB_PASSWORD="********"
 *   node scratch/geotab_smoke.cjs
 *
 * Requiere Node 18+ (fetch global).
 */

const DATABASE = process.env.GEOTAB_DATABASE;
const USER = process.env.GEOTAB_USER;
const PASSWORD = process.env.GEOTAB_PASSWORD;

if (!DATABASE || !USER || !PASSWORD) {
  console.error('❌ Faltan env vars: GEOTAB_DATABASE, GEOTAB_USER, GEOTAB_PASSWORD');
  process.exit(1);
}

async function rpc(server, method, params) {
  const res = await fetch(`https://${server}/apiv1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const json = await res.json();
  if (json.error) {
    const e = new Error(json.error.message || 'Geotab error');
    e.geotab = json.error;
    throw e;
  }
  return json.result;
}

(async () => {
  try {
    console.log(`\n🔐 Authenticate db="${DATABASE}" user="${USER}" @ my.geotab.com ...`);
    const login = await rpc('my.geotab.com', 'Authenticate', {
      database: DATABASE,
      userName: USER,
      password: PASSWORD,
    });

    const path = login.path;
    const server = path && path !== 'ThisServer' ? path : 'my.geotab.com';
    const creds = login.credentials;

    console.log('✅ Login OK');
    console.log(`   path (federación): ${path}  ->  servidor efectivo: ${server}`);
    console.log(`   sessionId: ${String(creds.sessionId).slice(0, 8)}…  database: ${creds.database}`);

    // --- Conteos en vivo (lo que pediste: # vehículos, # conductores) ---
    const devices = await rpc(server, 'Get', { typeName: 'Device', credentials: creds });
    const drivers = await rpc(server, 'Get', {
      typeName: 'User',
      search: { isDriver: true },
      credentials: creds,
    });
    console.log(`\n🚚 Device (vehículos): ${devices.length}`);
    console.log(`👤 User isDriver (conductores): ${drivers.length}`);
    console.log('   Ejemplo dispositivos:', devices.slice(0, 5).map((d) => d.name));

    // --- Trips de ayer (km + horas de conducción) ---
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const trips = await rpc(server, 'Get', {
      typeName: 'Trip',
      search: { fromDate: from, toDate: now.toISOString() },
      resultsLimit: 1000,
      credentials: creds,
    });

    let km = 0;
    let drivingSec = 0;
    for (const t of trips) {
      km += t.distance || 0; // distance ya viene en km
      // drivingDuration en formato timespan ISO-ish o "HH:MM:SS"; lo medimos crudo
      drivingSec += parseDuration(t.drivingDuration);
    }
    console.log(`\n🛣️  Trips últimas 24h: ${trips.length}`);
    console.log(`   km totales: ${km.toFixed(1)}`);
    console.log(`   horas de conducción: ${(drivingSec / 3600).toFixed(1)}`);

    console.log('\n🎉 Smoke test OK — credenciales, federación y permisos válidos.');
  } catch (err) {
    console.error('\n❌ FALLÓ:', err.message);
    if (err.geotab) console.error('   Geotab error:', JSON.stringify(err.geotab, null, 2));
    process.exit(1);
  }
})();

// Geotab devuelve duraciones como "HH:MM:SS" o "d.HH:MM:SS"
function parseDuration(s) {
  if (!s || typeof s !== 'string') return 0;
  let days = 0;
  let rest = s;
  if (s.includes('.') && s.indexOf('.') < s.indexOf(':')) {
    const [d, r] = s.split('.');
    days = Number(d) || 0;
    rest = r;
  }
  const [h = 0, m = 0, sec = 0] = rest.split(':').map(Number);
  return days * 86400 + h * 3600 + m * 60 + sec;
}
