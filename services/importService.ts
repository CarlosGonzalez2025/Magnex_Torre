import * as XLSX from 'xlsx';
import { supabase } from './supabaseClient';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ValidationError {
  fila: number;
  columna: string;
  mensaje: string;
}

export interface ParseResult<T> {
  datos: T[];
  errores: ValidationError[];
  valido: boolean;
}

export interface ImportResult {
  cargaId: string;
  exito: boolean;
  registrosInsertados: number;
  errores: ValidationError[];
  novedades?: { pendientes: number };
}

interface WriteResult {
  insertados: number;
  omitidos: ValidationError[];
  pendientes: number;
}

// Cabeceras esperadas por hoja
const CABECERAS: Record<string, string[]> = {
  Conductores_App: [
    'NOMBRES', 'CEDULA', 'CARGO', 'BASE', 'ESTADO', 'PROYECTO',
    'TIPO_LICENCIA', 'FECHA_EXP_PARTICULAR', 'FECHA_VENC_PARTICULAR',
    'IBUTTON',
  ],
  Vehiculos_App_V2: [
    'PLACA', 'ESTADO', 'CLIENTE', 'MARCA', 'LINEA', 'TIPO_COMBUSTIBLE',
    'MODELO', 'FECHA_VENC_SOAT', 'FECHA_VENC_RTM', 'CONTRATO_NOMBRE',
  ],
  Conductor: [
    'NOMBRES', 'CEDULA', 'GRUPO', 'CALIFICACION', 'KMS', 'HORAS_CONDUCCION',
    'EXCESOS_10_KPH', 'EXCESOS_20_KPH', 'EXCESOS_30_KPH', 'EXCESOS_40_KPH',
    'EXCESOS_50_KPH', 'EXCESOS_60_KPH', 'EXCESOS_80_KPH',
    'ACELERACIONES', 'FRENADAS', 'FECHA', 'IBUTTON',
  ],
  Coltrack_Vehiculos: [
    'PLACA', 'GRUPO', 'CALIFICACION', 'KMS', 'HORAS_CONDUCCION',
    'EXCESOS_10_KPH', 'EXCESOS_20_KPH', 'EXCESOS_30_KPH', 'EXCESOS_40_KPH',
    'EXCESOS_50_KPH', 'EXCESOS_60_KPH', 'EXCESOS_80_KPH',
    'ACELERACIONES', 'FRENADAS', 'FECHA', 'IBUTTON', 'GPS_PROVEEDOR',
  ],
  Ralentis: [
    'PLACA', 'USER_GROUP', 'FECHA', 'KMS_RECORRIDOS', 'ENCENDIDOS_APAGADOS',
    'RALENTIS_EXCESIVOS', 'HORAS_MOTOR_ENCENDIDO', 'HORAS_MOTOR_RALENTI',
    'CONSUMO_COMBUSTIBLE',
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function excelDateToISO(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const dmy = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  return null;
}

function parseDateTokenToISO(value: string): string | null {
  const trimmed = value.trim();
  const ymd = trimmed.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  const dmy = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!dmy) return null;
  const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
  return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
}

function periodoTextToRange(value: unknown): { inicio: string; fin: string } | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const matches = text.match(/\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}/g) ?? [];
  if (matches.length < 2) return null;
  const inicio = parseDateTokenToISO(matches[0]);
  const fin = parseDateTokenToISO(matches[1]);
  return inicio && fin ? { inicio, fin } : null;
}

function isUuid(value?: string): boolean {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function monthRange(fecha: string, mes?: string): { inicio: string; fin: string; mes: string } {
  const fallbackYear = /^\d{4}-\d{2}-\d{2}/.test(fecha)
    ? Number(fecha.slice(0, 4))
    : new Date().getUTCFullYear();
  const normalizedMes = String(mes ?? '').trim();
  const monthMatch = normalizedMes.match(/^(\d{1,2})[\/-](\d{4})$/);
  const monthNames: Record<string, number> = {
    ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
    JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10,
    NOVIEMBRE: 11, DICIEMBRE: 12,
  };
  const monthNameMatch = normalizedMes
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .match(/^([A-Z]+)(?:\s+(\d{4}))?$/);
  const base =
    normalizedMes.match(/^\d{4}-\d{2}$/)
      ? `${normalizedMes}-01`
      : monthMatch
        ? `${monthMatch[2]}-${monthMatch[1].padStart(2, '0')}-01`
        : monthNameMatch && monthNames[monthNameMatch[1]]
          ? `${monthNameMatch[2] ?? fallbackYear}-${String(monthNames[monthNameMatch[1]]).padStart(2, '0')}-01`
      : (fecha || new Date().toISOString().slice(0, 10));
  const d = new Date(`${base.slice(0, 10)}T00:00:00`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const inicio = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const finDate = new Date(Date.UTC(y, m + 1, 0));
  const fin = finDate.toISOString().slice(0, 10);
  return { inicio, fin, mes: inicio.slice(0, 7) };
}

function normalizeHeader(h: string): string {
  return h.trim().toUpperCase()
    .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÍÌÎÏ]/g, 'I').replace(/[ÓÒÔÖ]/g, 'O')
    .replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N')
    // Eliminar todo carácter que no sea letra o número (incluyendo #, /, (, ), ,)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');   // Quitar _ al inicio/final
}

/**
 * Busca en un objeto normalizado usando múltiples alias posibles.
 * Devuelve el primer valor encontrado o `fallback`.
 */
function get(
  normalized: Record<string, unknown>,
  ...aliases: string[]
): unknown {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (normalized[key] !== undefined && normalized[key] !== '') return normalized[key];
  }
  return undefined;
}

function validateHeaders(sheetHeaders: string[], expected: string[]): ValidationError[] {
  const normalized = sheetHeaders.map(normalizeHeader);
  return expected
    .filter(e => !normalized.includes(e))
    .map(missing => ({ fila: 1, columna: missing, mensaje: `Columna requerida no encontrada: ${missing}` }));
}

function num(v: unknown): number {
  const n = Number(v);
  return isNaN(n) || !isFinite(n) ? 0 : n;
}

function safeCoord(v: unknown): number | null {
  const n = Number(v);
  if (isNaN(n) || !isFinite(n) || n === 0) return null;
  return n;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function excelDateTimeToISO(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    const hh = String(date.H ?? 0).padStart(2, '0');
    const mm = String(date.M ?? 0).padStart(2, '0');
    const ss = String(Math.floor(date.S ?? 0)).padStart(2, '0');
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}T${hh}:${mm}:${ss}`;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.replace(' ', 'T');
    const dmy = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T${String(dmy[4] ?? '00').padStart(2, '0')}:${String(dmy[5] ?? '00').padStart(2, '0')}:${String(dmy[6] ?? '00').padStart(2, '0')}`;
    }
  }
  return excelDateToISO(value);
}

function esConductorNoIdentificado(value: unknown): boolean {
  const txt = normalizeText(value);
  return !txt || ['NO REGISTRA', 'NOREGISTRA', 'SIN CONDUCTOR', 'NO IDENTIFICADO', 'N/A', 'NA', 'NINGUNO'].includes(txt);
}

// ── Lectura de workbook ───────────────────────────────────────────────────────

export function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });
        resolve(wb);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Error leyendo archivo'));
    reader.readAsArrayBuffer(file);
  });
}

// ── Parsers por hoja ─────────────────────────────────────────────────────────

