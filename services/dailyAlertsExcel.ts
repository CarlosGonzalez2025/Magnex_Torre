import type ExcelJSType from 'exceljs';
import type { ReporteAlertasDiariasData, AlertaDiariaGps } from './reportService';
import { esConductorIdentificado } from './reportService';
import { descargarBuffer, MIME_XLSX } from '../utils/descargarArchivo';

// ── Paleta y helpers de estilo ────────────────────────────────────────────────
const COLORS = {
  navy: '1F2937',
  navy2: '334155',
  blue: '2563EB',
  blueLight: 'DBEAFE',
  green: '16A34A',
  amber: 'D97706',
  red: 'DC2626',
  redLight: 'FEE2E2',
  amberLight: 'FEF3C7',
  orange: 'EA580C',
  slate: 'E2E8F0',
  slateLight: 'F1F5F9',
  white: 'FFFFFF',
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso ?? '');
}
function horaCorta(iso: string): string {
  const m = /[T\s](\d{2}:\d{2}(?::\d{2})?)/.exec(String(iso ?? ''));
  return m ? m[1] : '';
}
function periodoLargo(inicio: string, fin: string): string {
  const larga = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${m[3]} de ${MESES[+m[2] - 1] ?? m[2]} de ${m[1]}` : iso;
  };
  return !fin || inicio === fin ? larga(inicio) : `${larga(inicio)} al ${larga(fin)}`;
}

/** Categoría del evento a partir de sus contadores. */
function categoria(a: AlertaDiariaGps): string {
  if (num(a.infraccion_80_kmh) > 0) return 'Infracción ≥80 km/h';
  if (num(a.excesos_50_80_kmh) > 0) return 'Exceso 50-80 km/h';
  if (num(a.excesos_varios_parametros) > 0) return 'Exceso 10-40 km/h';
  if (num(a.frenadas_bruscas) > 0) return 'Frenada brusca';
  return String(a.estado ?? '') || 'Otro';
}

function mapsUrl(a: AlertaDiariaGps): string {
  const lat = num(a.latitud), lng = num(a.longitud);
  if (lat !== 0 && lng !== 0) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const lugar = String(a.lugar ?? '').trim();
  return lugar ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}` : '';
}

