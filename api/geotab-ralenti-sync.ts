import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Sincroniza Geotab hacia el MÓDULO DE INFORME DE RALENTÍ (quincenal).
 *
 * Complementa a `geotab-sync.ts`, que corre cada hora y mantiene la tabla
 * `geotab_daily_metrics` (km / conducción / ralentí por vehículo y día). Este
 * endpoint toma esas métricas ya sincronizadas, las agrega por quincena y las
 * escribe en `ralentis_periodos`; en paralelo baja los eventos individuales de
 * la regla "Idling" de MyGeotab y los escribe en `ralentis_eventos`.
 *
 *   GET/POST /api/geotab-ralenti-sync                      -> quincena en curso + la anterior
 *   GET/POST /api/geotab-ralenti-sync?inicio=2026-07-16&fin=2026-07-31   -> solo ese rango
 *
 * Programación (vercel.json): dos corridas diarias, 05:30 y 17:30 UTC. La segunda no es
 * redundante: en los días de cambio de quincena hay dos rangos que procesar y puede que
 * no quepan en los 60 s de una sola invocación; el que quede pendiente entra en la otra.
 *
 * Nota: existió una Edge Function de Supabase homónima que hacía el mismo trabajo. Nunca
 * llegó a desplegarse y se eliminó en sep-2026: dos escritores sobre `geotab_daily_metrics`
 * significan que corregir uno solo no sirve de nada, porque el otro vuelve a pisar.
 *
 * Decisiones de diseño (ago-2026):
 *
 * 1. HORAS DE MOTOR DERIVADAS. Geotab expone `TripDetailEngineHours`, pero medido
 *    contra el export real sumaba 2.733 h para 279 vehículos en 16 días —
 *    incompatible con los 326.841 km recorridos: es una lectura de odómetro con
 *    muestreo grueso. El tiempo de motor encendido se deriva como
 *    conducción + ralentí, que sí cuadra.
 *
 * 2. SIN COMBUSTIBLE NI CO₂. El viaje trae combustible TOTAL, no el consumido
 *    en ralentí, y el informe no admite estimaciones: `consumo_combustible` = 0.
 *
 * 3. PRECEDENCIA. `ralentis_periodos` tiene UNA fila por vehículo y período
 *    (sumar horas de motor de dos plataformas sería físicamente imposible), así
 *    que Geotab NUNCA pisa filas de Coltrack/Fagor: solo escribe donde no hay
 *    fila o donde la fila ya es suya. Ver migrations/ralentis_periodos_fuente_v1.sql
 *
 * Env vars requeridas en Vercel:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET (opcional)
 */

const VERCEL_APP_URL = process.env.VERCEL_APP_URL || 'https://magnex-torre.vercel.app';
const GEOTAB_API_URL = `${VERCEL_APP_URL}/api/geotab`;
const COLOMBIA_OFFSET = '-05:00';

export const config = { maxDuration: 60 };

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Presupuesto para EMPEZAR otra quincena dentro de los 60 s de la función. No es 45 s
// por una razón: el guard se evalúa ANTES de arrancar el rango, y una quincena completa
// tarda unos 30 s (la consulta de eventos de la regla Idling más ~55 lotes de upsert).
// Arrancar la segunda a los 45 s garantizaría el timeout. A los 25 s todavía cabe.
const LIMITE_MS = 25_000;