export function parseConductores(wb: XLSX.WorkBook): ParseResult<Record<string, unknown>> {
  const sheet = wb.Sheets['Conductores_App'] ?? wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const errores: ValidationError[] = [];

  if (rows.length === 0) return { datos: [], errores: [{ fila: 1, columna: '', mensaje: 'Hoja Conductores_App vacía' }], valido: false };

  const headerErrors = validateHeaders(Object.keys(rows[0]), CABECERAS.Conductores_App);
  errores.push(...headerErrors);

  const datos = rows.map((row, i) => {
    const fila = i + 2;
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[normalizeHeader(k)] = v;
    }

    if (!normalized.CEDULA) errores.push({ fila, columna: 'CEDULA', mensaje: 'Cédula obligatoria' });

    return {
      nombres: String(normalized.NOMBRES || '').trim(),
      cedula: String(normalized.CEDULA || '').trim(),
      cargo: String(normalized.CARGO || '').trim(),
      base: String(normalized.BASE || '').trim(),
      estado: String(normalized.ESTADO || 'ACTIVO').trim().toUpperCase(),
      proyecto: String(normalized.PROYECTO || '').trim(),
      tipo_licencia: String(normalized.TIPO_LICENCIA || '').trim(),
      fecha_exp_particular: excelDateToISO(normalized.FECHA_EXP_PARTICULAR),
      fecha_venc_particular: excelDateToISO(normalized.FECHA_VENC_PARTICULAR),
      fecha_exp_publica: excelDateToISO(normalized.FECHA_EXP_PUBLICA),
      fecha_venc_publica: excelDateToISO(normalized.FECHA_VENC_PUBLICA),
      fecha_exp_moto: excelDateToISO(normalized.FECHA_EXP_MOTO),
      fecha_venc_moto: excelDateToISO(normalized.FECHA_VENC_MOTO),
      fecha_revision_simit: excelDateToISO(normalized.FECHA_REVISION_SIMIT),
      tipo_comparendo: String(normalized.TIPO_COMPARENDO || '').trim(),
      valor_comparendo: num(normalized.VALOR_COMPARENDO),
      ibutton: String(normalized.IBUTTON || '').trim(),
    };
  });

  return { datos, errores, valido: errores.length === 0 };
}

export function parseVehiculos(wb: XLSX.WorkBook): ParseResult<Record<string, unknown>> {
  const sheet = wb.Sheets['Vehiculos_App_V2'] ?? wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const errores: ValidationError[] = [];

  if (rows.length === 0) return { datos: [], errores: [{ fila: 1, columna: '', mensaje: 'Hoja Vehiculos_App_V2 vacía' }], valido: false };

  const headerErrors = validateHeaders(Object.keys(rows[0]), CABECERAS.Vehiculos_App_V2);
  errores.push(...headerErrors);

  const datos = rows.map((row, i) => {
    const fila = i + 2;
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) normalized[normalizeHeader(k)] = v;

    if (!normalized.PLACA) errores.push({ fila, columna: 'PLACA', mensaje: 'Placa obligatoria' });

    return {
      placa: String(normalized.PLACA || '').trim().toUpperCase(),
      estado: String(normalized.ESTADO || 'ACTIVO').trim().toUpperCase(),
      cliente: String(normalized.CLIENTE || '').trim(),
      marca: String(normalized.MARCA || '').trim(),
      linea: String(normalized.LINEA || '').trim(),
      carroceria: String(normalized.CARROCERIA || '').trim(),
      tipo_activo: String(normalized.TIPO_ACTIVO || '').trim(),
      tipo_combustible: String(normalized.TIPO_COMBUSTIBLE || '').trim(),
      modelo: String(normalized.MODELO || '').trim(),
      fecha_matricula: excelDateToISO(normalized.FECHA_MATRICULA),
      fecha_venc_soat: excelDateToISO(normalized.FECHA_VENC_SOAT),
      fecha_venc_rtm: excelDateToISO(normalized.FECHA_VENC_RTM),
      fecha_venc_certificacion: excelDateToISO(normalized.FECHA_VENC_CERTIFICACION),
      poliza_todo_riesgo: String(normalized.POLIZA_TODO_RIESGO || '').trim(),
      tipo_servicio: String(normalized.TIPO_SERVICIO || '').trim(),
      tarjeta_operacion: String(normalized.TARJETA_OPERACION || '').trim(),
      vin: String(normalized.VIN || '').trim(),
      motor: String(normalized.MOTOR || '').trim(),
      chasis: String(normalized.CHASIS || '').trim(),
      centro_costo_nombre: String(normalized.CENTRO_COSTO_NOMBRE || '').trim(),
      centro_costo_numero: String(normalized.CENTRO_COSTO_NUMERO || '').trim(),
      lugar: String(normalized.LUGAR || '').trim(),
      zona: String(normalized.ZONA || '').trim(),
      coordinador: String(normalized.COORDINADOR || '').trim(),
      gps_compañia: String(normalized.GPS_COMPANIA || normalized.GPS_COMPAÑIA || '').trim(),
      km_actual: num(normalized.KM_ACTUAL),
      km_semana_actual: num(normalized.KM_SEMANA_ACTUAL),
      _contrato_nombre: String(normalized.CONTRATO_NOMBRE || '').trim(),
    };
  });

  return { datos, errores, valido: errores.length === 0 };
}

// ── Parser: Operación Conductor ───────────────────────────────────────────────
// Acepta nombres de hoja: "Operacion_Conductor", "Operacion Conductor",
// "Conductor", o la primera hoja del libro.