function borderThin(cell: ExcelJSType.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: COLORS.slate } },
    left: { style: 'thin', color: { argb: COLORS.slate } },
    bottom: { style: 'thin', color: { argb: COLORS.slate } },
    right: { style: 'thin', color: { argb: COLORS.slate } },
  };
}
function styleHeaderCell(cell: ExcelJSType.Cell, fill = COLORS.navy) {
  cell.font = { bold: true, color: { argb: COLORS.white }, size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  borderThin(cell);
}

// ── Hoja 1: Resumen (segmentado como el PDF) ──────────────────────────────────

function addResumenSheet(wb: ExcelJSType.Workbook, data: ReporteAlertasDiariasData) {
  const { resumen, alertas } = data;
  const ws = wb.addWorksheet('Resumen');
  const contrato = data.contrato?.nombre ?? 'Todos los contratos';
  const periodo = periodoLargo(data.periodoInicio, data.periodoFin);

  ws.mergeCells('A1:D1');
  const t = ws.getCell('A1');
  t.value = 'Informe Diario de Comportamiento Vial — Detalle de Alertas GPS';
  t.font = { bold: true, size: 14, color: { argb: COLORS.white } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
  t.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 26;
  ws.mergeCells('A2:D2');
  const s = ws.getCell('A2');
  s.value = `Contrato: ${contrato}   |   Periodo: ${periodo}`;
  s.font = { italic: true, bold: true, color: { argb: COLORS.navy2 } };
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blueLight } };

  let r = 4;
  const seccion = (titulo: string, filas: Array<[string, number | string, string?]>) => {
    ws.mergeCells(r, 1, r, 4);
    const c = ws.getCell(r, 1);
    c.value = titulo;
    c.font = { bold: true, color: { argb: COLORS.white } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy2 } };
    r++;
    for (const [label, valor, accent] of filas) {
      const lc = ws.getCell(r, 1); lc.value = label; lc.font = { bold: true, color: { argb: COLORS.navy } };
      ws.mergeCells(r, 1, r, 3); borderThin(lc);
      const vc = ws.getCell(r, 4); vc.value = valor;
      vc.font = { bold: true, color: { argb: accent ?? COLORS.navy2 } };
      vc.alignment = { horizontal: 'center' };
      if (typeof valor === 'number') vc.numFmt = '#,##0';
      borderThin(vc);
      r++;
    }
    r++;
  };

  const pctAlertas = resumen.vehiculosActivosBase > 0 ? (resumen.vehiculosConAlertas / resumen.vehiculosActivosBase) * 100 : 0;
  seccion('Resumen ejecutivo - flota activa', [
    ['Vehículos activos en BD', resumen.vehiculosActivosBase],
    ['Vehículos con alertas', resumen.vehiculosConAlertas, COLORS.red],
    ['Vehículos sin alertas', Math.max(0, resumen.vehiculosActivosBase - resumen.vehiculosConAlertas), COLORS.green],
    ['% de la flota con alertas', `${pctAlertas.toFixed(1)}%`],
  ]);
  seccion('Trazabilidad de conductores', [
    ['Conductores activos en BD', resumen.personasAutorizadas],
    ['Con alertas identificadas', resumen.personasIdentificadas, COLORS.green],
    ['Alertas sin identificar (eventos)', resumen.alertasSinConductorIdentificado, COLORS.amber],
    ['Situaciones vehículo-día sin iButton', resumen.personasSinIdentificar, COLORS.amber],
  ]);
  seccion('Totales por tipo de alerta', [
    ['Infracción ≥ 80 km/h', resumen.infracciones80, COLORS.red],
    ['Excesos 50-80 km/h', resumen.excesos50a80, COLORS.amber],
    ['Excesos varios (10/20/30/40 km/h)', resumen.excesosVarios, COLORS.red],
    ['Frenadas bruscas', resumen.frenadas, COLORS.orange],
  ]);

  // Ranking top vehículos/conductores por total de eventos
  const rank = new Map<string, { placa: string; conductor: string; total: number }>();
  for (const a of alertas) {
    const placa = String(a.placa ?? '');
    const key = placa;
    const cur = rank.get(key) ?? { placa, conductor: esConductorIdentificado(a.conductor) ? a.conductor : 'No registra', total: 0 };
    cur.total += num(a.infraccion_80_kmh) + num(a.excesos_50_80_kmh) + num(a.excesos_varios_parametros) + num(a.frenadas_bruscas);
    rank.set(key, cur);
  }
  const top = Array.from(rank.values()).filter(x => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 15);
  if (top.length > 0) {
    ws.mergeCells(r, 1, r, 4);
    const c = ws.getCell(r, 1);
    c.value = 'Top vehículos por total de eventos';
    c.font = { bold: true, color: { argb: COLORS.white } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blue } };
    r++;
    ['Placa', 'Conductor', 'Total eventos'].forEach((h, i) => {
      const hc = ws.getCell(r, i === 0 ? 1 : i === 1 ? 2 : 4);
      hc.value = h; styleHeaderCell(hc, COLORS.navy2);
    });
    ws.mergeCells(r, 2, r, 3);
    r++;
    for (const x of top) {
      ws.getCell(r, 1).value = x.placa; borderThin(ws.getCell(r, 1));
      const cc = ws.getCell(r, 2); cc.value = x.conductor; ws.mergeCells(r, 2, r, 3); borderThin(cc);
      const tc = ws.getCell(r, 4); tc.value = x.total; tc.numFmt = '#,##0'; tc.alignment = { horizontal: 'center' }; tc.font = { bold: true }; borderThin(tc);
      r++;
    }
  }

  ws.getColumn(1).width = 38;
  ws.getColumn(2).width = 26;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 16;
}

