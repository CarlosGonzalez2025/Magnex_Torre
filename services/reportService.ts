import { supabase } from './supabaseClient';

const PAGE_SIZE = 1000;

function getLocalDateISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function fetchAllRows<T = Record<string, unknown>>(query: any): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows;
}

// ── Tipos de dominio ─────────────────────────────────────────────────────────

export interface FiltroReporte {
  conductorId?: string;
  vehiculoId?: string;
  fechaInicio: string;   // YYYY-MM-DD
  fechaFin: string;      // YYYY-MM-DD
  proyecto?: string;
  contratoId?: string;
  /** Conjunto de contratos (p.ej. los asociados a un cliente/grupo). Aplica filtro `in`. */
  contratoIds?: string[];
  reporteId?: string;
}

export interface ContratoOption {
  id: string;
  nombre: string;
  cliente?: string;
  proyecto?: string;
}

export interface ConductorOption {
  id: string;
  nombres: string;
  cedula: string;
  proyecto: string;
  contrato_id?: string | null;
}

export interface VehiculoOption {
  id: string;
  placa: string;
  cliente: string;
  contrato_id: string | null;
  gps_compañia?: string | null;
  tipo_activo?: string | null;
}

export interface MetricasExceso {
  excesos_10_kph: number;
  excesos_20_kph: number;
  excesos_30_kph: number;
  excesos_40_kph: number;
  excesos_50_kph: number;
  excesos_60_kph: number;
  excesos_80_kph: number;
}

export interface ReporteConductorData {
  conductor: {
    id: string;
    nombres: string;
    cedula: string;
    cargo: string;
    base: string;
    proyecto: string;
    estado: string;
    ibutton: string;
    tipo_comparendo: string;
    valor_comparendo: number;
    foto_url?: string;
    licencias: {
      tipo: string;
      fecha_exp_particular?: string;
      fecha_venc_particular?: string;
      fecha_exp_publica?: string;
      fecha_venc_publica?: string;
      fecha_exp_moto?: string;
      fecha_venc_moto?: string;
    };
    capacitaciones: {
      manejo_def?: string;
      peligrosas?: string;
      alturas?: string;
      otro?: string;
    };
  };
  metricas: MetricasExceso & {
    calificacion: number;
    kms: number;
    horas_conduccion: number;
    aceleraciones: number;
    frenadas: number;
    dias_evaluados: number;
    vehiculos_con_gps: number;
    vehiculos_sin_gps: number;
    placa_relacionada?: string;
  };
  ralenti?: {
    kms_recorridos: number;
    ralentis_excesivos: number;
    horas_motor_encendido: number;
    horas_motor_ralenti: number;
    consumo_combustible: number;
  };
  periodoInicio: string;
  periodoFin: string;
  fechaReporte: string;
  semaforo: 'verde' | 'amarillo' | 'rojo';
}

export interface ReporteVehiculoData {
  vehiculo: {
    id: string;
    placa: string;
    marca: string;
    linea: string;
    modelo: string;
    tipo_activo: string;
    tipo_combustible: string;
    estado: string;
    gps_compañia: string;
    cliente: string;
    fecha_venc_soat?: string;
    fecha_venc_rtm?: string;
    km_actual: number;
  };
  contrato?: {
    nombre: string;
    cliente: string;
    tipo: string;
    fecha_inicio: string;
    fecha_fin: string;
    kilometraje_pactado: number;
  };
  metricas: MetricasExceso & {
    calificacion: number;
    kms: number;
    horas_conduccion: number;
    aceleraciones: number;
    frenadas: number;
    dias_evaluados: number;
    dispositivo_gps?: string;
    estado_gps?: string;
    base?: string;
    maxima_vel_80_kph?: number;
  };
  ralenti: {
    kms_recorridos: number;
    encendidos_apagados: number;
    ralentis_excesivos: number;
    horas_motor_encendido: number;
    horas_motor_ralenti: number;
    consumo_combustible: number;
  };
  periodoInicio: string;
  periodoFin: string;
  fechaReporte: string;
  semaforo: 'verde' | 'amarillo' | 'rojo';
}

// ── Semáforo de calificación ─────────────────────────────────────────────────

export interface AlertaDiariaGps {
  id: string;
  placa: string;
  conductor: string;
  conductor_identificado: boolean;
  lugar: string;
  latitud: number;
  longitud: number;
  fecha: string;
  fecha_dia: string;
  velocidad: number;
  estado: string;
  infraccion_80_kmh: number;
  excesos_varios_parametros: number;
  excesos_50_80_kmh: number;
  frenadas_bruscas: number;
  contrato_nombre: string;
  gps: string;
  tipo_activo: string;
  cliente: string;
  vehiculo_id?: string | null;
  conductor_id?: string | null;
  contrato_id?: string | null;
}

export interface ResumenTipoVehiculoDiario {
  tipo: string;
  totalVehiculos: number;
  vehiculosConAlertas: number;
  porcentajeConAlertas: number;
  infracciones80: number;
  excesos50a80: number;
  excesosVarios: number;
  frenadas: number;
  totalAlertas: number;
}

export interface ReporteAlertasDiariasData {
  alertas: AlertaDiariaGps[];
  periodoInicio: string;
  periodoFin: string;
  fechaReporte: string;
  contrato?: ContratoOption;
  resumen: {
    totalAlertas: number;
    vehiculosActivosBase: number;
    vehiculosConAlertas: number;
    personasAutorizadas: number;
    personasIdentificadas: number;
    personasSinIdentificar: number;
    alertasSinConductorIdentificado: number;
    motocicletasConAlertas: number;
    vehiculosConGps: number;
    motocicletasConGps: number;
    infracciones80: number;
    excesosVarios: number;
    excesos50a80: number;
    frenadas: number;
    tiposVehiculo: ResumenTipoVehiculoDiario[];
  };
}

function semaforo(calificacion: number): 'verde' | 'amarillo' | 'rojo' {
  if (calificacion >= 85) return 'verde';
  if (calificacion >= 70) return 'amarillo';
  return 'rojo';
}

// ── Suma de campo numérico con reduce ────────────────────────────────────────

function sumar<T extends Record<string, unknown>>(arr: T[], campo: keyof T): number {
  return arr.reduce((acc, r) => acc + Number(r[campo] ?? 0), 0);
}

