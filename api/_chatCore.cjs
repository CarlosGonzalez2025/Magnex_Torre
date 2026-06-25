/**
 * Núcleo del chat IA — fuente única usada por:
 *   - api/chat.ts        (función serverless en Vercel, producción)
 *   - scripts/local_api_server.cjs  (servidor de desarrollo local)
 *
 * Patrón: function-calling con Gemini. La IA SOLO decide qué herramienta usar y
 * extrae parámetros; las consultas a Supabase son predefinidas, parametrizadas y
 * de SOLO LECTURA (anon key). No hay texto→SQL. Así los números son confiables
 * y no hay riesgo de inyección ni de escrituras.
 */

const { createClient } = require('@supabase/supabase-js');

// ── Factores CO₂ (kg/gal) y precio (COP/gal) — FECOC/UPME, iguales al módulo de ralentí ──
const CO2_FACTORES = [
  { test: t => t.includes('diesel') || t.includes('diésel') || t.includes('acpm'), factor: 10.15 },
  { test: t => t.includes('gasolina') || t.includes('corriente'), factor: 8.81 },
  { test: t => t.includes('glp') || t.includes('gas licuado'), factor: 6.47 },
  { test: t => t.includes('electric') || t.includes('eléctric'), factor: 0 },
];
const PRECIOS_GALON = [
  { test: t => t.includes('diesel') || t.includes('diésel') || t.includes('acpm'), precio: 11200 },
  { test: t => t.includes('gasolina') || t.includes('corriente'), precio: 16000 },
  { test: t => t.includes('electric') || t.includes('eléctric'), precio: 0 },
];
const getCO2 = tipo => {
  const t = (tipo || '').toLowerCase().trim();
  if (!t) return 10.15;
  return (CO2_FACTORES.find(f => f.test(t)) || {}).factor ?? 10.15;
};
const getPrecio = tipo => {
  const t = (tipo || '').toLowerCase().trim();
  if (!t) return 11200;
  return (PRECIOS_GALON.find(f => f.test(t)) || {}).precio ?? 11200;
};

const esTaller = nombre => (nombre || '').toUpperCase().includes('TALLER');
const esConductorPlaceholder = nombre => {
  const n = (nombre || '').toLowerCase().trim();
  return !n || ['no registra', 'sin conductor', 'desconocido', 'no asignado', 'conductor n/a', 'na', 'n/a'].includes(n);
};

function makeClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false } });
}

// Trae una tabla completa (con filtros) paginando en paralelo según el conteo exacto.
async function fetchAll(supabase, table, fields, applyFilters) {
  const PAGE = 1000;
  const countQ = applyFilters(supabase.from(table).select(fields, { count: 'exact', head: true }));
  const { count, error: countErr } = await countQ;
  if (countErr) throw countErr;
  const numPages = Math.max(1, Math.ceil((count || 0) / PAGE));
  const promises = Array.from({ length: numPages }, (_, i) =>
    applyFilters(supabase.from(table).select(fields)).range(i * PAGE, (i + 1) * PAGE - 1)
  );
  const results = await Promise.all(promises);
  const rows = [];
  for (const r of results) {
    if (r.error) throw r.error;
    if (r.data) rows.push(...r.data);
  }
  return rows;
}

// Mapa vehiculo_id → { contrato_id, cliente, tipo_combustible, tipo_activo, placa }
let _vehCache = null;
async function getVehMap(supabase) {
  if (_vehCache) return _vehCache;
  const rows = await fetchAll(supabase, 'vehiculos', 'id, placa, cliente, contrato_id, tipo_activo, tipo_combustible', q => q);
  const map = new Map();
  rows.forEach(v => map.set(String(v.id), v));
  _vehCache = map;
  return map;
}

const hh = secs => +(secs / 3600).toFixed(1);