// ── Hoja 2: Detalle de Alertas (un evento por fila, toda la info) ──────────────

function addDetalleSheet(wb: ExcelJSType.Workbook, data: ReporteAlertasDiariasData) {
  const ws = wb.addWorksheet('Detalle de Alertas', { views: [{ state: 'frozen', ySplit: 1 }] });
  const contratoNombre = data.contrato?.nombre ?? '';

  const headers = [
    'Fecha', 'Hora', 'Placa', 'Tipo de vehículo', 'Conductor', 'Identificado',
    'Contrato', 'Cliente', 'Plataforma GPS', 'Nombre de alerta', 'Categoría',
    'Velocidad (km/h)', '≥80', '50-80', '10-40', 'Frenadas',
    'Ubicación', 'Latitud', 'Longitud', 'Ver en Maps',
  ];
  ws.getRow(1).values = headers;
  ws.getRow(1).eachCell(c => styleHeaderCell(c));

  // Orden cronológico
  const alertas = [...data.alertas].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

  alertas.forEach((a, i) => {
    const rowNum = i + 2;
    const identificado = esConductorIdentificado(a.conductor);
    const cat = categoria(a);
    ws.getRow(rowNum).values = [
      fechaCorta(String(a.fecha)),
      horaCorta(String(a.fecha)),
      String(a.placa ?? ''),
      String(a.tipo_activo ?? ''),
      identificado ? String(a.conductor) : 'No registra',
      identificado ? 'Sí' : 'No',
      contratoNombre || String(a.contrato_nombre ?? ''),
      String(a.cliente ?? ''),
      String(a.gps ?? ''),
      String(a.estado ?? '') || cat,
      cat,
      num(a.velocidad) || '',
      num(a.infraccion_80_kmh) || '',
      num(a.excesos_50_80_kmh) || '',
      num(a.excesos_varios_parametros) || '',
      num(a.frenadas_bruscas) || '',
      String(a.lugar ?? ''),
      num(a.latitud) || '',
      num(a.longitud) || '',
      '',
    ];

    // Resaltar por severidad
    if (num(a.infraccion_80_kmh) > 0) {
      ws.getRow(rowNum).eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redLight } }; });
    } else if (num(a.excesos_50_80_kmh) > 0) {
      ws.getRow(rowNum).eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.amberLight } }; });
    }

    // Hipervínculo a Maps
    const url = mapsUrl(a);
    const mapsCell = ws.getCell(rowNum, headers.length);
    if (url) {
      mapsCell.value = { text: 'Abrir', hyperlink: url, tooltip: 'Abrir ubicación en Google Maps' };
      mapsCell.font = { color: { argb: '0563C1' }, underline: true };
    }
    ws.getRow(rowNum).eachCell(c => { c.alignment = { vertical: 'middle', wrapText: false }; borderThin(c); });
  });

  // Autofiltro sobre todo el rango
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const widths = [11, 9, 11, 16, 24, 11, 24, 18, 14, 26, 20, 13, 7, 8, 8, 9, 34, 12, 12, 10];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

// ── API pública ────────────────────────────────────────────────────────────────

export async function descargarExcelAlertasDiarias(data: ReporteAlertasDiariasData): Promise<void> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Magnex Torre';
  wb.created = new Date();
  wb.modified = new Date();

  addResumenSheet(wb, data);
  addDetalleSheet(wb, data);

  const buffer = await wb.xlsx.writeBuffer();
  const contrato = (data.contrato?.nombre ?? 'alertas').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40);
  // Mismo archivo y mismo nombre; el helper corrige la liberación prematura de
  // la URL del blob y añade el enlace al DOM, que Firefox necesita.
  descargarBuffer(
    buffer as ArrayBuffer,
    `detalle_alertas_${contrato}_${data.periodoInicio}_${data.periodoFin}.xlsx`,
    MIME_XLSX,
  );
}
