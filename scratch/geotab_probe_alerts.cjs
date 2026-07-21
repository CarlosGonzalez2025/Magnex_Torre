/**
 * Probe de alertas Geotab — valida acceso a DeviceStatusInfo (posición en vivo)
 * y ExceptionEvent (eventos de reglas), que alimentan el pipeline de alertas.
 * Aislado, NO toca el sistema. Lee credenciales de env vars.
 */
const DATABASE = process.env.GEOTAB_DATABASE;
const USER = process.env.GEOTAB_USER;
const PASSWORD = process.env.GEOTAB_PASSWORD;

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
    const login = await rpc('my.geotab.com', 'Authenticate', {
      database: DATABASE, userName: USER, password: PASSWORD,
    });
    const server = login.path && login.path !== 'ThisServer' ? login.path : 'my.geotab.com';
    const creds = login.credentials;
    console.log(`✅ Login OK @ ${server}\n`);

    // 1) Posición en vivo
    const dsi = await rpc(server, 'Get', { typeName: 'DeviceStatusInfo', credentials: creds });
    console.log(`📍 DeviceStatusInfo: ${dsi.length} registros`);
    if (dsi[0]) {
      const s = dsi[0];
      console.log('   ejemplo:', JSON.stringify({
        device: s.device?.id, bearing: s.bearing, speed: s.speed,
        isDriving: s.isDriving, lat: s.latitude, lng: s.longitude, dateTime: s.dateTime,
      }));
    }

    // 2) Reglas configuradas (para saber qué eventos existen)
    const rules = await rpc(server, 'Get', { typeName: 'Rule', credentials: creds });
    console.log(`\n📐 Rule: ${rules.length} reglas configuradas`);
    console.log('   ejemplos:', rules.slice(0, 10).map((r) => r.name));

    // 3) ExceptionEvent últimas 24h
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const ee = await rpc(server, 'Get', {
      typeName: 'ExceptionEvent',
      search: { fromDate: from, toDate: now.toISOString() },
      resultsLimit: 50,
      credentials: creds,
    });
    console.log(`\n⚠️  ExceptionEvent 24h (muestra hasta 50): ${ee.length}`);
    if (ee[0]) {
      console.log('   ejemplo:', JSON.stringify({
        rule: ee[0].rule?.id, device: ee[0].device?.id,
        from: ee[0].activeFrom, to: ee[0].activeTo, diagnostic: ee[0].diagnostic?.id,
      }));
    }

    console.log('\n🎉 Probe OK — el usuario tiene acceso a las entidades del pipeline de alertas.');
  } catch (err) {
    console.error('\n❌ FALLÓ:', err.message);
    if (err.geotab) console.error('   Geotab error:', JSON.stringify(err.geotab, null, 2));
    process.exit(1);
  }
})();
