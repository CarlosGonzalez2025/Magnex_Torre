import type { VercelRequest, VercelResponse } from '@vercel/node';

// Credenciales de Coltrack
const COLTRACK_API_URL = 'https://gps.coltrack.com/gps/api.jsp';
const COLTRACK_USER = 'WebSMagnex';
const COLTRACK_PASS = ']0zSKl549!9%';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Solo permitir POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Preparar credenciales Basic Auth
    const credentials = Buffer.from(`${COLTRACK_USER}:${COLTRACK_PASS}`).toString('base64');

    // Hacer request a Coltrack
    const response = await fetch(COLTRACK_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Coltrack API returned ${response.status}`,
        message: await response.text()
      });
    }

    const data = await response.json();

    // Validar estructura de respuesta
    if (data.status !== 'OK' || !data.message || !data.message.data) {
      return res.status(500).json({
        error: 'Invalid response structure from Coltrack',
        data
      });
    }

    // Retornar datos exitosamente
    return res.status(200).json({
      success: true,
      source: 'coltrack',
      data: data.message.data
    });

  } catch (error: any) {
    console.error('Error connecting to Coltrack:', error);
    return res.status(500).json({
      error: 'Failed to connect to Coltrack API',
      message: error.message
    });
  }
}
