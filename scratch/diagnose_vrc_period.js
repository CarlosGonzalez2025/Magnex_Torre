import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const fechaInicio = '2026-05-29';
const fechaFin = '2026-06-28';

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
  console.log(`=== DIAGNOSTICO periodo ${fechaInicio} a ${fechaFin} para VRC-TIBU y VRC-ADMINISTRACION ===\n`);

  const { data: contratos, error: cErr } = await supabase.from('contratos').select('*');
  if (cErr) throw cErr;

  const targets = contratos.filter(c =>
    /VRC.?TIBU/i.test(c.nombre) || /VRC.?ADMINISTRACI/i.test(c.nombre)
  );
  console.log('Contratos encontrados:', targets.map(c => `${c.nombre} (${c.id})`));

  for (const contrato of targets) {
    console.log(`\n--- CONTRATO: ${contrato.nombre} (${contrato.id}) ---`);

    const conds = await fetchAllRows(supabase.from('conductores').select('*').eq('contrato_id', contrato.id));
    console.log(`Conductores asignados: ${conds.length}`);

    const vehs = await fetchAllRows(supabase.from('vehiculos').select('*').eq('contrato_id', contrato.id));
    console.log(`Vehiculos asignados: ${vehs.length}`);

    // Reportes de conductores en el periodo
    const condIds = conds.map(c => c.id);
    const repCond = condIds.length ? await fetchAllRows(
      supabase.from('reportes_conductores').select('*').in('conductor_id', condIds).eq('periodo_inicio', fechaInicio).eq('periodo_fin', fechaFin)
    ) : [];
    const sumKmsCond = repCond.reduce((s, r) => s + Number(r.kms ?? 0), 0);
    console.log(`Reportes de conductores en periodo: ${repCond.length} | Suma Kms: ${sumKmsCond.toFixed(2)}`);
    const fuentesCond = [...new Set(repCond.map(r => r.fuente ?? 'NULL'))];
    console.log(`Fuentes presentes en reportes_conductores: ${fuentesCond.join(', ') || 'ninguna'}`);

    // Reportes de vehiculos en el periodo (para comparar si SI hay datos a nivel vehiculo)
    const vehIds = vehs.map(v => v.id);
    const repVeh = vehIds.length ? await fetchAllRows(
      supabase.from('reportes_vehiculos').select('*').in('vehiculo_id', vehIds).eq('periodo_inicio', fechaInicio).eq('periodo_fin', fechaFin)
    ) : [];
    const sumKmsVeh = repVeh.reduce((s, r) => s + Number(r.kms ?? 0), 0);
    console.log(`Reportes de vehiculos en periodo: ${repVeh.length} | Suma Kms: ${sumKmsVeh.toFixed(2)}`);
    const fuentesVeh = [...new Set(repVeh.map(r => r.fuente ?? 'NULL'))];
    console.log(`Fuentes presentes en reportes_vehiculos: ${fuentesVeh.join(', ') || 'ninguna'}`);

    // Cuantos vehiculos tienen kms > 0 pero sin conductor asociado en el reporte
    if (repVeh.length > 0) {
      console.log('Detalle vehiculos con Kms en el periodo:');
      repVeh.filter(r => Number(r.kms ?? 0) > 0).forEach(r => {
        const v = vehs.find(vv => vv.id === r.vehiculo_id);
        console.log(`  - Placa: ${v?.placa ?? r.vehiculo_id} | Kms: ${r.kms} | Fuente: ${r.fuente ?? 'NULL'}`);
      });
    }
  }
}

main().catch(err => console.error('Error:', err.message));