export function parseOperacionConductor(wb: XLSX.WorkBook): ParseResult<Record<string, unknown>> {
  const sheetName =
    wb.SheetNames.find(n => /operaci[oó]n?[\s_]*conductor/i.test(n)) ??
    wb.SheetNames.find(n => /conductor/i.test(n)) ??
    wb.SheetNames[0];

  const sheet = wb.Sheets[sheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const errores: ValidationError[] = [];

  if (rows.length === 0) {
    return { datos: [], errores: [{ fila: 1, columna: '', mensaje: `Hoja "${sheetName}" vacía o no encontrada` }], valido: false };
  }

  // Verificar columnas mínimas obligatorias
  const firstRow = rows[0];
  const firstNorm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(firstRow)) firstNorm[normalizeHeader(k)] = v;

  if (!('CEDULA' in firstNorm || 'C_DULA' in firstNorm)) {
    errores.push({ fila: 1, columna: 'Cédula', mensaje: 'No se encontró la columna Cédula en la hoja de conductores' });
    return { datos: [], errores, valido: false };
  }

  const datos = rows.map((row, i) => {
    const fila = i + 2;
    const n: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) n[normalizeHeader(k)] = v;

    const cedula = String(get(n, 'Cédula', 'CEDULA', 'cedula') ?? '').trim();
    if (!cedula) errores.push({ fila, columna: 'Cédula', mensaje: 'Fila sin cédula — se omitirá' });
    const periodo = String(get(n, 'Periodo', 'PERIODO', 'periodo') ?? '').trim();
    const fecha = excelDateToISO(get(n, 'FECHA', 'Fecha', 'fecha')) || periodoTextToRange(periodo)?.inicio || new Date().toISOString().slice(0, 10);

    // Excesos varios parámetros: puede venir del sheet o lo calculamos como suma 10–60
    const excesosVarios = num(
      get(n,
        'EXCESOS DE VELOCIDAD VARIOS PPARÁMETROS (10, 20, 30, 40, 50, 60, 70)',
        'EXCESOS DE VELOCIDAD VARIOS PARAMETROS',
        'EXCESOS_DE_VELOCIDAD_VARIOS_PPAR_METROS_10_20_30_40_50_60_70',
        'EXCESOS_VARIOS_PARAMS',
        'EXCESOS_VARIOS',
      )
    ) || (
      num(get(n, 'Excesos 10 kph', 'EXCESOS_10_KPH')) +
      num(get(n, 'Excesos 20 kph', 'EXCESOS_20_KPH')) +
      num(get(n, 'Excesos 30 kph', 'EXCESOS_30_KPH')) +
      num(get(n, 'Excesos 40 kph', 'EXCESOS_40_KPH')) +
      num(get(n, 'Excesos 50 kph', 'EXCESOS_50_KPH')) +
      num(get(n, 'Excesos 60 kph', 'EXCESOS_60_KPH'))
    );

    return {
      _fila: fila,
      _cedula: cedula,
      _nombre_conductor: String(get(n, 'Conductor', 'CONDUCTOR', 'NOMBRES', 'NOMBRE') ?? '').trim(),
      calificacion:      num(get(n, 'Calificacion', 'CALIFICACION')),
      kms:               num(get(n, 'kms', 'KMS')),
      horas_conduccion:  num(get(n, 'Horas conduccion', 'HORAS_CONDUCCION')),
      // Excesos 10
      excesos_10_kph:    num(get(n, 'Excesos 10 kph', 'EXCESOS_10_KPH')),
      maxima_vel_10_kph: num(get(n, 'Maxima vel 10 kph', 'MAXIMA_VEL_10_KPH')),
      duracion_10_kph:   num(get(n, 'Duracion seg 10 kph', 'DURACION_SEG_10_KPH', 'DURACION_10_KPH')),
      // Excesos 20
      excesos_20_kph:    num(get(n, 'Excesos 20 kph', 'EXCESOS_20_KPH')),
      maxima_vel_20_kph: num(get(n, 'Maxima vel 20 kph', 'MAXIMA_VEL_20_KPH')),
      duracion_20_kph:   num(get(n, 'Duracion seg 20 kph', 'DURACION_SEG_20_KPH', 'DURACION_20_KPH')),
      // Excesos 30
      excesos_30_kph:    num(get(n, 'Excesos 30 kph', 'EXCESOS_30_KPH')),
      maxima_vel_30_kph: num(get(n, 'Maxima vel 30 kph', 'MAXIMA_VEL_30_KPH')),
      duracion_30_kph:   num(get(n, 'Duracion seg 30 kph', 'DURACION_SEG_30_KPH', 'DURACION_30_KPH')),
      // Excesos 40
      excesos_40_kph:    num(get(n, 'Excesos 40 kph', 'EXCESOS_40_KPH')),
      maxima_vel_40_kph: num(get(n, 'Maxima vel 40 kph', 'MAXIMA_VEL_40_KPH')),
      duracion_40_kph:   num(get(n, 'Duracion seg 40 kph', 'DURACION_SEG_40_KPH', 'DURACION_40_KPH')),
      // Excesos 50
      excesos_50_kph:    num(get(n, 'Excesos 50 kph', 'EXCESOS_50_KPH')),
      maxima_vel_50_kph: num(get(n, 'Maxima vel 50 kph', 'MAXIMA_VEL_50_KPH')),
      duracion_50_kph:   num(get(n, 'Duracion seg 50 kph', 'DURACION_SEG_50_KPH', 'DURACION_50_KPH')),
      // Excesos 60
      excesos_60_kph:    num(get(n, 'Excesos 60 kph', 'EXCESOS_60_KPH')),
      maxima_vel_60_kph: num(get(n, 'Maxima vel 60 kph', 'MAXIMA_VEL_60_KPH')),
      duracion_60_kph:   num(get(n, 'Duracion seg 60 kph', 'DURACION_SEG_60_KPH', 'DURACION_60_KPH')),
      // Excesos 80 (el header original tiene "#" al inicio)
      excesos_80_kph:    num(get(n,
        '# DE EXCESOS DE VELOCIDAD 80 KM/H', 'Excesos 80 kph', 'EXCESOS_80_KPH',
        'DE_EXCESOS_DE_VELOCIDAD_80_KM_H', '_DE_EXCESOS_DE_VELOCIDAD_80_KM_H',
      )),
      maxima_vel_80_kph: num(get(n, 'Maxima vel 80 kph', 'MAXIMA_VEL_80_KPH')),
      duracion_80_kph:   num(get(n, 'Duracion seg 80 kph', 'DURACION_SEG_80_KPH', 'DURACION_80_KPH')),
      // Conducción agresiva (headers con "#")
      aceleraciones: num(get(n,
        '# ACELERACIONES BRUSCAS', 'Aceleraciones', 'ACELERACIONES',
        'ACELERACIONES_BRUSCAS', '_ACELERACIONES_BRUSCAS',
      )),
      frenadas: num(get(n,
        '# DE FRENADAS BRUSCAS', 'Frenadas', 'FRENADAS',
        'FRENADAS_BRUSCAS', 'DE_FRENADAS_BRUSCAS', '_DE_FRENADAS_BRUSCAS',
      )),
      // Campos adicionales
      excesos_varios_params: excesosVarios,
      mes:              String(get(n, 'MES', 'Mes', 'mes') ?? '').trim(),
      fecha,
      ibutton:          String(get(n, 'IBUTTON', 'Ibutton', 'ibutton') ?? '').trim(),
      estado_conductor: String(get(n,
        'Estaso del conductor', 'Estado del conductor', 'ESTADO_DEL_CONDUCTOR',
        'ESTADO_CONDUCTOR', 'Estado conductor', 'ESTADO',
      ) ?? '').trim(),
      periodo,
      consecutivo:      String(get(n, 'Consecutivo', 'CONSECUTIVO') ?? '').trim(),
    };
  });

  // Filtrar filas sin cédula
  const datosFiltrados = datos.filter(d => d._cedula);
  return { datos: datosFiltrados, errores, valido: errores.length === 0 };
}

// ── Parser: Operación Vehículos ───────────────────────────────────────────────
// Acepta: "Operacion_Vehiculos", "Operacion Vehículos", "Coltrack_Vehiculos".
// IMPORTANTE: Esta hoja incluye datos de ralentís (Encendido/Apagado, etc.)
// que se insertan en la tabla `ralentis` además de `coltrack_datos_vehiculo`.

