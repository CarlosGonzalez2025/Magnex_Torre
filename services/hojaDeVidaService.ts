/**
 * hojaDeVidaService.ts
 *
 * Ensambla la HOJA DE VIDA del conductor en tiempo de LECTURA, agregando la
 * tabla maestra `conductores` (sincronizada desde Google Sheets) con los datos
 * que ya producen otros módulos + las tablas nuevas del ecosistema.
 *
 * REGLA DE ORO: este servicio es 100% de solo lectura sobre los módulos
 * existentes. No escribe, no altera y no depende de la lógica interna de
 * informes mensuales, ralentí, alertas ni inspecciones — solo consume sus datos.
 *
 * Fuentes:
 *   conductores                 -> identidad + documental (Sheet)
 *   reportes_conductores        -> desempeño mensual (FK conductor_id)
 *   alertas_diarias_gps         -> excesos / frenadas por día (FK conductor_id)
 *   ralentis_eventos            -> ralentí (FK conductor_id)
 *   preoperational_inspections  -> inspecciones (link débil por nombre)
 *   ml_driver_scores            -> riesgo relativo vs flota (complementario)
 *   conductor_campo_registros   -> comportamientos QR en campo [nueva]
 *   epp_entregas                -> EPP / dotación [nueva]
 *   conductor_scores            -> puntaje/semáforo (se calcula en Fase 4) [nueva]
 */

import { supabase } from './supabaseClient';
import {
  getVerificacionByCedula, getCapacitacionesByCedula,
  type VerificacionDoc, type CapacitacionesResumen,
} from './documentosService';

const VENTANA_DIAS_DEFAULT = 90;

