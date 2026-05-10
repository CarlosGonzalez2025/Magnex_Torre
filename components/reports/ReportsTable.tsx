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

  const handleExport = () => {
    if (data.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    const exportColumns = columns.filter(col => col.header.trim());
    const exportData = sorted.map(row => {
      const out: Record<string, unknown> = {};
      exportColumns.forEach(col => {
        const value = col.exportValue ? col.exportValue(row[col.key], row) : row[col.key];
        out[col.header] = formatExportValue(value);
      });
      return out;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet['!cols'] = exportColumns.map(col => ({ wch: Math.max(12, col.header.length + 4) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
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