export function parseOperacionVehiculo(wb: XLSX.WorkBook): ParseResult<Record<string, unknown>> {
  const sheetName =
    wb.SheetNames.find(n => /operaci[oó]n?[\s_]*veh[ií]culos?/i.test(n)) ??
    wb.SheetNames.find(n => /coltrack_?veh/i.test(n)) ??
    wb.SheetNames.find(n => /veh[ií]culos?/i.test(n)) ??
    wb.SheetNames[0];

  const sheet = wb.Sheets[sheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const errores: ValidationError[] = [];

  if (rows.length === 0) {
    return { datos: [], errores: [{ fila: 1, columna: '', mensaje: `Hoja "${sheetName}" vacía o no encontrada` }], valido: false };
  }

  const firstNorm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rows[0])) firstNorm[normalizeHeader(k)] = v;
  if (!('VEHICULO' in firstNorm || 'PLACA' in firstNorm || 'MATRICULA' in firstNorm)) {
    errores.push({ fila: 1, columna: 'Vehiculo', mensaje: 'No se encontró la columna Vehiculo / Placa en la hoja de vehículos' });
    return { datos: [], errores, valido: false };
  }

  const datos = rows.map((row, i) => {
    const fila = i + 2;
    const n: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) n[normalizeHeader(k)] = v;

    const placa = String(
      get(n, 'Vehiculo', 'VEHICULO', 'Placa', 'PLACA', 'Matricula', 'MATRICULA') ?? ''
    ).trim().toUpperCase();

    if (!placa) errores.push({ fila, columna: 'Vehiculo', mensaje: 'Fila sin placa — se omitirá' });
    const periodo = String(get(n, 'Periodo', 'PERIODO') ?? '').trim();
    const fecha = excelDateToISO(get(n, 'fecha de reporte', 'FECHA_DE_REPORTE', 'FECHA')) || periodoTextToRange(periodo)?.inicio || new Date().toISOString().slice(0, 10);

    // Excesos varios = suma 10–60 si no viene explícito
    const excesosVarios = num(
      get(n,
        'Excesos de velocidad varios parámetros',
        'EXCESOS_DE_VELOCIDAD_VARIOS_PAR_METROS',
        'EXCESOS_DE_VELOCIDAD_VARIOS_PARAMETROS',
        'EXCESOS_VARIOS_PARAMS',
        'EXCESOS_VARIOS',
      )
    ) || (
      num(get(n, 'Excesos 10 kph', 'EXCESOS_10_KPH')) +
      num(get(n, 'Excesos 20 kph', 'EXCESOS_20_KPH')) +
      num(get(n, 'Excesos 30 kph', 'EXCESOS_30_KPH')) +
      num(get(n, 'Excesos 40 kph', 'EXCESOS_40_KPH')) +
      num(get(n, 'Excesos 50 kph', 'EXCESOS_50_KPH')) +
      num(get(n, 'Excesos 60 kph', 'EXCESOS_60_KPH'))
    );

    return {
      _fila: fila,
      _placa: placa,
      calificacion:      num(get(n, 'Calificacion', 'CALIFICACION')),
      kms:               num(get(n, 'kms', 'KMS')),
      horas_conduccion:  num(get(n, 'Horas conduccion', 'HORAS_CONDUCCION')),
      // Excesos
      excesos_10_kph:    num(get(n, 'Excesos 10 kph', 'EXCESOS_10_KPH')),
      maxima_vel_10_kph: num(get(n, 'Maxima vel 10 kph', 'MAXIMA_VEL_10_KPH')),
      duracion_10_kph:   num(get(n, 'Duracion seg 10 kph', 'DURACION_SEG_10_KPH', 'DURACION_10_KPH')),
      excesos_20_kph:    num(get(n, 'Excesos 20 kph', 'EXCESOS_20_KPH')),
      maxima_vel_20_kph: num(get(n, 'Maxima vel 20 kph', 'MAXIMA_VEL_20_KPH')),
      duracion_20_kph:   num(get(n, 'Duracion seg 20 kph', 'DURACION_SEG_20_KPH', 'DURACION_20_KPH')),
      excesos_30_kph:    num(get(n, 'Excesos 30 kph', 'EXCESOS_30_KPH')),
      maxima_vel_30_kph: num(get(n, 'Maxima vel 30 kph', 'MAXIMA_VEL_30_KPH')),
      duracion_30_kph:   num(get(n, 'Duracion seg 30 kph', 'DURACION_SEG_30_KPH', 'DURACION_30_KPH')),
      excesos_40_kph:    num(get(n, 'Excesos 40 kph', 'EXCESOS_40_KPH')),
      maxima_vel_40_kph: num(get(n, 'Maxima vel 40 kph', 'MAXIMA_VEL_40_KPH')),
      duracion_40_kph:   num(get(n, 'Duracion seg 40 kph', 'DURACION_SEG_40_KPH', 'DURACION_40_KPH')),
      excesos_50_kph:    num(get(n, 'Excesos 50 kph', 'EXCESOS_50_KPH')),
      maxima_vel_50_kph: num(get(n, 'Maxima vel 50 kph', 'MAXIMA_VEL_50_KPH')),
      duracion_50_kph:   num(get(n, 'Duracion seg 50 kph', 'DURACION_SEG_50_KPH', 'DURACION_50_KPH')),
      excesos_60_kph:    num(get(n, 'Excesos 60 kph', 'EXCESOS_60_KPH')),
      maxima_vel_60_kph: num(get(n, 'Maxima vel 60 kph', 'MAXIMA_VEL_60_KPH')),
      duracion_60_kph:   num(get(n, 'Duracion seg 60 kph', 'DURACION_SEG_60_KPH', 'DURACION_60_KPH')),
      excesos_80_kph:    num(get(n, 'Excesos 80 kph', 'EXCESOS_80_KPH')),
      maxima_vel_80_kph: num(get(n, 'Maxima vel 80 kph', 'MAXIMA_VEL_80_KPH')),
      duracion_80_kph:   num(get(n, 'Duracion seg 80 kph', 'DURACION_SEG_80_KPH', 'DURACION_80_KPH')),
      // Conducción agresiva
      aceleraciones: num(get(n, 'Aceleraciones', 'ACELERACIONES', 'ACELERACIONES_BRUSCAS')),
      frenadas:      num(get(n, 'Frenadas', 'FRENADAS', 'FRENADAS_BRUSCAS')),
      // Campos adicionales
      excesos_varios_params: excesosVarios,
      dispositivo_gps: String(get(n, 'DISPOSITIVO GPS', 'DISPOSITIVO_GPS', 'GPS_PROVEEDOR', 'GPS') ?? '').trim(),
      mes:             String(get(n, 'Mes', 'MES') ?? '').trim(),
      fecha,
      periodo,
      estado_gps:      String(get(n, 'Estado', 'ESTADO', 'ESTADO_GPS') ?? '').trim(),
      consecutivo:     String(get(n, 'Consecutivo', 'CONSECUTIVO') ?? '').trim(),
      tipo_activo:     String(get(n, 'Tipo de activo', 'TIPO_DE_ACTIVO', 'TIPO_ACTIVO') ?? '').trim(),
      // Ralentís (integrado en la misma hoja)
      kms_recorridos:        num(get(n, 'Kms recorridos', 'KMS_RECORRIDOS')) || num(get(n, 'kms', 'KMS')),
      encendidos_apagados:   num(get(n, 'Encendido/Apagado', 'ENCENDIDO_APAGADO', 'ENCENDIDOS_APAGADOS')),
      ralentis_excesivos:    num(get(n, 'Ralentis excesivos', 'RALENTIS_EXCESIVOS')),
      horas_motor_encendido: num(get(n, 'Horas motor encendido', 'HORAS_MOTOR_ENCENDIDO')),
      horas_motor_ralenti:   num(get(n, 'Horas motor en ralenti', 'HORAS_MOTOR_EN_RALENTI', 'HORAS_MOTOR_RALENTI')),
      consumo_combustible:   num(get(n, 'Consumo de combustible', 'CONSUMO_DE_COMBUSTIBLE', 'CONSUMO_COMBUSTIBLE')),
    };
  });

  const datosFiltrados = datos.filter(d => d._placa);
  return { datos: datosFiltrados, errores, valido: errores.length === 0 };
}