function promedio<T extends Record<string, unknown>>(arr: T[], campo: keyof T): number {
  if (arr.length === 0) return 0;
  return sumar(arr, campo) / arr.length;
}

// ── Consultas a Supabase ─────────────────────────────────────────────────────

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function tieneGpsConfigurado(value: unknown): boolean {
  const normalizado = normalizeText(value);
  return Boolean(normalizado) && !['NO', 'N/A', 'NA', 'SIN GPS', 'NINGUNO', 'NO APLICA', '0'].includes(normalizado);
}

// Valores de "conductor" que representan la ausencia de un conductor registrado.
const CONDUCTORES_SIN_IDENTIFICAR = [
  'NO REGISTRA', 'NOREGISTRA', 'SIN CONDUCTOR', 'NO IDENTIFICADO', 'SIN IDENTIFICAR',
  'N/A', 'NA', 'NINGUNO', 'DESCONOCIDO', 'SIN ASIGNAR', 'NO APLICA', 'SIN DATO',
];

/**
 * Un conductor está identificado cuando su nombre es un valor real (registrado),
 * no vacío ni un marcador de ausencia (N/A, "Sin conductor", "NO REGISTRA", etc.).
 * La identificación se decide por el NOMBRE, no por el flag `conductor_identificado`
 * de BD (que puede quedar en false aun habiendo conductor registrado).
 */
export function esConductorIdentificado(value: unknown): boolean {
  const txt = normalizeText(value);
  return Boolean(txt) && !CONDUCTORES_SIN_IDENTIFICAR.includes(txt);
}

function esMoto(tipo: unknown): boolean {
  return normalizeText(tipo).includes('MOTO');
}

function tipoVehiculoLabel(tipo: unknown): string {
  const label = String(tipo ?? '').trim();
  return label || 'Sin tipo registrado';
}

function tipoVehiculoKey(tipo: unknown): string {
  return normalizeText(tipoVehiculoLabel(tipo)) || 'SIN_TIPO_REGISTRADO';
}

export async function getConductores(): Promise<ConductorOption[]> {
  const query = supabase
    .from('conductores')
    .select('id, nombres, cedula, proyecto, contrato_id, estado')
    .eq('estado', 'ACTIVO')
    .order('nombres');
  const data = await fetchAllRows<Record<string, unknown>>(query);
  return data.map(({ estado: _estado, ...c }) => c) as unknown as ConductorOption[];
}

export async function getVehiculos(): Promise<VehiculoOption[]> {
  const query = supabase
    .from('vehiculos')
    .select('id, placa, cliente, contrato_id, gps_compañia, tipo_activo')
    .eq('estado', 'ACTIVO')
    .order('placa');
  const data = await fetchAllRows<Record<string, unknown>>(query);
  return data as unknown as VehiculoOption[];
}

export async function getContratos(): Promise<ContratoOption[]> {
  const query = supabase
    .from('contratos')
    .select('id, nombre, cliente, proyecto')
    .order('nombre');
  const data = await fetchAllRows<Record<string, unknown>>(query);
  return data as unknown as ContratoOption[];
}

export async function getProyectos(): Promise<string[]> {
  const query = supabase
    .from('conductores')
    .select('proyecto')
    .neq('proyecto', '');
  const data = await fetchAllRows<{ proyecto: string }>(query);
  const set = new Set(data.map((d: { proyecto: string }) => d.proyecto).filter(Boolean));
  return Array.from(set).sort() as string[];
}


// ── Reporte de conductor ─────────────────────────────────────────────────────

export async function getReporteConductor(filtro: FiltroReporte): Promise<ReporteConductorData | null> {
  if (!filtro.conductorId) return null;

  const { data: cond, error: eCond } = await supabase
    .from('conductores')
    .select('*')
    .eq('id', filtro.conductorId)
    .single();
  if (eCond || !cond) return null;
  if (String(cond.estado ?? '').toUpperCase() !== 'ACTIVO') return null;

  let metrics: Record<string, unknown>[] = [];
  if (filtro.reporteId) {
    const { data: rep } = await supabase
      .from('reportes_conductores')
      .select('*')
      .eq('id', filtro.reporteId)
      .single();
    if (rep) {
      metrics = [{
        ...rep,
        aceleraciones: rep.aceleraciones ?? rep.aceleraciones_bruscas,
        frenadas: rep.frenadas ?? rep.frenadas_bruscas,
        fecha: rep.periodo_inicio,
      }];
    }
  } else {
    // 1. Fuente primaria: reportes_conductores (resúmenes mensuales authoritativos).
    //    coltrack_datos_conductor puede tener registros desactualizados con fecha=inicio
    //    del período que representan el mes completo y no solo el rango solicitado.
    const { data: reportesPrimary } = await supabase
      .from('reportes_conductores')
      .select('*')
      .eq('conductor_id', filtro.conductorId)
      .gte('periodo_inicio', filtro.fechaInicio)
      .lte('periodo_fin', filtro.fechaFin);

    if (reportesPrimary && reportesPrimary.length > 0) {
      metrics = (reportesPrimary as Record<string, unknown>[]).map(r => ({
        ...r,
        aceleraciones: r.aceleraciones ?? r.aceleraciones_bruscas,
        frenadas: r.frenadas ?? r.frenadas_bruscas,
        fecha: r.periodo_inicio,
      }));
    } else {
      // 2. Fallback: coltrack_datos_conductor (registros diarios individuales)
      const { data: metricsRaw } = await supabase
        .from('coltrack_datos_conductor')
        .select('*')
        .eq('conductor_id', filtro.conductorId)
        .gte('fecha', filtro.fechaInicio)
        .lte('fecha', filtro.fechaFin);
      metrics = (metricsRaw ?? []) as Record<string, unknown>[];
    }
  }
  const calificacion = metrics.length > 0 ? promedio(metrics, 'calificacion') : 0;
  const kms = sumar(metrics, 'kms');
  const horas_conduccion = sumar(metrics, 'horas_conduccion');

  const metricas = {
    calificacion: Math.round(calificacion * 100) / 100,
    kms: Math.round(kms * 100) / 100,
    horas_conduccion: Math.round(horas_conduccion * 100) / 100,
    excesos_10_kph: sumar(metrics, 'excesos_10_kph'),
    excesos_20_kph: sumar(metrics, 'excesos_20_kph'),
    excesos_30_kph: sumar(metrics, 'excesos_30_kph'),
    excesos_40_kph: sumar(metrics, 'excesos_40_kph'),
    excesos_50_kph: sumar(metrics, 'excesos_50_kph'),
    excesos_60_kph: sumar(metrics, 'excesos_60_kph'),
    excesos_80_kph: sumar(metrics, 'excesos_80_kph'),
    aceleraciones: sumar(metrics, 'aceleraciones'),
    frenadas: sumar(metrics, 'frenadas'),
    dias_evaluados: metrics.length,
    vehiculos_con_gps: 0,
    vehiculos_sin_gps: 0,
    placa_relacionada: metrics.length > 0 ? String(metrics[metrics.length - 1].ibutton ?? '') : '',
  };

  return {
    conductor: {
      id: cond.id as string,
      nombres: cond.nombres as string,
      cedula: cond.cedula as string,
      cargo: cond.cargo as string ?? '',
      base: cond.base as string ?? '',
      proyecto: cond.proyecto as string ?? '',
      estado: cond.estado as string ?? 'ACTIVO',
      ibutton: cond.ibutton as string ?? '',
      tipo_comparendo: cond.tipo_comparendo as string ?? '',
      valor_comparendo: Number(cond.valor_comparendo ?? 0),
      foto_url: cond.foto_url as string ?? '',
      licencias: {
        tipo: cond.tipo_licencia as string ?? '',
        fecha_exp_particular: cond.fecha_exp_particular as string,
        fecha_venc_particular: cond.fecha_venc_particular as string,
        fecha_exp_publica: cond.fecha_exp_publica as string,
        fecha_venc_publica: cond.fecha_venc_publica as string,
        fecha_exp_moto: cond.fecha_exp_moto as string,
        fecha_venc_moto: cond.fecha_venc_moto as string,
      },
      capacitaciones: {
        manejo_def: cond.fecha_cap_manejo_def as string,
        peligrosas: cond.fecha_cap_peligrosas as string,
        alturas: cond.fecha_cap_alturas as string,
        otro: cond.fecha_cap_otro as string,
      },
    },
    metricas,
    periodoInicio: filtro.fechaInicio,
    periodoFin: filtro.fechaFin,
    fechaReporte: getLocalDateISO(),
    semaforo: semaforo(metricas.calificacion),
  };
}

