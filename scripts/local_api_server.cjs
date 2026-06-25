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
const fs = require('fs');
const path = require('path');

// Cargar .env.local (mismo directorio raíz del proyecto)
try {
  const envPath = path.join(__dirname, '..', '.env.local');
  const envText = fs.readFileSync(envPath, 'utf8');
  for (const line of envText.split('\n')) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch { /* .env.local no existe o no es legible */ }

const PORT = process.env.LOCAL_API_PORT || 3001;

// ── Chat IA (núcleo compartido con api/chat.ts) ──
const { runChat } = require('../api/_chatCore.cjs');
const CHAT_SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://cmzeijcyykzdmvisojte.supabase.co';
const CHAT_SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const CHAT_GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// API Credentials (same as in fleetService.ts)
const COLTRACK_API_URL = 'https://gps.coltrack.com/gps/api.jsp';
const COLTRACK_USER = 'WebSMagnex';
const COLTRACK_PASS = ']0zSKl549!9%';

const FAGOR_API_URL = 'http://www.flotasnet.com/servicios/EstadoVehiculo.asmx';
const FAGOR_USER = 'WebMasa2024';
const FAGOR_PASS = 'Weblog24*';
const FAGOR_EMPRESA = 'masa stork';
// URLs CSV de Google Sheets (export?format=csv&gid=...)
// Configura estas variables en tu entorno o directamente aquí.
// Formato: https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=GID
const VEHICULOS_CSV_URL   = process.env.VEHICULOS_SHEETS_CSV_URL   || '';
const CONDUCTORES_CSV_URL = process.env.CONDUCTORES_SHEETS_CSV_URL || '';

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

// Parsea texto CSV en array de objetos (usa la primera fila como cabeceras)
function parseCSV(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    function parseLine(line) {
        const fields = [];
        let current = '', inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
                else inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                fields.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        fields.push(current.trim());
        return fields;
    }

    const headers = parseLine(lines[0]);
    return lines.slice(1).map(line => {
        const values = parseLine(line);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
        return obj;
    }).filter(row => Object.values(row).some(v => v !== ''));
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

// Mapeo de columnas CSV de vehículos → claves estándar
const VEHICULOS_FIELD_MAP = {
    PLACA: 'placa', ESTADO_ACTUAL_ACTIVO: 'estado', ESTADO: 'estado',
    CONTRATO: 'contrato', NOMBRE_CONTRATO_PROYECTO: 'contrato',
    CLIENTE: 'cliente', MARCA: 'marca', LINEA: 'linea',
    TIPO_DE_ACTIVO: 'tipo', TIPO: 'tipo',
    CLASE_ACTIVO: 'clase', CLASE: 'clase',
    CARROCERIA: 'carroceria', TIPO_COMBUSTIBLE: 'tipo_combustible', MODELO: 'modelo',
    NOMBRE_CENTRO_DE_COSTO: 'centro_costo_nombre', NUMERO_CENTRO_DE_COSTO: 'centro_costo_numero',
    LUGAR: 'lugar', ZONA: 'zona', COORDINADOR: 'coordinador', COMPANIA_GPS: 'gps_compañia',
    KM_ACTUAL: 'km_actual', KM_SEMANA_ACTUAL: 'km_semana_actual',
};

function normalizeKeyVeh(k) {
    return k.trim().toUpperCase()
        .replace(/[ÁÀÂÄ]/g,'A').replace(/[ÉÈÊË]/g,'E')
        .replace(/[ÍÌÎÏ]/g,'I').replace(/[ÓÒÔÖ]/g,'O')
        .replace(/[ÚÙÛÜ]/g,'U').replace(/[Ñ]/g,'N')
        .replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}

// Fetch Google Sheets Vehículos data (CSV export URL)
async function fetchGoogleSheets() {
    if (!VEHICULOS_CSV_URL) {
        return { success: false, error: 'VEHICULOS_SHEETS_CSV_URL no configurada', vehicleMap: {}, count: 0, data: [] };
    }
    try {
        const response = await httpsRequest(VEHICULOS_CSV_URL, {
            method: 'GET', headers: { 'Accept': 'text/csv,*/*' }
        });
        if (!response.ok) throw new Error(`Google Sheets CSV returned ${response.status}`);

        const text = await response.text();
        const rawRows = parseCSV(text);

        const rows = rawRows.map(raw => {
            const normalized = {};
            for (const [k, v] of Object.entries(raw)) {
                const target = VEHICULOS_FIELD_MAP[normalizeKeyVeh(k)];
                if (target && !normalized[target]) normalized[target] = v;
            }
            return normalized;
        }).filter(r => r.placa);

        const vehicleMap = {};
        rows.forEach(r => {
            const plate = String(r.placa || '').trim().toUpperCase();
            if (plate) vehicleMap[plate] = { ...r, placa: plate };
        });

        console.log(`[Google Sheets] Loaded ${rows.length} vehiculos from CSV`);
        return { success: true, vehicleMap, count: rows.length, data: rows };

    } catch (error) {
        console.error('[Google Sheets] Error:', error.message);
        return { success: false, vehicleMap: {}, count: 0, data: [], error: error.message };
    }
}

// Fetch Google Sheets Conductores data (CSV export URL)
async function fetchConductoresSheets() {
    if (!CONDUCTORES_CSV_URL) {
        return { success: false, error: 'CONDUCTORES_SHEETS_CSV_URL no configurada', data: [], count: 0 };
    }

    const FIELD_MAP = {
        NOMBRES: 'nombres',
        NO_CEDULA_CIUDADANIA: 'cedula', CEDULA: 'cedula',
        CARGO: 'cargo', BASE: 'base',
        ESTADO_DEL_CONDUCTOR: 'estado', ESTADO: 'estado',
        NOMBRE_CONTRATO_PROYECTO: 'proyecto', PROYECTO: 'proyecto',
        LLAVE_IBUTTON: 'ibutton', LLAVE_IBUTTON_FAGOR: 'ibutton', IBUTTON: 'ibutton',
        TIPO_LICENCIA_CONDUCCION: 'tipo_licencia', TIPO_LICENCIA: 'tipo_licencia',
        FECHA_PRIMERA_EXPEDICION_LICENCIA_PARTICULAR: 'fecha_exp_particular',
        FECHA_EXP_PARTICULAR: 'fecha_exp_particular',
        FECHA_VENC_LIC_PARTICULAR: 'fecha_venc_particular',
        FECHA_VENC_PARTICULAR: 'fecha_venc_particular',
        FECHA_PRIMERA_EXPEDICION_LICENCIA_PUBLICA: 'fecha_exp_publica',
        FECHA_EXP_PUBLICA: 'fecha_exp_publica',
        FECHA_VENC_LIC_PUBLICA: 'fecha_venc_publica',
        FECHA_VENC_PUBLICA: 'fecha_venc_publica',
        FECHA_PRIMERA_EXPEDICION_LICENCIA_MOTOCICLETA: 'fecha_exp_moto',
        FECHA_EXP_MOTO: 'fecha_exp_moto',
        FECHA_VENC_LIC_MOTOCICLETA: 'fecha_venc_moto',
        FECHA_VENC_MOTO: 'fecha_venc_moto',
        FECHA_CAPACITACION_MANEJO_DEFENSIVO: 'fecha_cap_manejo_def',
        FECHA_CAP_MANEJO_DEF: 'fecha_cap_manejo_def',
        FECHA_CAPACITACION_LEGISLACION: 'fecha_cap_peligrosas',
        FECHA_CAP_PELIGROSAS: 'fecha_cap_peligrosas',
        FECHA_APLICACION_PRUEBA_PRACTICA: 'fecha_cap_alturas',
        FECHA_CAP_ALTURAS: 'fecha_cap_alturas',
        FECHA_APLICACION_PRUEBA_CONOCIMIENTOS: 'fecha_cap_otro',
        FECHA_CAP_OTRO: 'fecha_cap_otro',
        RESULTADO_PRUEBA_PRACTICA: 'resultado_prueba_ingreso',
        RESULTADO_PRUEBA_INGRESO: 'resultado_prueba_ingreso',
        RESULTADO_PRUEBA_CONOCIMIENTOS: 'resultado_prueba_periodica',
        RESULTADO_PRUEBA_PERIODICA: 'resultado_prueba_periodica',
        TIPO_COMPETENCIAS_LABORALES_O_CERTIFICACION_TRANSPORTE_MERCANCIAS_PELIGROSAS: 'tipo_competencias',
        TIPO_COMPETENCIAS: 'tipo_competencias',
        FECHA_VIGENCIA_COMPETENCIAS_LABORALES_O_CERTIFICACION: 'vigencia_competencias',
        VIGENCIA_COMPETENCIAS: 'vigencia_competencias',
        FECHA_REVISION_ANTE_EL_SIMIT: 'fecha_revision_simit',
        FECHA_REVISION_SIMIT: 'fecha_revision_simit',
        TIPO_DE_COMPARENDO: 'tipo_comparendo', TIPO_COMPARENDO: 'tipo_comparendo',
        VALOR_DE_COMPARENDO: 'valor_comparendo', VALOR_COMPARENDO: 'valor_comparendo',
    };

    function normalizeKey(k) {
        return k.trim().toUpperCase()
            .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E')
            .replace(/[ÍÌÎÏ]/g, 'I').replace(/[ÓÒÔÖ]/g, 'O')
            .replace(/[ÚÙÛÜ]/g, 'U').replace(/[Ñ]/g, 'N')
            .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }

    function isoDate(val) {
        if (!val || val === '') return null;
        const s = String(val).trim();
        const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`;
        const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) return s.slice(0, 10);
        return null;
    }

    try {
        const response = await httpsRequest(CONDUCTORES_CSV_URL, {
            method: 'GET',
            headers: { 'Accept': 'text/csv,*/*' }
        });
        if (!response.ok) throw new Error(`Conductores CSV returned ${response.status}`);

        const text = await response.text();
        const rows = parseCSV(text);

        const conductores = rows.map((row) => {
            const mapped = {};
            for (const [k, v] of Object.entries(row)) {
                const norm = normalizeKey(String(k));
                const target = FIELD_MAP[norm];
                if (!target) continue;
                if (target.startsWith('fecha_') || target === 'vigencia_competencias') {
                    mapped[target] = isoDate(v);
                } else if (target === 'valor_comparendo') {
                    mapped[target] = v !== '' && v != null ? Number(v) : 0;
                } else {
                    if (!mapped[target]) mapped[target] = String(v ?? '').trim();
                }
            }
            if (!mapped.estado) mapped.estado = 'ACTIVO';
            return mapped;
        }).filter(c => c.cedula);

        console.log(`[Conductores Sheets] Loaded ${conductores.length} conductores from CSV`);
        return { success: true, source: 'google-sheets-conductores', data: conductores, count: conductores.length };

    } catch (error) {
        console.error('[Conductores Sheets] Error:', error.message);
        return { success: false, error: error.message, data: [], count: 0 };
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
        } else if (req.url === '/api/sheets-conductores') {
            const result = await fetchConductoresSheets();
            res.writeHead(result.success ? 200 : 500);
            res.end(JSON.stringify(result));
        } else if (req.url === '/api/chat' && req.method === 'POST') {
            const body = await readBody(req);
            const messages = Array.isArray(body.messages) ? body.messages : [];
            if (messages.length === 0) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Falta el historial de mensajes.' }));
            } else {
                const out = await runChat({
                    messages,
                    geminiApiKey: CHAT_GEMINI_KEY,
                    supabaseUrl: CHAT_SUPABASE_URL,
                    supabaseKey: CHAT_SUPABASE_KEY,
                });
                res.writeHead(out.error ? 502 : 200);
                res.end(JSON.stringify(out));
            }
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
    console.log(`  POST /api/coltrack           - Fetch Coltrack vehicles`);
    console.log(`  POST /api/fagor              - Fetch Fagor vehicles`);
    console.log(`  GET  /api/google-sheets      - Fetch vehiculos from Google Sheets`);
    console.log(`  GET  /api/sheets-conductores - Fetch conductores from Google Sheets`);
    console.log(`  GET  /api/health             - Health check`);
    console.log(`\nNow run 'npm run dev' in another terminal.\n`);
});
