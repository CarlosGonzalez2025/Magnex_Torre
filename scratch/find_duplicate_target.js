import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const contratoAdmin = '4bbd8493-20e0-4818-917c-ede4e001a676';
const contratoTibu = '3b2b1604-4b6d-4786-a077-04c1d4be39cc';

const normName = (name) =>
  String(name ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');

async function fetchAllRows(query) {
  const allRows = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    allRows.push(...(data ?? []));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

async function main() {
  console.log('Descargando TODOS los conductores (8665)...');
  const allConds = await fetchAllRows(supabase.from('conductores').select('id, nombres, cedula, contrato_id, proyecto, estado'));
  console.log(`Total: ${allConds.length}`);

  const byName = new Map();
  allConds.forEach(c => {
    const key = normName(c.nombres);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(c);
  });

  for (const [label, contratoId] of [['VRC-ADMINISTRACION', contratoAdmin], ['VRC-TIBU', contratoTibu]]) {
    const misConds = allConds.filter(c => c.contrato_id === contratoId);
    console.log(`\n=== ${label}: revisando duplicados de nombre ===`);
    for (const c of misConds) {
      const key = normName(c.nombres);
      const dups = byName.get(key) || [];
      if (dups.length > 1) {
        console.log(`\nNOMBRE DUPLICADO: "${c.nombres}"`);
        for (const d of dups) {
          // Buscar si este id tiene reporte con kms en el periodo
          const { data: rep } = await supabase
            .from('reportes_conductores')
            .select('kms, fuente')
            .eq('conductor_id', d.id)
            .eq('periodo_inicio', '2026-05-29')
            .eq('periodo_fin', '2026-06-28');
          const kmsInfo = (rep && rep.length) ? rep.map(r => `${r.fuente}:${r.kms}`).join(',') : 'sin reporte';
          console.log(`  - id=${d.id} | contrato_id=${d.contrato_id ?? 'NULL'} | proyecto="${d.proyecto}" | estado=${d.estado} | reportes periodo=[${kmsInfo}] ${d.id === c.id ? '<-- ESTE ES EL ASIGNADO AL CONTRATO' : ''}`);
        }
      }
    }
  }
}

main().catch(e => console.error(e));
