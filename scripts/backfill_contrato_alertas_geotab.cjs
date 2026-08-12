/**
 * Backfill del contrato en las alertas históricas de Geotab (saved_alerts).
 *
 * Contexto: hasta la corrección de ago-2026, el pipeline de alertas de Geotab
 * escribía el contrato como 'No asignado' (frontend) o NULL (worker) porque el
 * ExceptionEvent solo identifica el dispositivo y nunca se cruzaba con el
 * maestro de vehículos. Coltrack y Fagor no están afectados: traen el contrato
 * en su propio registro.
 *
 * Este script resuelve el contrato contra `vehiculos` + `contratos` —la misma
 * fuente que ya usa el pipeline de cargas masivas— y solo toca filas que
 * cumplen TODAS estas condiciones:
 *
 *   source = 'GEOTAB'  AND  (contract IS NULL OR contract = 'No asignado')
 *
 * Nunca modifica alertas de Coltrack/Fagor ni filas que ya tengan contrato.
 *
 * Uso:
 *   node scripts/backfill_contrato_alertas_geotab.cjs              # dry-run (no escribe)
 *   node scripts/backfill_contrato_alertas_geotab.cjs --apply      # aplica los cambios
 *   node scripts/backfill_contrato_alertas_geotab.cjs --apply --max-placas 5   # prueba acotada
 *
 * Credenciales: usa SUPABASE_SERVICE_ROLE_KEY si está en el entorno; si no, la
 * clave anon (que tiene GRANT UPDATE sobre saved_alerts).
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  || 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const APLICAR = process.argv.includes('--apply');
const MAX_PLACAS = (() => {
  const i = process.argv.indexOf('--max-placas');
  return i !== -1 ? Number(process.argv[i + 1]) || Infinity : Infinity;
})();

const PAGE = 1000;
const SIN_CONTRATO = 'No asignado';

/** Misma normalización que services/vehicleContractService.ts */
const normalizePlate = (p) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function construirMapaContratos() {
  const mapa = new Map();
  for (let desde = 0; ; desde += PAGE) {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('placa, contratos(nombre)')
      .range(desde, desde + PAGE - 1);
    if (error) throw new Error(`vehiculos: ${error.message}`);
    for (const fila of data) {
      const clave = normalizePlate(fila.placa);
      const rel = Array.isArray(fila.contratos) ? fila.contratos[0] : fila.contratos;
      const nombre = String(rel?.nombre ?? '').trim();
      if (clave && nombre) mapa.set(clave, nombre);
    }
    if (data.length < PAGE) break;
  }
  return mapa;
}

// Dos pasadas explícitas en vez de un .or(): evita las comillas de PostgREST
// sobre un valor con espacio, donde un error de sintaxis pasaría inadvertido.
// El grueso está en 'No asignado' (lo que escribía el frontend); el NULL lo
// escribía el worker de backend.
const FILTROS_SIN_CONTRATO = [
  { nombre: `contract = '${SIN_CONTRATO}'`, filtro: (q) => q.eq('contract', SIN_CONTRATO) },
  { nombre: 'contract IS NULL', filtro: (q) => q.is('contract', null) },
];

/**
 * Recorre las alertas Geotab pendientes de contrato y devuelve sus (id, placa).
 *
 * Paginado por cursor sobre la PK, no por offset: a 67k filas el `range()`
 * profundo se degrada hasta el "statement timeout" del servidor.
 */
async function relevarPendientes() {
  const filas = [];
  const noVerificados = [];

  for (const { nombre, filtro } of FILTROS_SIN_CONTRATO) {
    let cursor = null;
    let leidasEnPasada = 0;

    while (true) {
      let q = filtro(
        supabase.from('saved_alerts').select('id, plate').eq('source', 'GEOTAB')
      ).order('id').limit(PAGE);
      if (cursor) q = q.gt('id', cursor);

      const { data, error } = await q;

      if (error) {
        // Un filtro sin coincidencias obliga a recorrer la tabla entera para
        // demostrarlo, y ahí salta el statement timeout del servidor. Abortar
        // todo el script por eso dejaría sin corregir el grueso que sí se lee,
        // así que se registra la pasada como no verificada y se sigue.
        noVerificados.push(`${nombre}: ${error.message || `HTTP ${error.code || 'error'}`}`);
        break;
      }
      if (!data.length) break;

      for (const fila of data) {
        const p = String(fila.plate ?? '').trim();
        if (p) filas.push({ id: fila.id, placa: p });
      }
      leidasEnPasada += data.length;
      cursor = data[data.length - 1].id;
      if (data.length < PAGE) break;
    }

    console.log(`   [${nombre}] ${leidasEnPasada} filas leídas`);
  }

  const conteo = new Map();
  for (const f of filas) conteo.set(f.placa, (conteo.get(f.placa) || 0) + 1);
  return { filas, conteo, total: filas.length, noVerificados };
}

