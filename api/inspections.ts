import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';

// URL del Excel de inspecciones
const INSPECTIONS_URL = 'https://desarrollo.checkayg.stork.segurosayg.com/export/archivoinspeccionestotal.xlsx';

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

/**
 * Serverless function para descargar y parsear inspecciones preoperacionales
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('[Inspections] Downloading Excel from:', INSPECTIONS_URL);

    // Descargar el Excel
    const response = await fetch(INSPECTIONS_URL);

    if (!response.ok) {
      throw new Error(`Failed to download Excel: ${response.status}`);
    }

    // Convertir a buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log('[Inspections] Parsing Excel...');

    // Parsear Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Asumir que la primera hoja contiene los datos
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convertir a JSON
    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

    console.log(`[Inspections] Found ${rawData.length} records`);

    // Mapear datos a estructura consistente
    const inspections: InspectionRecord[] = rawData.map((row: any) => ({
      llave: row['Llave'] || row['llave'] || '',
      fecha: row['Fecha'] || row['fecha'] || '',
      matricula: row['Matrícula'] || row['Matricula'] || row['matricula'] || row['Placa'] || '',
      dia: row['Día'] || row['Dia'] || row['dia'] || '',
      horaInicio: row['Hora inicio'] || row['hora_inicio'] || '',
      lugarInicio: row['Lugar inicio'] || row['lugar_inicio'] || '',
      horaFin: row['Hora fin'] || row['hora_fin'] || '',
      conductor: row['Conductor'] || row['conductor'] || '',
      fechaHoraInspeccion: row['Fecha y hora inspección'] || row['fecha_hora_inspeccion'] || '',
      numHallazgos: parseInt(row['Nº Hallazgos'] || row['num_hallazgos'] || '0'),
      estado: row['Estado'] || row['estado'] || 'Desconocido',
      contrato: row['Contrato'] || row['contrato'] || 'No asignado',
      tipoVehiculo: row['Tipo de vehículos'] || row['Tipo de vehiculos'] || row['tipo_vehiculo'] || ''
    }));

    // Calcular estadísticas
    const stats = {
      total: inspections.length,
      ok: inspections.filter(i => i.estado === 'OK').length,
      sinInspeccion: inspections.filter(i => i.estado.toLowerCase().includes('sin inspección') || i.estado.toLowerCase().includes('sin inspeccion')).length,
      fueraDeTiempo: inspections.filter(i => i.estado.toLowerCase().includes('fuera de tiempo')).length
    };

    // Estadísticas por contrato
    const contractStats: Record<string, any> = {};
    inspections.forEach(inspection => {
      const contract = inspection.contrato || 'No asignado';
      if (!contractStats[contract]) {
        contractStats[contract] = {
          total: 0,
          ok: 0,
          sinInspeccion: 0,
          fueraDeTiempo: 0
        };
      }
      contractStats[contract].total++;
      if (inspection.estado === 'OK') contractStats[contract].ok++;
      if (inspection.estado.toLowerCase().includes('sin inspección')) contractStats[contract].sinInspeccion++;
      if (inspection.estado.toLowerCase().includes('fuera de tiempo')) contractStats[contract].fueraDeTiempo++;
    });

    console.log('[Inspections] Successfully parsed inspections');

    return res.status(200).json({
      success: true,
      data: inspections,
      stats,
      contractStats,
      downloadedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[Inspections] Error:', error.message);

    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      data: [],
      stats: { total: 0, ok: 0, sinInspeccion: 0, fueraDeTiempo: 0 },
      contractStats: {}
    });
  }
}
