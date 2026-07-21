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

// Normalizacion DISTINTA a la usada en los scripts de reconciliacion, para cruzar con un metodo independiente
function normName2(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

async function main() {
  const allDrivers = await fetchAllRows(supabase.from('conductores').select('id, nombres, cedula, estado, contrato_id'));
  console.log(`Total conductores (verificacion): ${allDrivers.length}`);

  const totalOficiales = allDrivers.filter(c => c.contrato_id !== null).length;
  const totalPendientes = allDrivers.filter(c => String(c.estado ?? '').toUpperCase() === 'PENDIENTE GOOGLE SHEETS' || c.contrato_id === null).length;
  console.log(`Oficiales (contrato_id no nulo): ${totalOficiales}`);
  console.log(`Sin contrato o estado PENDIENTE: ${totalPendientes}`);
  console.log(`Suma deberia acercarse al total: ${totalOficiales + totalPendientes} vs ${allDrivers.length}`);

  // Agrupar TODOS por nombre normalizado (metodo 2)
  const grupos = new Map();
  allDrivers.forEach(d => {
    const key = normName2(d.nombres);
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(d);
  });

  let gruposConDup = 0;
  let totalDuplicadosMetodo2 = 0;
  let oficialesAfectadosMetodo2 = 0;
  const contratosMetodo2 = new Set();

  for (const [key, miembros] of grupos.entries()) {
    if (miembros.length < 2) continue;
    const oficialesEnGrupo = miembros.filter(m => m.contrato_id !== null);
    const huerfanos = miembros.filter(m => {
      const esNulo = m.contrato_id === null;
      const esPendiente = String(m.estado ?? '').toUpperCase() === 'PENDIENTE GOOGLE SHEETS';
      const esCedulaTemp = String(m.cedula ?? '').startsWith('TEMP_CC_') || String(m.cedula ?? '').startsWith('-');
      return esNulo || esPendiente || esCedulaTemp;
    });
    if (oficialesEnGrupo.length > 0 && huerfanos.length > 0) {
      gruposConDup++;
      totalDuplicadosMetodo2 += huerfanos.length;
      oficialesAfectadosMetodo2 += oficialesEnGrupo.length;
      oficialesEnGrupo.forEach(o => contratosMetodo2.add(o.contrato_id));
    }
  }

  console.log(`\n=== METODO INDEPENDIENTE (normalizacion NFKD distinta) ===`);
  console.log(`Grupos de nombre con oficial+huerfano: ${gruposConDup}`);
  console.log(`Conductores oficiales afectados (metodo 2): ${oficialesAfectadosMetodo2}`);
  console.log(`Total duplicados huerfanos (metodo 2): ${totalDuplicadosMetodo2}`);
  console.log(`Contratos distintos afectados (metodo 2): ${contratosMetodo2.size}`);
}

main().catch(e => console.error(e));
