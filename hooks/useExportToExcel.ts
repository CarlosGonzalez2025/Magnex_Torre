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
    console.log('=== useExportToExcel INICIADO ===');
    console.log('Cantidad de filas recibidas:', data.length);
    console.log('Cantidad de columnas:', columns.length);

    if (data.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    // Mostrar muestra de datos de entrada
    if (data.length > 0) {
      console.log('Primera fila de datos:', data[0]);
      console.log('Keys disponibles en primera fila:', Object.keys(data[0]));
    }

    // Crear datos formateados para Excel
    const formattedData = data.map((item, index) => {
      const row: Record<string, any> = {};
      columns.forEach(col => {
        const value = item[col.key];

        // 🔍 DIAGNÓSTICO: Mostrar valores críticos
        if (index === 0 && (col.key === 'plan_descripcion' || col.key === 'archivos_adjuntos')) {
          console.log(`Procesando columna "${col.header}" (key: ${col.key}):`, value);
        }

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

    console.log('Datos formateados para Excel:', formattedData.length, 'filas');
    if (formattedData.length > 0) {
      console.log('Primera fila formateada:', formattedData[0]);
    }

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
