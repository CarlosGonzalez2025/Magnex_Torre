import {
  getReporteConductor,
  getReporteVehiculo,
} from './reportService';
import type {
  ConductorOption,
  ContratoOption,
  ReporteConductorData,
  ReporteVehiculoData,
  VehiculoOption,
} from './reportService';
import {
  descargarConsolidadoConductoresContrato,
  descargarConsolidadoVehiculosContrato,
} from './pdfTemplates';

export type TipoInformeMensual = 'conductores' | 'vehiculos';

/**
 * Período mensual inmediatamente anterior, para las comparativas de los consolidados.
 * Mes calendario completo si el período arranca el día 1; en otro caso (períodos 29→28)
 * se retrocede la misma cantidad de días terminando el día previo al inicio actual.
 */
export function obtenerPeriodoAnterior(
  fechaInicioStr: string,
  fechaFinStr: string,
): { fechaInicio: string; fechaFin: string } {
  // Mediodía para evitar redondeos por DST y diferencias de zona horaria.
  const inicio = new Date(fechaInicioStr + 'T12:00:00');

  if (inicio.getDate() === 1) {
    const prevMesInicio = new Date(Date.UTC(inicio.getFullYear(), inicio.getMonth() - 1, 1));
    const prevMesFin = new Date(Date.UTC(inicio.getFullYear(), inicio.getMonth(), 0));
    return {
      fechaInicio: prevMesInicio.toISOString().slice(0, 10),
      fechaFin: prevMesFin.toISOString().slice(0, 10),
    };
  }

  const fin = new Date(fechaFinStr + 'T12:00:00');
  // diffDays = días exactos entre inicio y fin (ej: 29 para 29/04–28/05)
  const diffDays = Math.round((fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));

  // prevFin = día anterior al inicio del período actual (ej: 28/04)
  const prevFin = new Date(fechaInicioStr + 'T12:00:00');
  prevFin.setDate(prevFin.getDate() - 1);

  // prevInicio = prevFin retrocedido diffDays días (ej: 28/04 - 29 = 30/03)
  const prevInicio = new Date(prevFin.getTime());
  prevInicio.setDate(prevInicio.getDate() - diffDays);

  return {
    fechaInicio: prevInicio.toISOString().slice(0, 10),
    fechaFin: prevFin.toISOString().slice(0, 10),
  };
}

function tieneGpsConfigurado(valor?: string | null): boolean {
  const normalizado = String(valor ?? '').trim().toUpperCase();
  return Boolean(normalizado) && !['NO', 'N/A', 'NA', 'SIN GPS', 'NINGUNO', 'NO APLICA', '0'].includes(normalizado);
}

/**
 * Genera y descarga los consolidados mensuales en PDF de un contrato.
 *
 * Siempre se consultan conductores Y vehículos (del período y del anterior) porque cada
 * consolidado referencia al otro y compara contra el período previo; `tipos` decide
 * únicamente qué PDFs se descargan.
 *
 * @returns los tipos de informe efectivamente generados (vacío = sin datos en el período).
 */
export async function descargarInformesMensualesContrato(params: {
  contrato: ContratoOption;
  /** Catálogo completo de conductores; se filtra por contrato internamente. */
  conductores: ConductorOption[];
  /** Catálogo completo de vehículos; se filtra por contrato internamente. */
  vehiculos: VehiculoOption[];
  fechaInicio: string;
  fechaFin: string;
  tipos?: TipoInformeMensual[];
}): Promise<TipoInformeMensual[]> {
  const { contrato, fechaInicio, fechaFin } = params;
  const tipos = params.tipos ?? ['conductores', 'vehiculos'];

  const conductoresContrato = params.conductores.filter(c => c.contrato_id === contrato.id);
  const vehiculosContrato = params.vehiculos.filter(v => v.contrato_id === contrato.id);
  const prev = obtenerPeriodoAnterior(fechaInicio, fechaFin);

  const [datosConductores, datosVehiculos, datosConductoresPrev, datosVehiculosPrev] = await Promise.all([
    Promise.all(conductoresContrato.map(c => getReporteConductor({
      conductorId: c.id, fechaInicio, fechaFin, contratoId: contrato.id,
    }))),
    Promise.all(vehiculosContrato.map(v => getReporteVehiculo({
      vehiculoId: v.id, fechaInicio, fechaFin, contratoId: contrato.id,
    }))),
    Promise.all(conductoresContrato.map(c => getReporteConductor({
      conductorId: c.id, fechaInicio: prev.fechaInicio, fechaFin: prev.fechaFin, contratoId: contrato.id,
    }))),
    Promise.all(vehiculosContrato.map(v => getReporteVehiculo({
      vehiculoId: v.id, fechaInicio: prev.fechaInicio, fechaFin: prev.fechaFin, contratoId: contrato.id,
    }))),
  ]);

  const conductoresValidos = datosConductores.filter(Boolean) as ReporteConductorData[];
  const vehiculosValidos = datosVehiculos.filter(Boolean) as ReporteVehiculoData[];
  const conductoresPrevValidos = datosConductoresPrev.filter(Boolean) as ReporteConductorData[];
  const vehiculosPrevValidos = datosVehiculosPrev.filter(Boolean) as ReporteVehiculoData[];

  const vehiculosConGps = vehiculosContrato.filter(v => tieneGpsConfigurado(v.gps_compañia)).length;
  const resumen = {
    totalVehiculos: vehiculosContrato.length,
    totalConductores: conductoresContrato.length,
    vehiculosConGps,
    vehiculosSinGps: Math.max(0, vehiculosContrato.length - vehiculosConGps),
  };

  const generados: TipoInformeMensual[] = [];

  if (tipos.includes('conductores') && conductoresValidos.length > 0) {
    await descargarConsolidadoConductoresContrato(
      contrato,
      conductoresValidos,
      vehiculosValidos,
      resumen,
      fechaInicio,
      fechaFin,
      conductoresPrevValidos,
      vehiculosPrevValidos,
    );
    generados.push('conductores');
  }

  if (tipos.includes('vehiculos') && vehiculosValidos.length > 0) {
    await descargarConsolidadoVehiculosContrato(
      contrato,
      vehiculosValidos,
      conductoresValidos,
      resumen,
      fechaInicio,
      fechaFin,
      vehiculosPrevValidos,
      conductoresPrevValidos,
    );
    generados.push('vehiculos');
  }

  return generados;
}
