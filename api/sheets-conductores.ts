import type { VercelRequest, VercelResponse } from '@vercel/node';

// URL CSV de exportación del Google Sheet de Conductores.
// Formato: https://docs.google.com/spreadsheets/d/e/.../pub?gid=0&output=csv
const CSV_URL = process.env.CONDUCTORES_SHEETS_CSV_URL || '';

// Mapeo: clave normalizada del CSV → campo en la BD
// Cubre tanto las columnas del sheet real como alias genéricos
const FIELD_MAP: Record<string, string> = {
  // Identidad
  NOMBRES:                    'nombres',
  NO_CEDULA_CIUDADANIA:       'cedula',
  CEDULA:                     'cedula',
  CARGO:                      'cargo',
  BASE:                       'base',
  ESTADO_DEL_CONDUCTOR:       'estado',
  ESTADO:                     'estado',
  NOMBRE_CONTRATO_PROYECTO:   'proyecto',
  PROYECTO:                   'proyecto',
  LLAVE_IBUTTON:              'ibutton',
  LLAVE_IBUTTON_FAGOR:        'ibutton',
  IBUTTON:                    'ibutton',
  // Licencia particular
  TIPO_LICENCIA_CONDUCCION:                   'tipo_licencia',
  TIPO_LICENCIA:                              'tipo_licencia',
  FECHA_PRIMERA_EXPEDICION_LICENCIA_PARTICULAR: 'fecha_exp_particular',
  FECHA_EXP_PARTICULAR:                       'fecha_exp_particular',
  FECHA_VENC_LIC_PARTICULAR:                  'fecha_venc_particular',
  FECHA_VENC_PARTICULAR:                      'fecha_venc_particular',
  // Licencia pública
  FECHA_PRIMERA_EXPEDICION_LICENCIA_PUBLICA:  'fecha_exp_publica',
  FECHA_EXP_PUBLICA:                          'fecha_exp_publica',
  FECHA_VENC_LIC_PUBLICA:                     'fecha_venc_publica',
  FECHA_VENC_PUBLICA:                         'fecha_venc_publica',
  // Licencia moto
  FECHA_PRIMERA_EXPEDICION_LICENCIA_MOTOCICLETA: 'fecha_exp_moto',
  FECHA_EXP_MOTO:                             'fecha_exp_moto',
  FECHA_VENC_LIC_MOTOCICLETA:                 'fecha_venc_moto',
  FECHA_VENC_MOTO:                            'fecha_venc_moto',
  // Capacitaciones
  FECHA_CAPACITACION_MANEJO_DEFENSIVO:        'fecha_cap_manejo_def',
  FECHA_CAP_MANEJO_DEF:                       'fecha_cap_manejo_def',
  FECHA_CAPACITACION_LEGISLACION:             'fecha_cap_peligrosas',
  FECHA_CAP_PELIGROSAS:                       'fecha_cap_peligrosas',
  FECHA_APLICACION_PRUEBA_PRACTICA:           'fecha_cap_alturas',
  FECHA_CAP_ALTURAS:                          'fecha_cap_alturas',
  FECHA_APLICACION_PRUEBA_CONOCIMIENTOS:      'fecha_cap_otro',
  FECHA_CAP_OTRO:                             'fecha_cap_otro',
  // Resultados pruebas
  RESULTADO_PRUEBA_PRACTICA:                  'resultado_prueba_ingreso',
  RESULTADO_PRUEBA_INGRESO:                   'resultado_prueba_ingreso',
  RESULTADO_PRUEBA_CONOCIMIENTOS:             'resultado_prueba_periodica',
  RESULTADO_PRUEBA_PERIODICA:                 'resultado_prueba_periodica',
  // Competencias laborales
  TIPO_COMPETENCIAS_LABORALES_O_CERTIFICACION_TRANSPORTE_MERCANCIAS_PELIGROSAS: 'tipo_competencias',
  TIPO_COMPETENCIAS:                          'tipo_competencias',
  FECHA_VIGENCIA_COMPETENCIAS_LABORALES_O_CERTIFICACION: 'vigencia_competencias',
  VIGENCIA_COMPETENCIAS:                      'vigencia_competencias',
  // SIMIT / Comparendos
  FECHA_REVISION_ANTE_EL_SIMIT:              'fecha_revision_simit',
  FECHA_REVISION_SIMIT:                      'fecha_revision_simit',
  TIPO_DE_COMPARENDO:                        'tipo_comparendo',
  TIPO_COMPARENDO:                           'tipo_comparendo',
  VALOR_DE_COMPARENDO:                       'valor_comparendo',
  VALOR_COMPARENDO:                          'valor_comparendo',
};

function normalizeKey(k: string): string {
  return k.trim().toUpperCase()
    .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÍÌÎÏ]/g, 'I').replace(/[ÓÒÔÖ]/g, 'O')
    .replace(/[ÚÙÛÜ]/g, 'U').replace(/[Ñ]/g, 'N')
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function isoDate(val: unknown): string | null {
  if (!val || val === '') return null;
  const s = String(val).trim();
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return s.slice(0, 10);
  return null;
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!CSV_URL) {
    return res.status(500).json({
      success: false,
      error: 'CONDUCTORES_SHEETS_CSV_URL no configurada.',
      data: [], count: 0,
    });
  }

  try {
    const response = await fetch(CSV_URL, { headers: { Accept: 'text/csv,*/*' }, redirect: 'follow' });
    if (!response.ok) throw new Error(`Google Sheets CSV returned HTTP ${response.status}`);

    const text = await response.text();
    const rows = parseCSV(text);

    const conductores = rows.map(row => {
      const mapped: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        const norm = normalizeKey(k);
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

    console.log(`[sheets-conductores] ${conductores.length} conductores cargados`);
    return res.status(200).json({ success: true, source: 'google-sheets-csv', data: conductores, count: conductores.length });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sheets-conductores]', msg);
    return res.status(500).json({ success: false, error: msg, data: [], count: 0 });
  }
}