// ── Reporte de vehículo ───────────────────────────────────────────────────────

export async function getReporteVehiculo(filtro: FiltroReporte): Promise<ReporteVehiculoData | null> {
  if (!filtro.vehiculoId) return null;

  const { data: veh, error: eVeh } = await supabase
    .from('vehiculos')
    .select('*, contratos(*)')
    .eq('id', filtro.vehiculoId)
    .single();
  if (eVeh || !veh) return null;
  if (String(veh.estado ?? '').toUpperCase() !== 'ACTIVO') return null;

  let metrics: Record<string, unknown>[] = [];
  let ralentisData: Record<string, unknown>[] = [];

  if (filtro.reporteId) {
    const { data: rep } = await supabase
      .from('reportes_vehiculos')
      .select('*')
      .eq('id', filtro.reporteId)
      .single();
    if (rep) {
      metrics = [{
        ...rep,
        aceleraciones: rep.aceleraciones ?? rep.aceleraciones_bruscas,
        frenadas: rep.frenadas ?? rep.frenadas_bruscas,
        fecha: rep.periodo_inicio,
      }];
      ralentisData = [{
        ...rep,
        kms_recorridos: rep.kms ?? rep.km_recorridos_ralenti,
        horas_motor_ralenti: rep.horas_motor_ralenti,
        horas_motor_encendido: rep.horas_motor_encendido,
        consumo_combustible: rep.consumo_combustible,
      }];
    }
  } else {
    // 1. Fuente primaria métricas de conducción: reportes_vehiculos (contención estricta)
    const { data: reportesPrimary } = await supabase
      .from('reportes_vehiculos')
      .select('*')
      .eq('vehiculo_id', filtro.vehiculoId)
      .gte('periodo_inicio', filtro.fechaInicio)
      .lte('periodo_fin', filtro.fechaFin);

    if (reportesPrimary && reportesPrimary.length > 0) {
      metrics = (reportesPrimary as Record<string, unknown>[]).map(r => ({
        ...r,
        aceleraciones: r.aceleraciones ?? r.aceleraciones_bruscas,
        frenadas: r.frenadas ?? r.frenadas_bruscas,
        fecha: r.periodo_inicio,
      }));
    } else {
      // Fallback: coltrack_datos_vehiculo (registros diarios)
      const { data: metricsRaw } = await supabase
        .from('coltrack_datos_vehiculo')
        .select('*')
        .eq('vehiculo_id', filtro.vehiculoId)
        .gte('fecha', filtro.fechaInicio)
        .lte('fecha', filtro.fechaFin);
      metrics = (metricsRaw ?? []) as Record<string, unknown>[];
    }

    // 2. Fuente primaria ralentís: ralentis_periodos (tabla dedicada, 1 registro por período)
    //    Garantía: clave única vehiculo_id+periodo_inicio+periodo_fin → sin duplicados jamás
    const { data: ralentiPeriodo } = await supabase
      .from('ralentis_periodos')
      .select('*')
      .eq('vehiculo_id', filtro.vehiculoId)
      .eq('periodo_inicio', filtro.fechaInicio)
      .eq('periodo_fin', filtro.fechaFin)
      .maybeSingle();

    if (ralentiPeriodo) {
      ralentisData = [ralentiPeriodo as Record<string, unknown>];
    } else if (metrics.length > 0 && (metrics[0].horas_motor_ralenti || metrics[0].km_recorridos_ralenti)) {
      // Fallback: campos de ralentí embebidos en reportes_vehiculos (imports anteriores)
      ralentisData = (metrics as Record<string, unknown>[]).map(r => ({
        kms_recorridos: r.kms ?? r.km_recorridos_ralenti ?? 0,
        horas_motor_ralenti: r.horas_motor_ralenti ?? 0,
        horas_motor_encendido: r.horas_motor_encendido ?? 0,
        consumo_combustible: r.consumo_combustible ?? 0,
        ralentis_excesivos: r.ralentis_excesivos ?? 0,
        encendidos_apagados: r.encendidos_apagados ?? 0,
      }));
    } else {
      // Fallback: tabla ralentis diaria (imports vía Excel estándar)
      const { data: ralentiRaw } = await supabase
        .from('ralentis')
        .select('*')
        .eq('vehiculo_id', filtro.vehiculoId)
        .gte('fecha', filtro.fechaInicio)
        .lte('fecha', filtro.fechaFin);
      ralentisData = (ralentiRaw ?? []) as Record<string, unknown>[];
    }
  }

  const calificacion = metrics.length > 0 ? promedio(metrics, 'calificacion') : 0;
  const contrato = veh.contratos as Record<string, unknown> | null;

  const metricas = {
    calificacion: Math.round(calificacion * 100) / 100,
    kms: Math.round(sumar(metrics, 'kms') * 100) / 100,
    horas_conduccion: Math.round(sumar(metrics, 'horas_conduccion') * 100) / 100,
    excesos_10_kph: sumar(metrics, 'excesos_10_kph'),
    excesos_20_kph: sumar(metrics, 'excesos_20_kph'),
    excesos_30_kph: sumar(metrics, 'excesos_30_kph'),
    excesos_40_kph: sumar(metrics, 'excesos_40_kph'),
    excesos_50_kph: sumar(metrics, 'excesos_50_kph'),
    excesos_60_kph: sumar(metrics, 'excesos_60_kph'),
    excesos_80_kph: sumar(metrics, 'excesos_80_kph'),
    aceleraciones: sumar(metrics, 'aceleraciones'),
    frenadas: sumar(metrics, 'frenadas'),
    dias_evaluados: metrics.length,
    dispositivo_gps: metrics.length > 0 ? String(metrics[0].gps_proveedor ?? '') : '',
    estado_gps: '',
    base: veh.lugar as string ?? '',
    maxima_vel_80_kph: metrics.length > 0 ? Math.max(...metrics.map(m => Number(m.maxima_vel_80_kph ?? 0))) : 0,
  };

  const ralenti = {
    kms_recorridos: Math.round(sumar(ralentisData, 'kms_recorridos') * 100) / 100,
    encendidos_apagados: sumar(ralentisData, 'encendidos_apagados'),
    ralentis_excesivos: sumar(ralentisData, 'ralentis_excesivos'),
    horas_motor_encendido: Math.round(sumar(ralentisData, 'horas_motor_encendido') * 100) / 100,
    horas_motor_ralenti: Math.round(sumar(ralentisData, 'horas_motor_ralenti') * 100) / 100,
    consumo_combustible: Math.round(sumar(ralentisData, 'consumo_combustible') * 100) / 100,
  };

  return {
    vehiculo: {
      id: veh.id as string,
      placa: veh.placa as string,
      marca: veh.marca as string ?? '',
      linea: veh.linea as string ?? '',
      modelo: veh.modelo as string ?? '',
      tipo_activo: veh.tipo_activo as string ?? '',
      tipo_combustible: veh.tipo_combustible as string ?? '',
      estado: veh.estado as string ?? 'ACTIVO',
      gps_compañia: veh.gps_compañia as string ?? '',
      cliente: veh.cliente as string ?? '',
      fecha_venc_soat: veh.fecha_venc_soat as string,
      fecha_venc_rtm: veh.fecha_venc_rtm as string,
      km_actual: Number(veh.km_actual ?? 0),
    },
    contrato: contrato ? {
      nombre: contrato.nombre as string,
      cliente: contrato.cliente as string,
      tipo: contrato.tipo as string,
      fecha_inicio: contrato.fecha_inicio as string,
      fecha_fin: contrato.fecha_fin as string,
      kilometraje_pactado: Number(contrato.kilometraje_pactado ?? 0),
    } : undefined,
    metricas,
    ralenti,
    periodoInicio: filtro.fechaInicio,
    periodoFin: filtro.fechaFin,
    fechaReporte: getLocalDateISO(),
    semaforo: semaforo(metricas.calificacion),
  };
}