// Mantener aliases para compatibilidad con código existente
export function parseAlertasDiarias(wb: XLSX.WorkBook): ParseResult<Record<string, unknown>> {
  const sheetName =
    wb.SheetNames.find(n => /alertas?[\s_]*(diarias?|gps)?/i.test(n)) ??
    wb.SheetNames.find(n => /lacira|diario/i.test(n)) ??
    wb.SheetNames[0];

  const sheet = wb.Sheets[sheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const errores: ValidationError[] = [];

  if (rows.length === 0) {
    return { datos: [], errores: [{ fila: 1, columna: '', mensaje: `Hoja "${sheetName}" vacia o no encontrada` }], valido: false };
  }

  const firstNorm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rows[0])) firstNorm[normalizeHeader(k)] = v;
  for (const key of ['PLACA', 'CONDUCTOR', 'LUGAR', 'FECHA']) {
    if (!(key in firstNorm)) errores.push({ fila: 1, columna: key, mensaje: `Columna requerida no encontrada: ${key}` });
  }
  if (errores.length > 0) return { datos: [], errores, valido: false };

  const datos = rows.map((row, i) => {
    const fila = i + 2;
    const n: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) n[normalizeHeader(k)] = v;

    const placa = String(get(n, 'Placa', 'PLACA', 'Vehiculo', 'VEHICULO') ?? '').trim().toUpperCase();
    const conductor = String(get(n, 'Conductor', 'CONDUCTOR') ?? '').trim();
    const fecha = excelDateTimeToISO(get(n, 'Fecha', 'FECHA', 'Fecha alerta', 'FECHA_ALERTA')) || '';

    if (!placa) errores.push({ fila, columna: 'Placa', mensaje: 'Fila sin placa; se omitira' });
    if (!fecha) errores.push({ fila, columna: 'Fecha', mensaje: 'Fila sin fecha valida; se omitira' });

    return {
      _fila: fila,
      _placa: placa,
      conductor,
      conductor_identificado: !esConductorNoIdentificado(conductor),
      lugar: String(get(n, 'Lugar', 'LUGAR', 'Ubicacion', 'UBICACION') ?? '').trim(),
      latitud: safeCoord(get(n, 'Latitud', 'LATITUD')),
      longitud: safeCoord(get(n, 'Longitud', 'LONGITUD')),
      fecha,
      fecha_dia: fecha ? fecha.slice(0, 10) : '',
      velocidad: num(get(n, 'Velocidad', 'VELOCIDAD')),
      estado: String(get(n, 'Estado', 'ESTADO') ?? '').trim(),
      infraccion_80_kmh: num(get(n, 'Infraccion 80 Km/h', 'INFRACCION_80_KM_H', 'Infraccion 80', 'EXCESOS_80_KPH')),
      excesos_varios_parametros: num(get(n,
        'Excesos de velocidad varios parametros (10,20, 30, 40) km/h',
        'Excesos de velocidad varios parametros',
        'Excesos varios parametros',
        'EXCESOS_VARIOS_PARAMETROS',
      )),
      excesos_50_80_kmh: num(get(n,
        'Excesos >=50 < 80 km',
        'Excesos >=50 <80 km',
        'Excesos de Velocidad > 50 km/h hasta 80 km/h',
        'EXCESOS_50_80_KMH',
      )),
      frenadas_bruscas: num(get(n, 'Frenadas Bruscas', 'FRENADAS_BRUSCAS', 'Frenadas')),
      contrato_nombre: String(get(n, 'Contrato', 'CONTRATO') ?? '').trim(),
      gps: String(get(n, 'Gps', 'GPS', 'DISPOSITIVO GPS', 'DISPOSITIVO_GPS') ?? '').trim(),
      raw_data: row,
    };
  });

  const datosFiltrados = datos.filter(d => d._placa && d.fecha);
  return { datos: datosFiltrados, errores, valido: errores.length === 0 };
}

export const parseColtrackConductor = parseOperacionConductor;
export const parseColtrackVehiculo = parseOperacionVehiculo;

// ── Inserción en base de datos ────────────────────────────────────────────────

async function upsertConductores(datos: Record<string, unknown>[]): Promise<void> {
  for (const c of datos) {
    const { _contrato_nombre, ...rest } = c as Record<string, unknown>;
    void _contrato_nombre;
    const { error } = await supabase
      .from('conductores')
      .upsert(rest, { onConflict: 'cedula', ignoreDuplicates: false });
    if (error) throw new Error(`conductor ${c.cedula}: ${error.message}`);
  }
}

async function upsertVehiculos(datos: Record<string, unknown>[]): Promise<void> {
  for (const v of datos) {
    const { _contrato_nombre, ...rest } = v as Record<string, unknown>;

    // Resolver contrato_id a partir de nombre
    let contrato_id: string | null = null;
    if (_contrato_nombre) {
      const { data } = await supabase
        .from('contratos')
        .select('id')
        .ilike('nombre', String(_contrato_nombre))
        .maybeSingle();
      contrato_id = data?.id ?? null;
    }

    const { error } = await supabase
      .from('vehiculos')
      .upsert({ ...rest, contrato_id }, { onConflict: 'placa', ignoreDuplicates: false });
    if (error) throw new Error(`vehículo ${v.placa}: ${error.message}`);
  }
}

