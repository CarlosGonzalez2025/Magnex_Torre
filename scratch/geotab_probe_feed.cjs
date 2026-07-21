/** Verifica que GetFeed pagina Trip correctamente (km/horas reales sin tope). */
const DATABASE = process.env.GEOTAB_DATABASE, USER = process.env.GEOTAB_USER, PASSWORD = process.env.GEOTAB_PASSWORD;

async function rpc(server, method, params) {
  const res = await fetch(`https://${server}/apiv1`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const json = await res.json();
  if (json.error) { const e = new Error(json.error.message); e.geotab = json.error; throw e; }
  return json.result;
}

(async () => {
  try {
    const login = await rpc('my.geotab.com', 'Authenticate', { database: DATABASE, userName: USER, password: PASSWORD });
    const server = login.path && login.path !== 'ThisServer' ? login.path : 'my.geotab.com';
    const creds = login.credentials;

    const now = new Date();
    const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const resultsLimit = 50000;
    let fromVersion, total = 0, pages = 0;
    const all = [];
    for (let i = 0; i < 200; i++) {
      const r = await rpc(server, 'GetFeed', { typeName: 'Trip', search: { fromDate, toDate: now.toISOString() }, fromVersion, resultsLimit, credentials: creds });
      const data = r.data || [];
      all.push(...data); total += data.length; pages++;
      fromVersion = r.toVersion;
      if (data.length < resultsLimit || !fromVersion) break;
    }
    let km = 0;
    for (const t of all) km += t.distance || 0;
    console.log(`✅ GetFeed Trip 24h: ${total} viajes en ${pages} página(s) — vs 1000 topado del Get simple`);
    console.log(`   km totales reales: ${km.toFixed(1)}`);
    console.log(`   ejemplo trip:`, JSON.stringify({ device: all[0]?.device?.id, distance: all[0]?.distance, drivingDuration: all[0]?.drivingDuration, idlingDuration: all[0]?.idlingDuration, start: all[0]?.start }));
  } catch (err) {
    console.error('❌ FALLÓ:', err.message, err.geotab ? JSON.stringify(err.geotab) : '');
    process.exit(1);
  }
})();
