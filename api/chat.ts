import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    if (!GEMINI_API_KEY) {
      return res.status(502).json({ error: 'GEMINI_API_KEY no está configurada en Vercel (Settings → Environment Variables).' });
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) return res.status(400).json({ error: 'Falta el historial de mensajes.' });

    // El núcleo es CJS y se comparte con el servidor de desarrollo local. Se carga con
    // import() dinámico (compatible con el runtime ESM de Vercel) y dentro del try, de
    // modo que cualquier fallo de carga devuelva JSON y no la página de error de Vercel.
    // @ts-ignore — módulo CJS sin tipos
    const mod: any = await import('./_chatCore.cjs');
    const runChat = (mod && mod.default ? mod.default.runChat : mod.runChat);

    const out = await runChat({
      messages,
      geminiApiKey: GEMINI_API_KEY,
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_ANON_KEY,
    });
    if (out.error) return res.status(502).json({ error: out.error });
    return res.status(200).json(out);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/chat]', msg);
    return res.status(500).json({ error: `Fallo en el asistente: ${msg}` });
  }
}
