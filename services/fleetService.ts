import { Vehicle, ApiSource, VehicleStatus } from '../types';
import { generateMockVehicles } from './mockData';

const BACKEND_API_URL = 'http://localhost:8000/api';

// --- COLTRACK CONFIGURATION ---
const COLTRACK_API_URL = 'https://gps.coltrack.com/gps/api.jsp';
const COLTRACK_USER = 'WebSMagnex';
const COLTRACK_PASS = ']0zSKl549!9%';

// --- FAGOR CONFIGURATION ---
// Changed to HTTPS to attempt to avoid Mixed Content blocking
const FAGOR_API_URL = 'https://www.flotasnet.com/servicios/EstadoVehiculo.asmx'; 
const FAGOR_USER = 'WebMasa2024';
const FAGOR_PASS = 'Weblog24*';

export interface FleetResponse {
  data: Vehicle[];
  source: 'REAL' | 'DIRECT_API' | 'PARTIAL_DIRECT' | 'ERROR' | 'MOCK';
  error?: string;
  apiStatus?: {
    coltrack: 'connected' | 'failed' | 'not_tested';
    fagor: 'connected' | 'failed' | 'not_tested';
    backend: 'connected' | 'failed' | 'not_tested';
  };
  vehicleCounts?: {
    coltrack: number;
    fagor: number;
    total: number;
  };
}

// Helper to determine status from speed/ignition/event text
const determineStatus = (speed: number, isIgnitionOn: boolean, eventText: string = ''): VehicleStatus => {
  if (speed > 0) return VehicleStatus.MOVING;
  // Fagor specific strings often contain these keywords
  if (eventText.includes('Arranque') || eventText.includes('Inicio ralenti') || eventText.includes('ON')) return VehicleStatus.IDLE;
  if (eventText.includes('Parada') || eventText.includes('Fin ralenti') || eventText.includes('OFF')) return VehicleStatus.OFF;

  // Fallback
  return isIgnitionOn ? VehicleStatus.IDLE : VehicleStatus.STOPPED;
};

// Helper to determine contract/client from vehicle data
const determineContract = (record: any, source: ApiSource): string => {
  // Coltrack puede tener campo "Grupo" o "Cliente"
  if (source === ApiSource.COLTRACK) {
    return record.Grupo || record.Cliente || record.Contrato || 'No asignado';
  }

  // Fagor puede tener campo similar en el futuro
  if (source === ApiSource.FAGOR) {
    return record.Cliente || record.Contrato || 'No asignado';
  }

  return 'No asignado';
};

/**
 * Attempts to fetch data from Coltrack via serverless function
 */
const fetchColtrackViaAPI = async (): Promise<Vehicle[]> => {
  try {
    const response = await fetch('/api/coltrack', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Coltrack serverless function returned ${response.status}`);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error('Invalid response from Coltrack serverless function');
    }

    return result.data.map((record: any, index: number) => {
      const speed = parseFloat(record.VELOCIDAD || record.Velocidad || '0');
      const ignicion = record.IGNICION === 'ON' || record.Ignicion === 'ON' || record.Ignicion === '1' || record.Ignicion === true;
      const status = determineStatus(speed, ignicion);

      // Coltrack usa campos en MAYÚSCULAS (según código de referencia)
      const plate = record.PLACA || record.Placa || 'UNKNOWN';
      const driver = record.CONDUCTOR || record.Conductor || 'Sin Asignar';
      const contract = determineContract(record, ApiSource.COLTRACK);

      return {
        id: `COL-${plate}-${index}`,
        plate: plate,
        source: ApiSource.COLTRACK,
        latitude: parseFloat(record.LATITUD || record.Latitud || '0'),
        longitude: parseFloat(record.LONGITUD || record.Longitud || '0'),
        speed: speed,
        status: status,
        driver: driver,
        fuelLevel: parseInt(record.COMBUSTIBLE || record.Combustible || '0', 10),
        lastUpdate: new Date().toISOString(),
        location: record.CIUDAD || record.Ciudad || record.Ubicacion || 'Desconocido',
        odometer: parseFloat(record.ODOMETRO || record.Odometro || '0'),
        contract: contract,
        event: record.EVENTO || record.Evento || '',
        vehicleType: record.TIPO || record.Tipo || record.TipoVehiculo || ''
      };
    });

  } catch (error) {
    console.warn('Coltrack serverless function failed:', error);
    return [];
  }
};

/**
 * Attempts to fetch data from Fagor via serverless function
 */
const fetchFagorViaAPI = async (): Promise<Vehicle[]> => {
  try {
    const response = await fetch('/api/fagor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Fagor serverless function returned ${response.status}`);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error('Invalid response from Fagor serverless function');
    }

    return result.data.map((record: any, index: number) => {
      const plate = record.Matricula;
      const speed = parseInt(record.Velocidad || '0', 10);
      const estadoText = record.Estado;
      const contract = determineContract(record, ApiSource.FAGOR);

      const status = determineStatus(speed, false, estadoText);

      return {
        id: `FAG-${plate || index}`,
        plate: plate || 'UNKNOWN',
        source: ApiSource.FAGOR,
        latitude: parseFloat(record.Latitud) || 0,
        longitude: parseFloat(record.Longitud) || 0,
        speed: speed,
        status: status,
        driver: record.Conductor || 'Sin Asignar',
        fuelLevel: 0,
        lastUpdate: new Date().toISOString(),
        location: record.Localidad || 'Desconocido',
        odometer: parseFloat(record.Kilometros || '0'),
        contract: contract,
        event: record.Estado || record.EstadoUsuario || '',
        vehicleType: record.TipoVehiculo || ''
      };
    });

  } catch (error) {
    console.warn('Fagor serverless function failed:', error);
    return [];
  }
};