// ── Listado de reportes guardados ────────────────────────────────────────────

async function listarReportesConductoresDesdeColtrack(filtro: Partial<FiltroReporte>): Promise<Record<string, unknown>[]> {
  let q = supabase
    .from('coltrack_datos_conductor')
    .select('*, conductores!inner(id, nombres, cedula, proyecto, contrato_id, estado)')
    .order('fecha', { ascending: false });

  const contratoIds = filtro.contratoIds?.filter(Boolean) ?? [];
  if (filtro.conductorId) q = q.eq('conductor_id', filtro.conductorId);
  if (filtro.fechaInicio) q = q.gte('fecha', filtro.fechaInicio);
  if (filtro.fechaFin) q = q.lte('fecha', filtro.fechaFin);
  if (filtro.proyecto) q = q.eq('conductores.proyecto', filtro.proyecto);
  if (filtro.contratoId) q = q.eq('conductores.contrato_id', filtro.contratoId);
  else if (contratoIds.length > 0) q = q.in('conductores.contrato_id', contratoIds);

  const data = await fetchAllRows<Record<string, unknown>>(q);

  const grupos = new Map<string, Record<string, unknown> & { _calificaciones: number[] }>();
  for (const row of data) {
    const conductor = row.conductores as Record<string, unknown> | null;
    if (!conductor || normalizeText(conductor.estado) !== 'ACTIVO') continue;

    const fecha = String(row.fecha ?? '').slice(0, 10);
    const mes = fecha ? fecha.slice(0, 7) : String(row.mes ?? '');
    const conductorId = String(row.conductor_id ?? conductor.id ?? '');
    // Cuando hay un rango de fechas explícito, agrupa todo el período en una sola fila
    // (evita dividir períodos cross-mes como 29/04–28/05 en dos filas de calendario)
    const useRangePeriod = !!(filtro.fechaInicio && filtro.fechaFin);
    const key = useRangePeriod ? conductorId : `${conductorId}|${mes}`;

    if (!grupos.has(key)) {
      grupos.set(key, {
        conductor_id: conductorId,
        conductores: {
          nombres: conductor.nombres,
          cedula: conductor.cedula,
          contrato_id: conductor.contrato_id,
        },
        periodo_inicio: useRangePeriod ? filtro.fechaInicio! : fecha,
        periodo_fin: useRangePeriod ? filtro.fechaFin! : fecha,
        mes: useRangePeriod ? (filtro.fechaInicio?.slice(0, 7) ?? mes) : mes,
        calificacion: 0,
        kms: 0,
        horas_conduccion: 0,
        excesos_10_kph: 0,
        excesos_20_kph: 0,
        excesos_30_kph: 0,
        excesos_40_kph: 0,
        excesos_50_kph: 0,
        excesos_60_kph: 0,
        excesos_80_kph: 0,
        aceleraciones_bruscas: 0,
        frenadas_bruscas: 0,
        proyecto: String(conductor.proyecto ?? row.proyecto ?? ''),
        fecha_reporte: getLocalDateISO(),
        _calificaciones: [],
      });
    }

    const acc = grupos.get(key)!;
    // Solo actualizar periodo_inicio/fin dinámicamente cuando NO usamos rango fijo
    if (!useRangePeriod && fecha) {
      const inicio = String(acc.periodo_inicio || fecha);
      const fin = String(acc.periodo_fin || fecha);
      acc.periodo_inicio = fecha < inicio ? fecha : inicio;
      acc.periodo_fin = fecha > fin ? fecha : fin;
    }

    const calificacion = Number(row.calificacion ?? 0);
    if (calificacion > 0) acc._calificaciones.push(calificacion);
    for (const campo of [
      'kms',
      'horas_conduccion',
      'excesos_10_kph',
      'excesos_20_kph',
      'excesos_30_kph',
      'excesos_40_kph',
      'excesos_50_kph',
      'excesos_60_kph',
      'excesos_80_kph',
    ]) {
      acc[campo] = Number(acc[campo] ?? 0) + Number(row[campo] ?? 0);
    }
    acc.aceleraciones_bruscas = Number(acc.aceleraciones_bruscas ?? 0) + Number(row.aceleraciones ?? 0);
    acc.frenadas_bruscas = Number(acc.frenadas_bruscas ?? 0) + Number(row.frenadas ?? 0);
  }

  return Array.from(grupos.values()).map(({ _calificaciones, ...row }) => ({
    ...row,
    calificacion: _calificaciones.length
      ? Math.round((_calificaciones.reduce((a, b) => a + b, 0) / _calificaciones.length) * 100) / 100
      : 0,
  }));
}

