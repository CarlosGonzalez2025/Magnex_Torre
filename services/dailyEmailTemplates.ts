import type { ReporteAlertasDiariasData, AlertaDiariaGps } from './reportService';
import { esConductorIdentificado } from './reportService';

export interface CorreoAlertas {
  tipo: 'critico' | 'preventivo';
  asunto: string;
  cuerpo: string;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function n(v: number): string {
  return Math.round(v).toLocaleString('es-CO');
}

/** 'YYYY-MM-DD' → "01 de julio de 2026". */
function fechaLarga(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return String(iso ?? '');
  const [, y, mes, d] = m;
  const mesLabel = MESES[Number(mes) - 1] ?? mes;
  return `${d} de ${mesLabel} de ${y}`;
}

/** Periodo en español: día único → fecha larga; rango → "26 de junio al 30 de junio de 2026". */
function periodoLargo(inicio: string, fin: string): string {
  if (!fin || inicio === fin) return fechaLarga(inicio);
  return `${fechaLarga(inicio)} al ${fechaLarga(fin)}`;
}

function nombreConductor(a: AlertaDiariaGps): string {
  return esConductorIdentificado(a.conductor) ? a.conductor : 'No registra';
}

function esMoto(tipo: string): boolean {
  return String(tipo ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().includes('MOTO');
}

function tipoVehiculoLabel(tipo: string): string {
  const t = String(tipo ?? '').trim();
  if (!t) return 'Vehículo';
  return esMoto(t) ? 'Motocicleta' : t;
}

interface PlacaAgg {
  placa: string;
  tipo_activo: string;
  identificado: boolean;
  conductor: string;
  infr80: number;
  exc50a80: number;
  excVarios: number;
  frenadas: number;
}

/** Agrega los eventos por placa dentro del contrato/periodo. */
function agregarPorPlaca(alertas: AlertaDiariaGps[]): Map<string, PlacaAgg> {
  const map = new Map<string, PlacaAgg>();
  for (const a of alertas) {
    const placa = String(a.placa ?? '').trim() || 'SIN PLACA';
    const cur = map.get(placa) ?? {
      placa,
      tipo_activo: a.tipo_activo ?? '',
      identificado: false,
      conductor: 'No registra',
      infr80: 0, exc50a80: 0, excVarios: 0, frenadas: 0,
    };
    cur.infr80 += Number(a.infraccion_80_kmh ?? 0);
    cur.exc50a80 += Number(a.excesos_50_80_kmh ?? 0);
    cur.excVarios += Number(a.excesos_varios_parametros ?? 0);
    cur.frenadas += Number(a.frenadas_bruscas ?? 0);
    if (!cur.tipo_activo && a.tipo_activo) cur.tipo_activo = a.tipo_activo;
    // Conserva un conductor identificado si aparece en cualquier evento de la placa.
    if (!cur.identificado && esConductorIdentificado(a.conductor)) {
      cur.identificado = true;
      cur.conductor = a.conductor;
    }
    map.set(placa, cur);
  }
  return map;
}

// ── Plantilla CRÍTICA (hay excesos ≥ 80 km/h) ─────────────────────────────────

function cuerpoCritico(data: ReporteAlertasDiariasData, aggs: PlacaAgg[]): string {
  const { resumen } = data;
  const operacion = data.contrato?.nombre ?? 'la operación';
  const periodo = periodoLargo(data.periodoInicio, data.periodoFin);

  const criticos = aggs
    .filter(a => a.infr80 > 0)
    .sort((x, y) => y.infr80 - x.infr80);

  const topFrenadas = aggs
    .filter(a => a.frenadas > 0)
    .sort((x, y) => y.frenadas - x.frenadas)
    .slice(0, 6);

  const L: string[] = [];
  L.push('Cordial saludo');
  L.push('');
  L.push('Estimados Ingenieros');
  L.push('');
  L.push(`Me permito hacer envío del informe correspondiente con el análisis de los excesos de velocidad presentado el ${periodo}.`);
  L.push('');

  // 1. Resumen ejecutivo
  L.push('1. RESUMEN EJECUTIVO');
  L.push(
    `Durante la jornada del ${periodo}, la operación ${operacion} registró ${n(resumen.infracciones80)} evento(s) de velocidad igual o superior a 80 km/h, clasificándose como una condición de Alerta por Manejo Reactivo Agudo, al tratarse de una infracción de alta severidad que requiere intervención inmediata.`
  );
  L.push(
    `Adicional a los eventos críticos, la operación presentó ${n(resumen.excesos50a80)} excesos de velocidad entre 50 y 80 km/h y ${n(resumen.frenadas)} frenadas bruscas, indicadores que evidencian una conducción reactiva y una tendencia al incumplimiento de los límites de velocidad antes de alcanzar el umbral crítico.`
  );
  L.push(
    `Adicionalmente, se identificaron ${n(resumen.personasSinIdentificar)} conductor(es) sin registro mediante llave iButton, situación que continúa afectando la trazabilidad de la operación y limita la identificación precisa de los responsables de los eventos registrados.`
  );
  L.push('');

  // 2. Detalle de casos críticos
  L.push('2. DETALLE DE HALLAZGOS (CASOS CRÍTICOS)');
  L.push('En cumplimiento del protocolo de monitoreo técnico para la columna Infracción 80 km/h, se identificaron los siguientes eventos críticos:');
  L.push('');
  L.push('#  | Vehículo | Conductor | Eventos ≥80 km/h | Tipo de vehículo | Severidad');
  criticos.forEach((c, i) => {
    L.push(`${i + 1}  | ${c.placa} | ${c.identificado ? c.conductor : 'No registra'} | ${n(c.infr80)} | ${tipoVehiculoLabel(c.tipo_activo)} | ALTA`);
  });
  L.push('');
  L.push('Análisis del caso:');
  criticos.forEach((c) => {
    const tipo = tipoVehiculoLabel(c.tipo_activo);
    L.push(
      `• ${c.placa} (${tipo}): registró ${n(c.infr80)} exceso(s) de velocidad igual o superior a 80 km/h, condición que incrementa el riesgo de pérdida de control y reduce el tiempo de reacción frente a cambios en las condiciones de la vía${esMoto(c.tipo_activo) ? ', especialmente tratándose de una motocicleta' : ''}.`
    );
    if (!c.identificado) {
      L.push(
        `  El evento fue registrado bajo la condición "No registra", lo que impide identificar al conductor responsable y dificulta la implementación de acciones correctivas específicas y el seguimiento individual del comportamiento vial.`
      );
    }
  });
  L.push('');

  // 3. Contexto preventivo
  L.push('3. CONTEXTO PREVENTIVO (ALERTAS MENORES)');
  L.push('Además de los eventos críticos identificados, el análisis operativo permitió evidenciar los siguientes indicadores preventivos:');
  if (topFrenadas.length > 0) {
    L.push(`Se registraron ${n(resumen.frenadas)} frenadas bruscas. Los mayores registros corresponden a:`);
    topFrenadas.forEach(t => L.push(`  - ${t.placa}: ${n(t.frenadas)} eventos.`));
  }
  L.push(
    `Se identificaron ${n(resumen.excesos50a80)} excesos de velocidad entre 50 y 80 km/h, comportamiento que representa un factor precursor de los eventos críticos de velocidad.`
  );
  L.push(
    `Se registraron ${n(resumen.personasSinIdentificar)} persona(s) con alertas sin identificación mediante llave iButton, condición que limita la trazabilidad de la operación y dificulta la gestión individual de los comportamientos inseguros.`
  );
  L.push('');

  // 4. Recomendaciones
  L.push('4. RECOMENDACIONES');
  if (criticos[0]) {
    L.push(`• Realizar retroalimentación al conductor asociado al vehículo ${criticos[0].placa} una vez sea identificado y verificar las condiciones que originaron el evento de velocidad superior a 80 km/h.`);
  }
  L.push(`• Fortalecer las campañas de conducción defensiva orientadas al control de velocidad y la anticipación del riesgo para disminuir los ${n(resumen.excesos50a80)} excesos de velocidad y las ${n(resumen.frenadas)} frenadas bruscas registradas.`);
  L.push('• Verificar diariamente el uso correcto de la llave iButton antes del inicio de la jornada para garantizar la identificación de todos los conductores.');
  L.push('• Mantener seguimiento a los conductores y vehículos con mayor número de frenadas bruscas para implementar acciones preventivas y reducir la reincidencia de estos comportamientos.');

  return L.join('\n');
}

// ── Plantilla PREVENTIVA (sin excesos ≥ 80 km/h) ──────────────────────────────

function cuerpoPreventivo(data: ReporteAlertasDiariasData, aggs: PlacaAgg[]): string {
  const { resumen } = data;
  const contrato = data.contrato?.nombre ?? 'el contrato';
  const periodo = periodoLargo(data.periodoInicio, data.periodoFin);

  const topIncidencia = aggs
    .map(a => ({ ...a, total: a.exc50a80 + a.frenadas + a.excVarios }))
    .filter(a => a.total > 0)
    .sort((x, y) => y.total - x.total)
    .slice(0, 5);

  const topExc = [...aggs].filter(a => a.exc50a80 > 0).sort((x, y) => y.exc50a80 - x.exc50a80).slice(0, 3);
  const topFren = [...aggs].filter(a => a.frenadas > 0).sort((x, y) => y.frenadas - x.frenadas).slice(0, 3);

  const L: string[] = [];
  L.push('Buen día,');
  L.push('');
  L.push(
    `Se ha realizado el análisis de alertas de conducción correspondiente al periodo del ${periodo} para el contrato ${contrato}, con base en el reporte emitido por la Torre de Control y la validación de la información suministrada.`
  );
  L.push('');
  L.push('A continuación, se presentan los principales hallazgos identificados durante el periodo evaluado:');
  L.push('');
  L.push(`Infracciones a 80 km/h: ${n(resumen.infracciones80)}.`);
  L.push(`Excesos de velocidad (>50 km/h hasta 80 km/h): ${n(resumen.excesos50a80)}.`);
  L.push(`Frenadas Bruscas: ${n(resumen.frenadas)}.`);
  L.push('');

  L.push('Análisis de Conductores con Mayor Incidencia');
  L.push('');
  L.push('Tras la revisión y validación de los registros de conductores y placas, los principales vehículos involucrados son:');
  topIncidencia.forEach((t) => {
    const partes: string[] = [];
    if (t.exc50a80 > 0) partes.push(`${n(t.exc50a80)} excesos de velocidad`);
    if (t.frenadas > 0) partes.push(`${n(t.frenadas)} frenadas bruscas`);
    const idTxt = t.identificado ? `conductor ${t.conductor}` : 'sin identificación del conductor ("No registra")';
    L.push(`  - ${t.placa}: registra ${partes.join(' y ')}, ${idTxt}.`);
  });
  L.push('');

  L.push('Análisis de Riesgos y Trazabilidad');
  L.push('');
  L.push('Control de Velocidad');
  L.push(
    `Durante el periodo se registraron ${n(resumen.excesos50a80)} excesos de velocidad entre 50 km/h y 80 km/h${topExc.length ? `, concentrándose principalmente en los vehículos ${topExc.map(t => t.placa).join(', ')}` : ''}. La ausencia de identificación del conductor en varios de estos eventos impide una gestión efectiva sobre los responsables y representa un riesgo importante para la operación.`
  );
  L.push('');
  L.push('Conducción Reactiva (Frenadas Bruscas)');
  L.push(
    `Se identificaron ${n(resumen.frenadas)} alertas de frenadas bruscas${topFren.length ? `, siendo el vehículo ${topFren[0].placa} el de mayor recurrencia con ${n(topFren[0].frenadas)} eventos` : ''}. Estos comportamientos evidencian la necesidad de fortalecer las prácticas de conducción preventiva y realizar seguimiento operativo a estos vehículos.`
  );
  L.push('');
  L.push('Gestión de Identidad (iButton)');
  L.push(
    `De las ${n(resumen.personasAutorizadas)} personas autorizadas para conducir, ${n(resumen.personasIdentificadas)} conductor(es) registró(aron) alertas identificadas mediante llave iButton, mientras que se evidenciaron ${n(resumen.personasSinIdentificar)} registro(s) sin identificación. Este comportamiento limita la trazabilidad de la operación y la implementación de acciones correctivas sobre los conductores involucrados.`
  );
  L.push('');
  L.push('Control de Velocidad Máxima');
  L.push('Se resalta positivamente que durante el periodo evaluado no se registraron excesos de velocidad iguales o superiores a 80 km/h, manteniendo el cumplimiento del indicador crítico de seguridad vial.');
  L.push('');

  L.push('Recomendaciones');
  const placasClave = topIncidencia.map(t => t.placa).join(', ');
  L.push(`• Implementar de manera inmediata controles para garantizar el uso obligatorio de la llave iButton antes del inicio de cada recorrido${placasClave ? `, especialmente en los vehículos ${placasClave}` : ''}.`);
  L.push('• Realizar seguimiento preventivo a los vehículos con mayor número de excesos de velocidad y frenadas bruscas, priorizando la identificación de los conductores responsables.');
  L.push('• Fortalecer las campañas de sensibilización sobre cumplimiento de límites de velocidad y técnicas de manejo defensivo.');
  L.push('• Mantener el seguimiento al indicador de velocidad máxima, conservando el resultado positivo obtenido al no registrar excesos superiores a 80 km/h.');

  return L.join('\n');
}

// ── API pública ────────────────────────────────────────────────────────────────

export function generarCorreoAlertasDiarias(data: ReporteAlertasDiariasData): CorreoAlertas {
  const aggs = Array.from(agregarPorPlaca(data.alertas).values());
  const contrato = data.contrato?.nombre ?? 'Contrato';
  const periodo = periodoLargo(data.periodoInicio, data.periodoFin);
  const critico = data.resumen.infracciones80 > 0;

  return {
    tipo: critico ? 'critico' : 'preventivo',
    asunto: `Informe de alertas GPS — ${contrato} — ${periodo}`,
    cuerpo: critico ? cuerpoCritico(data, aggs) : cuerpoPreventivo(data, aggs),
  };
}
