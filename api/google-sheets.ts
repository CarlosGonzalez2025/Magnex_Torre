import type { VercelRequest, VercelResponse } from '@vercel/node';

// URL CSV de exportación del Google Sheet de Vehículos.
// Formato: https://docs.google.com/spreadsheets/d/e/.../pub?gid=0&output=csv
const CSV_URL = process.env.VEHICULOS_SHEETS_CSV_URL || '';

// Mapeo: columna real del CSV → clave estándar devuelta al cliente
// Cubre tanto el nombre exacto del sheet actual como alias genéricos
const FIELD_MAP: Record<string, string> = {
  PLACA:                  'placa',
  ESTADO_ACTUAL_ACTIVO:   'estado',
  ESTADO:                 'estado',
  CONTRATO:               'contrato',
  NOMBRE_CONTRATO_PROYECTO: 'contrato',
  CLIENTE:                'cliente',
  MARCA:                  'marca',
  LINEA:                  'linea',
  TIPO_DE_ACTIVO:         'tipo',
  TIPO:                   'tipo',
  CLASE_ACTIVO:           'clase',
  CLASE:                  'clase',
  CARROCERIA:             'carroceria',
  TIPO_COMBUSTIBLE:       'tipo_combustible',
  MODELO:                 'modelo',
  FECHA_MATRICULA:        'fecha_matricula',
  FECHA_SOAT:             'fecha_venc_soat',
  FECHA_RTM:              'fecha_venc_rtm',
  FECHA_CERTIFICACION:    'fecha_venc_certificacion',
  POLIZA_DE_TODO_RIESGO:  'poliza_todo_riesgo',
  TIPO_SERVICIO:          'tipo_servicio',
  TARJETA_DE_OPERACION:   'tarjeta_operacion',
  NUMERO_VIN:             'vin',
  NUMERO_MOTOR:           'motor',
  NUMERO_CHASIS:          'chasis',
  NOMBRE_CENTRO_DE_COSTO: 'centro_costo_nombre',
  NUMERO_CENTRO_DE_COSTO: 'centro_costo_numero',
  LUGAR:                  'lugar',
  ZONA:                   'zona',
  COORDINADOR:            'coordinador',
  COMPANIA_GPS:           'gps_compañia',
  KM_ACTUAL:              'km_actual',
  KM_SEMANA_ACTUAL:       'km_semana_actual',
};

function normalizeKey(k: string): string {
  return k.trim().toUpperCase()
    .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÍÌÎÏ]/g, 'I').replace(/[ÓÒÔÖ]/g, 'O')
    .replace(/[ÚÙÛÜ]/g, 'U').replace(/[Ñ]/g, 'N')
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim()); current = '';
      } else { current += ch; }
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== ''));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!CSV_URL) {
    return res.status(500).json({
      success: false,
      error: 'VEHICULOS_SHEETS_CSV_URL no configurada.',
      data: [], vehicleMap: {}, count: 0,
    });
  }

  try {
    const response = await fetch(CSV_URL, { headers: { Accept: 'text/csv,*/*' }, redirect: 'follow' });
    if (!response.ok) throw new Error(`Google Sheets CSV returned HTTP ${response.status}`);

    const text = await response.text();
    const rawRows = parseCSV(text);

    // Normalizar cada fila usando el FIELD_MAP
    const rows = rawRows.map(raw => {
      const normalized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        const target = FIELD_MAP[normalizeKey(k)];
        if (target && !normalized[target]) normalized[target] = v;
      }
      return normalized;
    }).filter(r => r.placa);

    const vehicleMap: Record<string, Record<string, unknown>> = {};
    rows.forEach(r => {
      const plate = String(r.placa ?? '').trim().toUpperCase();
      if (plate) vehicleMap[plate] = { ...r, placa: plate };
    });

    console.log(`[google-sheets] ${rows.length} vehículos cargados desde CSV`);
    return res.status(200).json({ success: true, source: 'google-sheets-csv', data: rows, vehicleMap, count: rows.length });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[google-sheets]', msg);
    return res.status(500).json({ success: false, error: msg, data: [], vehicleMap: {}, count: 0 });
  }
}
