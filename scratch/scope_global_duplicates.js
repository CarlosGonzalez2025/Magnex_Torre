import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

const normName = (name) =>
  String(name ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');

async function main() {
  const allDrivers = await fetchAllRows(supabase.from('conductores').select('id, nombres, cedula, estado, contrato_id'));
  const contratos = await fetchAllRows(supabase.from('contratos').select('id, nombre'));
  const contratoMap = new Map(contratos.map(c => [c.id, c.nombre]));

  const oficiales = allDrivers.filter(c => c.contrato_id !== null);

  const mapNombreACond = new Map();
  allDrivers.forEach(d => {
    const key = normName(d.nombres);
    if (!mapNombreACond.has(key)) mapNombreACond.set(key, []);
    mapNombreACond.get(key).push(d);
  });

  const porContrato = new Map(); // contrato_id -> { oficialesConDup: Set, totalDup: number }

  for (const cond of oficiales) {
    const key = normName(cond.nombres);
    const matches = mapNombreACond.get(key) || [];
    const duplicates = matches.filter(m => {
      if (m.id === cond.id) return false;
      const esNulo = m.contrato_id === null;
      const esPendiente = String(m.estado ?? '').toUpperCase() === 'PENDIENTE GOOGLE SHEETS';
      const esCedulaTemp = String(m.cedula ?? '').startsWith('TEMP_CC_') || String(m.cedula ?? '').startsWith('-');
      return esNulo || esPendiente || esCedulaTemp;
    });
    if (duplicates.length > 0) {
      const cId = cond.contrato_id;
      if (!porContrato.has(cId)) porContrato.set(cId, { conductoresAfectados: 0, totalDuplicados: 0 });
      const rec = porContrato.get(cId);
      rec.conductoresAfectados++;
      rec.totalDuplicados += duplicates.length;
    }
  }

  const rows = Array.from(porContrato.entries())
    .map(([cId, rec]) => ({ contrato: contratoMap.get(cId) ?? cId, ...rec }))
    .sort((a, b) => b.conductoresAfectados - a.conductoresAfectados);

  console.log(`Contratos afectados: ${rows.length}`);
  console.log(`Total conductores oficiales con al menos 1 duplicado: ${rows.reduce((s, r) => s + r.conductoresAfectados, 0)}`);
  console.log(`Total filas duplicadas huérfanas involucradas: ${rows.reduce((s, r) => s + r.totalDuplicados, 0)}`);
  console.log('\nDetalle por contrato:');
  rows.forEach(r => console.log(`  - ${r.contrato}: ${r.conductoresAfectados} conductores afectados, ${r.totalDuplicados} duplicados`));
}

main().catch(e => console.error(e));