function periodoFromRow(row: Record<string, unknown>, tipo: 'daily' | 'monthly') {
  const fecha = String(row.fecha ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const periodo = periodoTextToRange(row.periodo);
  if (tipo === 'monthly' && periodo) {
    return { inicio: periodo.inicio, fin: periodo.fin, mes: periodo.inicio.slice(0, 7) };
  }
  if (tipo === 'monthly') return monthRange(fecha, String(row.mes ?? ''));
  return { inicio: fecha, fin: fecha, mes: fecha.slice(0, 7) };
}

async function upsertReporteConductor(
  conductor: { id: string; proyecto?: string | null; ibutton?: string | null; estado?: string | null },
  row: Record<string, unknown>,
  tipo: 'daily' | 'monthly',
): Promise<void> {
  const periodo = periodoFromRow(row, tipo);
  const { error } = await supabase
    .from('reportes_conductores')
    .upsert(
      {
        conductor_id: conductor.id,
        periodo_inicio: periodo.inicio,
        periodo_fin: periodo.fin,
        calificacion: num(row.calificacion),
        kms: num(row.kms),
        horas_conduccion: num(row.horas_conduccion),
        excesos_10_kph: num(row.excesos_10_kph),
        excesos_20_kph: num(row.excesos_20_kph),
        excesos_30_kph: num(row.excesos_30_kph),
        excesos_40_kph: num(row.excesos_40_kph),
        excesos_50_kph: num(row.excesos_50_kph),
        excesos_60_kph: num(row.excesos_60_kph),
        excesos_80_kph: num(row.excesos_80_kph),
        aceleraciones_bruscas: num(row.aceleraciones),
        frenadas_bruscas: num(row.frenadas),
        ibutton: String(row.ibutton ?? conductor.ibutton ?? ''),
        estado_conductor: String(row.estado_conductor ?? conductor.estado ?? ''),
        proyecto: String(conductor.proyecto ?? ''),
        mes: periodo.mes,
        fecha_reporte: new Date().toISOString().slice(0, 10),
      },
      { onConflict: 'conductor_id,periodo_inicio,periodo_fin', ignoreDuplicates: false }
    );

  if (error) throw new Error(`reporte conductor: ${error.message}`);
}

async function upsertReporteVehiculo(
  vehiculo: { id: string; contrato_id?: string | null; cliente?: string | null; lugar?: string | null },
  row: Record<string, unknown>,
  ralenti: Record<string, unknown>,
  tipo: 'daily' | 'monthly',
): Promise<void> {
  const periodo = periodoFromRow(row, tipo);
  const { error } = await supabase
    .from('reportes_vehiculos')
    .upsert(
      {
        vehiculo_id: vehiculo.id,
        contrato_id: vehiculo.contrato_id ?? null,
        periodo_inicio: periodo.inicio,
        periodo_fin: periodo.fin,
        calificacion: num(row.calificacion),
        kms: num(row.kms),
        horas_conduccion: num(row.horas_conduccion),
        excesos_10_kph: num(row.excesos_10_kph),
        excesos_20_kph: num(row.excesos_20_kph),
        excesos_30_kph: num(row.excesos_30_kph),
        excesos_40_kph: num(row.excesos_40_kph),
        excesos_50_kph: num(row.excesos_50_kph),
        excesos_60_kph: num(row.excesos_60_kph),
        excesos_80_kph: num(row.excesos_80_kph),
        aceleraciones_bruscas: num(row.aceleraciones),
        frenadas_bruscas: num(row.frenadas),
        dispositivo_gps: String(row.dispositivo_gps ?? ''),
        base: String(vehiculo.lugar ?? ''),
        estado_gps: String(row.estado_gps ?? ''),
        km_recorridos_ralenti: num(ralenti.kms_recorridos),
        horas_motor_encendido: num(ralenti.horas_motor_encendido),
        horas_motor_ralenti: num(ralenti.horas_motor_ralenti),
        consumo_combustible: num(ralenti.consumo_combustible),
        proyecto: String(vehiculo.cliente ?? ''),
        mes: periodo.mes,
        fecha_reporte: new Date().toISOString().slice(0, 10),
      },
      { onConflict: 'vehiculo_id,periodo_inicio,periodo_fin', ignoreDuplicates: false }
    );

  if (error) throw new Error(`reporte vehiculo: ${error.message}`);
}

async function insertOperacionConductor(datos: Record<string, unknown>[], tipo: 'daily' | 'monthly'): Promise<WriteResult> {
  const omitidos: ValidationError[] = [];
  let insertados = 0;

  for (const d of datos) {
    const { _cedula, _nombre_conductor, _fila, ...rest } = d;
    void _nombre_conductor;

    const { data: cond } = await supabase
      .from('conductores')
      .select('id, proyecto, ibutton, estado')
      .eq('cedula', String(_cedula))
      .maybeSingle();

    if (!cond) {
      omitidos.push({
        fila: Number(_fila ?? 0),
        columna: 'Cedula',
        mensaje: `Conductor con cedula ${_cedula} no encontrado en la base de conductores. Fila omitida.`,
      });
      continue;
    }

    const { error } = await supabase
      .from('coltrack_datos_conductor')
      .upsert(
        { conductor_id: cond.id, ...rest },
        { onConflict: 'conductor_id,fecha', ignoreDuplicates: false }
      );
    if (error) throw new Error(`coltrack conductor ${_cedula}: ${error.message}`);

    await upsertReporteConductor(cond as { id: string; proyecto?: string | null; ibutton?: string | null; estado?: string | null }, rest, tipo);
    insertados++;
  }

  return { insertados, omitidos, pendientes: 0 };
}

async function insertOperacionVehiculo(datos: Record<string, unknown>[], tipo: 'daily' | 'monthly'): Promise<WriteResult> {
  const omitidos: ValidationError[] = [];
  let insertados = 0;

  // Campos que pertenecen a ralentis (no a coltrack_datos_vehiculo)
  const RALENTIS_FIELDS = new Set([
    'kms_recorridos', 'encendidos_apagados', 'ralentis_excesivos',
    'horas_motor_encendido', 'horas_motor_ralenti', 'consumo_combustible',
  ]);

  for (const d of datos) {
    const { _placa, _fila, ...allRest } = d;

    const { data: veh } = await supabase
      .from('vehiculos')
      .select('id, contrato_id, cliente, lugar')
      .eq('placa', String(_placa))
      .maybeSingle();

    if (!veh) {
      omitidos.push({
        fila: Number(_fila ?? 0),
        columna: 'Vehiculo',
        mensaje: `Vehiculo con placa ${_placa} no encontrado en la base de vehiculos. Fila omitida.`,
      });
      continue;
    }

    const vehiculoId = (veh as { id: string }).id;

    // Separar datos coltrack de datos ralentis
    const coltrackRest: Record<string, unknown> = {};
    const ralentisRest: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(allRest)) {
      if (RALENTIS_FIELDS.has(k)) ralentisRest[k] = v;
      else coltrackRest[k] = v;
    }

    // Insertar coltrack
    const fecha = String(coltrackRest.fecha ?? '');
    const { error: eC } = await supabase
      .from('coltrack_datos_vehiculo')
      .upsert(
        { vehiculo_id: vehiculoId, ...coltrackRest },
        { onConflict: 'vehiculo_id,fecha', ignoreDuplicates: false }
      );
    if (eC) throw new Error(`coltrack vehículo ${_placa}: ${eC.message}`);

    // Insertar ralentis solo si hay algún valor > 0
    const tieneRalentis = Object.values(ralentisRest).some(v => Number(v) > 0);
    if (tieneRalentis) {
      const { error: eR } = await supabase
        .from('ralentis')
        .upsert(
          { vehiculo_id: vehiculoId, fecha, ...ralentisRest },
          { onConflict: 'vehiculo_id,fecha', ignoreDuplicates: false }
        );
      if (eR) throw new Error(`ralentis ${_placa}: ${eR.message}`);
    }

    await upsertReporteVehiculo(
      veh as { id: string; contrato_id?: string | null; cliente?: string | null; lugar?: string | null },
      coltrackRest,
      ralentisRest,
      tipo,
    );
    insertados++;
  }

  return { insertados, omitidos, pendientes: 0 };
}

async function insertAlertasDiarias(datos: Record<string, unknown>[], _tipo: 'daily' | 'monthly', cargaId?: string): Promise<WriteResult> {
  const omitidos: ValidationError[] = [];
  let insertados = 0;
  let pendientes = 0;

  const { data: conductoresRaw } = await supabase
    .from('conductores')
    .select('id, nombres, estado');
  const conductores = new Map(
    (conductoresRaw ?? [])
      .filter((c: Record<string, unknown>) => normalizeText(c.estado) === 'ACTIVO')
      .map((c: Record<string, unknown>) => [normalizeText(c.nombres), String(c.id)])
  );

  for (const d of datos) {
    const { _placa, _fila, ...rest } = d;
    void _fila;
    const conductorNombre = String(rest.conductor ?? '').trim();

    const { data: vehRaw } = await supabase
      .from('vehiculos')
      .select('id, placa, estado, contrato_id, cliente, tipo_activo, gps_compañia')
      .eq('placa', String(_placa))
      .maybeSingle();
    // Intermediate cast evita el ParserError de Supabase con ñ en nombre de columna
    const veh = vehRaw as unknown as Record<string, unknown> | null;

    const vehiculoActivo = !!veh && normalizeText(veh.estado) === 'ACTIVO';

    // Si la placa no esta en la base activa, queda solo como novedad pendiente.
    // El trigger SQL la pasara a alertas_diarias_gps cuando el vehiculo exista y este activo.
    if (!vehiculoActivo) {
      const { error: pendienteError } = await supabase
        .from('alertas_diarias_pendientes')
        .upsert(
          {
            carga_id: cargaId ?? null,
            placa: String(_placa),
            conductor: conductorNombre,
            conductor_identificado: !esConductorNoIdentificado(conductorNombre),
            lugar: String(rest.lugar ?? '').trim(),
            latitud: rest.latitud ?? null,
            longitud: rest.longitud ?? null,
            fecha: String(rest.fecha ?? ''),
            fecha_dia: String(rest.fecha_dia ?? ''),
            velocidad: rest.velocidad ?? 0,
            estado: String(rest.estado ?? '').trim(),
            infraccion_80_kmh: rest.infraccion_80_kmh ?? 0,
            excesos_varios_parametros: rest.excesos_varios_parametros ?? 0,
            excesos_50_80_kmh: rest.excesos_50_80_kmh ?? 0,
            frenadas_bruscas: rest.frenadas_bruscas ?? 0,
            contrato_nombre: String(rest.contrato_nombre ?? '').trim(),
            gps: String(rest.gps ?? '').trim(),
            raw_data: rest.raw_data ?? null,
          },
          {
            onConflict: 'placa,fecha,conductor,lugar,velocidad,infraccion_80_kmh,excesos_varios_parametros,excesos_50_80_kmh,frenadas_bruscas',
            ignoreDuplicates: true,
          }
        );
      if (pendienteError) {
        throw new Error(`alerta pendiente ${_placa}: ${pendienteError.message}`);
      }
      pendientes++;
      continue;
    }

    // Resolver contrato: primero desde el vehiculo, luego por nombre si no hay.
    let contratoId = veh!.contrato_id as string | null;
    let contratoNombre = String(rest.contrato_nombre ?? '').trim();
    if (!contratoId && contratoNombre) {
      const { data: contrato } = await supabase
        .from('contratos')
        .select('id, nombre')
        .ilike('nombre', contratoNombre)
        .maybeSingle();
      contratoId = (contrato?.id as string | undefined) ?? null;
      contratoNombre = String(contrato?.nombre ?? contratoNombre);
    }

    const conductorId = esConductorNoIdentificado(conductorNombre)
      ? null
      : (conductores.get(normalizeText(conductorNombre)) ?? null);

    // Solo las alertas cruzadas con vehiculo activo entran al informe diario.
    const payload = {
      ...rest,
      carga_id: cargaId ?? null,
      vehiculo_id: veh!.id,
      conductor_id: conductorId,
      contrato_id: contratoId,
      contrato_nombre: contratoNombre,
      placa: String(_placa),
      cliente: String(veh!.cliente ?? ''),
      tipo_activo: String(veh!.tipo_activo ?? ''),
      gps: String(rest.gps || veh!['gps_compañia'] || ''),
    };

    const { error } = await supabase
      .from('alertas_diarias_gps')
      .upsert(payload, {
        onConflict: 'placa,fecha,conductor,lugar,velocidad,infraccion_80_kmh,excesos_varios_parametros,excesos_50_80_kmh,frenadas_bruscas',
        ignoreDuplicates: false,
      });

    if (error) throw new Error(`alerta diaria ${_placa}: ${error.message}`);
    insertados++;
  }

  return { insertados, omitidos, pendientes };
}