// Trae todas las filas de una consulta paginando (PostgREST tope 1000 por request).
async function fetchAllRows<T = Record<string, unknown>>(query: any): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ── Clave canónica (mismo criterio que ml_driver_scores / api/agent.py) ───────
// La base trae a la misma persona con varias grafías; agrupar por el nombre
// crudo parte su exposición. Normalizamos para el link débil de inspecciones.
export function normalizeConductorKey(nombre: string): string {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ConductorRow {
  id: string;
  nombres: string;
  cedula: string;
  cargo?: string;
  base?: string;
  estado?: string;
  proyecto?: string;
  tipo_licencia?: string;
  fecha_exp_particular?: string | null;
  fecha_venc_particular?: string | null;
  fecha_exp_publica?: string | null;
  fecha_venc_publica?: string | null;
  fecha_exp_moto?: string | null;
  fecha_venc_moto?: string | null;
  fecha_cap_manejo_def?: string | null;
  fecha_cap_peligrosas?: string | null;
  fecha_cap_alturas?: string | null;
  fecha_cap_otro?: string | null;
  resultado_prueba_ingreso?: string;
  resultado_prueba_periodica?: string;
  tipo_competencias?: string;
  vigencia_competencias?: string | null;
  fecha_revision_simit?: string | null;
  tipo_comparendo?: string;
  valor_comparendo?: number;
  ibutton?: string;
  foto_url?: string | null;
  foto_sheet_url?: string | null;
  pdf_url?: string | null;
  carnet_token?: string | null;
  telemetria_ref_id?: string | null;
  en_sheet?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export type EstadoVigencia = 'vigente' | 'por_vencer' | 'vencido' | 'sin_dato';

export interface DocumentoVigencia {
  etiqueta: string;
  fecha: string | null;
  estado: EstadoVigencia;
  diasRestantes: number | null;
}

export interface DesempenoMensual {
  periodo_inicio: string;
  periodo_fin: string;
  calificacion: number | null;
  kms: number | null;
  horas_conduccion: number | null;
  excesos_total: number;
  frenadas_bruscas: number;
  aceleraciones_bruscas: number;
  placa_relacionada: string | null;
  proyecto: string | null;
}

export interface ResumenAlertas {
  eventos_totales: number;
  excesos_graves: number;
  excesos_moderados: number;
  frenadas_bruscas: number;
  velocidad_max: number;
  ultima_alerta: string | null;
}

export interface EventoTimeline {
  fecha: string;
  origen: 'alerta' | 'ralenti' | 'inspeccion' | 'campo' | 'mensual';
  tipo: string;
  detalle: string;
  severidad?: 'leve' | 'grave' | 'critico' | 'info';
}

export interface RegistroCampo {
  id: string;
  tipo_evento: string;
  severidad: string;
  descripcion: string;
  evidencia_url: string | null;
  latitud: number | null;
  longitud: number | null;
  registrado_por_nombre: string | null;
  created_at: string;
}

export interface EppEntrega {
  id: string;
  tipo_elemento: string;
  cantidad: number;
  talla: string | null;
  fecha_entrega: string;
  entregado_por_nombre: string | null;
  observaciones: string | null;
}

export interface ScoreSnapshot {
  puntaje: number;
  semaforo: 'VERDE' | 'AMARILLO' | 'ROJO';
  detonadores: string[];
  desglose: Array<{ factor: string; cantidad?: number; puntos?: number }>;
  fecha_calculo: string;
}

export interface MlRiesgo {
  risk_score: number;
  risk_nivel: string;
  tendencia: string;
  fecha_calculo: string;
}

export interface HojaDeVida {
  conductor: ConductorRow;
  licencias: DocumentoVigencia[];
  capacitaciones: DocumentoVigencia[];
  simit: {
    fecha_revision: string | null;
    tipo_comparendo: string | null;
    valor_comparendo: number;
    tiene_comparendo: boolean;
  };
  desempenoMensual: DesempenoMensual[];
  resumenAlertas: ResumenAlertas;
  ralentiEventos: number;
  inspecciones: Array<{ fecha: string; status: string; findings: number; placa: string }>;
  registrosCampo: RegistroCampo[];
  epp: EppEntrega[];
  score: ScoreSnapshot | null;   // null hasta Fase 4
  mlRiesgo: MlRiesgo | null;      // indicador complementario, NO es el puntaje
  verificacion: VerificacionDoc | null;      // fuente viva: Sheet de verificación documental
  capacitacionesMD: CapacitacionesResumen;   // fuente viva: Sheet de capacitaciones (manejo defensivo)
  timeline: EventoTimeline[];
}

// ── Utilidades de vigencia documental (cálculo puro, sin BD) ──────────────────

function calcVigencia(etiqueta: string, fecha: string | null | undefined): DocumentoVigencia {
  if (!fecha) return { etiqueta, fecha: null, estado: 'sin_dato', diasRestantes: null };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fecha);
  if (Number.isNaN(venc.getTime())) return { etiqueta, fecha, estado: 'sin_dato', diasRestantes: null };
  const dias = Math.round((venc.getTime() - hoy.getTime()) / 86_400_000);
  let estado: EstadoVigencia = 'vigente';
  if (dias < 0) estado = 'vencido';
  else if (dias <= 30) estado = 'por_vencer';
  return { etiqueta, fecha, estado, diasRestantes: dias };
}

function fechaLimiteVentana(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

// ── Listado de conductores (para el buscador) ─────────────────────────────────

export interface ConductorListItem {
  id: string;
  nombres: string;
  cedula: string;
  cargo: string | null;
  proyecto: string | null;
  estado: string | null;
  foto_url: string | null;
  en_sheet?: boolean;
}

export interface ListConductoresOpts {
  search?: string;
  proyecto?: string;               // filtro por contrato/proyecto
  incluirRetirados?: boolean;      // incluir los que ya no están en el Sheet (en_sheet=false)
  soloActivos?: boolean;
  page?: number;                   // 1-based
  pageSize?: number;
}

/** Listado paginado (estilo datatable) con filtros. Lee la tabla espejo hv_conductores. */
export async function listConductores(
  opts: ListConductoresOpts = {},
): Promise<{ data: ConductorListItem[]; total: number; error?: string }> {
  try {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = opts.pageSize ?? 25;
    const from = (page - 1) * pageSize;

    let query = supabase
      .from('hv_conductores')
      .select('id, nombres, cedula, cargo, proyecto, estado, foto_url, foto_sheet_url, en_sheet', { count: 'exact' })
      .order('nombres', { ascending: true });

    if (!opts.incluirRetirados) query = query.eq('en_sheet', true);
    if (opts.soloActivos) query = query.neq('estado', 'INACTIVO');
    if (opts.proyecto) query = query.eq('proyecto', opts.proyecto);
    if (opts.search && opts.search.trim()) {
      const s = opts.search.trim().replace(/,/g, ' ');
      query = query.or(`nombres.ilike.%${s}%,cedula.ilike.%${s}%`);
    }

    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    const items = (data ?? []).map((r: any) => ({
      id: r.id, nombres: r.nombres, cedula: r.cedula, cargo: r.cargo,
      proyecto: r.proyecto, estado: r.estado,
      foto_url: r.foto_url || r.foto_sheet_url || null,   // la del supervisor gana sobre la del Sheet
      en_sheet: r.en_sheet,
    })) as ConductorListItem[];
    return { data: items, total: count ?? 0 };
  } catch (e: unknown) {
    return { data: [], total: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Sincronización del espejo desde el Google Sheet (client-side) ─────────────
// Reutiliza el proxy /api/sheets-conductores (evita CORS del CSV) y hace el
// upsert por lotes con el cliente autenticado. Mismo patrón que googleSheetsService.

export interface SyncHvResult {
  success: boolean;
  sincronizados: number;
  retirados: number;
  conPuente: number;
  error?: string;
}

export async function sincronizarHvDesdeSheet(): Promise<SyncHvResult> {
  try {
    const apiBase = (import.meta as any).env?.VITE_API_BASE ?? '';
    const res = await fetch(`${apiBase}/api/sheets-conductores`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Proxy de conductores HTTP ${res.status}`);
    const json = await res.json() as { success: boolean; data: Array<Record<string, unknown>>; error?: string };
    if (!json.success) throw new Error(json.error ?? 'Error en el proxy de conductores');

    const filas = (json.data ?? []).filter(c => c.cedula);
    if (filas.length === 0) {
      return { success: false, sincronizados: 0, retirados: 0, conPuente: 0, error: 'El Sheet devolvió 0 conductores — sync cancelado.' };
    }

    const cedulas = filas.map(c => String(c.cedula).trim());

    // Puente a telemetría: cédula -> conductores(id) de la tabla vieja.
    const refMap = new Map<string, string>();
    for (let i = 0; i < cedulas.length; i += 300) {
      const chunk = cedulas.slice(i, i + 300);
      const { data } = await supabase.from('conductores').select('id, cedula').in('cedula', chunk);
      for (const r of (data ?? []) as Array<{ id: string; cedula: string }>) refMap.set(String(r.cedula).trim(), r.id);
    }

    const nowIso = new Date().toISOString();
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const str = (v: unknown) => (v == null ? null : String(v).trim() || null);

    const payloads = filas.map(c => {
      const cedula = String(c.cedula).trim();
      return {
        cedula,
        nombres: String(c.nombres ?? '').trim(),
        cargo: str(c.cargo), base: str(c.base),
        estado: String(c.estado ?? 'ACTIVO').trim().toUpperCase(),
        proyecto: str(c.proyecto), tipo_licencia: str(c.tipo_licencia),
        fecha_exp_particular: c.fecha_exp_particular ?? null, fecha_venc_particular: c.fecha_venc_particular ?? null,
        fecha_exp_publica: c.fecha_exp_publica ?? null, fecha_venc_publica: c.fecha_venc_publica ?? null,
        fecha_exp_moto: c.fecha_exp_moto ?? null, fecha_venc_moto: c.fecha_venc_moto ?? null,
        fecha_cap_manejo_def: c.fecha_cap_manejo_def ?? null, fecha_cap_peligrosas: c.fecha_cap_peligrosas ?? null,
        fecha_cap_alturas: c.fecha_cap_alturas ?? null, fecha_cap_otro: c.fecha_cap_otro ?? null,
        resultado_prueba_ingreso: str(c.resultado_prueba_ingreso),
        resultado_prueba_periodica: str(c.resultado_prueba_periodica),
        tipo_competencias: str(c.tipo_competencias), vigencia_competencias: c.vigencia_competencias ?? null,
        fecha_revision_simit: c.fecha_revision_simit ?? null,
        tipo_comparendo: str(c.tipo_comparendo), valor_comparendo: num(c.valor_comparendo),
        ibutton: str(c.ibutton),
        telemetria_ref_id: refMap.get(cedula) ?? null,
        en_sheet: true,
        updated_from_sheet_at: nowIso,
        updated_at: nowIso,
      };
    });

    // Upsert por lotes (por cédula). No incluye carnet_token ni foto_url → preservados.
    let sincronizados = 0;
    for (let i = 0; i < payloads.length; i += 500) {
      const chunk = payloads.slice(i, i + 500);
      const { error } = await supabase.from('hv_conductores').upsert(chunk, { onConflict: 'cedula', ignoreDuplicates: false });
      if (error) throw new Error(error.message);
      sincronizados += chunk.length;
    }

    // Soft-remove: los que ya no están en el Sheet.
    const setCed = new Set(cedulas);
    const existentes = await fetchAllRows<{ cedula: string }>(
      supabase.from('hv_conductores').select('cedula').eq('en_sheet', true),
    );
    const fuera = existentes.map(e => e.cedula).filter(ced => !setCed.has(ced));
    let retirados = 0;
    for (let i = 0; i < fuera.length; i += 200) {
      const chunk = fuera.slice(i, i + 200);
      const { error } = await supabase.from('hv_conductores').update({ en_sheet: false, updated_at: nowIso }).in('cedula', chunk);
      if (!error) retirados += chunk.length;
    }

    return { success: true, sincronizados, retirados, conPuente: refMap.size };
  } catch (e: unknown) {
    return { success: false, sincronizados: 0, retirados: 0, conPuente: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Nombres de contratos para el filtro (derivados de la tabla espejo hv_conductores). */
export async function listContratos(): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('hv_conductores')
      .select('proyecto')
      .eq('en_sheet', true)
      .not('proyecto', 'is', null);
    const set = new Set<string>();
    for (const r of (data ?? []) as Array<{ proyecto: string }>) {
      const p = (r.proyecto ?? '').trim();
      if (p) set.add(p);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

// ── Hoja de Vida completa de un conductor ─────────────────────────────────────

export async function getHojaDeVida(
  conductorId: string,
  ventanaDias: number = VENTANA_DIAS_DEFAULT,
): Promise<{ data: HojaDeVida | null; error?: string }> {
  try {
    // 1) Identidad (obligatoria) desde la tabla espejo limpia
    const { data: conductor, error: errCond } = await supabase
      .from('hv_conductores')
      .select('*')
      .eq('id', conductorId)
      .maybeSingle();
    if (errCond) throw errCond;
    if (!conductor) return { data: null, error: 'Conductor no encontrado' };

    const c = conductor as ConductorRow;
    // La foto del supervisor gana sobre la del Sheet.
    c.foto_url = c.foto_url || c.foto_sheet_url || null;
    const key = normalizeConductorKey(c.nombres);
    const desde = fechaLimiteVentana(ventanaDias);
    // Puente a telemetría: la tabla vieja `conductores` guarda alertas/ralentí/mensuales.
    const telemetriaId = c.telemetria_ref_id ?? null;

    // 2) El resto en paralelo. Cada fuente se aísla: si una falla, no tumba todo.
    const [
      reportesRes,
      alertasRes,
      ralentiRes,
      inspeccionesRes,
      campoRes,
      eppRes,
      scoreRes,
      mlRes,
    ] = await Promise.all([
      telemetriaId
        ? supabase
            .from('reportes_conductores')
            .select('periodo_inicio, periodo_fin, calificacion, kms, horas_conduccion, excesos_10_kph, excesos_20_kph, excesos_30_kph, excesos_40_kph, excesos_50_kph, excesos_60_kph, excesos_80_kph, aceleraciones_bruscas, frenadas_bruscas, placa_relacionada, proyecto')
            .eq('conductor_id', telemetriaId)
            .order('periodo_fin', { ascending: false })
            .then(r => r, () => ({ data: [], error: null }))
        : Promise.resolve({ data: [], error: null }),
      telemetriaId
        ? supabase
            .from('alertas_diarias_gps')
            .select('fecha, velocidad, infraccion_80_kmh, excesos_50_80_kmh, frenadas_bruscas, lugar')
            .eq('conductor_id', telemetriaId)
            .gte('fecha', desde)
            .order('fecha', { ascending: false })
            .then(r => r, () => ({ data: [], error: null }))
        : Promise.resolve({ data: [], error: null }),
      telemetriaId
        ? supabase
            .from('ralentis_eventos')
            .select('id', { count: 'exact', head: true })
            .eq('conductor_id', telemetriaId)
            .then(r => r, () => ({ count: 0, error: null }))
        : Promise.resolve({ count: 0, error: null }),
      supabase
        .from('preoperational_inspections')
        .select('inspection_date, status, findings_count, plate, driver')
        .ilike('driver', `%${c.nombres}%`)
        .order('inspection_date', { ascending: false })
        .limit(50)
        .then(r => r, () => ({ data: [], error: null })),
      supabase
        .from('conductor_campo_registros')
        .select('id, tipo_evento, severidad, descripcion, evidencia_url, latitud, longitud, registrado_por_nombre, created_at')
        .eq('conductor_id', conductorId)
        .order('created_at', { ascending: false })
        .then(r => r, () => ({ data: [], error: null })),
      supabase
        .from('epp_entregas')
        .select('id, tipo_elemento, cantidad, talla, fecha_entrega, entregado_por_nombre, observaciones')
        .eq('conductor_id', conductorId)
        .order('fecha_entrega', { ascending: false })
        .then(r => r, () => ({ data: [], error: null })),
      supabase
        .from('conductor_scores')
        .select('puntaje, semaforo, detonadores, desglose, fecha_calculo')
        .eq('conductor_id', conductorId)
        .order('fecha_calculo', { ascending: false })
        .limit(1)
        .then(r => r, () => ({ data: [], error: null })),
      supabase
        .from('ml_driver_scores')
        .select('risk_score, risk_nivel, tendencia, fecha_calculo')
        .eq('conductor_key', key)
        .order('fecha_calculo', { ascending: false })
        .limit(1)
        .then(r => r, () => ({ data: [], error: null })),
    ]);

    // ── Fuentes vivas: verificación documental + capacitaciones (por cédula) ───
    const [verificacion, capacitacionesMD] = await Promise.all([
      getVerificacionByCedula(c.cedula),
      getCapacitacionesByCedula(c.cedula),
    ]);

    // ── Licencias y capacitaciones (vigencias calculadas) ──────────────────────
    const licencias: DocumentoVigencia[] = [
      calcVigencia('Licencia particular', c.fecha_venc_particular),
      calcVigencia('Licencia pública', c.fecha_venc_publica),
      calcVigencia('Licencia motocicleta', c.fecha_venc_moto),
    ].filter(d => d.estado !== 'sin_dato');

    const capacitaciones: DocumentoVigencia[] = [
      calcVigencia('Manejo defensivo', c.fecha_cap_manejo_def),
      calcVigencia('Mercancías peligrosas', c.fecha_cap_peligrosas),
      calcVigencia('Trabajo en alturas', c.fecha_cap_alturas),
      calcVigencia('Otra capacitación', c.fecha_cap_otro),
      calcVigencia('Competencias laborales', c.vigencia_competencias),
    ].filter(d => d.estado !== 'sin_dato');

    // ── Desempeño mensual ──────────────────────────────────────────────────────
    const desempenoMensual: DesempenoMensual[] = ((reportesRes as any).data ?? []).map((r: any) => ({
      periodo_inicio: r.periodo_inicio,
      periodo_fin: r.periodo_fin,
      calificacion: r.calificacion,
      kms: r.kms,
      horas_conduccion: r.horas_conduccion,
      excesos_total:
        (r.excesos_10_kph ?? 0) + (r.excesos_20_kph ?? 0) + (r.excesos_30_kph ?? 0) +
        (r.excesos_40_kph ?? 0) + (r.excesos_50_kph ?? 0) + (r.excesos_60_kph ?? 0) +
        (r.excesos_80_kph ?? 0),
      frenadas_bruscas: r.frenadas_bruscas ?? 0,
      aceleraciones_bruscas: r.aceleraciones_bruscas ?? 0,
      placa_relacionada: r.placa_relacionada,
      proyecto: r.proyecto,
    }));

    // ── Resumen de alertas (misma semántica de exceso del asistente IA) ────────
    const alertas = ((alertasRes as any).data ?? []) as any[];
    let excGraves = 0, excModerados = 0, frenadas = 0, velMax = 0;
    for (const a of alertas) {
      const grave = (a.infraccion_80_kmh ?? 0) > 0 || (a.velocidad ?? 0) >= 80;
      const moderado = !grave && ((a.excesos_50_80_kmh ?? 0) > 0 || (a.velocidad ?? 0) >= 50);
      if (grave) excGraves++;
      else if (moderado) excModerados++;
      if ((a.frenadas_bruscas ?? 0) > 0) frenadas++;
      if ((a.velocidad ?? 0) > velMax) velMax = a.velocidad ?? 0;
    }
    const resumenAlertas: ResumenAlertas = {
      eventos_totales: alertas.length,
      excesos_graves: excGraves,
      excesos_moderados: excModerados,
      frenadas_bruscas: frenadas,
      velocidad_max: velMax,
      ultima_alerta: alertas[0]?.fecha ?? null,
    };

    // ── Inspecciones (link débil por nombre; se marca como aproximado) ─────────
    const inspecciones = ((inspeccionesRes as any).data ?? []).map((i: any) => ({
      fecha: i.inspection_date,
      status: i.status ?? '-',
      findings: i.findings_count ?? 0,
      placa: i.plate ?? '-',
    }));

    // ── Registros de campo y EPP ───────────────────────────────────────────────
    const registrosCampo = (((campoRes as any).data ?? []) as RegistroCampo[]);
    const epp = (((eppRes as any).data ?? []) as EppEntrega[]);

    // ── Score (Fase 4) y riesgo ML (complementario) ────────────────────────────
    const scoreRow = ((scoreRes as any).data ?? [])[0];
    const score: ScoreSnapshot | null = scoreRow
      ? {
          puntaje: Number(scoreRow.puntaje),
          semaforo: scoreRow.semaforo,
          detonadores: scoreRow.detonadores ?? [],
          desglose: scoreRow.desglose ?? [],
          fecha_calculo: scoreRow.fecha_calculo,
        }
      : null;

    const mlRow = ((mlRes as any).data ?? [])[0];
    const mlRiesgo: MlRiesgo | null = mlRow
      ? {
          risk_score: Number(mlRow.risk_score),
          risk_nivel: mlRow.risk_nivel,
          tendencia: mlRow.tendencia,
          fecha_calculo: mlRow.fecha_calculo,
        }
      : null;

    // ── Timeline unificado (recientes primero) ─────────────────────────────────
    const timeline: EventoTimeline[] = [];
    for (const a of alertas.slice(0, 30)) {
      const grave = (a.infraccion_80_kmh ?? 0) > 0 || (a.velocidad ?? 0) >= 80;
      timeline.push({
        fecha: a.fecha,
        origen: 'alerta',
        tipo: grave ? 'Exceso grave' : 'Exceso / evento',
        detalle: `${a.velocidad ?? 0} km/h${a.lugar ? ' · ' + a.lugar : ''}`,
        severidad: grave ? 'grave' : 'leve',
      });
    }
    for (const r of registrosCampo.slice(0, 30)) {
      timeline.push({
        fecha: r.created_at,
        origen: 'campo',
        tipo: `Campo: ${r.tipo_evento}`,
        detalle: r.descripcion,
        severidad: (r.severidad as any) ?? 'info',
      });
    }
    for (const i of inspecciones.slice(0, 15)) {
      timeline.push({
        fecha: i.fecha,
        origen: 'inspeccion',
        tipo: `Inspección: ${i.status}`,
        detalle: `${i.findings} hallazgos · ${i.placa}`,
        severidad: i.status && /sin|fuera/i.test(i.status) ? 'grave' : 'info',
      });
    }
    timeline.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    return {
      data: {
        conductor: c,
        licencias,
        capacitaciones,
        simit: {
          fecha_revision: c.fecha_revision_simit ?? null,
          tipo_comparendo: c.tipo_comparendo || null,
          valor_comparendo: Number(c.valor_comparendo ?? 0),
          tiene_comparendo: !!(c.tipo_comparendo && c.tipo_comparendo.trim()) || Number(c.valor_comparendo ?? 0) > 0,
        },
        desempenoMensual,
        resumenAlertas,
        ralentiEventos: (ralentiRes as any).count ?? 0,
        inspecciones,
        registrosCampo,
        epp,
        score,
        mlRiesgo,
        verificacion,
        capacitacionesMD,
        timeline: timeline.slice(0, 60),
      },
    };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}
