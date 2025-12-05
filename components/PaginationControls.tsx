/**
 * Componente de controles de paginación estilo DataTable
 *
 * Características:
 * - Selector de filas por página
 * - Botones de navegación
 * - Información de registros
 * - 100% responsive
 * - Diseño profesional
 */

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  pageSizeOptions: number[];
  recordInfo: {
    start: number;
    end: number;
    total: number;
  };
  visiblePages: number[];
  canGoNext: boolean;
  canGoPrevious: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onFirstPage: () => void;
  onLastPage: () => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  pageSize,
  pageSizeOptions,
  recordInfo,
  visiblePages,
  canGoNext,
  canGoPrevious,
  onPageChange,
  onPageSizeChange,
  onFirstPage,
  onLastPage,
  onNextPage,
  onPreviousPage
}) => {
  if (totalPages === 0) {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-slate-50 border-t border-slate-200">
        <div className="text-sm text-slate-600">
          No hay registros para mostrar
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-slate-50 border-t border-slate-200">
      {/* Selector de filas por página */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-600 whitespace-nowrap">
          Mostrar:
        </label>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-600 whitespace-nowrap">
          por página
        </span>
      </div>

      {/* Información de registros */}
      <div className="text-sm text-slate-600 text-center">
        Mostrando <span className="font-semibold text-slate-900">{recordInfo.start}</span> a{' '}
        <span className="font-semibold text-slate-900">{recordInfo.end}</span> de{' '}
        <span className="font-semibold text-slate-900">{recordInfo.total}</span> registros
      </div>

      {/* Controles de navegación */}
      <div className="flex items-center gap-1">
        {/* Primera página */}
        <button
          onClick={onFirstPage}
          disabled={!canGoPrevious}
          className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Primera página"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        {/* Página anterior */}
        <button
          onClick={onPreviousPage}
          disabled={!canGoPrevious}
          className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Página anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Números de página */}
        <div className="hidden sm:flex items-center gap-1">
          {visiblePages.map((page, index) => {
            if (page === -1) {
              return (
                <span key={`ellipsis-${index}`} className="px-2 text-slate-400">
                  ...
                </span>
              );
            }

            return (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  page === currentPage
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-slate-200 text-slate-700'
                }`}
              >
                {page}
              </button>
            );
          })}
        </div>

        {/* Indicador de página en móvil */}
        <div className="sm:hidden px-3 py-1.5 text-sm font-medium text-slate-700">
          {currentPage} / {totalPages}
        </div>

        {/* Página siguiente */}
        <button
          onClick={onNextPage}
          disabled={!canGoNext}
          className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Página siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Última página */}
        <button
          onClick={onLastPage}
          disabled={!canGoNext}
          className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Última página"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