(async () => {
  console.log(`\n=== Backfill contrato — alertas Geotab ===`);
  console.log(`Modo: ${APLICAR ? 'APLICAR (escribe en la base)' : 'DRY-RUN (no escribe)'}`);
  if (MAX_PLACAS !== Infinity) console.log(`Límite de prueba: ${MAX_PLACAS} placas`);

  const mapa = await construirMapaContratos();
  console.log(`\nMaestro de vehículos: ${mapa.size} placas con contrato`);

  console.log(`\nRelevando alertas pendientes...`);
  const { filas, conteo, total, noVerificados } = await relevarPendientes();
  console.log(`Alertas Geotab sin contrato: ${total} (${conteo.size} placas distintas)`);
  if (noVerificados.length) {
    console.log(`\n⚠ Pasadas NO verificadas (el servidor cortó la consulta):`);
    noVerificados.forEach(m => console.log(`   ${m}`));
    console.log(`   Esas filas, si existen, quedan fuera de esta corrida.`);
  }

  const resolubles = [];
  const irresolubles = [];
  for (const [placa, filas] of conteo) {
    const contrato = mapa.get(normalizePlate(placa));
    (contrato ? resolubles : irresolubles).push({ placa, filas, contrato });
  }
  resolubles.sort((a, b) => b.filas - a.filas);

  const filasResolubles = resolubles.reduce((s, r) => s + r.filas, 0);
  console.log(`  Resolubles   : ${filasResolubles} filas en ${resolubles.length} placas`);
  console.log(`  Sin contrato : ${total - filasResolubles} filas en ${irresolubles.length} placas`);
  if (irresolubles.length) {
    console.log(`    (placas ausentes del maestro: ${irresolubles.map(r => r.placa).slice(0, 20).join(', ')})`);
  }

  console.log(`\nMuestra de lo que se asignaría:`);
  resolubles.slice(0, 10).forEach(r =>
    console.log(`   ${r.placa.padEnd(9)} ${String(r.filas).padStart(6)} filas -> ${r.contrato}`)
  );

  if (!APLICAR) {
    console.log(`\nDry-run: no se escribió nada. Repite con --apply para aplicar.`);
    return;
  }

  console.log(`\nAplicando...`);

  // Se actualiza por lotes de ids (PK) en lugar de por placa: el filtro por
  // `plate` no tiene índice y recorrería la tabla entera una vez por placa.
  const placasObjetivo = new Set(resolubles.slice(0, MAX_PLACAS).map(r => r.placa));
  const idsPorContrato = new Map();
  for (const { id, placa } of filas) {
    if (!placasObjetivo.has(placa)) continue;
    const contrato = mapa.get(normalizePlate(placa));
    if (!contrato) continue;
    if (!idsPorContrato.has(contrato)) idsPorContrato.set(contrato, []);
    idsPorContrato.get(contrato).push(id);
  }

  // 200 y no 500: con lotes de 500 el UPDATE ... WHERE id IN (...) rozaba el
  // statement timeout del servidor y perdía el lote entero.
  const LOTE = 200;
  let actualizadas = 0;
  const errores = [];

  /** Actualiza un lote; ante timeout lo parte en dos y reintenta. */
  async function actualizarLote(contrato, ids, profundidad = 0) {
    const { error } = await supabase
      .from('saved_alerts')
      .update({ contract: contrato })
      .in('id', ids);

    if (!error) { actualizadas += ids.length; return; }

    const esTimeout = String(error.message || '').includes('statement timeout');
    if (esTimeout && ids.length > 1 && profundidad < 4) {
      const mitad = Math.ceil(ids.length / 2);
      await actualizarLote(contrato, ids.slice(0, mitad), profundidad + 1);
      await actualizarLote(contrato, ids.slice(mitad), profundidad + 1);
      return;
    }
    errores.push(`${contrato} (${ids.length} ids): ${error.message || 'error sin mensaje'}`);
  }

  for (const [contrato, ids] of idsPorContrato) {
    const antes = actualizadas;
    for (let i = 0; i < ids.length; i += LOTE) {
      await actualizarLote(contrato, ids.slice(i, i + LOTE));
    }
    console.log(`   ${contrato} -> ${actualizadas - antes}/${ids.length} filas`);
  }

  console.log(`\nListo: ${actualizadas} filas actualizadas en ${idsPorContrato.size} contratos.`);
  if (errores.length) {
    console.log(`Errores (${errores.length}):`);
    errores.slice(0, 20).forEach(e => console.log('   ' + e));
  }

  // Verificación posterior: cuánto queda sin contrato.
  console.log(`\nVerificando...`);
  const { conteo: c2, total: t2 } = await relevarPendientes();
  console.log(`Quedan sin contrato: ${t2} filas en ${c2.size} placas.`);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
