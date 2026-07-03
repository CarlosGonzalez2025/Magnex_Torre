import type ExcelJSType from 'exceljs';
import type { ContratoOption, ConductorOption, VehiculoOption } from './reportService';
import type { FiltroState } from '../components/reports/ReportFilters';

// ── Paleta y helpers de estilo (mínimos, sin acoplar con la lógica GPS de ReportsTable) ──
const COLORS = {
  navy: '1F2937',
  navy2: '334155',
  blue: '2563EB',
  blueLight: 'DBEAFE',
  green: '16A34A',
  amber: 'D97706',
  slate: 'E2E8F0',
  slateLight: 'F1F5F9',
  white: 'FFFFFF',
};

const MESES_ABBR = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

type Row = Record<string, unknown>;

const SIN_CONTRATO = '__SIN_CONTRATO__';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Suma de todos los umbrales de exceso de velocidad (decisión de negocio confirmada)
const UMBRALES_EXCESO = [
  'excesos_10_kph', 'excesos_20_kph', 'excesos_30_kph', 'excesos_40_kph',
  'excesos_50_kph', 'excesos_60_kph', 'excesos_80_kph',
] as const;

function totalExcesos(row: Row): number {
  return UMBRALES_EXCESO.reduce((acc, campo) => acc + num(row[campo]), 0);
}

function aceleraciones(row: Row): number {
  return num(row.aceleraciones_bruscas ?? row.aceleraciones);
}

function frenadas(row: Row): number {
  return num(row.frenadas_bruscas ?? row.frenadas);
}

/**
 * 'YYYY-MM' del mes lógico del período de la fila.
 *
 * Los períodos mensuales se manejan del día 29 al 28 (p.ej. "abril" = 29-mar → 28-abr),
 * por lo que el mes lógico es el del FIN de período (el día 28 siempre cae en el mes correcto).
 * NO se usa el campo `mes`: en producción se guarda con el mes de INICIO (queda un mes atrás)
 * y además está inconsistente entre registros. Fallbacks solo si falta periodo_fin.
 */
function mesDeFila(row: Row): string {
  const fin = String(row.periodo_fin ?? '').slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(fin)) return fin;
  const inicio = String(row.periodo_inicio ?? row.fecha ?? '').slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(inicio)) return inicio;
  const mes = String(row.mes ?? '').trim();
  return /^\d{4}-\d{2}$/.test(mes) ? mes : 'Sin período';
}

function etiquetaMes(mes: string): string {
  const m = Number(mes.slice(5, 7));
  const abbr = MESES_ABBR[m - 1];
  return abbr ? abbr : mes;
}

/** contrato_id de una fila de conductor (contrato anidado). */
function contratoIdConductor(row: Row): string {
  const cond = row.conductores as Row | null;
  const id = cond?.contrato_id ?? row.contrato_id;
  return id ? String(id) : SIN_CONTRATO;
}

/** contrato_id de una fila de vehículo (columna directa o vehículo anidado). */
function contratoIdVehiculo(row: Row): string {
  const veh = row.vehiculos as Row | null;
  const id = row.contrato_id ?? veh?.contrato_id;
  return id ? String(id) : SIN_CONTRATO;
}

// ── Estilo ───────────────────────────────────────────────────────────────────

function styleHeaderCell(cell: ExcelJSType.Cell, fill = COLORS.navy) {
  cell.font = { bold: true, color: { argb: COLORS.white }, size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: COLORS.slate } },
    left: { style: 'thin', color: { argb: COLORS.slate } },
    bottom: { style: 'thin', color: { argb: COLORS.slate } },
    right: { style: 'thin', color: { argb: COLORS.slate } },
  };
}

function borderThin(cell: ExcelJSType.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: COLORS.slate } },
    left: { style: 'thin', color: { argb: COLORS.slate } },
    bottom: { style: 'thin', color: { argb: COLORS.slate } },
    right: { style: 'thin', color: { argb: COLORS.slate } },
  };
}

// ── Hoja 1: Resumen HSE-F-144 (pivote dinámico) ───────────────────────────────