export async function listarReportesConductores(filtro: Partial<FiltroReporte> & { mes?: string }) {
  // Incluir 'estado' en el select para poder filtrar inactivos del lado del cliente también
  const contratoIds = filtro.contratoIds?.filter(Boolean) ?? [];
  const usaContratoJoin = Boolean(filtro.contratoId) || contratoIds.length > 0;
  const select = usaContratoJoin
    ? '*, conductores!inner(nombres, cedula, contrato_id, estado)'
    : '*, conductores(nombres, cedula, contrato_id, estado)';
  let q = supabase
    .from('reportes_conductores')
    .select(select)
    .order('fecha_reporte', { ascending: false });

  if (filtro.conductorId) q = q.eq('conductor_id', filtro.conductorId);
  if (filtro.proyecto) q = q.eq('proyecto', filtro.proyecto);
  if (filtro.contratoId) q = q.eq('conductores.contrato_id', filtro.contratoId);
  else if (contratoIds.length > 0) q = q.in('conductores.contrato_id', contratoIds);
  // Excluir conductores inactivos: no deben aparecer en informes mensuales
  q = q.eq('conductores.estado', 'ACTIVO');
  if (filtro.fechaInicio && filtro.fechaFin) {
    // Contención estricta: solo registros cuyo período cae COMPLETAMENTE dentro del rango.
    // El overlap traía registros de meses calendario (Abr 1-30, May 1-31) que parcialmente
    // solapan con períodos custom (29/04-28/05), mostrando datos incorrectos del período anterior.
    q = q.gte('periodo_inicio', filtro.fechaInicio).lte('periodo_fin', filtro.fechaFin);
  } else if (filtro.mes) {
    q = q.eq('mes', filtro.mes);
  }

  const data = await fetchAllRows<Record<string, unknown>>(q);
  // Doble verificación cliente: descartar cualquier fila cuyo conductor no sea ACTIVO
  const activos = data.filter(row => {
    const cond = row.conductores as Record<string, unknown> | null;
    if (!cond) return false;
    return normalizeText(String(cond.estado ?? '')).toUpperCase() === 'ACTIVO';
  });
  if (activos.length > 0) return activos;
  return listarReportesConductoresDesdeColtrack(filtro);
}

