export interface CorreoMensual {
  asunto: string;
  cuerpo: string;
}

const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

/**
 * Etiqueta del mes lógico de un período mensual: "JUNIO 2026".
 *
 * Los períodos corren del día 29 al 28 (p.ej. "junio" = 29-may → 28-jun), por lo que
 * el mes lógico es el del FIN del período (el día 28 siempre cae en el mes correcto).
 */
export function etiquetaMesPeriodo(periodoFin: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(periodoFin ?? ''));
  if (!m) return String(periodoFin ?? '');
  const [, anio, mes] = m;
  return `${MESES[Number(mes) - 1] ?? mes} ${anio}`;
}

/** Año del mes lógico del período (el del fin de período). */
export function anioPeriodo(periodoFin: string): string {
  const m = /^(\d{4})/.exec(String(periodoFin ?? ''));
  return m ? m[1] : String(new Date().getFullYear());
}

/**
 * Correo de remisión del Informe Mensual de Monitoreo de Comportamientos Viales.
 * El texto es la plantilla institucional aprobada; solo se interpolan el contrato,
 * el mes del período y el año de vigencia.
 */
export function generarCorreoInformeMensual(params: {
  contratoNombre: string;
  periodoInicio: string;
  periodoFin: string;
}): CorreoMensual {
  const contrato = String(params.contratoNombre ?? '').trim().toUpperCase() || 'CONTRATO';
  const mes = etiquetaMesPeriodo(params.periodoFin);
  const anio = anioPeriodo(params.periodoFin);

  const L: string[] = [];
  L.push('Cordial saludo,');
  L.push('Adjunto encontrarán el Informe Mensual de Monitoreo de Comportamientos Viales de la Flota Vehicular, correspondiente a');
  L.push('');
  L.push(`${contrato}| ${mes}, `);
  L.push('');
  L.push('elaborado con el objetivo de identificar tendencias de riesgo, fortalecer las acciones preventivas y dar cumplimiento a los lineamientos del Plan Estratégico de Seguridad Vial (PESV) y el Sistema de Gestión de Seguridad y Salud en el Trabajo (SG-SST).');
  L.push('');
  L.push('📌 Notas importantes');
  L.push('');
  L.push('1. Revisión de flota:');
  L.push('Agradecemos validar la flota vehicular relacionada en el informe. En caso de identificar novedades (inclusiones, retiros o cambios de asignación), solicitamos informarnos oportunamente para realizar los ajustes correspondientes en las plataformas de monitoreo y en la base de control operativo.');
  L.push('');
  L.push('2. Identificación iButton:');
  L.push('Para garantizar la trazabilidad y cobertura total de la información, es indispensable que todos los conductores utilicen correctamente su llave iButton, previamente registrada en el sistema GPS Coltrack. El uso adecuado de este dispositivo permite asociar los eventos comportamentales al conductor correspondiente y fortalecer los análisis individuales y grupales.');
  L.push('En relación con las acciones propuestas en el informe, recordamos que la Gerencia del Proyecto y el equipo HSE son responsables de gestionar y documentar los cierres correspondientes. Estas acciones están orientadas a:');
  L.push('Fortalecer la cultura de seguridad vial.');
  L.push('Reducir la exposición al riesgo operacional.');
  L.push('Prevenir la materialización de incidentes y accidentes viales.');
  L.push('Garantizar el cumplimiento de los indicadores establecidos en el PESV.');
  L.push('');
  L.push(`Reiteramos nuestro compromiso en continuar fortaleciendo el control operativo y la gestión preventiva durante el año ${anio}, alineados con los objetivos estratégicos de seguridad vial del proyecto.`);
  L.push('');
  L.push('Quedamos atentos a cualquier comentario, observación o requerimiento adicional.');

  return {
    asunto: `Informe Mensual de Monitoreo de Comportamientos Viales — ${contrato} | ${mes}`,
    cuerpo: L.join('\n'),
  };
}