function addResumenSheet(
  workbook: ExcelJSType.Workbook,
  params: BuildParams,
) {
  const { filtro, contratos, conductores, vehiculos, conductorRows, conductorRowsPrev } = params;
  const ws = workbook.addWorksheet('Resumen');

  const contratoNombre = new Map<string, string>(contratos.map(c => [c.id, c.nombre]));
  contratoNombre.set(SIN_CONTRATO, 'Sin contrato');

  // Meses presentes en los datos (union conductor + vehículo), ordenados
  const mesesSet = new Set<string>();
  [...conductorRows, ...params.vehiculoRows].forEach(r => mesesSet.add(mesDeFila(r)));
  let meses = Array.from(mesesSet).filter(m => m !== 'Sin período').sort();
  if (meses.length === 0) meses = ['Sin período'];

  // Contratos a mostrar: contrato explícito, o los del alcance (cliente/grupo) unidos
  // con los que tengan datos en el período. Así se listan también contratos con roster
  // pero sin telemetría (columnas en cero, como el formato de referencia).
  let contratoIds: string[];
  if (filtro.contratoId) {
    contratoIds = [filtro.contratoId];
  } else {
    const set = new Set<string>();
    (params.contratoIdsScope ?? []).forEach(id => { if (id) set.add(String(id)); });
    conductorRows.forEach(r => set.add(contratoIdConductor(r)));
    params.vehiculoRows.forEach(r => set.add(contratoIdVehiculo(r)));
    contratoIds = Array.from(set).sort((a, b) =>
      (contratoNombre.get(a) ?? a).localeCompare(contratoNombre.get(b) ?? b, 'es'));
  }
  if (contratoIds.length === 0) contratoIds = [SIN_CONTRATO];

  // ── Agregaciones de telemetría (desde reportes de conductores) ──
  type Celda = { excesos: number; acel: number; fren: number; km: number; condExc: Set<string> };
  const nuevaCelda = (): Celda => ({ excesos: 0, acel: 0, fren: 0, km: 0, condExc: new Set() });
  // agg[contratoId][mes]
  const agg = new Map<string, Map<string, Celda>>();
  const excesosPrev = new Map<string, number>();
  const excesosActualPorContrato = new Map<string, number>();

  for (const row of conductorRows) {
    const cId = contratoIdConductor(row);
    const mes = mesDeFila(row);
    if (!agg.has(cId)) agg.set(cId, new Map());
    const porMes = agg.get(cId)!;
    if (!porMes.has(mes)) porMes.set(mes, nuevaCelda());
    const celda = porMes.get(mes)!;
    const exc = totalExcesos(row);
    celda.excesos += exc;
    celda.acel += aceleraciones(row);
    celda.fren += frenadas(row);
    celda.km += num(row.kms);
    if (exc > 0) celda.condExc.add(String(row.conductor_id ?? ''));
    excesosActualPorContrato.set(cId, (excesosActualPorContrato.get(cId) ?? 0) + exc);
  }
  for (const row of conductorRowsPrev) {
    const cId = contratoIdConductor(row);
    excesosPrev.set(cId, (excesosPrev.get(cId) ?? 0) + totalExcesos(row));
  }

  // Roster por contrato (el alcance de cliente/grupo ya limita qué contratos se listan)
  const nConductores = (cId: string) => conductores.filter(c =>
    String(c.contrato_id ?? SIN_CONTRATO) === cId).length;
  const nVehiculos = (cId: string) => vehiculos.filter(v =>
    String(v.contrato_id ?? SIN_CONTRATO) === cId).length;

  // Helpers de agregación por (contrato, mes)
  const celda = (cId: string, mes: string): Celda =>
    agg.get(cId)?.get(mes) ?? nuevaCelda();
  const condExcTotal = (cId: string): number => {
    const set = new Set<string>();
    agg.get(cId)?.forEach(c => c.condExc.forEach(id => set.add(id)));
    set.delete('');
    return set.size;
  };

  // ── Layout de columnas ──
  const colsPorContrato = meses.length + 1; // meses + TOTAL
  const firstColDe = (ci: number) => 2 + ci * colsPorContrato;
  const totalColDe = (ci: number) => firstColDe(ci) + meses.length;
  const lastCol = totalColDe(contratoIds.length - 1);

  // Fila 1: título
  ws.mergeCells(1, 1, 1, lastCol);
  const t = ws.getCell(1, 1);
  t.value = 'HSE-F-144  Informe de gestión de comportamientos GPS';
  t.font = { bold: true, size: 14, color: { argb: COLORS.white } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 26;

  // Fila 2: período
  ws.mergeCells(2, 1, 2, lastCol);
  const s = ws.getCell(2, 1);
  const alcance = filtro.cliente ? `   |   Cliente/Grupo: ${filtro.cliente}` : '';
  s.value = `Período de reporte: ${filtro.fechaInicio} a ${filtro.fechaFin}${alcance}`;
  s.font = { italic: true, bold: true, color: { argb: COLORS.navy2 } };
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blueLight } };
  s.alignment = { vertical: 'middle', horizontal: 'center' };

  // Filas 3-4: encabezados de contrato y meses
  ws.mergeCells(3, 1, 4, 1);
  styleHeaderCell(ws.getCell(3, 1));
  ws.getCell(3, 1).value = 'Indicador';
  ws.getCell(3, 1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

  contratoIds.forEach((cId, ci) => {
    const first = firstColDe(ci);
    const total = totalColDe(ci);
    ws.mergeCells(3, first, 3, total);
    const gh = ws.getCell(3, first);
    gh.value = contratoNombre.get(cId) ?? cId;
    styleHeaderCell(gh, COLORS.navy2);
    meses.forEach((mes, mi) => {
      const c = ws.getCell(4, first + mi);
      c.value = etiquetaMes(mes);
      styleHeaderCell(c, COLORS.blue);
    });
    const tc = ws.getCell(4, total);
    tc.value = 'TOTAL';
    styleHeaderCell(tc, COLORS.green);
  });

  // ── Filas de indicadores ──
  interface IndicadorNum {
    label: string;
    // valor por (contrato, mes)
    valor: (cId: string, mes: string) => number;
    // total por contrato (por defecto suma de meses)
    total?: (cId: string) => number;
    decimales?: number;
  }

  const sumaMeses = (cId: string, fn: (cId: string, mes: string) => number) =>
    meses.reduce((acc, mes) => acc + fn(cId, mes), 0);

  const indicadores: IndicadorNum[] = [
    { label: 'Número de conductores', valor: (cId) => nConductores(cId), total: (cId) => nConductores(cId) },
    { label: 'Número de vehículos', valor: (cId) => nVehiculos(cId), total: (cId) => nVehiculos(cId) },
    { label: 'Número de excesos de velocidad', valor: (cId, mes) => celda(cId, mes).excesos },
    { label: 'Número de aceleraciones bruscas', valor: (cId, mes) => celda(cId, mes).acel },
    { label: 'Número de desaceleraciones bruscas', valor: (cId, mes) => celda(cId, mes).fren },
    { label: 'Número de Kilómetros recorridos', valor: (cId, mes) => celda(cId, mes).km, decimales: 1 },
    {
      label: 'Número de conductores con excesos',
      valor: (cId, mes) => celda(cId, mes).condExc.size,
      total: (cId) => condExcTotal(cId),
    },
  ];

  let r = 5;
  indicadores.forEach((ind, idx) => {
    const rowNum = r + idx;
    const labelCell = ws.getCell(rowNum, 1);
    labelCell.value = ind.label;
    labelCell.font = { bold: true, size: 10, color: { argb: COLORS.navy } };
    labelCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.slateLight } };
    borderThin(labelCell);

    const fmt = ind.decimales ? '#,##0.0' : '#,##0';
    contratoIds.forEach((cId, ci) => {
      const first = firstColDe(ci);
      meses.forEach((mes, mi) => {
        const c = ws.getCell(rowNum, first + mi);
        c.value = ind.valor(cId, mes);
        c.numFmt = fmt;
        c.alignment = { vertical: 'middle', horizontal: 'center' };
        borderThin(c);
      });
      const tc = ws.getCell(rowNum, totalColDe(ci));
      tc.value = ind.total ? ind.total(cId) : sumaMeses(cId, ind.valor);
      tc.numFmt = fmt;
      tc.font = { bold: true };
      tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blueLight } };
      tc.alignment = { vertical: 'middle', horizontal: 'center' };
      borderThin(tc);
    });
  });

  // ── Filas por-contrato (celda combinada sobre meses+total) ──
  let rowTexto = r + indicadores.length;

  const filaPorContrato = (
    label: string,
    valor: (cId: string) => { text: string; warn?: boolean },
  ) => {
    const labelCell = ws.getCell(rowTexto, 1);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 10, color: { argb: COLORS.navy } };
    labelCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.slateLight } };
    borderThin(labelCell);
    contratoIds.forEach((cId, ci) => {
      const first = firstColDe(ci);
      const total = totalColDe(ci);
      ws.mergeCells(rowTexto, first, rowTexto, total);
      const c = ws.getCell(rowTexto, first);
      const { text, warn } = valor(cId);
      c.value = text;
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.font = { bold: true, color: { argb: warn ? COLORS.white : COLORS.navy2 } };
      if (warn) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.amber } };
      borderThin(c);
    });
    rowTexto += 1;
  };

  filaPorContrato('Aumento excesos vs período anterior (Sí/No)', (cId) => {
    const actual = excesosActualPorContrato.get(cId) ?? 0;
    const anterior = excesosPrev.get(cId) ?? 0;
    const aumento = actual > anterior;
    return { text: aumento ? 'Sí' : 'No', warn: aumento };
  });
  filaPorContrato('Acciones para mejora de desempeño', (cId) => {
    const actual = excesosActualPorContrato.get(cId) ?? 0;
    const anterior = excesosPrev.get(cId) ?? 0;
    return { text: actual > anterior ? '' : 'Sin desmejora' };
  });
  filaPorContrato('REALIZADO POR', () => ({ text: '' }));

  // Anchos y vista
  ws.getColumn(1).width = 34;
  for (let c = 2; c <= lastCol; c++) ws.getColumn(c).width = 11;
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];
}