async function listarReportesVehiculosDesdeColtrack(filtro: Partial<FiltroReporte>): Promise<Record<string, unknown>[]> {
  const contratoIds = filtro.contratoIds?.filter(Boolean) ?? [];
  const usaContratoJoin = Boolean(filtro.contratoId) || contratoIds.length > 0;
  const select = usaContratoJoin
    ? '*, vehiculos!inner(id, placa, marca, tipo_activo, contrato_id, estado, lugar, cliente)'
    : '*, vehiculos(id, placa, marca, tipo_activo, contrato_id, estado, lugar, cliente)';
  let q = supabase
    .from('coltrack_datos_vehiculo')
    .select(select)
    .order('fecha', { ascending: false });

  if (filtro.vehiculoId) q = q.eq('vehiculo_id', filtro.vehiculoId);
  if (filtro.fechaInicio) q = q.gte('fecha', filtro.fechaInicio);
  if (filtro.fechaFin) q = q.lte('fecha', filtro.fechaFin);
  if (filtro.proyecto) q = q.eq('vehiculos.cliente', filtro.proyecto);
  if (filtro.contratoId) q = q.eq('vehiculos.contrato_id', filtro.contratoId);
  else if (contratoIds.length > 0) q = q.in('vehiculos.contrato_id', contratoIds);

  const data = await fetchAllRows<Record<string, unknown>>(q);

  // También obtener datos de ralentí para el mismo periodo
  let dataRalenti: Record<string, unknown>[] = [];
  if (filtro.fechaInicio && filtro.fechaFin) {
    let qRalenti = supabase
      .from('ralentis')
      .select('*')
      .gte('fecha', filtro.fechaInicio)
      .lte('fecha', filtro.fechaFin);
    if (filtro.vehiculoId) qRalenti = qRalenti.eq('vehiculo_id', filtro.vehiculoId);
    dataRalenti = await fetchAllRows<Record<string, unknown>>(qRalenti);
  }

  // Mapear ralentís por vehiculo_id + fecha
  const ralentiMap = new Map<string, Record<string, unknown>>();
  for (const r of dataRalenti) {
    const key = `${r.vehiculo_id}|${String(r.fecha).slice(0, 10)}`;
    ralentiMap.set(key, r);
  }

  const grupos = new Map<string, Record<string, unknown> & { _calificaciones: number[] }>();
  for (const row of data) {
    const vehiculo = row.vehiculos as Record<string, unknown> | null;
    if (!vehiculo || normalizeText(vehiculo.estado) !== 'ACTIVO') continue;

    const fecha = String(row.fecha ?? '').slice(0, 10);
    const mes = fecha ? fecha.slice(0, 7) : String(row.mes ?? '');
    const vehiculoId = String(row.vehiculo_id ?? vehiculo.id ?? '');
    // Cuando hay un rango de fechas explícito, agrupa todo el período en una sola fila
    const useRangePeriod = !!(filtro.fechaInicio && filtro.fechaFin);
    const key = useRangePeriod ? vehiculoId : `${vehiculoId}|${mes}`;

    if (!grupos.has(key)) {
      grupos.set(key, {
        vehiculo_id: vehiculoId,
        vehiculos: {
          placa: vehiculo.placa,
          marca: vehiculo.marca,
          tipo_activo: vehiculo.tipo_activo,
          contrato_id: vehiculo.contrato_id,
        },
        periodo_inicio: useRangePeriod ? filtro.fechaInicio! : fecha,
        periodo_fin: useRangePeriod ? filtro.fechaFin! : fecha,
        mes: useRangePeriod ? (filtro.fechaInicio?.slice(0, 7) ?? mes) : mes,
        calificacion: 0,
        kms: 0,
        horas_conduccion: 0,
        excesos_10_kph: 0,
        excesos_20_kph: 0,
        excesos_30_kph: 0,
        excesos_40_kph: 0,
        excesos_50_kph: 0,
        excesos_60_kph: 0,
        excesos_80_kph: 0,
        aceleraciones_bruscas: 0,
        frenadas_bruscas: 0,
        horas_motor_ralenti: 0,
        proyecto: String(vehiculo.cliente ?? row.proyecto ?? ''),
        base: String(vehiculo.lugar ?? ''),
        fecha_reporte: getLocalDateISO(),
        _calificaciones: [],
      });
    }

    const acc = grupos.get(key)!;
    // Solo actualizar periodo_inicio/fin dinámicamente cuando NO usamos rango fijo
    if (!useRangePeriod && fecha) {
      const inicio = String(acc.periodo_inicio || fecha);
      const fin = String(acc.periodo_fin || fecha);
      acc.periodo_inicio = fecha < inicio ? fecha : inicio;
      acc.periodo_fin = fecha > fin ? fecha : fin;
    }

    const calificacion = Number(row.calificacion ?? 0);
    if (calificacion > 0) acc._calificaciones.push(calificacion);
    for (const campo of [
      'kms',
      'horas_conduccion',
      'excesos_10_kph',
      'excesos_20_kph',
      'excesos_30_kph',
      'excesos_40_kph',
      'excesos_50_kph',
      'excesos_60_kph',
      'excesos_80_kph',
    ]) {
      acc[campo] = Number(acc[campo] ?? 0) + Number(row[campo] ?? 0);
    }
    acc.aceleraciones_bruscas = Number(acc.aceleraciones_bruscas ?? 0) + Number(row.aceleraciones ?? 0);
    acc.frenadas_bruscas = Number(acc.frenadas_bruscas ?? 0) + Number(row.frenadas ?? 0);

    // Sumar ralentís
    const rKey = `${vehiculoId}|${fecha}`;
    const ral = ralentiMap.get(rKey);
    if (ral) {
      acc.horas_motor_ralenti = Number(acc.horas_motor_ralenti ?? 0) + Number(ral.horas_motor_ralenti ?? 0);
    }
  }

  return Array.from(grupos.values()).map(({ _calificaciones, ...row }) => ({
    ...row,
    calificacion: _calificaciones.length
      ? Math.round((_calificaciones.reduce((a, b) => a + b, 0) / _calificaciones.length) * 100) / 100
      : 0,
  }));
}

export async function listarReportesVehiculos(filtro: Partial<FiltroReporte> & { mes?: string }) {
  // Incluir 'estado' en el select para poder filtrar inactivos del lado del cliente también
  const contratoIds = filtro.contratoIds?.filter(Boolean) ?? [];
  let q = supabase
    .from('reportes_vehiculos')
    .select('*, vehiculos(placa, marca, tipo_activo, estado), contratos(nombre)')
    .order('fecha_reporte', { ascending: false });

  if (filtro.vehiculoId) q = q.eq('vehiculo_id', filtro.vehiculoId);
  if (filtro.proyecto) q = q.eq('proyecto', filtro.proyecto);
  if (filtro.contratoId) q = q.eq('contrato_id', filtro.contratoId);
  else if (contratoIds.length > 0) q = q.in('contrato_id', contratoIds);
  // Excluir vehículos inactivos: no deben aparecer en informes mensuales
  q = q.eq('vehiculos.estado', 'ACTIVO');
  if (filtro.fechaInicio && filtro.fechaFin) {
    // Contención estricta: solo registros cuyo período cae COMPLETAMENTE dentro del rango.
    // El overlap traía registros de meses calendario (Abr 1-30, May 1-31) que parcialmente
    // solapan con períodos custom (29/04-28/05), mostrando datos incorrectos del período anterior.
    q = q.gte('periodo_inicio', filtro.fechaInicio).lte('periodo_fin', filtro.fechaFin);
  } else if (filtro.mes) {
    q = q.eq('mes', filtro.mes);
  }

  const data = await fetchAllRows<Record<string, unknown>>(q);
  // Doble verificación cliente: descartar cualquier fila cuyo vehículo no sea ACTIVO
  const activos = data.filter(row => {
    const veh = row.vehiculos as Record<string, unknown> | null;
    if (!veh) return false;
    return normalizeText(String(veh.estado ?? '')).toUpperCase() === 'ACTIVO';
  });
  if (activos.length > 0) return activos;
  return listarReportesVehiculosDesdeColtrack(filtro);
}

