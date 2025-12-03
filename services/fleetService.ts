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

/**
 * Attempts to fetch data directly from Coltrack API (Client-side).
 */
const fetchColtrackDirectly = async (): Promise<Vehicle[]> => {
  const credentials = btoa(`${COLTRACK_USER}:${COLTRACK_PASS}`);
  
  try {
    const response = await fetch(COLTRACK_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
      },
    });

    if (!response.ok) throw new Error(`Coltrack API returned ${response.status}`);

    const json = await response.json();
    if (json.status !== 'OK' || !json.message || !json.message.data) {
      throw new Error('Invalid JSON structure from Coltrack');
    }

    return json.message.data.map((record: any, index: number) => {
      const speed = parseFloat(record.Velocidad || '0');
      const ignicion = record.Ignicion === 'ON' || record.Ignicion === '1' || record.Ignicion === true;
      const status = determineStatus(speed, ignicion);

      return {
        id: `COL-${record.Placa || index}`,
        plate: record.Placa || 'UNKNOWN',
        source: ApiSource.COLTRACK,
        latitude: parseFloat(record.Latitud || '0'),
        longitude: parseFloat(record.Longitud || '0'),
        speed: speed,
        status: status,
        driver: record.Conductor || 'Sin Asignar',
        fuelLevel: parseInt(record.Combustible || '0', 10),
        lastUpdate: new Date().toISOString(),
        location: record.Ciudad || record.Ubicacion || 'Desconocido',
        odometer: parseFloat(record.Odometro || '0'),
      };
    });

  } catch (error) {
    console.warn('Direct Coltrack connection failed:', error);
    return []; // Return empty to allow partial success
  }
};

/**
 * Attempts to fetch data directly from Fagor (FlotasNet) SOAP API.
 */
const fetchFagorDirectly = async (): Promise<Vehicle[]> => {
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                 xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Header>
        <AuthHeader xmlns="http://212.8.96.37/webservices/">
            <Username>${FAGOR_USER}</Username>
            <Password>${FAGOR_PASS}</Password>
        </AuthHeader>
    </soap:Header>
    <soap:Body>
        <EstadoActualFlota xmlns="http://212.8.96.37/webservices/">
            <empresa>masa stork</empresa>
        </EstadoActualFlota>
    </soap:Body>
  </soap:Envelope>`;

  try {
    const response = await fetch(FAGOR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://212.8.96.37/webservices/EstadoActualFlota'
      },
      body: soapEnvelope
    });

    if (!response.ok) throw new Error(`Fagor API returned ${response.status}`);
    
    const xmlText = await response.text();
    return parseFagorXml(xmlText);

  } catch (error) {
    console.warn('Direct Fagor connection failed:', error);
    return []; // Return empty to allow partial success
  }
};

/**
 * Parses the Fagor SOAP XML response using browser DOMParser.
 */
const parseFagorXml = (xmlText: string): Vehicle[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  
  // Handle namespaces if present, or just select by local name "DatosEstadoVehiculo"
  const vehicles = xmlDoc.getElementsByTagName("DatosEstadoVehiculo");
  
  return Array.from(vehicles).map((node, index) => {
    const getValue = (tag: string) => {
      const el = node.getElementsByTagName(tag)[0];
      return el ? el.textContent || '' : '';
    };

    const plate = getValue("Matricula");
    const latStr = getValue("Latitud").replace(',', '.');
    const lonStr = getValue("Longitud").replace(',', '.');
    const speed = parseInt(getValue("Velocidad") || '0', 10);
    const estadoText = getValue("Estado");
    
    // Infer status from text provided in XML
    const status = determineStatus(speed, false, estadoText);

    return {
      id: `FAG-${plate || index}`,
      plate: plate || 'UNKNOWN',
      source: ApiSource.FAGOR,
      latitude: parseFloat(latStr) || 0,
      longitude: parseFloat(lonStr) || 0,
      speed: speed,
      status: status,
      driver: getValue("Conductor") || 'Sin Asignar',
      fuelLevel: 0, // Fagor standard XML doesn't always have fuel in a simple tag
      lastUpdate: new Date().toISOString(), 
      location: getValue("Localidad") || 'Desconocido',
      odometer: parseFloat(getValue("Kilometros").replace(',', '.') || '0'),
    };
  });
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

  // 2. Second, try Direct Connections to BOTH APIs in parallel
  console.log("Attempting direct API connections to Fagor and Coltrack...");

  const results = await Promise.allSettled([
    fetchColtrackDirectly(),
    fetchFagorDirectly()
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