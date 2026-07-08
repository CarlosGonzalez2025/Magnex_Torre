/**
 * Métricas de motor/ralentí NORMALIZADAS por vehículos activos (horas de motor > 0).
 *
 * Fuente única de verdad de la agregación del módulo "Análisis General". Se extrajo del
 * componente para poder probarla de forma aislada (ver scratch/test_ralenti_metrics.mjs) y
 * evitar la regresión del bug diagnosticado en docs/DIAGNOSTICO_RALENTI_Q1_JUNIO_2026.md:
 * las filas con encendido=0 pero ralentí>0 (cargas de excesos/Fagor sin consolidado de horas
 * de motor) inflaban el % Ralentí a valores físicamente imposibles porque sumaban al
 * numerador sin aportar al denominador. Aquí el % y la conducción se calculan SOLO sobre el
 * universo con motor>0, y la identidad Motor = Conducción + Ralentí se cumple por construcción.
 */

export interface RalentiPeriodoRow {
  vehiculo_id: string;
  horas_motor_encendido?: number | string | null;
  horas_motor_ralenti?: number | string | null;
  kms_recorridos?: number | string | null;
  consumo_combustible?: number | string | null;
}

export interface MotorMetrics {
  totalHorasEncendido: number;
  totalHorasRalenti: number;      // ralentí normalizado (solo filas con encendido>0)
  ralentiHuerfano: number;        // ralentí de filas con encendido=0 (excluido del %)
  totalKm: number;
  totalGalones: number;           // galones de ralentí (todas las filas)
  horasConduccion: number;        // = encendido − ralentí (universo con motor)
  pctRalenti: number;             // [0..100]
  pctConduccion: number;          // [0..100]
  velocidadMedia: number;         // km/h ponderada = km / conducción
  kmPorHoraRalenti: number;       // km / ralentí
  kmPorVehiculoActivo: number;    // km / vehículos con motor
  vehiculosActivos: number;       // vehículos únicos en el período
  vehiculosConMotor: number;      // vehículos con encendido>0
  coberturaMotorPct: number;      // conMotor / activos * 100
  filasRalentiMayorEnc: number;   // filas con ralentí > encendido*1.02 (violación física)
  datoInconsistente: boolean;     // cobertura<98% o hay violaciones físicas
}

const N = (v: unknown): number => Number(v) || 0;

/** Umbral de cobertura por debajo del cual un período se marca como inconsistente. */
export const COBERTURA_MIN_PCT = 98;
/** Tolerancia de la validación cruzada de la identidad (2%). */
export const IDENTIDAD_TOLERANCIA = 0.02;

export function computeMotorMetrics(pRows: RalentiPeriodoRow[]): MotorMetrics {
  const motorRows = pRows.filter(r => N(r.horas_motor_encendido) > 0);

  const totalGalones = pRows.reduce((a, r) => a + N(r.consumo_combustible), 0);
  const totalHorasEncendido = motorRows.reduce((a, r) => a + N(r.horas_motor_encendido), 0);
  const totalHorasRalenti = motorRows.reduce((a, r) => a + N(r.horas_motor_ralenti), 0);
  const ralentiHuerfano = pRows.reduce(
    (a, r) => a + (N(r.horas_motor_encendido) === 0 ? N(r.horas_motor_ralenti) : 0), 0);
  const totalKm = motorRows.reduce((a, r) => a + N(r.kms_recorridos), 0);

  const vehSet = new Set<string>();
  const vehMotorSet = new Set<string>();
  let filasRalentiMayorEnc = 0;
  for (const r of pRows) {
    vehSet.add(String(r.vehiculo_id));
    const enc = N(r.horas_motor_encendido);
    const ral = N(r.horas_motor_ralenti);
    if (enc > 0) vehMotorSet.add(String(r.vehiculo_id));
    if (enc > 0 && ral > enc * 1.02) filasRalentiMayorEnc += 1;
  }

  const horasConduccion = Math.max(totalHorasEncendido - totalHorasRalenti, 0);
  const pctRalenti = totalHorasEncendido > 0 ? (totalHorasRalenti / totalHorasEncendido) * 100 : 0;
  const pctConduccion = totalHorasEncendido > 0 ? (horasConduccion / totalHorasEncendido) * 100 : 0;
  const velocidadMedia = horasConduccion > 0 ? totalKm / horasConduccion : 0;
  const kmPorHoraRalenti = totalHorasRalenti > 0 ? totalKm / totalHorasRalenti : 0;
  const kmPorVehiculoActivo = vehMotorSet.size > 0 ? totalKm / vehMotorSet.size : 0;
  const coberturaMotorPct = vehSet.size > 0 ? (vehMotorSet.size / vehSet.size) * 100 : 0;
  const datoInconsistente = coberturaMotorPct < COBERTURA_MIN_PCT || filasRalentiMayorEnc > 0;

  return {
    totalHorasEncendido, totalHorasRalenti, ralentiHuerfano, totalKm, totalGalones,
    horasConduccion, pctRalenti, pctConduccion, velocidadMedia, kmPorHoraRalenti,
    kmPorVehiculoActivo, vehiculosActivos: vehSet.size, vehiculosConMotor: vehMotorSet.size,
    coberturaMotorPct, filasRalentiMayorEnc, datoInconsistente,
  };
}

/**
 * Desviación relativa de la identidad Motor = Conducción + Ralentí en el agregado.
 * Debe ser ~0 sobre el universo con motor (la conducción se deriva). Si supera
 * IDENTIDAD_TOLERANCIA hay un error de agregación.
 */
export function identityDeviation(m: MotorMetrics): number {
  if (m.totalHorasEncendido <= 0) return 0;
  return Math.abs(m.totalHorasEncendido - (m.horasConduccion + m.totalHorasRalenti)) / m.totalHorasEncendido;
}