export async function getReporteAlertasDiarias(filtro: Pick<FiltroReporte, 'fechaInicio' | 'fechaFin' | 'contratoId'>): Promise<ReporteAlertasDiariasData | null> {
  let q = supabase
    .from('alertas_diarias_gps')
    .select('*')
    .gte('fecha_dia', filtro.fechaInicio)
    .lte('fecha_dia', filtro.fechaFin)
    .not('vehiculo_id', 'is', null)
    .order('fecha', { ascending: true });

  if (filtro.contratoId) q = q.eq('contrato_id', filtro.contratoId);

  const data = await fetchAllRows<Record<string, unknown>>(q);

  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return null;

  const vehiculoIds = Array.from(new Set(rows.map(r => String(r.vehiculo_id ?? '')).filter(Boolean)));
  let vehiculosActivos: Record<string, Record<string, unknown>> = {};
  if (vehiculoIds.length > 0) {
    const { data: vehs, error: vehError } = await supabase
      .from('vehiculos')
      .select('id, placa, estado, contrato_id, tipo_activo, cliente, gps_compañia')
      .in('id', vehiculoIds);
    if (vehError) throw new Error(vehError.message);
    vehiculosActivos = Object.fromEntries(
      ((vehs as unknown as Record<string, unknown>[]) ?? [])
        .filter((v) => normalizeText(v.estado) === 'ACTIVO')
        .map((v) => [String(v.id), v])
    );
  }

  const alertas = rows
    .filter(r => !!r.vehiculo_id && !!vehiculosActivos[String(r.vehiculo_id)])
    .map((r) => {
      const veh = vehiculosActivos[String(r.vehiculo_id)] ?? {};
      const conductorNombre = String(r.conductor ?? '');
      return {
        id: String(r.id),
        placa: String(r.placa ?? veh.placa ?? ''),
        conductor: conductorNombre,
        // Identificación por nombre real, no por el flag de BD (que llega en false
        // aun con conductor registrado y marcaba todo como "sin identificar").
        conductor_identificado: esConductorIdentificado(conductorNombre),
        lugar: String(r.lugar ?? ''),
        latitud: Number(r.latitud ?? 0),
        longitud: Number(r.longitud ?? 0),
        fecha: String(r.fecha ?? ''),
        fecha_dia: String(r.fecha_dia ?? ''),
        velocidad: Number(r.velocidad ?? 0),
        estado: String(r.estado ?? ''),
        infraccion_80_kmh: Number(r.infraccion_80_kmh ?? 0),
        excesos_varios_parametros: Number(r.excesos_varios_parametros ?? 0),
        excesos_50_80_kmh: Number(r.excesos_50_80_kmh ?? 0),
        frenadas_bruscas: Number(r.frenadas_bruscas ?? 0),
        contrato_nombre: String(r.contrato_nombre ?? ''),
        gps: String(r.gps ?? veh.gps_compañia ?? ''),
        tipo_activo: String(r.tipo_activo ?? veh.tipo_activo ?? ''),
        cliente: String(r.cliente ?? veh.cliente ?? ''),
        vehiculo_id: String(r.vehiculo_id ?? '') || null,
        conductor_id: String(r.conductor_id ?? '') || null,
        contrato_id: String(r.contrato_id ?? '') || null,
      };
    }) as AlertaDiariaGps[];

  if (alertas.length === 0) return null;

  let contrato: ContratoOption | undefined;
  if (filtro.contratoId) {
    const { data: ct } = await supabase
      .from('contratos')
      .select('id, nombre, cliente, proyecto')
      .eq('id', filtro.contratoId)
      .maybeSingle();
    contrato = ct as ContratoOption | undefined;
  }

  let vehiculosConGps = 0;
  let motocicletasConGps = 0;
  let personasAutorizadas = 0;
  const vehiculosQuery = supabase
    .from('vehiculos')
    .select('id, tipo_activo, gps_compañia')
    .eq('estado', 'ACTIVO');
  if (filtro.contratoId) vehiculosQuery.eq('contrato_id', filtro.contratoId);
  const _vehBase = await fetchAllRows<Record<string, unknown>>(vehiculosQuery);
  const vehiculosActivosBase = _vehBase.length;
  vehiculosConGps = _vehBase.filter((v) => tieneGpsConfigurado(v.gps_compañia)).length;
  motocicletasConGps = _vehBase.filter((v) => esMoto(v.tipo_activo) && tieneGpsConfigurado(v.gps_compañia)).length;

  const conductoresQuery = supabase
    .from('conductores')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'ACTIVO');
  if (filtro.contratoId) conductoresQuery.eq('contrato_id', filtro.contratoId);
  const { count: condCount } = await conductoresQuery;
  personasAutorizadas = condCount ?? 0;

  const identificados = new Set(alertas.filter(a => a.conductor_identificado).map(a => normalizeText(a.conductor)).filter(Boolean));
  const sinIdentificar = new Set(alertas.filter(a => !a.conductor_identificado).map(a => `${a.placa}|${a.fecha_dia}`));
  const alertasSinConductorIdentificado = alertas
    .filter(a => !a.conductor_identificado)
    .reduce((acc, a) => acc + a.infraccion_80_kmh + a.excesos_varios_parametros + a.excesos_50_80_kmh + a.frenadas_bruscas, 0);

  const tiposVehiculoMap = new Map<string, {
    tipo: string;
    vehiculoIds: Set<string>;
    vehiculosConAlertas: Set<string>;
    infracciones80: number;
    excesos50a80: number;
    excesosVarios: number;
    frenadas: number;
  }>();
  const tipoPorVehiculoId = new Map<string, unknown>();

  for (const vehiculo of _vehBase) {
    const id = String(vehiculo.id ?? '');
    const key = tipoVehiculoKey(vehiculo.tipo_activo);
    const current = tiposVehiculoMap.get(key) ?? {
      tipo: tipoVehiculoLabel(vehiculo.tipo_activo),
      vehiculoIds: new Set<string>(),
      vehiculosConAlertas: new Set<string>(),
      infracciones80: 0,
      excesos50a80: 0,
      excesosVarios: 0,
      frenadas: 0,
    };
    if (id) {
      current.vehiculoIds.add(id);
      tipoPorVehiculoId.set(id, vehiculo.tipo_activo);
    }
    tiposVehiculoMap.set(key, current);
  }

  for (const alerta of alertas) {
    const vehiculoId = String(alerta.vehiculo_id ?? '');
    const tipo = tipoPorVehiculoId.get(vehiculoId) ?? alerta.tipo_activo;
    const key = tipoVehiculoKey(tipo);
    const current = tiposVehiculoMap.get(key) ?? {
      tipo: tipoVehiculoLabel(tipo),
      vehiculoIds: new Set<string>(),
      vehiculosConAlertas: new Set<string>(),
      infracciones80: 0,
      excesos50a80: 0,
      excesosVarios: 0,
      frenadas: 0,
    };
    if (vehiculoId) current.vehiculosConAlertas.add(vehiculoId);
    current.infracciones80 += alerta.infraccion_80_kmh;
    current.excesos50a80 += alerta.excesos_50_80_kmh;
    current.excesosVarios += alerta.excesos_varios_parametros;
    current.frenadas += alerta.frenadas_bruscas;
    tiposVehiculoMap.set(key, current);
  }

  const tiposVehiculo = Array.from(tiposVehiculoMap.values())
    .map((tipo) => {
      const totalVehiculos = tipo.vehiculoIds.size;
      const vehiculosConAlertas = tipo.vehiculosConAlertas.size;
      return {
        tipo: tipo.tipo,
        totalVehiculos,
        vehiculosConAlertas,
        porcentajeConAlertas: totalVehiculos > 0 ? (vehiculosConAlertas / totalVehiculos) * 100 : 0,
        infracciones80: tipo.infracciones80,
        excesos50a80: tipo.excesos50a80,
        excesosVarios: tipo.excesosVarios,
        frenadas: tipo.frenadas,
        totalAlertas: tipo.infracciones80 + tipo.excesos50a80 + tipo.excesosVarios + tipo.frenadas,
      };
    })
    .sort((a, b) => b.totalAlertas - a.totalAlertas || b.vehiculosConAlertas - a.vehiculosConAlertas || a.tipo.localeCompare(b.tipo, 'es'));

  return {
    alertas,
    periodoInicio: filtro.fechaInicio,
    periodoFin: filtro.fechaFin,
    fechaReporte: getLocalDateISO(),
    contrato,
    resumen: {
      totalAlertas: alertas.reduce((acc, a) => acc + a.infraccion_80_kmh + a.excesos_varios_parametros + a.excesos_50_80_kmh + a.frenadas_bruscas, 0),
      vehiculosActivosBase,
      vehiculosConAlertas: new Set(alertas.map(a => a.placa)).size,
      personasAutorizadas,
      personasIdentificadas: identificados.size,
      personasSinIdentificar: sinIdentificar.size,
      alertasSinConductorIdentificado,
      motocicletasConAlertas: new Set(alertas.filter(a => esMoto(a.tipo_activo)).map(a => a.placa)).size,
      vehiculosConGps,
      motocicletasConGps,
      infracciones80: alertas.reduce((acc, a) => acc + a.infraccion_80_kmh, 0),
      excesosVarios: alertas.reduce((acc, a) => acc + a.excesos_varios_parametros, 0),
      excesos50a80: alertas.reduce((acc, a) => acc + a.excesos_50_80_kmh, 0),
      frenadas: alertas.reduce((acc, a) => acc + a.frenadas_bruscas, 0),
      tiposVehiculo,
    },
  };
}

