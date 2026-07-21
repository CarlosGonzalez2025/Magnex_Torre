/**
 * LLM Council — consulta paralela a ChatGPT y Gemini
 * Solo usa módulos nativos de Node.js: https, fs, path
 * Sin npm install, sin dependencias externas.
 *
 * Uso: node .claude/scripts/query_council.js "tu pregunta aquí"
 * Salida: JSON { prompt, openai: { response, model } | { error }, gemini: { response, model } | { error } }
 */

'use strict';

const https   = require('https');
const fs      = require('fs');
const path    = require('path');

// ── Carga de variables de entorno ────────────────────────────────────────────

function loadEnvFile(filePath) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch {
    // Archivo no existe o no legible — continuar sin él
  }
}

// Buscar .council.env en el directorio de trabajo y en la raíz del script
const cwd = process.cwd();
loadEnvFile(path.join(cwd, '.council.env'));
loadEnvFile(path.join(cwd, '.env'));
loadEnvFile(path.join(__dirname, '../../.council.env'));

// ── HTTP helper ───────────────────────────────────────────────────────────────

function httpsPost(hostname, urlPath, extraHeaders, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...extraHeaders,
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });

    req.setTimeout(30000, () => {
      req.destroy(new Error('Timeout (30s)'));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Consultas a cada API ──────────────────────────────────────────────────────

async function queryOpenAI(prompt) {
  // Soporta OpenAI directo o OpenRouter (misma API, distinto host/key)
  const useOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const apiKey = useOpenRouter
    ? process.env.OPENROUTER_API_KEY
    : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return { error: 'Configura OPENAI_API_KEY o OPENROUTER_API_KEY en .council.env' };
  }

  const model = process.env.OPENAI_MODEL || (useOpenRouter ? 'openai/gpt-4o-mini' : 'gpt-4o-mini');
  const hostname = useOpenRouter ? 'openrouter.ai' : 'api.openai.com';
  const urlPath  = useOpenRouter ? '/api/v1/chat/completions' : '/v1/chat/completions';
  const provider = useOpenRouter ? 'OpenRouter' : 'OpenAI';

  const extraHeaders = { Authorization: `Bearer ${apiKey}` };
  if (useOpenRouter) {
    // Headers recomendados por OpenRouter para identificar el origen
    extraHeaders['HTTP-Referer'] = 'https://magnex.app';
    extraHeaders['X-Title']      = 'Magnex Torre de Control';
  }

  try {
    const res = await httpsPost(
      hostname,
      urlPath,
      extraHeaders,
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.7,
      }
    );

    const text = res.body?.choices?.[0]?.message?.content;
    if (text) return { response: text.trim(), model, provider };

    const errMsg = res.body?.error?.message ?? JSON.stringify(res.body);
    return { error: `${provider} HTTP ${res.status}: ${errMsg}` };
  } catch (err) {
    return { error: `${provider}: ${err.message}` };
  }
}

async function queryGemini(prompt) {
  const orKey      = process.env.OPENROUTER_API_KEY;
  const geminiKey  = process.env.GEMINI_API_KEY;
  const orModel2   = process.env.COUNCIL_MODEL_2;

  // Prioridad: OpenRouter con COUNCIL_MODEL_2 > Gemini directo (si key válida)
  // Si la clave Gemini no empieza con AIzaSy asumimos que no es válida para la API directa
  const geminiKeyValid = geminiKey && geminiKey.startsWith('AIzaSy');
  const useOpenRouter  = orKey && (orModel2 || !geminiKeyValid);

  if (useOpenRouter) {
    const model    = orModel2 || 'google/gemini-2.0-flash-exp:free';
    const provider = `OpenRouter (${model})`;
    try {
      const res = await httpsPost(
        'openrouter.ai',
        '/api/v1/chat/completions',
        {
          Authorization: `Bearer ${orKey}`,
          'HTTP-Referer': 'https://magnex.app',
          'X-Title':      'Magnex Torre de Control',
        },
        { model, messages: [{ role: 'user', content: prompt }], max_tokens: 1500, temperature: 0.7 }
      );
      const text = res.body?.choices?.[0]?.message?.content;
      if (text) return { response: text.trim(), model, provider: 'OpenRouter' };
      const errMsg = res.body?.error?.message ?? JSON.stringify(res.body);
      return { error: `${provider} HTTP ${res.status}: ${errMsg}` };
    } catch (err) {
      return { error: `${provider}: ${err.message}` };
    }
  }

  // Gemini directo (key con formato AIzaSy...)
  if (!geminiKeyValid) {
    return { error: 'Configura GEMINI_API_KEY (debe empezar con AIzaSy) o agrega COUNCIL_MODEL_2 para usar OpenRouter' };
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  try {
    const res = await httpsPost(
      'generativelanguage.googleapis.com',
      `/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {},
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1500, temperature: 0.7 } }
    );
    const text = res.body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return { response: text.trim(), model, provider: 'Gemini' };
    const errMsg = res.body?.error?.message ?? JSON.stringify(res.body);
    return { error: `Gemini HTTP ${res.status}: ${errMsg}` };
  } catch (err) {
    return { error: `Gemini: ${err.message}` };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const prompt = process.argv.slice(2).join(' ').trim();

  if (!prompt) {
    process.stderr.write('Uso: node query_council.js "<pregunta>"\n');
    process.exit(1);
  }

  // Consultas en paralelo para minimizar latencia
  const [openai, gemini] = await Promise.all([
    queryOpenAI(prompt),
    queryGemini(prompt),
  ]);

  process.stdout.write(JSON.stringify({ prompt, openai, gemini }, null, 2) + '\n');
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
  process.exit(1);
});
