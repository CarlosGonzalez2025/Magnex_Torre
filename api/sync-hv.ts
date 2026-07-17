import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * api/sync-hv.ts
 *
 * Refresca la tabla `hv_conductores` (espejo limpio del Google Sheet) a demanda.
 * - Lee el CSV publicado del Sheet.
 * - Upsert por cédula de los campos DOCUMENTALES (el Sheet manda).
 * - Resuelve `telemetria_ref_id` = conductores(id) de esa cédula (puente).
 * - Marca `en_sheet=false` a los que ya no están en el Sheet (soft).
 * - NUNCA pisa campos del sistema: carnet_token, foto_url (override del supervisor).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CONDUCTORES_SHEETS_CSV_URL.
 * Usa service_role (bypassa RLS). Método POST (o GET para pruebas).
 */

const CSV_URL = process.env.CONDUCTORES_SHEETS_CSV_URL || '';

const FIELD_MAP: Record<string, string> = {
  NOMBRES: 'nombres',
  NO_CEDULA_CIUDADANIA: 'cedula', CEDULA: 'cedula',
  CARGO: 'cargo', BASE: 'base',
  ESTADO_DEL_CONDUCTOR: 'estado', ESTADO: 'estado',
  NOMBRE_CONTRATO_PROYECTO: 'proyecto', PROYECTO: 'proyecto',
  LLAVE_IBUTTON: 'ibutton', LLAVE_IBUTTON_FAGOR: 'ibutton', IBUTTON: 'ibutton',
  TIPO_LICENCIA_CONDUCCION: 'tipo_licencia', TIPO_LICENCIA: 'tipo_licencia',
  FECHA_PRIMERA_EXPEDICION_LICENCIA_PARTICULAR: 'fecha_exp_particular', FECHA_EXP_PARTICULAR: 'fecha_exp_particular',
  FECHA_VENC_LIC_PARTICULAR: 'fecha_venc_particular', FECHA_VENC_PARTICULAR: 'fecha_venc_particular',
  FECHA_PRIMERA_EXPEDICION_LICENCIA_PUBLICA: 'fecha_exp_publica', FECHA_EXP_PUBLICA: 'fecha_exp_publica',
  FECHA_VENC_LIC_PUBLICA: 'fecha_venc_publica', FECHA_VENC_PUBLICA: 'fecha_venc_publica',
  FECHA_PRIMERA_EXPEDICION_LICENCIA_MOTOCICLETA: 'fecha_exp_moto', FECHA_EXP_MOTO: 'fecha_exp_moto',
  FECHA_VENC_LIC_MOTOCICLETA: 'fecha_venc_moto', FECHA_VENC_MOTO: 'fecha_venc_moto',
  FECHA_CAPACITACION_MANEJO_DEFENSIVO: 'fecha_cap_manejo_def', FECHA_CAP_MANEJO_DEF: 'fecha_cap_manejo_def',
  FECHA_CAPACITACION_LEGISLACION: 'fecha_cap_peligrosas', FECHA_CAP_PELIGROSAS: 'fecha_cap_peligrosas',
  FECHA_APLICACION_PRUEBA_PRACTICA: 'fecha_cap_alturas', FECHA_CAP_ALTURAS: 'fecha_cap_alturas',
  FECHA_APLICACION_PRUEBA_CONOCIMIENTOS: 'fecha_cap_otro', FECHA_CAP_OTRO: 'fecha_cap_otro',
  RESULTADO_PRUEBA_PRACTICA: 'resultado_prueba_ingreso', RESULTADO_PRUEBA_INGRESO: 'resultado_prueba_ingreso',
  RESULTADO_PRUEBA_CONOCIMIENTOS: 'resultado_prueba_periodica', RESULTADO_PRUEBA_PERIODICA: 'resultado_prueba_periodica',
  TIPO_COMPETENCIAS_LABORALES_O_CERTIFICACION_TRANSPORTE_MERCANCIAS_PELIGROSAS: 'tipo_competencias', TIPO_COMPETENCIAS: 'tipo_competencias',
  FECHA_VIGENCIA_COMPETENCIAS_LABORALES_O_CERTIFICACION: 'vigencia_competencias', VIGENCIA_COMPETENCIAS: 'vigencia_competencias',
  FECHA_REVISION_ANTE_EL_SIMIT: 'fecha_revision_simit', FECHA_REVISION_SIMIT: 'fecha_revision_simit',
  TIPO_DE_COMPARENDO: 'tipo_comparendo', TIPO_COMPARENDO: 'tipo_comparendo',
  VALOR_DE_COMPARENDO: 'valor_comparendo', VALOR_COMPARENDO: 'valor_comparendo',
  // Metadatos del Sheet
  FOTO_DEL_CONDUCTOR: 'foto_sheet_url', FOTO: 'foto_sheet_url',
  ID: 'sheet_row_id',
  USUARIO_QUE_ACTUALIZA: 'actualizado_por',
};

const DATE_FIELDS = new Set([
  'fecha_exp_particular','fecha_venc_particular','fecha_exp_publica','fecha_venc_publica',
  'fecha_exp_moto','fecha_venc_moto','fecha_cap_manejo_def','fecha_cap_peligrosas',
  'fecha_cap_alturas','fecha_cap_otro','vigencia_competencias','fecha_revision_simit',
]);