export async function listarAlertasDiarias(filtro: Pick<FiltroReporte, 'fechaInicio' | 'fechaFin' | 'contratoId'>) {
  let q = supabase
    .from('alertas_diarias_gps')
    .select('*')
    .gte('fecha_dia', filtro.fechaInicio)
    .lte('fecha_dia', filtro.fechaFin)
    .not('vehiculo_id', 'is', null)
    .order('fecha', { ascending: false });
  if (filtro.contratoId) q = q.eq('contrato_id', filtro.contratoId);
  return fetchAllRows<Record<string, unknown>>(q);
}

/**
 * Versión ligera para el overview de "Contratos con alertas": solo las columnas
 * necesarias para agrupar (sin `raw_data` ni orden), lo que reduce drásticamente el
 * payload frente a `listarAlertasDiarias` (que trae `select('*')`).
 */
export async function listarAlertasDiariasResumen(filtro: Pick<FiltroReporte, 'fechaInicio' | 'fechaFin' | 'contratoId'>) {
  let q = supabase
    .from('alertas_diarias_gps')
    .select('contrato_id, contrato_nombre, placa, conductor, fecha_dia, infraccion_80_kmh, excesos_50_80_kmh, excesos_varios_parametros, frenadas_bruscas')
    .gte('fecha_dia', filtro.fechaInicio)
    .lte('fecha_dia', filtro.fechaFin)
    .not('vehiculo_id', 'is', null);
  if (filtro.contratoId) q = q.eq('contrato_id', filtro.contratoId);
  return fetchAllRows<Record<string, unknown>>(q);
}

export async function listarAlertasDiariasPendientes(filtro: Pick<FiltroReporte, 'fechaInicio' | 'fechaFin' | 'contratoId'>) {
  let contratoNombre = '';
  if (filtro.contratoId) {
    const { data: contrato, error } = await supabase
      .from('contratos')
      .select('nombre')
      .eq('id', filtro.contratoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    contratoNombre = String(contrato?.nombre ?? '');
  }

  let q = supabase
    .from('alertas_diarias_pendientes')
    .select('*')
    .gte('fecha_dia', filtro.fechaInicio)
    .lte('fecha_dia', filtro.fechaFin)
    .eq('estado_migracion', 'pendiente')
    .order('fecha', { ascending: false });

  if (contratoNombre) q = q.ilike('contrato_nombre', `%${contratoNombre}%`);

  return fetchAllRows<Record<string, unknown>>(q);
}