// Aliases por compatibilidad
const insertColtrackConductor = insertOperacionConductor;
const insertColtrackVehiculo = insertOperacionVehiculo;

// ── Función principal de importación ─────────────────────────────────────────
//
// IMPORTANTE: Los datos maestros de conductores y vehículos se sincronizan
// desde Google Sheets (SheetsSyncPanel). Este importador procesa únicamente
// datos OPERACIONALES: Conductor (coltrack), Coltrack_Vehiculos y Ralentis.
// El cruce se hace automáticamente por cédula (conductor) y placa (vehículo).

export async function importarExcel(
  file: File,
  tipo: 'daily' | 'monthly',
  usuarioId?: string
): Promise<ImportResult> {
  const erroresGlobales: ValidationError[] = [];
  let registrosInsertados = 0;

  // Subir archivo a Storage
  const nombreArchivo = `${Date.now()}_${file.name}`;
  const { data: upload, error: uploadError } = await supabase.storage
    .from('reportes')
    .upload(`excel/${nombreArchivo}`, file);
  if (uploadError) throw new Error(`No se pudo subir el archivo al bucket reportes: ${uploadError.message}`);
  const archivo_url = upload?.path ?? null;

  // Registrar carga
  const { data: carga, error: errorCarga } = await supabase
    .from('cargas_excel')
    .insert({
      usuario_id: isUuid(usuarioId) ? usuarioId : null,
      tipo,
      archivo_url,
      nombre_archivo: file.name,
      estado_validacion: 'pendiente',
    })
    .select('id')
    .single();

  if (errorCarga) {
    throw new Error(`No se pudo registrar la carga: ${errorCarga.message}`);
  }
  if (!carga) throw new Error('No se pudo registrar la carga: Supabase no retornó el ID de la carga');
  const cargaId = carga.id as string;

  try {
    const wb = await readWorkbook(file);

    // Avisar si el usuario sube hojas de maestros (deben venir de Google Sheets)
    if (wb.SheetNames.includes('Conductores_App')) {
      erroresGlobales.push({
        fila: 0, columna: 'Conductores_App',
        mensaje: 'La hoja Conductores_App no se procesa desde Excel. Sincroniza los conductores desde Google Sheets usando el panel de sincronización.',
      });
    }
    if (wb.SheetNames.includes('Vehiculos_App_V2')) {
      erroresGlobales.push({
        fila: 0, columna: 'Vehiculos_App_V2',
        mensaje: 'La hoja Vehiculos_App_V2 no se procesa desde Excel. Sincroniza los vehículos desde Google Sheets usando el panel de sincronización.',
      });
    }

    // Verificar que existan maestros en Supabase antes de procesar operacional
    const { count: totalConductores } = await supabase
      .from('conductores')
      .select('*', { count: 'exact', head: true });
    const { count: totalVehiculos } = await supabase
      .from('vehiculos')
      .select('*', { count: 'exact', head: true });

    // Detectar qué tipo de hojas operacionales hay
    // Acepta nombres nuevos (Operacion_Conductor, Operacion_Vehiculos) y nombres legados
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const firstRows: Record<string, unknown>[] = firstSheet ? XLSX.utils.sheet_to_json(firstSheet, { defval: '' }) : [];
    const firstHeaders = firstRows[0] ? Object.keys(firstRows[0]).map(normalizeHeader) : [];
    const tieneAlertasDiarias = tipo === 'daily' && (
      wb.SheetNames.some(n => /alertas?[\s_]*(diarias?|gps)?|lacira|diario/i.test(n)) ||
      ['PLACA', 'CONDUCTOR', 'LUGAR', 'LATITUD', 'LONGITUD', 'VELOCIDAD', 'CONTRATO', 'GPS'].every(h => firstHeaders.includes(h))
    );
    const tieneConductor = !tieneAlertasDiarias && wb.SheetNames.some(n => /operaci[oó]n?[\s_]*conductor|^conductor$/i.test(n));
    const tieneVehiculo  = !tieneAlertasDiarias && wb.SheetNames.some(n => /operaci[oó]n?[\s_]*veh|coltrack_?veh/i.test(n));

    if (tieneConductor && (totalConductores ?? 0) === 0) {
      erroresGlobales.push({
        fila: 0, columna: '',
        mensaje: 'No hay conductores en la base de datos. Sincroniza primero desde Google Sheets antes de cargar datos operacionales.',
      });
    }
    if (tieneVehiculo && (totalVehiculos ?? 0) === 0) {
      erroresGlobales.push({
        fila: 0, columna: '',
        mensaje: 'No hay vehículos en la base de datos. Sincroniza primero desde Google Sheets antes de cargar datos operacionales.',
      });
    }

    // Si hay errores bloqueantes, detener
    if (erroresGlobales.length > 0) {
      await supabase
        .from('cargas_excel')
        .update({ estado_validacion: 'invalido', errores_json: erroresGlobales })
        .eq('id', cargaId);
      return { cargaId, exito: false, registrosInsertados: 0, errores: erroresGlobales };
    }

    // Procesar únicamente hojas operacionales
    type Parser = { fn: () => ParseResult<Record<string, unknown>>; insert: (d: Record<string, unknown>[], tipo: 'daily' | 'monthly', cargaId?: string) => Promise<WriteResult> };
    const parsers: Parser[] = [];

    // Advertencias de fila (cédula/placa vacía) — no bloquean la importación
    const warnings: ValidationError[] = [];

    if (tieneAlertasDiarias) {
      const r = parseAlertasDiarias(wb);
      for (const e of r.errores) {
        (e.fila <= 1 ? erroresGlobales : warnings).push(e);
      }
      parsers.push({ fn: () => r, insert: insertAlertasDiarias });
    }

    if (tieneConductor) {
      const r = parseOperacionConductor(wb);
      // Errores estructurales (fila ≤ 1) bloquean; errores de fila individual son advertencias
      for (const e of r.errores) {
        (e.fila <= 1 ? erroresGlobales : warnings).push(e);
      }
      parsers.push({ fn: () => r, insert: insertColtrackConductor });
    }
    if (tieneVehiculo) {
      const r = parseOperacionVehiculo(wb);
      for (const e of r.errores) {
        (e.fila <= 1 ? erroresGlobales : warnings).push(e);
      }
      parsers.push({ fn: () => r, insert: insertColtrackVehiculo });
    }
    if (false) {
      // Rama dead-code para satisfacer TypeScript (Ralentis ya se procesa dentro de vehículos)
    }

    if (parsers.length === 0) {
      erroresGlobales.push({
        fila: 0, columna: '',
        mensaje: tipo === 'daily'
          ? 'No se encontraron datos de alertas diarias. El archivo debe contener las columnas Placa, Conductor, Lugar, Fecha, Velocidad, Contrato y GPS.'
          : 'No se encontraron hojas operacionales. El archivo debe contener una hoja "Operacion_Conductor" o "Operacion_Vehiculos" (o sus equivalentes legados).',
      });
    }

    let totalPendientes = 0;

    if (erroresGlobales.length === 0 && parsers.length > 0) {
      for (const p of parsers) {
        const result = p.fn();
        const write = await p.insert(result.datos, tipo, cargaId);
        warnings.push(...write.omitidos);
        registrosInsertados += write.insertados;
        totalPendientes += write.pendientes;
      }
    }

    // Solo es error bloqueante si no se insertó nada Y no hay pendientes
    if (warnings.length > 0 && registrosInsertados === 0 && totalPendientes === 0) {
      erroresGlobales.push({
        fila: 0,
        columna: '',
        mensaje: 'Ninguna fila pudo cruzarse con las bases maestras de conductores o vehiculos.',
      });
    }

    const estado = erroresGlobales.length === 0 ? 'procesado' : 'invalido';
    await supabase
      .from('cargas_excel')
      .update({
        estado_validacion: estado,
        errores_json: [...erroresGlobales, ...warnings],
      })
      .eq('id', cargaId);

    return {
      cargaId,
      exito: erroresGlobales.length === 0,
      registrosInsertados,
      errores: [...erroresGlobales, ...warnings],
      novedades: totalPendientes > 0 ? { pendientes: totalPendientes } : undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    erroresGlobales.push({ fila: 0, columna: '', mensaje: msg });
    await supabase
      .from('cargas_excel')
      .update({ estado_validacion: 'invalido', errores_json: erroresGlobales })
      .eq('id', cargaId);
    return { cargaId, exito: false, registrosInsertados: 0, errores: erroresGlobales };
  }
}

// ── Descarga de plantilla vacía ───────────────────────────────────────────────

// ── Plantillas de datos operacionales ─────────────────────────────────────────
// Las columnas están en el MISMO ORDEN que el Excel fuente de Coltrack.

export function descargarPlantilla(tipo: 'conductor' | 'vehiculo' | 'alertas'): void {

  if (tipo === 'alertas') {
    const cols = {
      'Placa': '',
      'Conductor': '',
      'Lugar': '',
      'Latitud': '',
      'Longitud': '',
      'Fecha': 'YYYY-MM-DD HH:mm:ss',
      'Velocidad': '',
      'Estado': '',
      'Infraccion 80 Km/h': '',
      'Excesos de velocidad varios parámetros (10,20, 30, 40) km/h': '',
      'Excesos >=50 < 80 km': '',
      'Frenadas Bruscas': '',
      'Contrato': '',
      'Gps': '',
    };

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([cols]);
    XLSX.utils.book_append_sheet(wb, ws, 'Alertas_Diarias');
    XLSX.writeFile(wb, 'Plantilla_Alertas_Diarias_GPS.xlsx');
    return;
  }

  if (tipo === 'conductor') {
    // ── Operación Conductor ──────────────────────────────────────────────────
    const cols = {
      'Conductor':                                                    '',
      'Cédula':                                                       '',
      'Calificacion':                                                 '',
      'kms':                                                          '',
      'Horas conduccion':                                             '',
      'Excesos 10 kph':                                               '',
      'Maxima vel 10 kph':                                            '',
      'Duracion seg 10 kph':                                          '',
      'Excesos 20 kph':                                               '',
      'Maxima vel 20 kph':                                            '',
      'Duracion seg 20 kph':                                          '',
      'Excesos 30 kph':                                               '',
      'Maxima vel 30 kph':                                            '',
      'Duracion seg 30 kph':                                          '',
      'Excesos 40 kph':                                               '',
      'Maxima vel 40 kph':                                            '',
      'Duracion seg 40 kph':                                          '',
      'Excesos 50 kph':                                               '',
      'Maxima vel 50 kph':                                            '',
      'Duracion seg 50 kph':                                          '',
      'Excesos 60 kph':                                               '',
      'Maxima vel 60 kph':                                            '',
      'Duracion seg 60 kph':                                          '',
      '# DE EXCESOS DE VELOCIDAD 80 KM/H':                           '',
      'Maxima vel 80 kph':                                            '',
      'Duracion seg 80 kph':                                          '',
      '# ACELERACIONES BRUSCAS':                                      '',
      '# DE FRENADAS BRUSCAS':                                        '',
      'MES':                                                          '',
      'FECHA':                                                        'YYYY-MM-DD',
      'EXCESOS DE VELOCIDAD VARIOS PPARÁMETROS (10, 20, 30, 40, 50, 60, 70)': '',
      'IBUTTON':                                                      '',
      'Estaso del conductor':                                         '',
      'Periodo':                                                      '',
      'Consecutivo':                                                  '',
    };

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([cols]);
    // Estilo de encabezado: negrita (requiere xlsx-style; aquí solo estructura)
    XLSX.utils.book_append_sheet(wb, ws, 'Operacion_Conductor');
    XLSX.writeFile(wb, 'Plantilla_Operacion_Conductor.xlsx');
    return;
  }

  // ── Operación Vehículos ────────────────────────────────────────────────────
  const cols = {
    'Vehiculo':                                              '',
    'Calificacion':                                          '',
    'kms':                                                   '',
    'Horas conduccion':                                      '',
    'Excesos 10 kph':                                        '',
    'Maxima vel 10 kph':                                     '',
    'Duracion seg 10 kph':                                   '',
    'Excesos 20 kph':                                        '',
    'Maxima vel 20 kph':                                     '',
    'Duracion seg 20 kph':                                   '',
    'Excesos 30 kph':                                        '',
    'Maxima vel 30 kph':                                     '',
    'Duracion seg 30 kph':                                   '',
    'Excesos 40 kph':                                        '',
    'Maxima vel 40 kph':                                     '',
    'Duracion seg 40 kph':                                   '',
    'Excesos 50 kph':                                        '',
    'Maxima vel 50 kph':                                     '',
    'Duracion seg 50 kph':                                   '',
    'Excesos 60 kph':                                        '',
    'Maxima vel 60 kph':                                     '',
    'Duracion seg 60 kph':                                   '',
    'Excesos 80 kph':                                        '',
    'Maxima vel 80 kph':                                     '',
    'Duracion seg 80 kph':                                   '',
    'Aceleraciones':                                         '',
    'Frenadas':                                              '',
    'Excesos de velocidad varios parámetros (10, 20, 30, 40, 50, 60)': '',
    'DISPOSITIVO GPS':                                       '',
    'Mes':                                                   '',
    'fecha de reporte':                                      'YYYY-MM-DD',
    'Periodo':                                               '',
    'Encendido/Apagado':                                     '',
    'Ralentis excesivos':                                    '',
    'Horas motor encendido':                                 '',
    'Horas motor en ralenti':                                '',
    'Consumo de combustible':                                '',
    'Estado':                                                '',
    'Consecutivo':                                           '',
    'Tipo de activo':                                        '',
  };

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([cols]);
  XLSX.utils.book_append_sheet(wb, ws, 'Operacion_Vehiculos');
  XLSX.writeFile(wb, 'Plantilla_Operacion_Vehiculos.xlsx');
}
