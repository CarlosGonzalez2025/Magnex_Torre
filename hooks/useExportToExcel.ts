import * as XLSX from 'xlsx';

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

export function useExportToExcel() {
  const exportToExcel = <T extends Record<string, any>>(
    data: T[],
    columns: ExportColumn[],
    filename: string
  ) => {
    if (data.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    // Crear datos formateados para Excel
    const formattedData = data.map(item => {
      const row: Record<string, any> = {};
      columns.forEach(col => {
        const value = item[col.key];
        // Formatear fechas
        if (value instanceof Date) {
          row[col.header] = value.toLocaleString('es-CO');
        } else if (typeof value === 'object' && value !== null) {
          // Convertir objetos a string
          row[col.header] = JSON.stringify(value);
        } else {
          row[col.header] = value;
        }
      });
      return row;
    });

    // Crear libro de trabajo
    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();

    // Ajustar anchos de columnas
    const columnWidths = columns.map(col => ({
      wch: col.width || 15
    }));
    worksheet['!cols'] = columnWidths;

    // Agregar hoja al libro
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');

    // Generar archivo
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // Descargar archivo
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return { exportToExcel };
}