export const fetchFleetData = async (): Promise<FleetResponse> => {
  // Initialize status tracking
  const apiStatus = {
    coltrack: 'not_tested' as const,
    fagor: 'not_tested' as const,
    backend: 'not_tested' as const
  };

  // 1. First, try the Python Backend
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const response = await fetch(`${BACKEND_API_URL}/vehiculos`, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      apiStatus.backend = 'connected';

      // Count vehicles by source
      const coltrackCount = data.filter((v: Vehicle) => v.source === ApiSource.COLTRACK).length;
      const fagorCount = data.filter((v: Vehicle) => v.source === ApiSource.FAGOR).length;

      return {
        data,
        source: 'REAL',
        apiStatus,
        vehicleCounts: {
          coltrack: coltrackCount,
          fagor: fagorCount,
          total: data.length
        }
      };
    }
    apiStatus.backend = 'failed';
  } catch (e) {
    apiStatus.backend = 'failed';
  }

  // 2. Second, try Serverless API Functions to BOTH APIs in parallel
  console.log("Attempting serverless API connections to Fagor and Coltrack...");

  const results = await Promise.allSettled([
    fetchColtrackViaAPI(),
    fetchFagorViaAPI()
  ]);

  const coltrackData = results[0].status === 'fulfilled' ? results[0].value : [];
  const fagorData = results[1].status === 'fulfilled' ? results[1].value : [];

  apiStatus.coltrack = coltrackData.length > 0 ? 'connected' : 'failed';
  apiStatus.fagor = fagorData.length > 0 ? 'connected' : 'failed';

  const combinedData = [...coltrackData, ...fagorData];

  if (combinedData.length > 0) {
    const hasColtrack = coltrackData.length > 0;
    const hasFagor = fagorData.length > 0;
    const sourceStatus = (hasColtrack && hasFagor) ? 'DIRECT_API' : 'PARTIAL_DIRECT';

    return {
      data: combinedData,
      source: sourceStatus,
      apiStatus,
      vehicleCounts: {
        coltrack: coltrackData.length,
        fagor: fagorData.length,
        total: combinedData.length
      }
    };
  }

  // 3. Fallback to MOCK
  // In a pure client-side environment (like a browser), accessing 3rd party APIs
  // without CORS headers will almost always fail. To prevent the app from appearing "broken",
  // we return fallback data with a MOCK source status.
  console.warn('All connections failed. Falling back to Simulation Mode.');
  const mockData = generateMockVehicles(25);
  const mockColtrackCount = mockData.filter(v => v.source === ApiSource.COLTRACK).length;
  const mockFagorCount = mockData.filter(v => v.source === ApiSource.FAGOR).length;

  return {
    data: mockData,
    source: 'MOCK',
    error: 'No se pudo establecer conexión con Fagor ni Coltrack. Mostrando datos de respaldo.',
    apiStatus,
    vehicleCounts: {
      coltrack: mockColtrackCount,
      fagor: mockFagorCount,
      total: mockData.length
    }
  };
};