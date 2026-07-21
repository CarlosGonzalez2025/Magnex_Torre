import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const condId = '6da015fd-ef6f-4477-a6cc-3c1906b63f86';
const dupId = '8f715c9e-315d-48da-9a51-b6db0d00db53';

async function main() {
  const { data: dupRow } = await supabase.from('conductores').select('id').eq('id', dupId).maybeSingle();
  if (!dupRow) { console.log('Ya no existe, saltando.'); return; }

  const { data: reps, error: repErr } = await supabase.from('reportes_conductores').select('*').eq('conductor_id', dupId);
  if (repErr) throw repErr;
  console.log(`Reportes a mover: ${reps.length}`);

  for (const r of reps) {
    const { data: officialRep } = await supabase
      .from('reportes_conductores').select('*')
      .eq('conductor_id', condId).eq('periodo_inicio', r.periodo_inicio).eq('periodo_fin', r.periodo_fin).eq('fuente', r.fuente ?? 'COLTRACK')
      .maybeSingle();

    if (officialRep) {
      const totalKms = Number(officialRep.kms ?? 0) + Number(r.kms ?? 0);
      await supabase.from('reportes_conductores').update({ kms: totalKms }).eq('id', officialRep.id);
      await supabase.from('reportes_conductores').delete().eq('id', r.id);
      console.log(`Fusionado periodo ${r.periodo_inicio}/${r.periodo_fin}`);
    } else {
      await supabase.from('reportes_conductores').update({ conductor_id: condId }).eq('id', r.id);
      console.log(`Reasignado periodo ${r.periodo_inicio}/${r.periodo_fin}`);
    }
  }

  const { error: delErr } = await supabase.from('conductores').delete().eq('id', dupId);
  if (delErr) {
    console.log(`No se pudo eliminar: ${delErr.message}. Marcando INACTIVO.`);
    await supabase.from('conductores').update({ estado: 'INACTIVO' }).eq('id', dupId);
  } else {
    console.log('Duplicado eliminado con exito.');
  }
}
main().catch(e => console.error('FALLO:', e.message));
