/**
 * documentosService.ts
 *
 * Sincroniza (client-side) dos fuentes vivas de Google Sheets hacia Supabase:
 *   1) Verificación documental  -> hv_verificacion_documental (última por cédula)
 *   2) Capacitaciones (manejo defensivo) -> hv_capacitaciones (todas las intervenciones)
 *
 * Usa el proxy genérico /api/sheets-csv (evita CORS). Mismo patrón que
 * hv_conductores: fetch del CSV vía proxy + upsert por lotes con el cliente
 * autenticado. Solo escribe en sus tablas; no toca otros módulos.
 */

import { supabase } from './supabaseClient';

// URLs públicas de los Sheets (CSV). Son públicas, no secretas.
export const VERIFICACION_CSV_URL =
  (import.meta as any).env?.VITE_VERIFICACION_CSV_URL ??
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQzqGE7lSZ7qV2NzzXp__5P6L3dFKSNjoirAqd9jrem2FwsDNm8dPyzpCcSC17TKRJtSekn2wRt1Qu4/pub?gid=0&single=true&output=csv';
export const CAPACITACIONES_CSV_URL =
  (import.meta as any).env?.VITE_CAPACITACIONES_CSV_URL ??
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbCun86uXI24CVAGIpD4uYekZCcJVfumRvVDNRgArTLE70AUsH7wNcBIWWVxIgdmNvenNff6370pcb/pub?gid=767343601&single=true&output=csv';

// ── Utilidades CSV / fechas ───────────────────────────────────────────────────

function parseLine(line: string): string[] {
  const f: string[] = [];
  let c = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { c += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { f.push(c.trim()); c = ''; }
    else c += ch;
  }
  f.push(c.trim());
  return f;
}

function parseCSV(text: string): string[][] {
  return text.replace(/\r/g, '').split('\n').filter(l => l.trim()).map(parseLine);
}

function normKey(k: string): string {
  return k.trim().toUpperCase()
    .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/[Ñ]/g, 'N')
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** dd/mm/yyyy (o d/m/yyyy) -> 'YYYY-MM-DD'. También acepta ya-ISO. */
function fechaDMY(v: string | undefined | null): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return s.slice(0, 10);
  return null;
}

