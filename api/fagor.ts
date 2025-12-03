import type { VercelRequest, VercelResponse } from '@vercel/node';

// Credenciales de Fagor
const FAGOR_API_URL = 'http://www.flotasnet.com/servicios/EstadoVehiculo.asmx';
const FAGOR_USER = 'WebMasa2024';
const FAGOR_PASS = 'Weblog24*';
const FAGOR_EMPRESA = 'masa stork';

// Helper para parsear XML a JSON simple
function parseVehicleXML(xmlText: string): any[] {
  const vehicles: any[] = [];

  // Buscar todos los bloques DatosEstadoVehiculo
  const vehiclePattern = /<DatosEstadoVehiculo>([\s\S]*?)<\/DatosEstadoVehiculo>/g;
  let match;

  while ((match = vehiclePattern.exec(xmlText)) !== null) {
    const vehicleXml = match[1];

    const getTagValue = (tag: string): string => {
      const regex = new RegExp(`<${tag}>(.*?)<\/${tag}>`, 's');
      const tagMatch = vehicleXml.match(regex);
      return tagMatch ? tagMatch[1].trim() : '';
    };

    vehicles.push({
      Matricula: getTagValue('Matricula'),
      Codigo: getTagValue('Codigo'),
      Conductor: getTagValue('Conductor'),
      Remolque: getTagValue('Remolque'),
      EstadoUsuario: getTagValue('EstadoUsuario'),
      Estado: getTagValue('Estado'),
      Localidad: getTagValue('Localidad'),
      Latitud: getTagValue('Latitud').replace(',', '.'),
      Longitud: getTagValue('Longitud').replace(',', '.'),
      UltimaPosicion: getTagValue('UltimaPosicion'),
      Velocidad: getTagValue('Velocidad'),
      Kilometros: getTagValue('Kilometros').replace(',', '.'),
      TiempoEstado: getTagValue('TiempoEstado'),
      Sensores: getTagValue('Sensores').replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim(),
      Rumbo: getTagValue('Rumbo')
    });
  }

  return vehicles;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Solo permitir POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Construir el SOAP envelope
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
          <empresa>${FAGOR_EMPRESA}</empresa>
      </EstadoActualFlota>
  </soap:Body>
</soap:Envelope>`;

    // Hacer request a Fagor
    const response = await fetch(FAGOR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://212.8.96.37/webservices/EstadoActualFlota'
      },
      body: soapEnvelope
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Fagor API returned ${response.status}`,
        message: await response.text()
      });
    }

    const xmlText = await response.text();

    // Parsear XML a JSON
    const vehicles = parseVehicleXML(xmlText);

    if (vehicles.length === 0) {
      return res.status(500).json({
        error: 'No vehicles found in Fagor response',
        xmlSnippet: xmlText.substring(0, 500)
      });
    }

    // Retornar datos exitosamente
    return res.status(200).json({
      success: true,
      source: 'fagor',
      data: vehicles
    });

  } catch (error: any) {
    console.error('Error connecting to Fagor:', error);
    return res.status(500).json({
      error: 'Failed to connect to Fagor API',
      message: error.message
    });
  }
}
