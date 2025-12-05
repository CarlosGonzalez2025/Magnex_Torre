/**
 * Hook para manejar paginación de tablas estilo DataTable
 *
 * Características:
 * - Paginación con selector de filas por página
 * - Navegación entre páginas
 * - Información de registros mostrados
 * - Responsive y profesional
 */

import { useState, useMemo } from 'react';

interface UsePaginationOptions {
  initialPageSize?: number;
  pageSizeOptions?: number[];
}

export function usePagination<T>(
  data: T[],
  options: UsePaginationOptions = {}
) {
  const {
    initialPageSize = 20,
    pageSizeOptions = [10, 20, 50, 100]
  } = options;

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Calcular datos paginados
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return data.slice(startIndex, endIndex);
  }, [data, currentPage, pageSize]);

  // Calcular número total de páginas
  const totalPages = useMemo(() => {
    return Math.ceil(data.length / pageSize);
  }, [data.length, pageSize]);

  // Información de registros
  const recordInfo = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(currentPage * pageSize, data.length);
    return {
      start: data.length > 0 ? startIndex : 0,
      end: endIndex,
      total: data.length
    };
  }, [currentPage, pageSize, data.length]);

  // Funciones de navegación
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToFirstPage = () => {
    setCurrentPage(1);
  };

  const goToLastPage = () => {
    setCurrentPage(totalPages);
  };

  // Cambiar tamaño de página
  const changePageSize = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1); // Reset a primera página
  };

  // Calcular páginas visibles para navegación
  const visiblePages = useMemo(() => {
    const pages: number[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      // Mostrar todas las páginas si son pocas
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Mostrar páginas con elipsis
      if (currentPage <= 3) {
        // Inicio
        pages.push(1, 2, 3, 4, -1, totalPages); // -1 representa "..."
      } else if (currentPage >= totalPages - 2) {
        // Final
        pages.push(1, -1, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        // Medio
        pages.push(1, -1, currentPage - 1, currentPage, currentPage + 1, -1, totalPages);
      }
    }

    return pages;
  }, [currentPage, totalPages]);

  return {
    // Datos paginados
    paginatedData,

    // Estado actual
    currentPage,
    pageSize,
    totalPages,
    recordInfo,

    // Opciones
    pageSizeOptions,

    // Navegación
    goToPage,
    goToNextPage,
    goToPreviousPage,
    goToFirstPage,
    goToLastPage,

    // Configuración
    changePageSize,

    // Helper para renderizar
    visiblePages,
    canGoNext: currentPage < totalPages,
    canGoPrevious: currentPage > 1
  };
}