/** "dd/mm/yyyy HH:MM:SS" -> ISO con offset Colombia (-05:00). */
function fechaHora(v: string | undefined | null): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) { const d = fechaDMY(s); return d ? `${d}T00:00:00-05:00` : null; }
  const [_, dd, mm, yyyy, hh = '0', mi = '0', ss = '0'] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${hh.padStart(2, '0')}:${mi.padStart(2, '0')}:${ss.padStart(2, '0')}-05:00`;
}

async function fetchCsv(url: string): Promise<string[][]> {
  const apiBase = (import.meta as any).env?.VITE_API_BASE ?? '';
  const res = await fetch(`${apiBase}/api/sheets-csv?url=${encodeURIComponent(url)}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Proxy CSV HTTP ${res.status}`);
  const json = await res.json() as { success: boolean; csv?: string; error?: string };
  if (!json.success || !json.csv) throw new Error(json.error ?? 'Proxy CSV sin datos');
  return parseCSV(json.csv);
}

async function upsertChunks(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict, ignoreDuplicates: false });
    if (error) throw new Error(error.message);
    n += chunk.length;
  }
  return n;
}

export interface SyncResult { success: boolean; procesados: number; error?: string }

// ── 1) Verificación documental (última por cédula) ────────────────────────────

export async function sincronizarVerificacionDocumental(): Promise<SyncResult> {
  try {
    const rows = await fetchCsv(VERIFICACION_CSV_URL);
    if (rows.length < 2) return { success: false, procesados: 0, error: 'Sheet de verificación vacío.' };

    const headers = rows[0].map(normKey);
    const idx = (k: string) => headers.indexOf(k);
    const get = (r: string[], k: string) => { const i = idx(k); return i >= 0 ? (r[i] ?? '').trim() : ''; };

    // Quedarnos con la validación MÁS RECIENTE por cédula.
    const latest = new Map<string, { r: string[]; ts: number }>();
    for (const r of rows.slice(1)) {
      const cedula = get(r, 'CEDULA_DEL_CONDUCTOR');
      if (!cedula) continue;
      const iso = fechaHora(get(r, 'FECHA_Y_HORA_DE_VALIDACION'));
      const ts = iso ? new Date(iso).getTime() : 0;
      const prev = latest.get(cedula);
      if (!prev || ts >= prev.ts) latest.set(cedula, { r, ts });
    }

    const comparendo = (r: string[], n: number) => ({
      fecha: get(r, `FECHA_COMPARENDO_${n}`) || null,
      codigo: get(r, `CODIGO_COMPARENDO_${n}`) || null,
      descripcion: get(r, `DESCRIPCION_COMPARENDO_${n}`) || null,
    });

    const payloads = [...latest.values()].map(({ r }) => {
      const comps = [1, 2, 3, 4, 5].map(n => comparendo(r, n)).filter(c => c.fecha || c.codigo || c.descripcion);
      return {
        cedula: get(r, 'CEDULA_DEL_CONDUCTOR'),
        nombre: get(r, 'NOMBRE_DEL_CONDUCTOR') || null,
        contrato: get(r, 'CONTRATO') || null,
        fecha_validacion: fechaHora(get(r, 'FECHA_Y_HORA_DE_VALIDACION')),
        usuario: get(r, 'USUARIO') || null,
        lic_part_categoria: get(r, 'CATEGORIA_DE_LICENCIA_PARTICULAR') || null,
        lic_part_estado: get(r, 'ESTADO_DE_LICENCIA_PARTICULAR') || null,
        lic_part_fecha_venc: fechaDMY(get(r, 'FECHA_DE_VENCIMIENTO_DE_LA_LICENCIA_PARTICULAR')),
        lic_part_alerta: get(r, 'ALERTA_VENCIMIENTO_LICENCIA_PARTICULAR') || null,
        lic_pub_categoria: get(r, 'CATEGORIA_DE_LICENCIA_PUBLICA') || null,
        lic_pub_estado: get(r, 'ESTADO_DE_LICENCIA_PUBLICA') || null,
        lic_pub_fecha_venc: fechaDMY(get(r, 'FECHA_DE_VENCIMIENTO_DE_LA_LICENCIA_PUBLICA')),
        lic_pub_alerta: get(r, 'ALERTA_VENCIMIENTO_LICENCIA_PUBLICA') || null,
        lic_moto_categoria: get(r, 'CATEGORIA_DE_LICENCIA_MOTO') || null,
        lic_moto_estado: get(r, 'ESTADO_DE_LICENCIA_MOTO') || null,
        lic_moto_fecha_venc: fechaDMY(get(r, 'FECHA_DE_VENCIMIENTO_DE_LA_LICENCIA_MOTO')),
        lic_moto_alerta: get(r, 'ALERTA_VENCIMIENTO_LICENCIA_MOTO') || null,
        tiene_comparendos: get(r, 'TIENE_COMPARENDOS') || null,
        numero_comparendos: Number(get(r, 'NUMERO_DE_COMPARENDOS')) || 0,
        valor_comparendos: Number(String(get(r, 'VALOR_TOTAL_COMPARENDOS_ACTIVOS')).replace(/[^0-9.]/g, '')) || 0,
        acuerdos_pago: get(r, 'TIENE_ACUERDOS_DE_PAGOS') || null,
        estado_acuerdos: get(r, 'ESTADO_DE_ACUERDOS_DE_PAGO') || null,
        comparendos: comps,
        link_runt: get(r, 'LINK_EVIDENCIA_RUNT') || null,
        link_simit: get(r, 'LINK_EVIDECNCIA_SIMIT') || get(r, 'LINK_EVIDENCIA_SIMIT') || null,
        link_pdf: get(r, 'LINK_PDF') || null,
        synced_at: new Date().toISOString(),
      };
    });

    const procesados = await upsertChunks('hv_verificacion_documental', payloads, 'cedula');
    return { success: true, procesados };
  } catch (e: unknown) {
    return { success: false, procesados: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── 2) Capacitaciones (todas las intervenciones) ──────────────────────────────

export async function sincronizarCapacitaciones(): Promise<SyncResult> {
  try {
    const rows = await fetchCsv(CAPACITACIONES_CSV_URL);
    if (rows.length < 2) return { success: false, procesados: 0, error: 'Sheet de capacitaciones vacío.' };

    // Estructura posicional (varias cabeceras en blanco): usamos índices fijos.
    const payloads: Record<string, unknown>[] = [];
    const vistos = new Set<string>();
    for (const r of rows.slice(1)) {
      const cedula = (r[2] ?? '').trim();
      if (!cedula) continue;
      const fechaCert = fechaDMY(r[3]);
      const vehiculo = (r[6] ?? '').trim();
      const tipo = (r[7] ?? '').trim();
      const vigencia = Number(r[9]) || null;
      // Fecha de vencimiento: la del Sheet o, si falta, cert + vigencia (años).
      let fechaVenc = fechaDMY(r[15]);
      if (!fechaVenc && fechaCert && vigencia) {
        const d = new Date(fechaCert);
        d.setFullYear(d.getFullYear() + Math.round(vigencia));
        fechaVenc = d.toISOString().slice(0, 10);
      }
      let sheetKey = (r[0] ?? '').trim();
      if (!sheetKey) sheetKey = `${cedula}|${fechaCert ?? ''}|${vehiculo}|${tipo}`;
      if (vistos.has(sheetKey)) continue;   // evita choque de onConflict dentro del mismo lote
      vistos.add(sheetKey);
      payloads.push({
        sheet_key: sheetKey,
        cedula,
        nombre: (r[1] ?? '').trim() || null,
        fecha_certificado: fechaCert,
        ubicacion: (r[4] ?? '').trim() || null,
        contrato: (r[5] ?? '').trim() || null,
        vehiculo: vehiculo || null,
        tipo: tipo || null,
        duracion: (r[8] ?? '').trim() || null,
        vigencia_anios: vigencia,
        link_certificado: (r[10] ?? '').trim() || null,
        estado: (r[12] ?? '').trim() || null,
        fecha_vencimiento: fechaVenc,
        validacion_nombres: (r[20] ?? '').trim() || null,
        link_certificado_ayg: (r[21] ?? '').trim() || null,
        consecutivo: (r[23] ?? '').trim() || null,
        anio: (r[24] ?? '').trim() || null,
        synced_at: new Date().toISOString(),
      });
    }

    const procesados = await upsertChunks('hv_capacitaciones', payloads, 'sheet_key');
    return { success: true, procesados };
  } catch (e: unknown) {
    return { success: false, procesados: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Lecturas para la Hoja de Vida ─────────────────────────────────────────────

export interface VerificacionDoc {
  cedula: string;
  fecha_validacion: string | null;
  contrato: string | null;
  licencias: Array<{ tipo: string; categoria: string | null; estado: string | null; fecha_venc: string | null; alerta: string | null }>;
  tiene_comparendos: string | null;
  numero_comparendos: number;
  valor_comparendos: number;
  acuerdos_pago: string | null;
  estado_acuerdos: string | null;
  comparendos: Array<{ fecha: string | null; codigo: string | null; descripcion: string | null }>;
  link_runt: string | null;
  link_simit: string | null;
  link_pdf: string | null;
}

export async function getVerificacionByCedula(cedula: string): Promise<VerificacionDoc | null> {
  try {
    const { data } = await supabase.from('hv_verificacion_documental').select('*').eq('cedula', cedula).maybeSingle();
    if (!data) return null;
    const d = data as any;
    return {
      cedula: d.cedula,
      fecha_validacion: d.fecha_validacion,
      contrato: d.contrato,
      licencias: [
        { tipo: 'Particular', categoria: d.lic_part_categoria, estado: d.lic_part_estado, fecha_venc: d.lic_part_fecha_venc, alerta: d.lic_part_alerta },
        { tipo: 'Pública', categoria: d.lic_pub_categoria, estado: d.lic_pub_estado, fecha_venc: d.lic_pub_fecha_venc, alerta: d.lic_pub_alerta },
        { tipo: 'Motocicleta', categoria: d.lic_moto_categoria, estado: d.lic_moto_estado, fecha_venc: d.lic_moto_fecha_venc, alerta: d.lic_moto_alerta },
      ].filter(l => l.categoria || l.fecha_venc || l.alerta),
      tiene_comparendos: d.tiene_comparendos,
      numero_comparendos: d.numero_comparendos ?? 0,
      valor_comparendos: Number(d.valor_comparendos ?? 0),
      acuerdos_pago: d.acuerdos_pago,
      estado_acuerdos: d.estado_acuerdos,
      comparendos: d.comparendos ?? [],
      link_runt: d.link_runt,
      link_simit: d.link_simit,
      link_pdf: d.link_pdf,
    };
  } catch { return null; }
}

export interface CapacitacionItem {
  tipo: string | null;
  vehiculo: string | null;
  contrato: string | null;
  fecha_certificado: string | null;
  fecha_vencimiento: string | null;
  vigencia_anios: number | null;
  estado: string | null;
  link_certificado: string | null;
  link_certificado_ayg: string | null;
  vencida: boolean;
  dias_para_vencer: number | null;
}

export interface CapacitacionesResumen {
  intervenciones: CapacitacionItem[];
  proximo_vencimiento: CapacitacionItem | null;  // la de vencimiento más reciente/relevante (alerta principal)
  total: number;
}

// ── Panel de vencimientos próximos (transversal) ──────────────────────────────

async function fetchAll<T = any>(query: any): Promise<T[]> {
  const PAGE = 1000; const all: T[] = []; let from = 0;
  while (true) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export interface VencimientoItem {
  conductor_id: string | null;
  cedula: string;
  nombre: string;
  contrato: string | null;
  documento: string;                    // 'Licencia particular' | 'Manejo defensivo' | ...
  fecha_venc: string;
  dias: number;                         // días restantes (negativo = vencido)
  estado: 'vencido' | 'por_vencer';
}

/**
 * Documentos que vencen dentro de `dias` (o ya vencidos) — licencias
 * (verificación documental) y manejo defensivo (última certificación).
 * Solo conductores presentes en el Sheet (hv_conductores.en_sheet).
 */
export async function getVencimientos(opts: {
  dias?: number; contrato?: string; incluirVencidos?: boolean;
} = {}): Promise<VencimientoItem[]> {
  const dias = opts.dias ?? 30;
  const incluirVencidos = opts.incluirVencidos ?? true;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const diasDe = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso); if (Number.isNaN(d.getTime())) return null;
    return Math.round((d.getTime() - hoy.getTime()) / 86_400_000);
  };

  // Conductores activos del Sheet: mapa cédula -> {id, nombre, contrato}
  const conductores = await fetchAll<{ id: string; cedula: string; nombres: string; proyecto: string | null }>(
    supabase.from('hv_conductores').select('id, cedula, nombres, proyecto').eq('en_sheet', true),
  );
  const cMap = new Map(conductores.map(c => [String(c.cedula).trim(), c]));

  const items: VencimientoItem[] = [];
  const push = (cedula: string, documento: string, fecha: string | null) => {
    const d = diasDe(fecha);
    if (d == null) return;
    if (d > dias) return;                       // aún lejos
    if (!incluirVencidos && d < 0) return;      // ya vencido y no lo queremos
    const c = cMap.get(String(cedula).trim());
    if (!c) return;                             // no es un conductor activo del Sheet
    if (opts.contrato && (c.proyecto ?? '') !== opts.contrato) return;
    items.push({
      conductor_id: c.id, cedula: String(cedula).trim(), nombre: c.nombres,
      contrato: c.proyecto ?? null, documento, fecha_venc: fecha!, dias: d,
      estado: d < 0 ? 'vencido' : 'por_vencer',
    });
  };

  // Licencias (verificación documental)
  const verif = await fetchAll<any>(
    supabase.from('hv_verificacion_documental').select('cedula, lic_part_fecha_venc, lic_pub_fecha_venc, lic_moto_fecha_venc'),
  );
  for (const v of verif) {
    push(v.cedula, 'Licencia particular', v.lic_part_fecha_venc);
    push(v.cedula, 'Licencia pública', v.lic_pub_fecha_venc);
    push(v.cedula, 'Licencia moto', v.lic_moto_fecha_venc);
  }

  // Manejo defensivo: última certificación por cédula (máx fecha_vencimiento)
  const capac = await fetchAll<{ cedula: string; fecha_vencimiento: string | null }>(
    supabase.from('hv_capacitaciones').select('cedula, fecha_vencimiento'),
  );
  const ultima = new Map<string, string>();
  for (const c of capac) {
    if (!c.fecha_vencimiento) continue;
    const k = String(c.cedula).trim();
    const prev = ultima.get(k);
    if (!prev || c.fecha_vencimiento > prev) ultima.set(k, c.fecha_vencimiento);
  }
  for (const [cedula, fecha] of ultima) push(cedula, 'Manejo defensivo', fecha);

  items.sort((a, b) => a.dias - b.dias);
  return items;
}

export async function getCapacitacionesByCedula(cedula: string): Promise<CapacitacionesResumen> {
  try {
    const { data } = await supabase
      .from('hv_capacitaciones')
      .select('tipo, vehiculo, contrato, fecha_certificado, fecha_vencimiento, vigencia_anios, estado, link_certificado, link_certificado_ayg')
      .eq('cedula', cedula)
      .order('fecha_vencimiento', { ascending: false });

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const items: CapacitacionItem[] = ((data ?? []) as any[]).map(r => {
      let vencida = false, dias: number | null = null;
      if (r.fecha_vencimiento) {
        const v = new Date(r.fecha_vencimiento);
        if (!Number.isNaN(v.getTime())) { dias = Math.round((v.getTime() - hoy.getTime()) / 86_400_000); vencida = dias < 0; }
      }
      return { ...r, vencida, dias_para_vencer: dias };
    });

    // Alerta principal: la intervención vigente con vencimiento más próximo; si
    // todas están vencidas, la de vencimiento más reciente.
    const vigentes = items.filter(i => i.dias_para_vencer != null && i.dias_para_vencer >= 0)
      .sort((a, b) => (a.dias_para_vencer! - b.dias_para_vencer!));
    const proximo = vigentes[0] ?? items[0] ?? null;

    return { intervenciones: items, proximo_vencimiento: proximo, total: items.length };
  } catch {
    return { intervenciones: [], proximo_vencimiento: null, total: 0 };
  }
}
