import React, { useEffect, useState } from 'react';
import { FileDown, FileText, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react';
import type ExcelJS from 'exceljs';
import { ValidationError } from '../../services/importService';

export const ErroresTable: React.FC<{ errores: ValidationError[] }> = ({ errores }) => {
  if (errores.length === 0) return null;
  return (
    <div className="rounded-xl border border-red-200 dark:border-red-800 overflow-hidden">
      <div className="bg-red-50 dark:bg-red-950/30 px-4 py-2 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-600" />
        <span className="text-sm font-semibold text-red-700 dark:text-red-400">{errores.length} error(es) de validacion</span>
      </div>
      <div className="overflow-x-auto max-h-56">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300">
              <th className="text-left px-3 py-2 font-semibold">Fila</th>
              <th className="text-left px-3 py-2 font-semibold">Columna</th>
              <th className="text-left px-3 py-2 font-semibold">Mensaje</th>
            </tr>
          </thead>
          <tbody>
            {errores.map((e, i) => (
              <tr key={i} className="border-t border-red-100 dark:border-red-900/50">
                <td className="px-3 py-1.5 text-red-700 dark:text-red-400">{e.fila || '-'}</td>
                <td className="px-3 py-1.5 font-mono text-red-600">{e.columna || '-'}</td>
                <td className="px-3 py-1.5 text-red-800 dark:text-red-300">{e.mensaje}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface Column {
  key: string;
  header: string;
  render?: (val: unknown, row: Record<string, unknown>) => React.ReactNode;
  exportValue?: (val: unknown, row: Record<string, unknown>) => unknown;
  width?: string;
}

interface ReportsTableProps {
  columns: Column[];
  data: Record<string, unknown>[];
  emptyMessage?: string;
  maxRows?: number;
  exportFileName?: string;
  includeDateContractSheet?: boolean;
}

const COLORS = {
  navy: '1F2937',
  navy2: '334155',
  blue: '2563EB',
  blueLight: 'DBEAFE',
  green: '16A34A',
  greenLight: 'DCFCE7',
  amber: 'D97706',
  amberLight: 'FEF3C7',
  orange: 'EA580C',
  orangeLight: 'FFEDD5',
  red: 'DC2626',
  redLight: 'FEE2E2',
  slate: 'E2E8F0',
  slateLight: 'F8FAFC',
  white: 'FFFFFF',
};

export const ReportsTable: React.FC<ReportsTableProps> = ({
  columns,
  data,
  emptyMessage = 'Sin datos',
  maxRows,
  exportFileName = 'reporte',
  includeDateContractSheet = true,
}) => {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  const rowsPerPage = 20;

  const sorted = [...data].sort((a, b) => {
    if (!sortKey) return 0;
    const av = String(a[sortKey] ?? '');
    const bv = String(b[sortKey] ?? '');
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const limited = typeof maxRows === 'number' ? sorted.slice(0, maxRows) : sorted;
  const totalPages = Math.ceil(limited.length / rowsPerPage);
  const paginated = limited.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
  const firstVisiblePage = Math.min(Math.max(0, page - 2), Math.max(0, totalPages - 5));

  useEffect(() => {
    setPage(0);
  }, [data, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const formatExportValue = (value: unknown) => {
    if (value instanceof Date) return value.toLocaleString('es-CO');
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if ('nombres' in obj || 'cedula' in obj) {
        return `${String(obj.nombres ?? '').toUpperCase()}${obj.cedula ? ` (${obj.cedula})` : ''}`.trim();
      }
      if ('placa' in obj) return String(obj.placa ?? '');
      if ('nombre' in obj) return String(obj.nombre ?? '');
      return JSON.stringify(value);
    }
    if (typeof value === 'boolean') return value ? 'VERDADERO' : 'FALSO';
    return value as string | number;
  };

  const normalizeKey = (key: string) => key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());

  const exportHeaderOverrides: Record<string, string> = {
    id: 'ID',
    carga_id: 'ID Carga',
    vehiculo_id: 'ID Vehiculo',
    conductor_id: 'ID Conductor',
    contrato_id: 'ID Contrato',
    fecha: 'Fecha Evento',
    fecha_dia: 'Fecha Dia',
    placa: 'Placa',
    conductor: 'Conductor',
    conductor_identificado: 'Conductor Identificado',
    lugar: 'Ubicacion',
    latitud: 'Latitud',
    longitud: 'Longitud',
    velocidad: 'Velocidad',
    estado: 'Estado',
    infraccion_80_kmh: 'Infraccion 80 km/h',
    excesos_varios_parametros: 'Excesos Varios Parametros',
    excesos_50_80_kmh: 'Excesos 50-80 km/h',
    frenadas_bruscas: 'Frenadas Bruscas',
    contrato_nombre: 'Contrato',
    gps: 'GPS',
    tipo_activo: 'Tipo Activo',
    cliente: 'Cliente',
    raw_data: 'Datos Originales',
    created_at: 'Fecha Registro',
    estado_migracion: 'Estado Migracion',
    migrado_at: 'Fecha Migracion',
  };

  const preferredExportOrder = [
    'fecha', 'fecha_dia', 'placa', 'conductor', 'conductor_identificado',
    'contrato_nombre', 'cliente', 'tipo_activo', 'gps', 'estado', 'velocidad',
    'lugar', 'latitud', 'longitud', 'infraccion_80_kmh', 'excesos_varios_parametros',
    'excesos_50_80_kmh', 'frenadas_bruscas', 'vehiculo_id', 'conductor_id',
    'contrato_id', 'carga_id', 'estado_migracion', 'migrado_at', 'created_at',
    'raw_data', 'id',
  ];

  const getAllExportKeys = (rows: Record<string, unknown>[]) => {
    const keys = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
    return keys.sort((a, b) => {
      const ai = preferredExportOrder.indexOf(a);
      const bi = preferredExportOrder.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  };

  const toNumber = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const hasCoordinates = (row: Record<string, unknown>) => {
    const lat = Number(row.latitud);
    const lng = Number(row.longitud);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
  };

  const mapsUrl = (row: Record<string, unknown>) => {
    if (hasCoordinates(row)) {
      return `https://www.google.com/maps/search/?api=1&query=${Number(row.latitud)},${Number(row.longitud)}`;
    }
    const place = String(row.lugar ?? '').trim();
    return place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : '';
  };

  const countBy = (rows: Record<string, unknown>[], key: string) => {
    const map = new Map<string, number>();
    rows.forEach(row => {
      const value = String(row[key] ?? '').trim() || 'Sin dato';
      map.set(value, (map.get(value) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([item, cantidad]) => ({ Item: item, Cantidad: cantidad }));
  };

  const buildDateContractRows = (rows: Record<string, unknown>[]) => {
    const groups = new Map<string, {
      fecha: string;
      contrato: string;
      excesos80: number;
      excesos50a80: number;
      frenadas: number;
      total: number;
    }>();

    rows.forEach(row => {
      const fecha = String(row.fecha_dia || row.fecha || '').slice(0, 10);
      const contrato = String(row.contrato_nombre || 'Sin contrato').trim() || 'Sin contrato';
      const key = `${fecha}|${contrato}`;
      const current = groups.get(key) ?? { fecha, contrato, excesos80: 0, excesos50a80: 0, frenadas: 0, total: 0 };
      current.excesos80 += toNumber(row.infraccion_80_kmh);
      current.excesos50a80 += toNumber(row.excesos_50_80_kmh);
      current.frenadas += toNumber(row.frenadas_bruscas);
      current.total = current.excesos80 + current.excesos50a80 + current.frenadas;
      groups.set(key, current);
    });

    return Array.from(groups.values())
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.contrato.localeCompare(b.contrato));
  };

  const styleWorksheet = (worksheet: ExcelJS.Worksheet) => {
    worksheet.views = [{ state: 'frozen', ySplit: 4 }];
    worksheet.properties.defaultRowHeight = 18;
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: COLORS.slate } },
          left: { style: 'thin', color: { argb: COLORS.slate } },
          bottom: { style: 'thin', color: { argb: COLORS.slate } },
          right: { style: 'thin', color: { argb: COLORS.slate } },
        };
      });
    });
  };

  const setColumnWidths = (worksheet: ExcelJS.Worksheet, widths: number[]) => {
    widths.forEach((width, index) => {
      worksheet.getColumn(index + 1).width = width;
    });
  };

  const columnLetter = (index: number) => {
    let value = index;
    let letter = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      letter = String.fromCharCode(65 + remainder) + letter;
      value = Math.floor((value - 1) / 26);
    }
    return letter;
  };

  const addTitle = (worksheet: ExcelJS.Worksheet, title: string, subtitle: string, columns: number) => {
    worksheet.mergeCells(1, 1, 1, Math.max(columns, 2));
    worksheet.mergeCells(2, 1, 2, Math.max(columns, 2));
    const titleCell = worksheet.getCell('A1');
    titleCell.value = title;
    titleCell.font = { bold: true, size: 16, color: { argb: COLORS.white } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    worksheet.getRow(1).height = 28;

    const subtitleCell = worksheet.getCell('A2');
    subtitleCell.value = subtitle;
    subtitleCell.font = { color: { argb: COLORS.navy2 }, italic: true };
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blueLight } };
  };

  const applyDataBars = (worksheet: ExcelJS.Worksheet, columns: string[], fromRow: number, toRow: number, color = COLORS.blue) => {
    if (toRow < fromRow) return;
    columns.forEach(col => {
      worksheet.addConditionalFormatting({
        ref: `${col}${fromRow}:${col}${toRow}`,
        rules: [{
          type: 'dataBar',
          cfvo: [{ type: 'min' }, { type: 'max' }],
          color: { argb: color },
        } as any],
      });
    });
  };

  const styleHeaderRow = (row: ExcelJS.Row, fill = COLORS.navy) => {
    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: COLORS.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
  };

  const addAlertSheet = (workbook: ExcelJS.Workbook, rows: Record<string, unknown>[]) => {
    const worksheet = workbook.addWorksheet('Alertas', { views: [{ state: 'frozen', ySplit: 4 }] });
    const exportKeys = getAllExportKeys(rows);
    const headers = exportKeys.map(key => exportHeaderOverrides[key] ?? normalizeKey(key));
    addTitle(worksheet, 'Alertas GPS', `Total registros: ${rows.length} - Generado: ${new Date().toLocaleString('es-CO')}`, headers.length);

    worksheet.addTable({
      name: 'TablaAlertasGps',
      ref: 'A4',
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleMedium2', showRowStripes: true },
      columns: headers.map(header => ({ name: header, filterButton: true })),
      rows: rows.map(row => exportKeys.map(key => formatExportValue(row[key]))),
    });

    styleHeaderRow(worksheet.getRow(4));
    setColumnWidths(worksheet, headers.map((header, index) => {
      const key = exportKeys[index];
      const base = ['lugar', 'raw_data'].includes(key) ? 36 : ['conductor', 'contrato_nombre'].includes(key) ? 26 : 16;
      return Math.max(base, Math.min(42, header.length + 4));
    }));

    rows.forEach((row, index) => {
      const excelRow = index + 5;
      const url = mapsUrl(row);
      if (!url) return;
      ['lugar', 'latitud', 'longitud'].forEach(key => {
        const colIndex = exportKeys.indexOf(key);
        if (colIndex === -1) return;
        const cell = worksheet.getCell(excelRow, colIndex + 1);
        cell.value = { text: String(cell.value ?? ''), hyperlink: url, tooltip: 'Abrir ubicacion en Google Maps' };
        cell.font = { color: { argb: '0563C1' }, underline: true };
      });
    });

    const numericLetters = ['velocidad', 'infraccion_80_kmh', 'excesos_varios_parametros', 'excesos_50_80_kmh', 'frenadas_bruscas']
      .map(key => exportKeys.indexOf(key))
      .filter(index => index >= 0)
      .map(index => columnLetter(index + 1));
    applyDataBars(worksheet, numericLetters, 5, rows.length + 4, COLORS.green);
    styleWorksheet(worksheet);
  };

  const addAnalysisSection = (
    worksheet: ExcelJS.Worksheet,
    startRow: number,
    title: string,
    headers: string[],
    rows: Array<Array<string | number>>,
    accent: string
  ) => {
    worksheet.mergeCells(startRow, 1, startRow, headers.length);
    const titleCell = worksheet.getCell(startRow, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, color: { argb: COLORS.white } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
    worksheet.getRow(startRow + 1).values = [, ...headers];
    styleHeaderRow(worksheet.getRow(startRow + 1), COLORS.navy2);
    rows.forEach((row, index) => {
      worksheet.getRow(startRow + 2 + index).values = [, ...row];
    });
    return startRow + rows.length + 4;
  };

  const addAnalysisSheet = (workbook: ExcelJS.Workbook, rows: Record<string, unknown>[]) => {
    const worksheet = workbook.addWorksheet('Analisis');
    const velocidades = rows.map(row => toNumber(row.velocidad)).filter(v => v > 0);
    const resumen: Array<Array<string | number>> = [
      ['Total registros', rows.length],
      ['Vehiculos unicos', new Set(rows.map(row => String(row.placa ?? '').trim()).filter(Boolean)).size],
      ['Conductores unicos', new Set(rows.map(row => String(row.conductor ?? '').trim()).filter(Boolean)).size],
      ['Conductores identificados', rows.filter(row => row.conductor_identificado === true).length],
      ['Registros sin conductor identificado', rows.filter(row => row.conductor_identificado === false).length],
      ['Velocidad promedio', velocidades.length ? Number((velocidades.reduce((a, b) => a + b, 0) / velocidades.length).toFixed(2)) : 0],
      ['Velocidad maxima', velocidades.length ? Math.max(...velocidades) : 0],
      ['Infracciones 80 km/h', rows.reduce((acc, row) => acc + toNumber(row.infraccion_80_kmh), 0)],
      ['Excesos varios parametros', rows.reduce((acc, row) => acc + toNumber(row.excesos_varios_parametros), 0)],
      ['Excesos 50-80 km/h', rows.reduce((acc, row) => acc + toNumber(row.excesos_50_80_kmh), 0)],
      ['Frenadas bruscas', rows.reduce((acc, row) => acc + toNumber(row.frenadas_bruscas), 0)],
      ['Registros con coordenadas', rows.filter(hasCoordinates).length],
    ];

    addTitle(worksheet, 'Analisis de Alertas GPS', `Generado: ${new Date().toLocaleString('es-CO')}`, 4);
    let nextRow = addAnalysisSection(worksheet, 4, 'Resumen ejecutivo', ['Indicador', 'Valor'], resumen, COLORS.blue);
    nextRow = addAnalysisSection(worksheet, nextRow, 'Top placas', ['Placa', 'Cantidad'], countBy(rows, 'placa').slice(0, 15).map(r => [r.Item, r.Cantidad]), COLORS.green);
    nextRow = addAnalysisSection(worksheet, nextRow, 'Por contrato', ['Contrato', 'Cantidad'], countBy(rows, 'contrato_nombre').map(r => [r.Item, r.Cantidad]), COLORS.amber);
    nextRow = addAnalysisSection(worksheet, nextRow, 'Por GPS', ['GPS', 'Cantidad'], countBy(rows, 'gps').map(r => [r.Item, r.Cantidad]), COLORS.orange);
    addAnalysisSection(worksheet, nextRow, 'Por estado', ['Estado', 'Cantidad'], countBy(rows, 'estado').map(r => [r.Item, r.Cantidad]), COLORS.red);

    setColumnWidths(worksheet, [36, 18, 22, 18]);
    applyDataBars(worksheet, ['B'], 6, worksheet.rowCount, COLORS.blue);
    styleWorksheet(worksheet);
  };

  const addDateContractSheet = (workbook: ExcelJS.Workbook, rows: Record<string, unknown>[]) => {
    const worksheet = workbook.addWorksheet('Fecha Contrato');
    const tableRows = buildDateContractRows(rows);
    addTitle(worksheet, 'Cantidades por fecha y contrato', `Total grupos: ${tableRows.length} - Generado: ${new Date().toLocaleString('es-CO')}`, 6);

    worksheet.addTable({
      name: 'TablaFechaContrato',
      ref: 'A4',
      headerRow: true,
      totalsRow: true,
      style: { theme: 'TableStyleMedium4', showRowStripes: true },
      columns: [
        { name: 'Fecha', filterButton: true },
        { name: 'Contrato', filterButton: true },
        { name: 'Excesos 80 km/h', totalsRowFunction: 'sum', filterButton: true },
        { name: 'Velocidad > 50 hasta 80 km/h', totalsRowFunction: 'sum', filterButton: true },
        { name: 'Frenadas Bruscas', totalsRowFunction: 'sum', filterButton: true },
        { name: 'Total', totalsRowFunction: 'sum', filterButton: true },
      ],
      rows: tableRows.map(row => [row.fecha, row.contrato, row.excesos80, row.excesos50a80, row.frenadas, row.total]),
    });

    setColumnWidths(worksheet, [14, 38, 18, 30, 18, 14]);
    styleHeaderRow(worksheet.getRow(4), COLORS.navy);
    applyDataBars(worksheet, ['C', 'D', 'E', 'F'], 5, tableRows.length + 4, COLORS.blue);
    styleWorksheet(worksheet);
  };

  const downloadWorkbook = async (workbook: ExcelJS.Workbook, filename: string) => {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (data.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    const ExcelJSModule = await import('exceljs');
    const workbook = new ExcelJSModule.Workbook();
    workbook.creator = 'Magnex Torre';
    workbook.created = new Date();
    workbook.modified = new Date();

    addAlertSheet(workbook, sorted);
    addAnalysisSheet(workbook, sorted);
    if (includeDateContractSheet) addDateContractSheet(workbook, sorted);

    await downloadWorkbook(workbook, `${exportFileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 dark:text-slate-500">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors"
          title="Descargar tabla completa en Excel"
        >
          <FileDown className="w-3.5 h-3.5" />
          Excel
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-800 text-white">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`text-left px-3 py-2.5 font-semibold cursor-pointer select-none whitespace-nowrap hover:bg-slate-700 transition-colors ${col.width ?? ''}`}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {sortKey === col.key
                      ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      : null
                    }
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((row, i) => (
              <tr
                key={i}
                className={`border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${i % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-slate-700 dark:text-slate-300">
                    {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{data.length} registros{typeof maxRows === 'number' && data.length > maxRows ? ` (mostrando ${maxRows})` : ''}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              &lsaquo;
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + firstVisiblePage).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-2 py-1 rounded border transition-colors ${page === p ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
              >
                {p + 1}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              &rsaquo;
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const SemaforoBadge: React.FC<{ calificacion: number }> = ({ calificacion }) => {
  const config =
    calificacion >= 85 ? { label: 'BUENO', cls: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' } :
    calificacion >= 70 ? { label: 'REGULAR', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' } :
    { label: 'CRITICO', cls: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${config.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${calificacion >= 85 ? 'bg-green-500' : calificacion >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} />
      {calificacion.toFixed(1)} - {config.label}
    </span>
  );
};
