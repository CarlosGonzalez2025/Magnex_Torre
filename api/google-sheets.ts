import type { VercelRequest, VercelResponse } from '@vercel/node';

// URL de tu Google Apps Script
const GOOGLE_SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbyO1ywoSOGQZuK6HfrumCGOLcCQvQuCK8tofIjEGJEihTssGkQHBljFx3M4JmfL5XY7/exec';

/**
 * Serverless function para obtener datos de Google Sheets (Apps Script)
 * Retorna un Map de Placa → Datos del vehículo (incluyendo Contrato)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('[Google Sheets API] Fetching data from Apps Script...');

    // Llamar a la API de Google Apps Script
    const response = await fetch(GOOGLE_SHEETS_API_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Google Sheets API returned status ${response.status}`);
    }

    const data = await response.json();

    // Verificar estructura de datos
    if (!data.success || !data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response format from Google Sheets API');
    }

    console.log(`[Google Sheets API] Successfully fetched ${data.data.length} records`);

    // Crear un Map de Placa → Datos para fácil lookup
    const vehicleMap: Record<string, any> = {};

    data.data.forEach((record: any) => {
      const plate = record.Placa || record.PLACA;
      if (plate) {
        vehicleMap[plate] = {
          placa: plate,
          contrato: record.Contrato || record.CONTRATO || 'No asignado',
          cliente: record.Cliente || record.CLIENTE || '',
          marca: record.Marca || record.MARCA || '',
          linea: record.Linea || record.LINEA || '',
          tipo: record['Tipo de activo'] || record.TIPO_DE_ACTIVO || '',
          clase: record['Clase activo'] || record.CLASE_ACTIVO || '',
          conductor: record.Conductor || record.CONDUCTOR || '',
          estado: record['Estado actual activo'] || record.ESTADO_ACTUAL_ACTIVO || 'ACTIVO',
          // Incluir todos los campos originales por si se necesitan
          ...record
        };
      }
    });

    return res.status(200).json({
      success: true,
      source: 'google-sheets',
      data: data.data,
      vehicleMap: vehicleMap,
      count: data.data.length
    });

  } catch (error: any) {
    console.error('[Google Sheets API] Error:', error.message);

    return res.status(500).json({
      success: false,
      source: 'google-sheets',
      error: error.message || 'Unknown error',
      data: [],
      vehicleMap: {},
      count: 0
    });
  }
}