// ─────────────────────────────────────────────────────────────────────────────
// HERRAMIENTAS (consultas vetadas de solo lectura)
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS = {
  listar_periodos: {
    decl: {
      name: 'listar_periodos',
      description: 'Lista los períodos (quincenas) disponibles en la base de datos de ralentí. Úsalo cuando el usuario pida datos de un período y no estés seguro de las fechas exactas válidas.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    run: async (supabase) => {
      const rows = await fetchAll(supabase, 'ralentis_periodos', 'periodo_inicio, periodo_fin', q => q);
      const set = new Map();
      rows.forEach(r => set.set(`${r.periodo_inicio}_${r.periodo_fin}`, { inicio: r.periodo_inicio, fin: r.periodo_fin }));
      const periodos = [...set.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
      return { periodos: periodos.slice(-12) };
    },
  },

  buscar_vehiculo: {
    decl: {
      name: 'buscar_vehiculo',
      description: 'Devuelve la ficha de un vehículo por su placa (datos del vehículo, contrato, cliente, vencimientos) y el resumen de ralentí de su último período registrado.',
      parameters: {
        type: 'OBJECT',
        properties: { placa: { type: 'STRING', description: 'Placa o matrícula del vehículo, p. ej. ABC123' } },
        required: ['placa'],
      },
    },
    run: async (supabase, args) => {
      const placa = String(args.placa || '').trim();
      const { data: vehs, error } = await supabase
        .from('vehiculos')
        .select('id, placa, estado, cliente, contrato_id, numero_contrato, marca, linea, tipo_activo, tipo_combustible, modelo, lugar, zona, coordinador, km_actual, fecha_venc_soat, fecha_venc_rtm')
        .ilike('placa', `%${placa}%`)
        .limit(3);
      if (error) throw error;
      if (!vehs || vehs.length === 0) return { encontrado: false, mensaje: `No se encontró ningún vehículo con placa parecida a "${placa}".` };
      const veh = vehs[0];
      const { data: per } = await supabase
        .from('ralentis_periodos')
        .select('periodo_inicio, periodo_fin, horas_motor_encendido, horas_motor_ralenti, consumo_combustible, ralentis_excesivos')
        .eq('vehiculo_id', veh.id)
        .order('periodo_inicio', { ascending: false })
        .limit(1);
      const p = per && per[0];
      const pct = p && p.horas_motor_encendido > 0 ? +((p.horas_motor_ralenti / p.horas_motor_encendido) * 100).toFixed(1) : null;
      return {
        encontrado: true,
        vehiculo: veh,
        coincidencias: vehs.length > 1 ? vehs.map(v => v.placa) : undefined,
        ultimoPeriodoRalenti: p ? {
          periodo: `${p.periodo_inicio} a ${p.periodo_fin}`,
          horasMotorEncendido: p.horas_motor_encendido,
          horasRalenti: p.horas_motor_ralenti,
          pctRalenti: pct,
          galones: p.consumo_combustible,
        } : null,
      };
    },
  },

  info_conductor: {
    decl: {
      name: 'info_conductor',
      description: 'Devuelve la ficha de un conductor por nombre o cédula (cargo, base, estado, vencimientos de licencia, comparendos) y su acumulado de eventos de ralentí.',
      parameters: {
        type: 'OBJECT',
        properties: {
          nombre: { type: 'STRING', description: 'Nombre o parte del nombre del conductor' },
          cedula: { type: 'STRING', description: 'Número de cédula del conductor (opcional)' },
        },
      },
    },
    run: async (supabase, args) => {
      let q = supabase.from('conductores').select('id, nombres, cedula, cargo, base, estado, proyecto, tipo_licencia, fecha_venc_particular, fecha_venc_publica, tipo_comparendo, valor_comparendo');
      if (args.cedula) q = q.eq('cedula', String(args.cedula).trim());
      else if (args.nombre) q = q.ilike('nombres', `%${String(args.nombre).trim()}%`);
      else return { encontrado: false, mensaje: 'Indica un nombre o una cédula.' };
      const { data: conds, error } = await q.limit(3);
      if (error) throw error;
      const cond = conds && conds[0];
      // Acumulado de ralentí por nombre del conductor
      const nombreBusca = (cond ? cond.nombres : args.nombre || '').trim();
      let ralenti = null;
      if (nombreBusca) {
        const ev = await fetchAll(supabase, 'ralentis_eventos', 'duracion_segundos, conductor_nombre', q2 => q2.ilike('conductor_nombre', `%${nombreBusca}%`));
        if (ev.length) {
          const totalSeg = ev.reduce((a, e) => a + (Number(e.duracion_segundos) || 0), 0);
          const maxSeg = ev.reduce((a, e) => Math.max(a, Number(e.duracion_segundos) || 0), 0);
          ralenti = { totalEventos: ev.length, horasRalentiAcumuladas: hh(totalSeg), eventoMaximoMin: +(maxSeg / 60).toFixed(1) };
        }
      }
      if (!cond) return { encontrado: false, mensaje: `No se encontró el conductor "${args.nombre || args.cedula}".`, ralenti };
      return { encontrado: true, conductor: cond, coincidencias: conds.length > 1 ? conds.map(c => c.nombres) : undefined, ralenti };
    },
  },

  resumen_contrato: {
    decl: {
      name: 'resumen_contrato',
      description: 'Devuelve el resumen de un contrato por su nombre: cliente, número de vehículos y agregado de ralentí del último período disponible para esa flota.',
      parameters: {
        type: 'OBJECT',
        properties: { nombre: { type: 'STRING', description: 'Nombre o parte del nombre del contrato' } },
        required: ['nombre'],
      },
    },
    run: async (supabase, args) => {
      const { data: contratos, error } = await supabase
        .from('contratos').select('id, nombre, cliente, proyecto, fecha_inicio, fecha_fin, tipo')
        .ilike('nombre', `%${String(args.nombre).trim()}%`).limit(3);
      if (error) throw error;
      const contrato = contratos && contratos[0];
      if (!contrato) return { encontrado: false, mensaje: `No se encontró el contrato "${args.nombre}".` };
      const vehMap = await getVehMap(supabase);
      const vehIds = new Set([...vehMap.values()].filter(v => String(v.contrato_id) === String(contrato.id)).map(v => String(v.id)));
      // Último período: tomar el más reciente y agregar solo los vehículos del contrato
      const todos = await fetchAll(supabase, 'ralentis_periodos', 'vehiculo_id, periodo_inicio, periodo_fin, horas_motor_encendido, horas_motor_ralenti, consumo_combustible', q => q);
      const ultimo = todos.reduce((acc, r) => (!acc || r.periodo_inicio > acc ? r.periodo_inicio : acc), null);
      const delContrato = todos.filter(r => r.periodo_inicio === ultimo && vehIds.has(String(r.vehiculo_id)));
      const enc = delContrato.reduce((a, r) => a + (Number(r.horas_motor_encendido) || 0), 0);
      const ral = delContrato.reduce((a, r) => a + (Number(r.horas_motor_ralenti) || 0), 0);
      const gal = delContrato.reduce((a, r) => a + (Number(r.consumo_combustible) || 0), 0);
      return {
        encontrado: true,
        contrato,
        totalVehiculos: vehIds.size,
        ultimoPeriodo: ultimo ? {
          periodo: ultimo,
          vehiculosConDatos: delContrato.length,
          horasMotorEncendido: +enc.toFixed(1),
          horasRalenti: +ral.toFixed(1),
          pctRalenti: enc > 0 ? +((ral / enc) * 100).toFixed(1) : null,
          galones: +gal.toFixed(1),
        } : null,
      };
    },
  },

  ralenti_por_periodo: {
    decl: {
      name: 'ralenti_por_periodo',
      description: 'Agregado de ralentí de un período (quincena), opcionalmente filtrado por cliente, contrato o tipo de vehículo. Devuelve horas de motor, % ralentí, galones, CO₂ y nº de eventos.',
      parameters: {
        type: 'OBJECT',
        properties: {
          periodo_inicio: { type: 'STRING', description: 'Fecha inicio del período en formato YYYY-MM-DD' },
          periodo_fin: { type: 'STRING', description: 'Fecha fin del período en formato YYYY-MM-DD' },
          cliente: { type: 'STRING', description: 'Filtrar por nombre de cliente (opcional)' },
          contrato: { type: 'STRING', description: 'Filtrar por nombre de contrato (opcional)' },
        },
        required: ['periodo_inicio', 'periodo_fin'],
      },
    },
    run: async (supabase, args) => {
      const vehMap = await getVehMap(supabase);
      let contratoId = null;
      if (args.contrato) {
        const { data: c } = await supabase.from('contratos').select('id').ilike('nombre', `%${args.contrato}%`).limit(1);
        contratoId = c && c[0] ? String(c[0].id) : null;
      }
      const cliente = args.cliente ? String(args.cliente).toLowerCase().trim() : null;
      const matchVeh = vid => {
        const v = vehMap.get(String(vid));
        if (!v) return !cliente && !contratoId;
        if (cliente && (v.cliente || '').toLowerCase().trim() !== cliente) return false;
        if (contratoId && String(v.contrato_id) !== contratoId) return false;
        return true;
      };
      const rows = (await fetchAll(supabase, 'ralentis_periodos', 'vehiculo_id, horas_motor_encendido, horas_motor_ralenti, consumo_combustible',
        q => q.eq('periodo_inicio', args.periodo_inicio).eq('periodo_fin', args.periodo_fin))).filter(r => matchVeh(r.vehiculo_id));
      if (rows.length === 0) return { mensaje: 'No hay datos para ese período/filtro. Usa listar_periodos para ver los períodos válidos.' };
      const enc = rows.reduce((a, r) => a + (Number(r.horas_motor_encendido) || 0), 0);
      const ral = rows.reduce((a, r) => a + (Number(r.horas_motor_ralenti) || 0), 0);
      let gal = 0, co2 = 0;
      rows.forEach(r => {
        const v = vehMap.get(String(r.vehiculo_id));
        const g = Number(r.consumo_combustible) || 0;
        gal += g; co2 += g * getCO2(v && v.tipo_combustible);
      });
      const ev = (await fetchAll(supabase, 'ralentis_eventos', 'vehiculo_id, duracion_segundos, conductor_nombre',
        q => q.eq('periodo_inicio', args.periodo_inicio).eq('periodo_fin', args.periodo_fin)))
        .filter(e => matchVeh(e.vehiculo_id) && !esTaller(e.conductor_nombre) && (Number(e.duracion_segundos) || 0) >= 300);
      return {
        periodo: `${args.periodo_inicio} a ${args.periodo_fin}`,
        filtro: { cliente: args.cliente || 'Todos', contrato: args.contrato || 'Todos' },
        vehiculosConDatos: rows.length,
        horasMotorEncendido: +enc.toFixed(1),
        horasRalenti: +ral.toFixed(1),
        horasConduccion: +Math.max(enc - ral, 0).toFixed(1),
        pctRalenti: enc > 0 ? +((ral / enc) * 100).toFixed(1) : null,
        galones: +gal.toFixed(1),
        co2Toneladas: +(co2 / 1000).toFixed(2),
        eventosMas5Min: ev.length,
      };
    },
  },

  top_conductores_ralenti: {
    decl: {
      name: 'top_conductores_ralenti',
      description: 'Ranking de conductores con más tiempo de ralentí en un período. Devuelve nombre, horas acumuladas y nº de eventos.',
      parameters: {
        type: 'OBJECT',
        properties: {
          periodo_inicio: { type: 'STRING', description: 'YYYY-MM-DD' },
          periodo_fin: { type: 'STRING', description: 'YYYY-MM-DD' },
          limite: { type: 'NUMBER', description: 'Cuántos conductores devolver (por defecto 10)' },
        },
        required: ['periodo_inicio', 'periodo_fin'],
      },
    },
    run: async (supabase, args) => {
      const limite = Math.min(Math.max(Number(args.limite) || 10, 1), 25);
      const ev = await fetchAll(supabase, 'ralentis_eventos', 'conductor_nombre, duracion_segundos',
        q => q.eq('periodo_inicio', args.periodo_inicio).eq('periodo_fin', args.periodo_fin));
      if (ev.length === 0) return { mensaje: 'No hay eventos para ese período. Usa listar_periodos.' };
      const agg = new Map();
      ev.forEach(e => {
        if (esTaller(e.conductor_nombre) || esConductorPlaceholder(e.conductor_nombre)) return;
        const k = e.conductor_nombre.trim();
        const o = agg.get(k) || { conductor: k, seg: 0, eventos: 0 };
        o.seg += Number(e.duracion_segundos) || 0; o.eventos += 1;
        agg.set(k, o);
      });
      const top = [...agg.values()].sort((a, b) => b.seg - a.seg).slice(0, limite)
        .map((o, i) => ({ puesto: i + 1, conductor: o.conductor, horasRalenti: hh(o.seg), eventos: o.eventos }));
      return { periodo: `${args.periodo_inicio} a ${args.periodo_fin}`, top };
    },
  },

  consumo_co2_por_contrato: {
    decl: {
      name: 'consumo_co2_por_contrato',
      description: 'Compara el consumo de combustible en ralentí (galones) y las emisiones de CO₂ por contrato en un período.',
      parameters: {
        type: 'OBJECT',
        properties: {
          periodo_inicio: { type: 'STRING', description: 'YYYY-MM-DD' },
          periodo_fin: { type: 'STRING', description: 'YYYY-MM-DD' },
        },
        required: ['periodo_inicio', 'periodo_fin'],
      },
    },
    run: async (supabase, args) => {
      const vehMap = await getVehMap(supabase);
      const { data: contratos } = await supabase.from('contratos').select('id, nombre');
      const contratoNombre = new Map((contratos || []).map(c => [String(c.id), c.nombre]));
      const rows = await fetchAll(supabase, 'ralentis_periodos', 'vehiculo_id, consumo_combustible',
        q => q.eq('periodo_inicio', args.periodo_inicio).eq('periodo_fin', args.periodo_fin));
      if (rows.length === 0) return { mensaje: 'No hay datos para ese período. Usa listar_periodos.' };
      const agg = new Map();
      rows.forEach(r => {
        const v = vehMap.get(String(r.vehiculo_id));
        const cid = v ? String(v.contrato_id) : 'sin_contrato';
        const nombre = contratoNombre.get(cid) || 'Sin contrato';
        const g = Number(r.consumo_combustible) || 0;
        const o = agg.get(nombre) || { contrato: nombre, galones: 0, co2Kg: 0 };
        o.galones += g; o.co2Kg += g * getCO2(v && v.tipo_combustible);
        agg.set(nombre, o);
      });
      const lista = [...agg.values()]
        .map(o => ({ contrato: o.contrato, galones: +o.galones.toFixed(1), co2Toneladas: +(o.co2Kg / 1000).toFixed(2) }))
        .sort((a, b) => b.galones - a.galones);
      return { periodo: `${args.periodo_inicio} a ${args.periodo_fin}`, porContrato: lista };
    },
  },
};

const SYSTEM_PROMPT = `Eres "Asistente Torre de Control", un asistente de IA integrado al sistema de gestión de flota de Magnex.
Respondes en español, de forma clara, breve y gerencial.

REGLAS ESTRICTAS:
- Para cualquier dato de la base (vehículos, conductores, contratos, ralentí, consumo, CO₂) DEBES usar las herramientas disponibles. NUNCA inventes cifras, placas, nombres ni fechas.
- Si una herramienta no devuelve datos, dilo con honestidad y sugiere cómo reformular (por ejemplo, usar listar_periodos para conocer los períodos válidos).
- Los períodos son quincenas (Q1 = día 1 al 15, Q2 = día 16 al fin de mes). Si el usuario menciona un mes o quincena sin fechas exactas, primero usa listar_periodos.
- No respondas sobre temas ajenos a la flota o la operación. Si te preguntan algo fuera de alcance, indícalo amablemente.
- Cuando muestres cifras clave, redáctalas de forma natural; el sistema ya muestra al usuario las tablas de datos crudos por separado, así que no las repitas exhaustivamente: resume e interpreta.`;

// ── Llamada a Gemini con bucle de function-calling ──
async function runChat({ messages, geminiApiKey, supabaseUrl, supabaseKey, model }) {
  if (!geminiApiKey) return { error: 'GEMINI_API_KEY no está configurada en el servidor.' };
  if (!supabaseUrl || !supabaseKey) return { error: 'Credenciales de Supabase no configuradas en el servidor.' };

  const supabase = makeClient(supabaseUrl, supabaseKey);
  _vehCache = null; // refrescar caché por invocación

  const MODEL = model || 'gemini-2.5-flash';
  const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${geminiApiKey}`;

  const contents = (messages || [])
    .filter(m => m && m.content)
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] }));

  const functionDeclarations = Object.values(TOOLS).map(t => t.decl);
  const toolResults = [];

  for (let iter = 0; iter < 6; iter++) {
    const body = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      tools: [{ functionDeclarations }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    };
    const resp = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!resp.ok) {
      const txt = await resp.text();
      return { error: `Error de Gemini (HTTP ${resp.status}): ${txt.slice(0, 300)}` };
    }
    const json = await resp.json();
    const cand = json.candidates && json.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const calls = parts.filter(p => p.functionCall).map(p => p.functionCall);

    if (calls.length === 0) {
      const text = parts.filter(p => p.text).map(p => p.text).join('\n').trim();
      return { answer: text || 'No obtuve respuesta del modelo.', toolResults };
    }

    // Ejecutar las herramientas solicitadas
    contents.push({ role: 'model', parts: calls.map(c => ({ functionCall: c })) });
    const responseParts = [];
    for (const call of calls) {
      const tool = TOOLS[call.name];
      let result;
      try {
        result = tool ? await tool.run(supabase, call.args || {}) : { error: `Herramienta desconocida: ${call.name}` };
      } catch (e) {
        result = { error: `Fallo al ejecutar ${call.name}: ${e.message || String(e)}` };
      }
      toolResults.push({ tool: call.name, args: call.args || {}, result });
      responseParts.push({ functionResponse: { name: call.name, response: { result } } });
    }
    contents.push({ role: 'user', parts: responseParts });
  }
  return { answer: 'No pude completar la consulta tras varios intentos. Reformula la pregunta, por favor.', toolResults };
}

module.exports = { runChat, TOOLS, makeClient };
