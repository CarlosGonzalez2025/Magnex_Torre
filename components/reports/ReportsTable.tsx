import React, { useEffect, useState } from 'react';
import { FileDown, FileText, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ValidationError } from '../../services/importService';

// ── Tabla de errores de validación ───────────────────────────────────────────

export const ErroresTable: React.FC<{ errores: ValidationError[] }> = ({ errores }) => {
  if (errores.length === 0) return null;
  return (
    <div className="rounded-xl border border-red-200 dark:border-red-800 overflow-hidden">
      <div className="bg-red-50 dark:bg-red-950/30 px-4 py-2 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-600" />
        <span className="text-sm font-semibold text-red-700 dark:text-red-400">{errores.length} error(es) de validación</span>
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
                <td className="px-3 py-1.5 text-red-700 dark:text-red-400">{e.fila || '—'}</td>
                <td className="px-3 py-1.5 font-mono text-red-600">{e.columna || '—'}</td>
                <td className="px-3 py-1.5 text-red-800 dark:text-red-300">{e.mensaje}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Tabla genérica de preview / datos ─────────────────────────────────────────

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
}

export const ReportsTable: React.FC<ReportsTableProps> = ({
  columns, data, emptyMessage = 'Sin datos', maxRows, exportFileName = 'reporte'
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
    else { setSortKey(key); setSortDir('asc'); }
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
    return value;
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
    'fecha',
    'fecha_dia',
    'placa',
    'conductor',
    'conductor_identificado',
    'contrato_nombre',
    'cliente',
    'tipo_activo',
    'gps',
    'estado',
    'velocidad',
    'lugar',
    'latitud',
    'longitud',
    'infraccion_80_kmh',
    'excesos_varios_parametros',
    'excesos_50_80_kmh',
    'frenadas_bruscas',
    'vehiculo_id',
    'conductor_id',
    'contrato_id',
    'carga_id',
    'estado_migracion',
    'migrado_at',
    'created_at',
    'raw_data',
    'id',
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

  const addHyperlinks = (
    worksheet: XLSX.WorkSheet,
    rows: Record<string, unknown>[],
    keys: string[]
  ) => {
    rows.forEach((row, rowIndex) => {
      const url = mapsUrl(row);
      if (!url) return;

      keys.forEach((key, colIndex) => {
        if (!['lugar', 'latitud', 'longitud'].includes(key)) return;
        const address = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
        const cell = worksheet[address];
        if (!cell) return;
        cell.l = { Target: url, Tooltip: 'Abrir ubicacion en Google Maps' };
        cell.s = { font: { color: { rgb: '0563C1' }, underline: true } };
      });
    });
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

  const buildAnalysisSheets = (rows: Record<string, unknown>[]) => {
    const total = rows.length;
    const velocidades = rows.map(row => toNumber(row.velocidad)).filter(v => v > 0);
    const resumen = [
      { Indicador: 'Total registros', Valor: total },
      { Indicador: 'Vehiculos unicos', Valor: new Set(rows.map(row => String(row.placa ?? '').trim()).filter(Boolean)).size },
      { Indicador: 'Conductores unicos', Valor: new Set(rows.map(row => String(row.conductor ?? '').trim()).filter(Boolean)).size },
      { Indicador: 'Conductores identificados', Valor: rows.filter(row => row.conductor_identificado === true).length },
      { Indicador: 'Registros sin conductor identificado', Valor: rows.filter(row => row.conductor_identificado === false).length },
      { Indicador: 'Velocidad promedio', Valor: velocidades.length ? Number((velocidades.reduce((a, b) => a + b, 0) / velocidades.length).toFixed(2)) : 0 },
      { Indicador: 'Velocidad maxima', Valor: velocidades.length ? Math.max(...velocidades) : 0 },
      { Indicador: 'Infracciones 80 km/h', Valor: rows.reduce((acc, row) => acc + toNumber(row.infraccion_80_kmh), 0) },
      { Indicador: 'Excesos varios parametros', Valor: rows.reduce((acc, row) => acc + toNumber(row.excesos_varios_parametros), 0) },
      { Indicador: 'Excesos 50-80 km/h', Valor: rows.reduce((acc, row) => acc + toNumber(row.excesos_50_80_kmh), 0) },
      { Indicador: 'Frenadas bruscas', Valor: rows.reduce((acc, row) => acc + toNumber(row.frenadas_bruscas), 0) },
      { Indicador: 'Registros con coordenadas', Valor: rows.filter(hasCoordinates).length },
    ];

    const sections: Array<{ title: string; rows: Record<string, unknown>[] }> = [
      { title: 'Resumen', rows: resumen },
      { title: 'Top placas', rows: countBy(rows, 'placa').slice(0, 15) },
      { title: 'Por contrato', rows: countBy(rows, 'contrato_nombre') },
      { title: 'Por GPS', rows: countBy(rows, 'gps') },
      { title: 'Por estado', rows: countBy(rows, 'estado') },
      { title: 'Por fecha', rows: countBy(rows, 'fecha_dia') },
    ];

    const sheetRows: unknown[][] = [];
    sections.forEach((section, index) => {
      if (index > 0) sheetRows.push([]);
      sheetRows.push([section.title]);
      const headers = Array.from(new Set(section.rows.flatMap(row => Object.keys(row))));
      sheetRows.push(headers);
      section.rows.forEach(row => sheetRows.push(headers.map(header => row[header])));
    });

    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    worksheet['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 18 }];
    return worksheet;
  };

  const handleExport = () => {
    if (data.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    const exportKeys = getAllExportKeys(sorted);
    const exportHeaders = exportKeys.map(key => exportHeaderOverrides[key] ?? normalizeKey(key));
    const exportData = sorted.map(row => exportKeys.map(key => formatExportValue(row[key])));

    const worksheet = XLSX.utils.aoa_to_sheet([exportHeaders, ...exportData]);
    worksheet['!cols'] = exportHeaders.map(header => ({ wch: Math.max(12, String(header).length + 4) }));
    worksheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: exportData.length, c: exportHeaders.length - 1 } }) };
    addHyperlinks(worksheet, sorted, exportKeys);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Alertas');
    XLSX.utils.book_append_sheet(workbook, buildAnalysisSheets(sorted), 'Analisis');
    XLSX.writeFile(workbook, `${exportFileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
                    {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{data.length} registros{typeof maxRows === 'number' && data.length > maxRows ? ` (mostrando ${maxRows})` : ''}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              ‹
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
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Badge de semáforo para tablas ─────────────────────────────────────────────

export const SemaforoBadge: React.FC<{ calificacion: number }> = ({ calificacion }) => {
  const config =
    calificacion >= 85 ? { label: 'BUENO', cls: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' } :
    calificacion >= 70 ? { label: 'REGULAR', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' } :
    { label: 'CRÍTICO', cls: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${config.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${calificacion >= 85 ? 'bg-green-500' : calificacion >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} />
      {calificacion.toFixed(1)} – {config.label}
    </span>
  );
};