function normalizeKey(k: string): string {
  return k.trim().toUpperCase()
    .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/[Ñ]/g, 'N')
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
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; }
      else current += ch;
    }
    fields.push(current.trim());
    return fields;
  };
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ success: false, error: 'Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
  if (!CSV_URL) return res.status(500).json({ success: false, error: 'CONDUCTORES_SHEETS_CSV_URL no configurada' });

  try {
    const resp = await fetch(CSV_URL, { headers: { Accept: 'text/csv,*/*' }, redirect: 'follow' });
    if (!resp.ok) throw new Error(`Google Sheets CSV HTTP ${resp.status}`);
    const rows = parseCSV(await resp.text());

    const conductores = rows.map(row => {
      const m: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        const target = FIELD_MAP[normalizeKey(k)];
        if (!target) continue;
        if (DATE_FIELDS.has(target)) m[target] = isoDate(v);
        else if (target === 'valor_comparendo') m[target] = v !== '' && v != null ? Number(v) : 0;
        else if (!m[target]) m[target] = String(v ?? '').trim();
      }
      if (!m.estado) m.estado = 'ACTIVO';
      return m;
    }).filter(c => c.cedula);

    // Guard: si el Sheet vino vacío, abortar (no marcar a todos fuera del sheet).
    if (conductores.length === 0) {
      return res.status(200).json({ success: false, error: 'El Sheet devolvió 0 conductores — sync cancelado.', sincronizados: 0 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Puente a telemetría: mapa cédula -> conductores(id) de la tabla vieja.
    const cedulas = conductores.map(c => String(c.cedula).trim());
    const refMap = new Map<string, string>();
    for (let i = 0; i < cedulas.length; i += 300) {
      const chunk = cedulas.slice(i, i + 300);
      const { data } = await supabase.from('conductores').select('id, cedula').in('cedula', chunk);
      for (const r of (data ?? []) as Array<{ id: string; cedula: string }>) refMap.set(String(r.cedula).trim(), r.id);
    }

    const nowIso = new Date().toISOString();
    const errores: string[] = [];
    let sincronizados = 0;

    for (const c of conductores) {
      const cedula = String(c.cedula).trim();
      // Payload SOLO documental + puente. NO incluye carnet_token ni foto_url
      // (override del supervisor) → el upsert nunca los pisa.
      const payload: Record<string, unknown> = {
        cedula,
        nombres: String(c.nombres ?? '').trim(),
        cargo: c.cargo ?? null, base: c.base ?? null,
        estado: String(c.estado ?? 'ACTIVO').trim().toUpperCase(),
        proyecto: c.proyecto ?? null, tipo_licencia: c.tipo_licencia ?? null,
        fecha_exp_particular: c.fecha_exp_particular ?? null, fecha_venc_particular: c.fecha_venc_particular ?? null,
        fecha_exp_publica: c.fecha_exp_publica ?? null, fecha_venc_publica: c.fecha_venc_publica ?? null,
        fecha_exp_moto: c.fecha_exp_moto ?? null, fecha_venc_moto: c.fecha_venc_moto ?? null,
        fecha_cap_manejo_def: c.fecha_cap_manejo_def ?? null, fecha_cap_peligrosas: c.fecha_cap_peligrosas ?? null,
        fecha_cap_alturas: c.fecha_cap_alturas ?? null, fecha_cap_otro: c.fecha_cap_otro ?? null,
        resultado_prueba_ingreso: c.resultado_prueba_ingreso ?? null,
        resultado_prueba_periodica: c.resultado_prueba_periodica ?? null,
        tipo_competencias: c.tipo_competencias ?? null, vigencia_competencias: c.vigencia_competencias ?? null,
        fecha_revision_simit: c.fecha_revision_simit ?? null,
        tipo_comparendo: c.tipo_comparendo ?? null, valor_comparendo: Number(c.valor_comparendo ?? 0),
        ibutton: c.ibutton ?? null,
        foto_sheet_url: c.foto_sheet_url ?? null,
        sheet_row_id: c.sheet_row_id ?? null,
        actualizado_por: c.actualizado_por ?? null,
        telemetria_ref_id: refMap.get(cedula) ?? null,
        en_sheet: true,
        updated_from_sheet_at: nowIso,
        updated_at: nowIso,
      };
      const { error } = await supabase.from('hv_conductores').upsert(payload, { onConflict: 'cedula', ignoreDuplicates: false });
      if (error) errores.push(`${cedula}: ${error.message}`);
      else sincronizados++;
    }

    // Soft-remove: los que ya no están en el Sheet.
    let retirados = 0;
    const setCed = new Set(cedulas);
    const existentes: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('hv_conductores').select('cedula').eq('en_sheet', true).range(from, from + 999);
      const batch = (data ?? []) as Array<{ cedula: string }>;
      existentes.push(...batch.map(r => r.cedula));
      if (batch.length < 1000) break;
    }
    const fuera = existentes.filter(ced => !setCed.has(ced));
    for (let i = 0; i < fuera.length; i += 200) {
      const chunk = fuera.slice(i, i + 200);
      const { error } = await supabase.from('hv_conductores').update({ en_sheet: false, updated_at: nowIso }).in('cedula', chunk);
      if (!error) retirados += chunk.length;
    }

    return res.status(200).json({
      success: true,
      total_sheet: conductores.length,
      sincronizados,
      retirados,
      con_puente_telemetria: [...refMap.values()].length,
      errores: errores.slice(0, 20),
      timestamp: nowIso,
    });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}
