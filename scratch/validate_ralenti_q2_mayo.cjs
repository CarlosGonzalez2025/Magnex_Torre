const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const fmt = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

async function fetchAll(table, select, build) {
  const pageSize = 1000;
  let all = [];
  for (let page = 0; ; page++) {
    let q = supabase.from(table).select(select).range(page*pageSize, page*pageSize + pageSize - 1);
    q = build(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
  }
  return all;
}

(async () => {
  // 1. Periodos distintos almacenados en ralentis_periodos
  const allPeriodos = await fetchAll('ralentis_periodos', 'periodo_inicio, periodo_fin, horas_motor_ralenti', q => q);
  const grupos = new Map();
  for (const r of allPeriodos) {
    const k = `${r.periodo_inicio} -> ${r.periodo_fin}`;
    const g = grupos.get(k) || { rows: 0, ralenti: 0 };
    g.rows++; g.ralenti += Number(r.horas_motor_ralenti) || 0;
    grupos.set(k, g);
  }
  console.log('=== ralentis_periodos: periodos distintos (todos) ===');
  for (const [k, g] of grupos) console.log(`${k}  | filas=${g.rows} | sum horas_ralenti=${g.ralenti.toFixed(2)} h`);

  // 2. Lo que la UI consulta para 2da quincena de mayo 2026
  const dateStart = '2026-05-16';
  const dateEnd = '2026-05-31';
  const uiRows = await fetchAll('ralentis_periodos', 'horas_motor_ralenti, horas_motor_encendido',
    q => q.gte('periodo_inicio', dateStart).lte('periodo_fin', dateEnd));
  const uiSum = uiRows.reduce((a, r) => a + (Number(r.horas_motor_ralenti)||0), 0);
  console.log(`\n=== UI query (periodo_inicio>=${dateStart} AND periodo_fin<=${dateEnd}) ===`);
  console.log(`filas=${uiRows.length} | "Tiempo Total en Ralentí" mostrado = ${uiSum.toFixed(2)} h => ${fmt(uiSum*3600)}`);

  // 3. Real desde ralentis_eventos por fecha_inicio dentro de la quincena
  const ev = await fetchAll('ralentis_eventos', 'duracion_segundos, fecha_inicio, proveedor',
    q => q.gte('fecha_inicio', `${dateStart}T00:00:00Z`).lte('fecha_inicio', `${dateEnd}T23:59:59Z`));
  const segTotales = ev.reduce((a, e) => a + (Number(e.duracion_segundos)||0), 0);
  console.log(`\n=== ralentis_eventos (fecha_inicio en la quincena) ===`);
  console.log(`eventos=${ev.length} | suma duracion = ${(segTotales/3600).toFixed(2)} h => ${fmt(segTotales)}`);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