// ── Hojas de detalle ──────────────────────────────────────────────────────────

function addDetalleConductores(workbook: ExcelJSType.Workbook, params: BuildParams) {
  const { contratos, conductorRows } = params;
  const contratoNombre = new Map<string, string>(contratos.map(c => [c.id, c.nombre]));
  const ws = workbook.addWorksheet('Detalle Conductores');

  const headers = ['Mes', 'Conductor', 'Cédula', 'Contrato', 'Calificación',
    'Km', 'Horas', 'Exc.10', 'Exc.20', 'Exc.30', 'Exc.40', 'Exc.50', 'Exc.60', 'Exc.80',
    'Total excesos', 'Aceleraciones', 'Frenadas'];
  ws.getRow(1).values = headers;
  ws.getRow(1).eachCell(c => styleHeaderCell(c));

  conductorRows.forEach((row, i) => {
    const cond = row.conductores as Row | null;
    const cId = contratoIdConductor(row);
    ws.getRow(i + 2).values = [
      mesDeFila(row),
      String(cond?.nombres ?? '').toUpperCase(),
      String(cond?.cedula ?? ''),
      cId === SIN_CONTRATO ? 'Sin contrato' : (contratoNombre.get(cId) ?? cId),
      num(row.calificacion),
      num(row.kms),
      num(row.horas_conduccion),
      num(row.excesos_10_kph), num(row.excesos_20_kph), num(row.excesos_30_kph),
      num(row.excesos_40_kph), num(row.excesos_50_kph), num(row.excesos_60_kph),
      num(row.excesos_80_kph),
      totalExcesos(row), aceleraciones(row), frenadas(row),
    ];
  });

  headers.forEach((_, i) => { ws.getColumn(i + 1).width = i === 1 ? 26 : i === 3 ? 26 : 12; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function addDetalleVehiculos(workbook: ExcelJSType.Workbook, params: BuildParams) {
  const { contratos, vehiculoRows } = params;
  const contratoNombre = new Map<string, string>(contratos.map(c => [c.id, c.nombre]));
  const ws = workbook.addWorksheet('Detalle Vehículos');

  const headers = ['Mes', 'Placa', 'Contrato', 'Tipo', 'Calificación', 'Km', 'Horas',
    'Exc.10', 'Exc.20', 'Exc.30', 'Exc.40', 'Exc.50', 'Exc.60', 'Exc.80',
    'Total excesos', 'Aceleraciones', 'Frenadas', 'Horas ralentí'];
  ws.getRow(1).values = headers;
  ws.getRow(1).eachCell(c => styleHeaderCell(c));

  vehiculoRows.forEach((row, i) => {
    const veh = row.vehiculos as Row | null;
    const cId = contratoIdVehiculo(row);
    const nombreContrato = (row.contratos as Row | null)?.nombre
      ?? (cId === SIN_CONTRATO ? 'Sin contrato' : contratoNombre.get(cId) ?? cId);
    ws.getRow(i + 2).values = [
      mesDeFila(row),
      String(veh?.placa ?? ''),
      String(nombreContrato),
      String(veh?.tipo_activo ?? ''),
      num(row.calificacion),
      num(row.kms),
      num(row.horas_conduccion),
      num(row.excesos_10_kph), num(row.excesos_20_kph), num(row.excesos_30_kph),
      num(row.excesos_40_kph), num(row.excesos_50_kph), num(row.excesos_60_kph),
      num(row.excesos_80_kph),
      totalExcesos(row), aceleraciones(row), frenadas(row),
      num(row.horas_motor_ralenti),
    ];
  });

  headers.forEach((_, i) => { ws.getColumn(i + 1).width = i === 2 ? 26 : 12; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ── API pública ────────────────────────────────────────────────────────────────

export interface BuildParams {
  filtro: FiltroState;
  contratos: ContratoOption[];
  conductores: ConductorOption[];
  vehiculos: VehiculoOption[];
  /** Contratos en alcance (contrato específico o los del cliente/grupo). Fija las columnas del Resumen. */
  contratoIdsScope?: string[];
  conductorRows: Row[];
  vehiculoRows: Row[];
  conductorRowsPrev: Row[];
}

export async function descargarExcelInformesMensuales(params: BuildParams): Promise<void> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Magnex Torre';
  workbook.created = new Date();
  workbook.modified = new Date();

  addResumenSheet(workbook, params);
  if (params.conductorRows.length > 0) addDetalleConductores(workbook, params);
  if (params.vehiculoRows.length > 0) addDetalleVehiculos(workbook, params);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `informes_mensuales_resumen_${params.filtro.fechaInicio}_${params.filtro.fechaFin}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
}
