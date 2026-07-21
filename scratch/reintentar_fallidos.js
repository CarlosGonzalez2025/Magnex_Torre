import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const pares = [
  { condId: '6da015fd-ef6f-4477-a6cc-3c1906b63f86', dupId: '8f715c9e-315d-48da-9a51-b6db0d00db53', nombre: 'ALVARO ALONSO SANCHEZ GARCIA' },
  { condId: 'a361966c-ddb2-4e6e-b8cd-c05a18f4cf68', dupId: 'edcc6688-f6cf-4330-8c19-7c9c9586fb45', nombre: 'Cristian Fernando Moreno Calderon' },
  { condId: 'a361966c-ddb2-4e6e-b8cd-c05a18f4cf68', dupId: '63559f93-d68a-4fa4-bbc7-c707b68d6443', nombre: 'Cristian Fernando Moreno Calderon' },
  { condId: '3ed92856-f589-42c3-9b57-1954f82facdc', dupId: '34fbbb95-a4f4-4a2f-9214-c8f4c1162b4c', nombre: 'JOSE GREGORIO SANCHEZ MONTENEGRO' },
];

async function procesarDuplicado(condId, dupId, nombre) {
  console.log(`\nReintentando: "${nombre}" oficial=${condId} dup=${dupId}`);

  // Verificar que el duplicado todavia exista (si ya se borro en un intento anterior, saltar)
  const { data: dupRow } = await supabase.from('conductores').select('id').eq('id', dupId).maybeSingle();
  if (!dupRow) {
    console.log('  El duplicado ya no existe (probablemente ya se proceso). Saltando.');
    return;
  }

  let mergesReps = 0, reassignsReps = 0, mergesDaily = 0, reassignsDaily = 0, alerts = 0;

  const { data: reps, error: repErr } = await supabase
    .from('reportes_conductores').select('*').eq('conductor_id', dupId);
  if (repErr) throw repErr;

  for (const r of (reps ?? [])) {
    const { data: officialRep, error: offErr } = await supabase
      .from('reportes_conductores').select('*')
      .eq('conductor_id', condId)
      .eq('periodo_inicio', r.periodo_inicio)
      .eq('periodo_fin', r.periodo_fin)
      .eq('fuente', r.fuente ?? 'COLTRACK')
      .maybeSingle();
    if (offErr) throw offErr;

    if (officialRep) {
      const totalKms = Number(officialRep.kms ?? 0) + Number(r.kms ?? 0);
      const mergedCalificacion = totalKms > 0
        ? Math.round((Number(officialRep.calificacion ?? 100) * Number(officialRep.kms ?? 0) + Number(r.calificacion ?? 100) * Number(r.kms ?? 0)) / totalKms)
        : Math.round((Number(officialRep.calificacion ?? 100) + Number(r.calificacion ?? 100)) / 2);

      const { error: updErr } = await supabase.from('reportes_conductores').update({
        kms: totalKms,
        horas_conduccion: Number(officialRep.horas_conduccion ?? 0) + Number(r.horas_conduccion ?? 0),
        calificacion: mergedCalificacion,
        excesos_10_kph: Number(officialRep.excesos_10_kph ?? 0) + Number(r.excesos_10_kph ?? 0),
        excesos_20_kph: Number(officialRep.excesos_20_kph ?? 0) + Number(r.excesos_20_kph ?? 0),
        excesos_30_kph: Number(officialRep.excesos_30_kph ?? 0) + Number(r.excesos_30_kph ?? 0),
        excesos_40_kph: Number(officialRep.excesos_40_kph ?? 0) + Number(r.excesos_40_kph ?? 0),
        excesos_50_kph: Number(officialRep.excesos_50_kph ?? 0) + Number(r.excesos_50_kph ?? 0),
        excesos_60_kph: Number(officialRep.excesos_60_kph ?? 0) + Number(r.excesos_60_kph ?? 0),
        excesos_80_kph: Number(officialRep.excesos_80_kph ?? 0) + Number(r.excesos_80_kph ?? 0),
        aceleraciones_bruscas: Number(officialRep.aceleraciones_bruscas ?? 0) + Number(r.aceleraciones_bruscas ?? 0),
        frenadas_bruscas: Number(officialRep.frenadas_bruscas ?? 0) + Number(r.frenadas_bruscas ?? 0),
      }).eq('id', officialRep.id);
      if (updErr) throw updErr;
      const { error: delRepErr } = await supabase.from('reportes_conductores').delete().eq('id', r.id);
      if (delRepErr) throw delRepErr;
      mergesReps++;
    } else {
      const { error: updErr } = await supabase.from('reportes_conductores').update({ conductor_id: condId }).eq('id', r.id);
      if (updErr) throw updErr;
      reassignsReps++;
    }
  }

  const { data: daily, error: dailyErr } = await supabase
    .from('coltrack_datos_conductor').select('*').eq('conductor_id', dupId);
  if (dailyErr) throw dailyErr;

  for (const d of (daily ?? [])) {
    const { data: officialDaily, error: offDErr } = await supabase
      .from('coltrack_datos_conductor').select('*')
      .eq('conductor_id', condId).eq('fecha', d.fecha).maybeSingle();
    if (offDErr) throw offDErr;

    if (officialDaily) {
      const totalKms = Number(officialDaily.kms ?? 0) + Number(d.kms ?? 0);
      const { error: updErr } = await supabase.from('coltrack_datos_conductor').update({
        kms: totalKms,
        horas_conduccion: Number(officialDaily.horas_conduccion ?? 0) + Number(d.horas_conduccion ?? 0),
      }).eq('id', officialDaily.id);
      if (updErr) throw updErr;
      const { error: delErr } = await supabase.from('coltrack_datos_conductor').delete().eq('id', d.id);
      if (delErr) throw delErr;
      mergesDaily++;
    } else {
      const { error: updErr } = await supabase.from('coltrack_datos_conductor').update({ conductor_id: condId }).eq('id', d.id);
      if (updErr) throw updErr;
      reassignsDaily++;
    }
  }

  const { data: alertRows, error: alertErr } = await supabase
    .from('alertas_diarias_gps').select('id').eq('conductor_id', dupId);
  if (alertErr) throw alertErr;
  for (const a of (alertRows ?? [])) {
    const { error: updErr } = await supabase.from('alertas_diarias_gps')
      .update({ conductor_id: condId, conductor_identificado: true }).eq('id', a.id);
    if (updErr) throw updErr;
    alerts++;
  }

  const { error: delErr } = await supabase.from('conductores').delete().eq('id', dupId);
  if (delErr) {
    await supabase.from('conductores').update({ estado: 'INACTIVO', updated_at: new Date().toISOString() }).eq('id', dupId);
    console.log(`  No se pudo eliminar (${delErr.message}); marcado INACTIVO.`);
  } else {
    console.log('  Duplicado eliminado.');
  }

  console.log(`  Reportes: ${reassignsReps} reasignados, ${mergesReps} fusionados | Diarios: ${reassignsDaily} reasignados, ${mergesDaily} fusionados | Alertas: ${alerts}`);
}

async function main() {
  for (const p of pares) {
    try {
      await procesarDuplicado(p.condId, p.dupId, p.nombre);
    } catch (e) {
      console.error(`  FALLO DE NUEVO: ${e.message}`);
    }
  }
}

main().catch(e => console.error('ERROR FATAL:', e.message));
