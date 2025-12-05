/**
 * Hook para manejar la carga manual de archivos Excel de inspecciones
 *
 * Permite al usuario subir un Excel directamente desde el navegador,
 * lo procesa en el cliente, filtra por fechas y retorna los datos.
 */

import React from 'react';
import * as XLSX from 'xlsx';

interface InspectionRecord {
  llave: string;
  fecha: string;
  matricula: string;
  dia: string;
  horaInicio: string;
  lugarInicio: string;
  horaFin: string;
  conductor: string;
  fechaHoraInspeccion: string;
  numHallazgos: number;
  estado: string;
  contrato: string;
  tipoVehiculo: string;
}

interface UseManualUploadResult {
  loading: boolean;
  error: string | null;
  processFile: (file: File, startDate: string, endDate: string, limit?: number) => Promise<InspectionRecord[]>;
  progress: number;
}

export function useManualInspectionUpload(): UseManualUploadResult {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0);

  /**
   * Parsear fecha del Excel (formato: DD/MM/YYYY o similar)
   */
  const parseExcelDate = (dateStr: any): Date | null => {
    if (!dateStr) return null;

    try {
      // Si es un Date object de Excel
      if (dateStr instanceof Date) {
        return dateStr;
      }

      // Si es string en formato DD/MM/YYYY
      if (typeof dateStr === 'string') {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1; // Mes base 0
          const year = parseInt(parts[2]);
          return new Date(year, month, day);
        }

        // Intentar parseo directo
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }

      // Si es número (serial date de Excel)
      if (typeof dateStr === 'number') {
        // Excel guarda fechas como número de días desde 1900-01-01
        const excelEpoch = new Date(1900, 0, 1);
        const days = dateStr - 2; // Ajuste por bug de Excel con año 1900
        const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
        return date;
      }

      return null;
    } catch (error) {
      console.error('[Manual Upload] Error parsing date:', dateStr, error);
      return null;
    }
  };

  /**
   * Procesar archivo Excel y extraer inspecciones
   */
  const processFile = async (
    file: File,
    startDate: string,
    endDate: string,
    limit: number = 3000
  ): Promise<InspectionRecord[]> => {
    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      console.log('[Manual Upload] Processing file:', file.name, 'Size:', file.size);

      // Validar tipo de archivo
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        throw new Error('El archivo debe ser un Excel (.xlsx o .xls)');
      }

      // Validar tamaño (máximo 50MB)
      if (file.size > 50 * 1024 * 1024) {
        throw new Error('El archivo es demasiado grande (máximo 50MB)');
      }

      setProgress(10);

      // Leer archivo como ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      setProgress(30);

      console.log('[Manual Upload] Parsing Excel...');

      // Parsear Excel
      const workbook = XLSX.read(arrayBuffer, {
        type: 'array',
        cellDates: true,
        cellNF: false,
        cellText: false
      });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('El archivo Excel no contiene hojas');
      }

      // Usar la primera hoja
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convertir a JSON
      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, {
        defval: '',
        raw: false
      });

      console.log(`[Manual Upload] Found ${rawData.length} records in Excel`);
      setProgress(50);

      if (rawData.length === 0) {
        throw new Error('El Excel no contiene datos');
      }

      // Preparar filtro de fechas
      const filterStartDate = new Date(startDate);
      const filterEndDate = new Date(endDate);
      filterEndDate.setHours(23, 59, 59, 999);

      console.log('[Manual Upload] Filtering by date range:', startDate, 'to', endDate);

      // Mapear y filtrar datos
      const inspections: InspectionRecord[] = rawData
        .map((row: any) => {
          // Extraer fecha
          const fechaStr = row['Fecha'] || row['fecha'] || row['FECHA'] || '';

          return {
            llave: String(row['Llave'] || row['llave'] || row['LLAVE'] || ''),
            fecha: fechaStr,
            matricula: String(row['Matrícula'] || row['Matricula'] || row['matricula'] || row['Placa'] || row['placa'] || ''),
            dia: String(row['Día'] || row['Dia'] || row['dia'] || ''),
            horaInicio: String(row['Hora inicio'] || row['hora_inicio'] || row['Hora Inicio'] || ''),
            lugarInicio: String(row['Lugar inicio'] || row['lugar_inicio'] || row['Lugar Inicio'] || ''),
            horaFin: String(row['Hora fin'] || row['hora_fin'] || row['Hora Fin'] || ''),
            conductor: String(row['Conductor'] || row['conductor'] || ''),
            fechaHoraInspeccion: String(row['Fecha y hora inspección'] || row['fecha_hora_inspeccion'] || row['Fecha y Hora Inspección'] || ''),
            numHallazgos: parseInt(row['Nº Hallazgos'] || row['num_hallazgos'] || row['No Hallazgos'] || '0') || 0,
            estado: String(row['Estado'] || row['estado'] || 'Desconocido'),
            contrato: String(row['Contrato'] || row['contrato'] || 'No asignado'),
            tipoVehiculo: String(row['Tipo de vehículos'] || row['Tipo de vehiculos'] || row['tipo_vehiculo'] || row['Tipo de Vehículo'] || '')
          };
        })
        .filter((inspection) => {
          // Filtrar por rango de fechas
          if (!inspection.fecha) return false;

          const inspectionDate = parseExcelDate(inspection.fecha);
          if (!inspectionDate) return false;

          return inspectionDate >= filterStartDate && inspectionDate <= filterEndDate;
        })
        .slice(0, limit); // Aplicar límite

      console.log(`[Manual Upload] Filtered to ${inspections.length} records`);
      setProgress(100);

      if (inspections.length === 0) {
        throw new Error(
          `No se encontraron inspecciones en el rango ${startDate} a ${endDate}.\n\n` +
          `El Excel tiene ${rawData.length} registros en total, pero ninguno corresponde al rango seleccionado.`
        );
      }

      setLoading(false);
      return inspections;

    } catch (err: any) {
      console.error('[Manual Upload] Error processing file:', err);
      const errorMsg = err.message || 'Error al procesar el archivo';
      setError(errorMsg);
      setLoading(false);
      throw new Error(errorMsg);
    }
  };

  return {
    loading,
    error,
    processFile,
    progress
  };
}
