import type { VercelRequest, VercelResponse } from '@vercel/node';
// El núcleo es CJS y se comparte con el servidor de desarrollo local.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runChat } = require('./_chatCore.cjs');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) return res.status(400).json({ error: 'Falta el historial de mensajes.' });

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
    return res.status(500).json({ error: msg });
  }
}
