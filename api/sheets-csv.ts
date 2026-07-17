import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * api/sheets-csv.ts
 *
 * Proxy CSV genérico para saltar CORS al leer Google Sheets publicados desde el
 * navegador. Solo permite URLs de docs.google.com (evita SSRF). Devuelve el CSV
 * en crudo; el parseo se hace en el cliente.
 *
 * Uso: GET /api/sheets-csv?url=<url_csv_publicado>
 */

function isAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)docs\.google\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = String(req.query.url ?? '').trim();
  if (!url) return res.status(400).json({ success: false, error: 'Falta el parámetro url.' });
  if (!isAllowed(url)) return res.status(400).json({ success: false, error: 'URL no permitida (solo docs.google.com).' });

  try {
    const r = await fetch(url, { headers: { Accept: 'text/csv,*/*' }, redirect: 'follow' });
    if (!r.ok) throw new Error(`Google Sheets CSV HTTP ${r.status}`);
    const csv = await r.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({ success: true, csv });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}