/** Fecha local de Colombia (UTC-5 fijo, sin horario de verano) de un instante dado. */
function fechaColombia(ms: number): string {
  return new Date(ms - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Quincena que contiene una fecha LOCAL (YYYY-MM-DD): 1→15 o 16→fin de mes.
 *
 * Recibe la fecha ya en hora de Colombia. Antes se derivaba de un `Date` con métodos
 * UTC, así que la quincena dependía de la hora a la que corriera el cron: con el
 * horario actual (05:30 UTC = 00:30 local) coincidía por casualidad, pero mover el
 * cron a la tarde habría hecho que el día 15 o el 31 cayeran en la quincena equivocada.
 */
function quincenaDe(fecha: string): { inicio: string; fin: string } {
  const [y, m, day] = fecha.split('-').map(Number);
  const mm = String(m).padStart(2, '0');
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return day <= 15
    ? { inicio: `${y}-${mm}-01`, fin: `${y}-${mm}-15` }
    : { inicio: `${y}-${mm}-16`, fin: `${y}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

const normPlate = (p: unknown) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Trae todas las filas de una consulta paginando (PostgREST corta en 1000). */
async function fetchAll(build: (from: number, to: number) => any): Promise<any[]> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let p = 0; ; p++) {
    const { data, error } = await build(p * PAGE, (p + 1) * PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Mismo criterio que geotab-sync: el prefijo VITE_ es irrelevante fuera del bundle.
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({
      error: 'Sync no configurado',
      message: 'Faltan variables de entorno en Vercel',
      detalle: {
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
      },
      ayuda: 'Defina la URL (SUPABASE_URL o VITE_SUPABASE_URL) y la service role key, y vuelva a desplegar: Vercel solo aplica variables nuevas a despliegues posteriores.',
    });
  }

  const inicioQ = req.query.inicio as string | undefined;
  const finQ = req.query.fin as string | undefined;

  let rangos: { inicio: string; fin: string }[];
  if (inicioQ !== undefined || finQ !== undefined) {
    if (!ES_FECHA.test(inicioQ ?? '') || !ES_FECHA.test(finQ ?? '') || (inicioQ as string) > (finQ as string)) {
      return res.status(400).json({ error: 'Rango inválido', message: 'Use inicio/fin en formato YYYY-MM-DD' });
    }
    rangos = [{ inicio: inicioQ as string, fin: finQ as string }];
  } else {
    // Además de la quincena en curso se reprocesa la que contiene "hace 3 días".
    //
    // Sin eso, el ÚLTIMO DÍA de cada quincena se perdía siempre. El cron corre a las
    // 00:30 de Colombia: el día 31, al agregar la quincena 16→31, ese día 31 todavía no
    // tiene viajes; y a partir del día 1 la quincena en curso ya es otra, así que
    // 16→31 no se volvía a tocar nunca. Lo mismo con el día 15 de cada mes.
    //
    // Tres días es justo la ventana que `geotab-sync` mantiene fresca, así que cuando
    // se reprocesa la quincena anterior sus últimos días ya están completos y asentados.
    const actual = quincenaDe(fechaColombia(Date.now()));
    const anterior = quincenaDe(fechaColombia(Date.now() - 3 * 24 * 60 * 60 * 1000));
    rangos = anterior.inicio === actual.inicio ? [actual] : [actual, anterior];
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const resultados: any[] = [];
  const pendientes: { inicio: string; fin: string }[] = [];
  let huboError = false;
  const t0 = Date.now();

  // La quincena EN CURSO va primero a propósito. En los días de transición —los únicos
  // en que hay dos rangos— la nueva quincena lleva uno a tres días de datos, así que
  // despacha en segundos y deja presupuesto de sobra para la anterior, que sí es cara.
  // Al revés, la cara bloquearía a la barata y el informe del período nuevo se quedaría
  // vacío sus primeros tres días. Si aun así una queda pendiente, es la anterior, y
  // tiene seis oportunidades (tres días × dos corridas) para cerrarse.
  for (const r of rangos) {
    if (Date.now() - t0 > LIMITE_MS) {
      pendientes.push(r);
      continue;
    }
    try {
      resultados.push(await sincronizarQuincena(supabase, r.inicio, r.fin));
    } catch (error: any) {
      console.error(`geotab-ralenti-sync ${r.inicio}→${r.fin}:`, error);
      huboError = true;
      resultados.push({ success: false, periodo: r, error: error.message });
    }
  }

  // Con una sola quincena se conserva la forma de respuesta anterior (los campos van
  // también en la raíz), para no romper a quien ya consuma este endpoint.
  const primero = resultados[0] ?? {};
  return res.status(huboError ? 500 : 200).json({
    ...primero,
    success: !huboError && resultados.every(r => r.success !== false),
    timestamp: new Date().toISOString(),
    rangos: resultados,
    pendientes: pendientes.length ? pendientes : undefined,
  });
}

/**
 * Agrega una quincena concreta: escribe `ralentis_periodos` y `ralentis_eventos`.
 * Lanza si algo falla; el llamador decide qué hacer con el resto de las quincenas.
 */
async function sincronizarQuincena(
  supabase: ReturnType<typeof createClient<any>>,
  inicio: string,
  fin: string
): Promise<any> {
  const avisos: string[] = [];

  // ── 1. Maestro de vehículos: placa normalizada -> id ────────────────────
  const vehiculos = await fetchAll((from, to) =>
    supabase.from('vehiculos').select('id, placa').range(from, to));
  const idPorPlaca = new Map<string, string>();
  for (const v of vehiculos) idPorPlaca.set(normPlate(v.placa), v.id as string);

  // ── 2. Agregado de la quincena desde geotab_daily_metrics ───────────────
  const diarias = await fetchAll((from, to) =>
    supabase.from('geotab_daily_metrics')
      .select('fecha, placa, km, horas_conduccion, horas_ralenti, viajes')
      .gte('fecha', inicio).lte('fecha', fin).range(from, to));

  if (diarias.length === 0) {
    // No es un fallo: una quincena futura o sin sincronizar simplemente no tiene nada
    // que agregar. Se informa y se sigue con las demás.
    return {
      success: false,
      periodo: { inicio, fin },
      error: 'Sin datos en geotab_daily_metrics para el período',
      message: 'El cron horario /api/geotab-sync debe haber corrido antes para este rango.',
    };
  }

  type Agg = { km: number; conduccion: number; ralenti: number; viajes: number; dias: Set<string> };
  const porPlaca = new Map<string, Agg>();
  for (const d of diarias) {
    const k = normPlate(d.placa);
    if (!k) continue;
    const a = porPlaca.get(k) ?? { km: 0, conduccion: 0, ralenti: 0, viajes: 0, dias: new Set<string>() };
    a.km += Number(d.km) || 0;
    a.conduccion += Number(d.horas_conduccion) || 0;
    a.ralenti += Number(d.horas_ralenti) || 0;
    a.viajes += Number(d.viajes) || 0;
    a.dias.add(String(d.fecha));
    porPlaca.set(k, a);
  }

  // ── 3. Eventos individuales de ralentí (regla Idling) ───────────────────
  const evRes = await fetch(GEOTAB_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'idlingEvents',
      fromDate: `${inicio}T00:00:00.000${COLOMBIA_OFFSET}`,
      toDate: `${fin}T23:59:59.999${COLOMBIA_OFFSET}`,
    }),
  });
  let eventosGeotab: any[] = [];
  if (!evRes.ok) {
    avisos.push(`No se pudieron traer los eventos de ralentí (HTTP ${evRes.status}); se sincronizan solo los agregados.`);
  } else {
    const payload = await evRes.json();
    eventosGeotab = payload?.data?.events ?? [];
    if (!payload?.data?.rule) {
      avisos.push('MyGeotab no tiene una regla de ralentí configurada: no hay eventos individuales que sincronizar.');
    }
    if (payload?.data?.truncado) {
      avisos.push('Geotab devolvió el máximo de eventos del rango: el conteo de ralentís excesivos puede estar incompleto. Sincronice el período en tramos más cortos.');
    }
  }

  // Conteo de eventos por placa → alimenta `ralentis_excesivos`.
  const eventosPorPlaca = new Map<string, number>();
  const filasEventos: any[] = [];
  for (const e of eventosGeotab) {
    const k = normPlate(e.plate);
    const vehiculoId = idPorPlaca.get(k);
    if (!vehiculoId) continue;
    eventosPorPlaca.set(k, (eventosPorPlaca.get(k) ?? 0) + 1);
    filasEventos.push({
      vehiculo_id: vehiculoId,
      conductor_id: null, // Geotab imputa conductor en <4% de los viajes; no se inventa.
      placa: k,
      conductor_nombre: 'NO REGISTRA',
      fecha_inicio: e.from,
      fecha_fin: e.to,
      duracion_segundos: e.durationSeconds,
      galones_consumidos: 0,
      ubicacion: '',
      latitud: null,
      longitud: null,
      proveedor: 'GEOTAB',
      periodo_inicio: inicio,
      periodo_fin: fin,
    });
  }

  let eventosEscritos = 0;
  const BATCH = 500;
  for (let i = 0; i < filasEventos.length; i += BATCH) {
    const chunk = filasEventos.slice(i, i + BATCH);
    const { error } = await supabase
      .from('ralentis_eventos')
      .upsert(chunk, { onConflict: 'placa,fecha_inicio,proveedor' });
    if (error) throw new Error(`ralentis_eventos: ${error.message}`);
    eventosEscritos += chunk.length;
  }

  // ── 4. Precedencia: no pisar filas de Coltrack/Fagor ────────────────────
  const existentes = await fetchAll((from, to) =>
    supabase.from('ralentis_periodos')
      .select('vehiculo_id, fuente')
      .eq('periodo_inicio', inicio).eq('periodo_fin', fin).range(from, to));
  // fuente NULL = histórico Coltrack/Fagor previo a la migración → tampoco se pisa.
  const bloqueados = new Set(
    existentes.filter(r => String(r.fuente ?? '') !== 'GEOTAB').map(r => String(r.vehiculo_id))
  );

  const filasPeriodo: any[] = [];
  let sinVehiculo = 0;
  let omitidosPorPrecedencia = 0;
  for (const [placa, a] of porPlaca) {
    const vehiculoId = idPorPlaca.get(placa);
    if (!vehiculoId) { sinVehiculo++; continue; }
    if (bloqueados.has(vehiculoId)) { omitidosPorPrecedencia++; continue; }
    const motor = a.conduccion + a.ralenti; // ver decisión 1 en el encabezado
    if (motor <= 0 && a.ralenti <= 0) continue;
    filasPeriodo.push({
      vehiculo_id: vehiculoId,
      periodo_inicio: inicio,
      periodo_fin: fin,
      ralentis_excesivos: eventosPorPlaca.get(placa) ?? 0,
      horas_motor_encendido: Number(motor.toFixed(4)),
      horas_motor_ralenti: Number(a.ralenti.toFixed(4)),
      kms_recorridos: Number(a.km.toFixed(2)),
      consumo_combustible: 0, // ver decisión 2
      encendidos_apagados: 0,
      fuente: 'GEOTAB',
    });
  }

  let periodosEscritos = 0;
  for (let i = 0; i < filasPeriodo.length; i += BATCH) {
    const chunk = filasPeriodo.slice(i, i + BATCH);
    const { error } = await supabase
      .from('ralentis_periodos')
      .upsert(chunk, { onConflict: 'vehiculo_id,periodo_inicio,periodo_fin' });
    if (error) throw new Error(`ralentis_periodos: ${error.message}`);
    periodosEscritos += chunk.length;
  }

  if (sinVehiculo > 0) {
    avisos.push(`${sinVehiculo} placas de Geotab no existen en el maestro de vehículos y se omitieron.`);
  }
  if (omitidosPorPrecedencia > 0) {
    avisos.push(`${omitidosPorPrecedencia} vehículos ya tienen datos de Coltrack/Fagor en el período: se respetaron y Geotab no los sobrescribió.`);
  }

  return {
    success: true,
    periodo: { inicio, fin },
    diasConDatos: new Set(diarias.map(d => String(d.fecha))).size,
    vehiculos: { conMetricas: porPlaca.size, escritos: periodosEscritos, omitidosPorPrecedencia, sinVehiculo },
    eventos: { recibidos: eventosGeotab.length, escritos: eventosEscritos },
    avisos: avisos.length ? avisos : undefined,
  };
}
