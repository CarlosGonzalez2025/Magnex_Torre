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

async function run() {
  console.log("=== INICIANDO SCRIPT DE CORRECCIÓN HISTÓRICA EN PRODUCCIÓN ===");
  try {
    // 1. Cargar todos los eventos detallados de Coltrack
    console.log("Cargando todos los eventos de ralentis_eventos para el proveedor COLTRACK...");
    const coltrackEvents = await fetchAllRows(
      supabase
        .from('ralentis_eventos')
        .select('*')
        .eq('proveedor', 'COLTRACK')
    );
    console.log(`Total de eventos Coltrack encontrados en la base de datos: ${coltrackEvents.length}`);

    if (coltrackEvents.length === 0) {
      console.log("No hay eventos Coltrack para corregir.");
      return;
    }

    // 2. Cargar todos los consolidados de ralentis_periodos
    console.log("Cargando todos los consolidados de ralentis_periodos...");
    const periodos = await fetchAllRows(
      supabase
        .from('ralentis_periodos')
        .select('*')
    );
    console.log(`Total de registros consolidados cargados: ${periodos.length}`);

    // Mapear consolidados para búsqueda rápida
    const periodosMap = new Map();
    periodos.forEach(p => {
      const key = `${p.vehiculo_id}_${p.periodo_inicio}_${p.periodo_fin}`;
      periodosMap.set(key, p);
    });

    // Contar cuántos eventos de Coltrack tenemos registrados en la base de datos por vehículo y periodo
    const eventsGroupCount = new Map();
    coltrackEvents.forEach(e => {
      const key = `${e.vehiculo_id}_${e.periodo_inicio}_${e.periodo_fin}`;
      eventsGroupCount.set(key, (eventsGroupCount.get(key) || 0) + 1);
    });

    // 3. Recalcular métricas de cada evento detallado
    console.log("Recalculando duraciones y fechas finales...");
    const updatedEvents = [];
    let countGlitched = 0;

    for (const e of coltrackEvents) {
      const key = `${e.vehiculo_id}_${e.periodo_inicio}_${e.periodo_fin}`;
      const periodData = periodosMap.get(key);
      
      let duracionSegundos = 300; // default 5 minutos
      
      if (periodData) {
        const totalHours = Number(periodData.horas_motor_ralenti || 0);
        const totalEvents = eventsGroupCount.get(key) || Number(periodData.ralentis_excesivos || 1);
        if (totalHours > 0 && totalEvents > 0) {
          duracionSegundos = Math.round((totalHours * 3600) / totalEvents);
        }
      }

      // Calcular fecha_fin en base a la nueva duración
      let fechaFinISO = null;
      try {
        const startDate = new Date(e.fecha_inicio);
        if (!isNaN(startDate.getTime())) {
          const endDate = new Date(startDate.getTime() + duracionSegundos * 1000);
          fechaFinISO = endDate.toISOString();
        }
      } catch (err) {
        // ignore
      }

      if (e.duracion_segundos > 7200) {
        countGlitched++;
      }

      // Construir el objeto completo de actualización para evitar violar restricciones de no-nulos en el upsert
      updatedEvents.push({
        ...e,
        duracion_segundos: duracionSegundos,
        fecha_fin: fechaFinISO,
        updated_at: new Date().toISOString()
      });
    }

    console.log(`\nResumen del recálculo:`);
    console.log(`- Eventos Coltrack totales procesados: ${updatedEvents.length}`);
    console.log(`- Eventos con duraciones severamente alteradas/glitcheadas (> 2 horas): ${countGlitched}`);

    // 4. Subir actualizaciones en lotes (chunks) de 500
    const CHUNK_SIZE = 500;
    console.log(`\nIniciando subida de datos a Supabase en lotes de ${CHUNK_SIZE}...`);
    
    for (let i = 0; i < updatedEvents.length; i += CHUNK_SIZE) {
      const chunk = updatedEvents.slice(i, i + CHUNK_SIZE);
      console.log(`Subiendo lote ${Math.floor(i / CHUNK_SIZE) + 1} de ${Math.ceil(updatedEvents.length / CHUNK_SIZE)} (Filas: ${chunk.length})...`);
      
      const { error } = await supabase
        .from('ralentis_eventos')
        .upsert(chunk, { onConflict: 'id' });

      if (error) {
        console.error(`Error al actualizar lote en la base de datos:`, error);
        throw error;
      }
    }

    console.log("\n=== ¡MIGRACIÓN COMPLETADA CON ÉXITO! Todos los registros históricos han sido corregidos. ===");

  } catch (err) {
    console.error("\n❌ ERROR DURANTE LA MIGRACIÓN HISTÓRICA:", err);
    process.exit(1);
  }
}

run();
