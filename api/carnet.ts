import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * api/carnet.ts
 *
 * Resuelve el QR del carnet del lado del SERVIDOR. El QR solo lleva un token
 * opaco (carnet_token); nunca cédula ni datos sensibles. Este endpoint traduce
 * el token a un carnet MÍNIMO de solo lectura (foto, nombre, cargo, puntaje,
 * semáforo), enmascarando la cédula. No expone licencias, documentos ni el
 * historial documental.
 *
 * Usa service_role (bypassa RLS) pero solo devuelve un subconjunto whitelisteado
 * → la exposición está controlada en la capa del API, no en la BD.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ya usadas por api/geotab-sync).
 */

function maskCedula(cedula: string | null | undefined): string {
  const s = String(cedula ?? '').trim();
  if (s.length <= 4) return s ? `••••${s}` : '';
  return `••••${s.slice(-4)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = String(req.query.token ?? '').trim();
  if (!token) {
    return res.status(400).json({ success: false, error: 'Falta el token del carnet.' });
  }

  // Preferimos service_role (si está configurado en Vercel), pero caemos a la
  // anon key pública: hv_conductores y conductor_scores ya tienen política de
  // lectura para `anon`, y este endpoint solo devuelve campos mínimos. Así el
  // QR funciona sin depender de configurar env vars en el hosting.
  const SUPABASE_URL_FALLBACK = 'https://cmzeijcyykzdmvisojte.supabase.co';
  const SUPABASE_ANON_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || SUPABASE_URL_FALLBACK;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_FALLBACK;

  try {
    const supabase = createClient(supabaseUrl, key);

    const { data: c, error: errC } = await supabase
      .from('hv_conductores')
      .select('id, nombres, cedula, cargo, proyecto, estado, foto_url, foto_sheet_url, ibutton')
      .eq('carnet_token', token)
      .maybeSingle();

    if (errC) throw errC;
    if (!c) return res.status(404).json({ success: false, error: 'Carnet no encontrado.' });

    // Último snapshot de puntaje (puede no existir aún)
    const { data: scoreRows } = await supabase
      .from('conductor_scores')
      .select('puntaje, semaforo, detonadores, fecha_calculo')
      .eq('conductor_id', c.id)
      .order('fecha_calculo', { ascending: false })
      .limit(1);

    const score = (scoreRows ?? [])[0] ?? null;

    // Conteo de registros de campo (para "historial reciente" sin exponer detalle)
    const { count: registrosCount } = await supabase
      .from('conductor_campo_registros')
      .select('id', { count: 'exact', head: true })
      .eq('conductor_id', c.id);

    return res.status(200).json({
      success: true,
      data: {
        conductor_id: c.id,          // UUID no sensible; el registro autenticado lo necesita
        nombres: c.nombres,
        cedula_masked: maskCedula(c.cedula),
        cargo: c.cargo ?? null,
        proyecto: c.proyecto ?? null,
        estado: c.estado ?? null,
        foto_url: c.foto_url ?? c.foto_sheet_url ?? null,
        tiene_ibutton: !!(c.ibutton && String(c.ibutton).trim()),
        puntaje: score ? Number(score.puntaje) : null,
        semaforo: score ? score.semaforo : null,
        detonadores: score ? (score.detonadores ?? []) : [],
        fecha_calculo: score ? score.fecha_calculo : null,
        registros_campo: registrosCount ?? 0,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg });
  }
}
