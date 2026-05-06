/**
 * Local API Server for Torre de Control
 * 
 * This server acts as a proxy to bypass CORS restrictions when developing locally.
 * Run with: node scripts/local_api_server.js
 * 
 * The Vite dev server should proxy /api requests to this server (port 3001)
 */

const http = require('http');
const https = require('https');

const PORT = 3001;

// API Credentials (same as in fleetService.ts)
const COLTRACK_API_URL = 'https://gps.coltrack.com/gps/api.jsp';
const COLTRACK_USER = 'WebSMagnex';
const COLTRACK_PASS = ']0zSKl549!9%';

const FAGOR_API_URL = 'http://www.flotasnet.com/servicios/EstadoVehiculo.asmx';
const FAGOR_USER = 'WebMasa2024';
const FAGOR_PASS = 'Weblog24*';
const FAGOR_EMPRESA = 'masa stork';
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyO1ywoSOGQZuK6HfrumCGOLcCQvQuCK8tofIjEGJEihTssGkQHBljFx3M4JmfL5XY7/exec';

// Helper to make HTTPS requests (follows redirects up to 5 hops)
function httpsRequest(url, options, postData = null, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) return reject(new Error('Too many redirects'));
        const urlObj = new URL(url);
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = https.request(reqOptions, (res) => {
            // Follow redirects
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                const redirectUrl = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : new URL(res.headers.location, url).toString();
                res.resume(); // drain
                resolve(httpsRequest(redirectUrl, { ...options, method: res.statusCode === 303 ? 'GET' : options.method }, res.statusCode === 303 ? null : postData, redirectCount + 1));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    text: () => Promise.resolve(data),
                    json: () => Promise.resolve(JSON.parse(data))
                });
            });
        });

        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

// Fetch Coltrack data
async function fetchColtrack() {
    try {
        const credentials = Buffer.from(`${COLTRACK_USER}:${COLTRACK_PASS}`).toString('base64');

        const response = await httpsRequest(COLTRACK_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
            }
        });

        if (!response.ok) {
            throw new Error(`Coltrack API returned ${response.status}`);
        }

        const data = await response.json();

        if (data.status !== 'OK' || !data.message || !data.message.data) {
            throw new Error('Invalid response structure from Coltrack');
        }

        return {
            success: true,
            source: 'coltrack',
            data: data.message.data
        };
    } catch (error) {
        console.error('Coltrack error:', error.message);
        return { success: false, error: error.message };
    }
}

// Fetch Fagor data (mismo SOAP que api/fagor.ts de Vercel)
async function fetchFagor() {
    try {
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

        // Fagor usa HTTP (no HTTPS), usar http module
        const http = require('http');
        const url = new URL(FAGOR_API_URL);

        const response = await new Promise((resolve, reject) => {
            const postData = soapEnvelope;
            const options = {
                hostname: url.hostname,
                port: url.port || 80,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': 'http://212.8.96.37/webservices/EstadoActualFlota',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    text: () => Promise.resolve(data)
                }));
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        if (!response.ok) {
            throw new Error(`Fagor API returned ${response.status}`);
        }

        const xmlText = await response.text();
        console.log('[Fagor] Response length:', xmlText.length);

        // Parsear XML — mismo parser que api/fagor.ts
        const vehicles = [];
        const vehiclePattern = /<DatosEstadoVehiculo>([\s\S]*?)<\/DatosEstadoVehiculo>/g;
        let match;

        while ((match = vehiclePattern.exec(xmlText)) !== null) {
            const vehicleXml = match[1];
            const getTagValue = (tag) => {
                const regex = new RegExp(`<${tag}>(.*?)<\/${tag}>`, 's');
                const tagMatch = vehicleXml.match(regex);
                return tagMatch ? tagMatch[1].trim() : '';
            };

            vehicles.push({
                Matricula:      getTagValue('Matricula'),
                Codigo:         getTagValue('Codigo'),
                Conductor:      getTagValue('Conductor'),
                EstadoUsuario:  getTagValue('EstadoUsuario'),
                Estado:         getTagValue('Estado'),
                Localidad:      getTagValue('Localidad'),
                Latitud:        getTagValue('Latitud').replace(',', '.'),
                Longitud:       getTagValue('Longitud').replace(',', '.'),
                UltimaPosicion: getTagValue('UltimaPosicion'),
                Velocidad:      getTagValue('Velocidad'),
                Kilometros:     getTagValue('Kilometros').replace(',', '.'),
                TiempoEstado:   getTagValue('TiempoEstado'),
                Rumbo:          getTagValue('Rumbo')
            });
        }

        if (vehicles.length === 0) {
            console.warn('[Fagor] No vehicles found. XML snippet:', xmlText.substring(0, 400));
            return { success: false, error: 'No vehicles found in Fagor response' };
        }

        console.log(`[Fagor] Parsed ${vehicles.length} vehicles`);
        return { success: true, source: 'fagor', data: vehicles };

    } catch (error) {
        console.error('Fagor error:', error.message);
        return { success: false, error: error.message };
    }
}

// Fetch Google Sheets contract data
async function fetchGoogleSheets() {
    try {
        const url = new URL(GOOGLE_SHEETS_URL);
        const response = await httpsRequest(GOOGLE_SHEETS_URL, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Google Sheets API returned ${response.status}`);
        }

        const data = await response.json();

        if (!data.success || !data.data || !Array.isArray(data.data)) {
            throw new Error('Invalid response format from Google Sheets');
        }

        const vehicleMap = {};
        data.data.forEach((record) => {
            const plate = record.Placa || record.PLACA;
            if (plate) {
                vehicleMap[plate] = {
                    placa: plate,
                    contrato: record.Contrato || record.CONTRATO || 'No asignado',
                    cliente: record.Cliente || record.CLIENTE || '',
                    ...record
                };
            }
        });

        console.log(`[Google Sheets] Loaded ${data.data.length} vehicle contracts`);
        return { success: true, vehicleMap, count: data.data.length, data: data.data };

    } catch (error) {
        console.error('[Google Sheets] Error:', error.message);
        return { success: false, vehicleMap: {}, count: 0, data: [] };
    }
}

// Simple router
const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    res.setHeader('Content-Type', 'application/json');

    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

    try {
        if (req.url === '/api/coltrack') {
            const result = await fetchColtrack();
            res.writeHead(result.success ? 200 : 500);
            res.end(JSON.stringify(result));
        } else if (req.url === '/api/fagor') {
            const result = await fetchFagor();
            res.writeHead(result.success ? 200 : 500);
            res.end(JSON.stringify(result));
        } else if (req.url === '/api/google-sheets') {
            const result = await fetchGoogleSheets();
            res.writeHead(result.success ? 200 : 500);
            res.end(JSON.stringify(result));
        } else if (req.url === '/api/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    } catch (error) {
        console.error('Server error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
    }
});

server.listen(PORT, () => {
    console.log(`\n🚀 Local API Server running on http://localhost:${PORT}`);
    console.log(`\nAvailable endpoints:`);
    console.log(`  POST /api/coltrack  - Fetch Coltrack vehicles`);
    console.log(`  POST /api/fagor     - Fetch Fagor vehicles`);
    console.log(`  GET  /api/health    - Health check`);
    console.log(`\nNow run 'npm run dev' in another terminal.\n`);
});
