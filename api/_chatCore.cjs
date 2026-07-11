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
  const rows = await fetchAll(supabase, 'vehiculos', 'id, placa, cliente, contrato_id, estado, tipo_activo, tipo_combustible', q => q);
  const map = new Map();
  rows.forEach(v => map.set(String(v.id), v));
  _vehCache = map;
  return map;
}

const hh = secs => +(secs / 3600).toFixed(1);

// Zona horaria operativa: Colombia (UTC-5, sin horario de verano). El runtime del
// servidor corre en UTC, así que "hoy" debe calcularse desplazando -5h.
const OPERACION_OFFSET_MIN = -5 * 60;
function fechaHoyColombia() {
  const now = new Date();
  const shifted = new Date(now.getTime() + OPERACION_OFFSET_MIN * 60000);
  return shifted.toISOString().slice(0, 10); // YYYY-MM-DD en hora Colombia
}
const norm = s => String(s || '').toUpperCase().replace(/\s+/g, '').trim();
const esActivo = estado => norm(estado) === 'ACTIVO';

// Mapa placa(normalizada) → vehículo, derivado del cache de vehiculos.
async function getPlacaMap(supabase) {
  const vehMap = await getVehMap(supabase);
  const map = new Map();
  for (const v of vehMap.values()) map.set(norm(v.placa), v);
  return map;
}

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
      const vehsContrato = [...vehMap.values()].filter(v => String(v.contrato_id) === String(contrato.id));
      const vehIds = new Set(vehsContrato.map(v => String(v.id)));
      // Conductores asignados al contrato (activos/total)
      const conds = await fetchAll(supabase, 'conductores', 'estado, contrato_id', q => q.eq('contrato_id', contrato.id));
      const conductoresActivos = conds.filter(c => esActivo(c.estado)).length;
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
        vehiculosActivos: vehsContrato.filter(v => esActivo(v.estado)).length,
        totalConductores: conds.length,
        conductoresActivos,
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

  excesos_velocidad: {
    decl: {
      name: 'excesos_velocidad',
      description: 'Excesos de velocidad registrados en una fecha o rango de fechas (informes diarios GPS). Si no se indican fechas, usa el día de HOY. Permite filtrar por placa, contrato o cliente. Devuelve el total de eventos y el desglose por vehículo y por conductor, con velocidad máxima y cuántos son graves (>=80 km/h). Úsalo para "¿el vehículo X tuvo excesos hoy?", "relación de vehículos/conductores con excesos de hoy", etc.',
      parameters: {
        type: 'OBJECT',
        properties: {
          fecha: { type: 'STRING', description: 'Un único día YYYY-MM-DD. Por defecto hoy.' },
          fecha_inicio: { type: 'STRING', description: 'Inicio del rango YYYY-MM-DD (opcional)' },
          fecha_fin: { type: 'STRING', description: 'Fin del rango YYYY-MM-DD (opcional)' },
          placa: { type: 'STRING', description: 'Filtrar por placa (opcional)' },
          contrato: { type: 'STRING', description: 'Filtrar por nombre de contrato (opcional)' },
          cliente: { type: 'STRING', description: 'Filtrar por cliente (opcional)' },
          solo_graves: { type: 'BOOLEAN', description: 'Si es true, solo excesos graves >=80 km/h (opcional)' },
        },
      },
    },
    run: async (supabase, args) => {
      const hoy = fechaHoyColombia();
      const desde = String(args.fecha_inicio || args.fecha || hoy).trim();
      const hasta = String(args.fecha_fin || args.fecha || hoy).trim();
      const rows = await fetchAll(
        supabase,
        'alertas_diarias_gps',
        'placa, conductor, velocidad, infraccion_80_kmh, excesos_50_80_kmh, contrato_nombre, cliente, fecha_dia',
        q => {
          let x = q.gte('fecha_dia', desde).lte('fecha_dia', hasta);
          if (args.placa) x = x.ilike('placa', `%${String(args.placa).trim()}%`);
          if (args.contrato) x = x.ilike('contrato_nombre', `%${String(args.contrato).trim()}%`);
          if (args.cliente) x = x.ilike('cliente', `%${String(args.cliente).trim()}%`);
          return x;
        }
      );
      // "Exceso de velocidad" = marca explícita de exceso de velocidad (infracción >=80 o
      // exceso 50-80) o velocidad registrada >=50. NO se cuentan frenadas bruscas ni
      // "excesos varios parámetros" (que no son de velocidad; aparecen con velocidad baja).
      const esExceso = r => (Number(r.infraccion_80_kmh) || 0) > 0 || (Number(r.excesos_50_80_kmh) || 0) > 0 ||
        (Number(r.velocidad) || 0) >= 50;
      const esGrave = r => (Number(r.infraccion_80_kmh) || 0) > 0 || (Number(r.velocidad) || 0) >= 80;
      let eventos = rows.filter(esExceso);
      if (args.solo_graves) eventos = eventos.filter(esGrave);
      if (eventos.length === 0) {
        return { rango: desde === hasta ? desde : `${desde} a ${hasta}`, filtro: { placa: args.placa || 'Todas', contrato: args.contrato || 'Todos', cliente: args.cliente || 'Todos' }, totalEventos: 0, mensaje: 'No se registraron excesos de velocidad para ese día/filtro.' };
      }
      const porVeh = new Map();
      const porCond = new Map();
      eventos.forEach(r => {
        const vel = Number(r.velocidad) || 0;
        const grave = esGrave(r);
        const placa = norm(r.placa) || 'SIN_PLACA';
        const pv = porVeh.get(placa) || { placa, eventos: 0, graves: 0, velMax: 0, contrato: r.contrato_nombre || '' };
        pv.eventos++; if (grave) pv.graves++; pv.velMax = Math.max(pv.velMax, vel);
        porVeh.set(placa, pv);
        // El ranking por conductor omite placeholders (No registra / sin asignar) para
        // que sea accionable; los totales por vehículo y globales sí los incluyen.
        if (!esConductorPlaceholder(r.conductor)) {
          const cond = String(r.conductor).trim();
          const pc = porCond.get(cond) || { conductor: cond, eventos: 0, graves: 0, velMax: 0 };
          pc.eventos++; if (grave) pc.graves++; pc.velMax = Math.max(pc.velMax, vel);
          porCond.set(cond, pc);
        }
      });
      const fmt = o => ({ ...o, velMax: +o.velMax.toFixed(1) });
      const vehiculos = [...porVeh.values()].sort((a, b) => b.eventos - a.eventos).map(fmt);
      const conductores = [...porCond.values()].sort((a, b) => b.eventos - a.eventos).map(fmt);
      return {
        rango: desde === hasta ? desde : `${desde} a ${hasta}`,
        filtro: { placa: args.placa || 'Todas', contrato: args.contrato || 'Todos', cliente: args.cliente || 'Todos', soloGraves: !!args.solo_graves },
        totalEventos: eventos.length,
        totalGraves: eventos.filter(esGrave).length,
        totalVehiculos: vehiculos.length,
        totalConductores: conductores.length,
        por_vehiculo: vehiculos.slice(0, 40),
        por_conductor: conductores.slice(0, 40),
      };
    },
  },

  km_recorridos: {
    decl: {
      name: 'km_recorridos',
      description: 'Kilómetros recorridos en una fecha o rango de fechas (métricas diarias de Geotab). Si no se indican fechas, usa el día de HOY. Permite filtrar por placa, contrato o cliente. Devuelve km totales, horas de conducción/ralentí, viajes y desglose por vehículo. Nota: cubre los vehículos rastreados por Geotab.',
      parameters: {
        type: 'OBJECT',
        properties: {
          fecha: { type: 'STRING', description: 'Un único día YYYY-MM-DD. Por defecto hoy.' },
          fecha_inicio: { type: 'STRING', description: 'Inicio del rango YYYY-MM-DD (opcional)' },
          fecha_fin: { type: 'STRING', description: 'Fin del rango YYYY-MM-DD (opcional)' },
          placa: { type: 'STRING', description: 'Filtrar por placa (opcional)' },
          contrato: { type: 'STRING', description: 'Filtrar por nombre de contrato (opcional)' },
          cliente: { type: 'STRING', description: 'Filtrar por cliente (opcional)' },
        },
      },
    },
    run: async (supabase, args) => {
      const hoy = fechaHoyColombia();
      const desde = String(args.fecha_inicio || args.fecha || hoy).trim();
      const hasta = String(args.fecha_fin || args.fecha || hoy).trim();
      const placaMap = await getPlacaMap(supabase);
      let contratoId = null;
      if (args.contrato) {
        const { data: c } = await supabase.from('contratos').select('id').ilike('nombre', `%${String(args.contrato).trim()}%`).limit(1);
        contratoId = c && c[0] ? String(c[0].id) : '__none__';
      }
      const cliente = args.cliente ? String(args.cliente).toLowerCase().trim() : null;
      const rows = await fetchAll(
        supabase,
        'geotab_daily_metrics',
        'placa, km, horas_conduccion, horas_ralenti, viajes, fecha',
        q => {
          let x = q.gte('fecha', desde).lte('fecha', hasta);
          if (args.placa) x = x.ilike('placa', `%${String(args.placa).trim()}%`);
          return x;
        }
      );
      const matchVeh = placa => {
        if (!contratoId && !cliente) return true;
        const v = placaMap.get(norm(placa));
        if (!v) return false;
        if (contratoId && String(v.contrato_id) !== contratoId) return false;
        if (cliente && (v.cliente || '').toLowerCase().trim() !== cliente) return false;
        return true;
      };
      const filtered = rows.filter(r => matchVeh(r.placa));
      if (filtered.length === 0) {
        return { rango: desde === hasta ? desde : `${desde} a ${hasta}`, filtro: { placa: args.placa || 'Todas', contrato: args.contrato || 'Todos', cliente: args.cliente || 'Todos' }, totalKm: 0, mensaje: 'No hay datos de kilómetros (Geotab) para ese día/filtro.' };
      }
      const agg = new Map();
      let totalKm = 0, totalCond = 0, totalRal = 0, totalViajes = 0;
      filtered.forEach(r => {
        const km = Number(r.km) || 0, cond = Number(r.horas_conduccion) || 0, ral = Number(r.horas_ralenti) || 0, vj = Number(r.viajes) || 0;
        totalKm += km; totalCond += cond; totalRal += ral; totalViajes += vj;
        const placa = norm(r.placa) || 'SIN_PLACA';
        const o = agg.get(placa) || { placa, km: 0, viajes: 0 };
        o.km += km; o.viajes += vj; agg.set(placa, o);
      });
      const porVehiculo = [...agg.values()].map(o => ({ placa: o.placa, km: +o.km.toFixed(1), viajes: o.viajes })).sort((a, b) => b.km - a.km);
      return {
        rango: desde === hasta ? desde : `${desde} a ${hasta}`,
        filtro: { placa: args.placa || 'Todas', contrato: args.contrato || 'Todos', cliente: args.cliente || 'Todos' },
        totalKm: +totalKm.toFixed(1),
        vehiculosConDatos: agg.size,
        horasConduccion: +totalCond.toFixed(1),
        horasRalenti: +totalRal.toFixed(1),
        viajes: totalViajes,
        por_vehiculo: porVehiculo.slice(0, 40),
      };
    },
  },

  listar_contratos: {
    decl: {
      name: 'listar_contratos',
      description: 'Lista los contratos con su número de vehículos y conductores asignados (activos y totales). Úsalo para "¿cuántos vehículos y conductores tiene el contrato X?" o para ver todos los contratos. Se puede filtrar por nombre.',
      parameters: {
        type: 'OBJECT',
        properties: { nombre: { type: 'STRING', description: 'Filtrar por nombre de contrato (opcional)' } },
      },
    },
    run: async (supabase, args) => {
      const { data: contratos, error } = await supabase.from('contratos').select('id, nombre, cliente, proyecto');
      if (error) throw error;
      const vehs = await fetchAll(supabase, 'vehiculos', 'contrato_id, estado', q => q);
      const conds = await fetchAll(supabase, 'conductores', 'contrato_id, estado', q => q);
      const acc = new Map();
      const bump = (id, campo, activo) => {
        const o = acc.get(String(id)) || { veh: 0, vehAct: 0, cond: 0, condAct: 0 };
        o[campo]++; if (activo) o[campo === 'veh' ? 'vehAct' : 'condAct']++;
        acc.set(String(id), o);
      };
      vehs.forEach(v => { if (v.contrato_id != null) bump(v.contrato_id, 'veh', esActivo(v.estado)); });
      conds.forEach(c => { if (c.contrato_id != null) bump(c.contrato_id, 'cond', esActivo(c.estado)); });
      let lista = (contratos || []).map(c => {
        const o = acc.get(String(c.id)) || { veh: 0, vehAct: 0, cond: 0, condAct: 0 };
        return { contrato: c.nombre, cliente: c.cliente || '', vehiculos: o.veh, vehiculosActivos: o.vehAct, conductores: o.cond, conductoresActivos: o.condAct };
      });
      if (args.nombre) {
        const n = String(args.nombre).toLowerCase().trim();
        lista = lista.filter(c => (c.contrato || '').toLowerCase().includes(n));
        if (lista.length === 0) return { encontrado: false, mensaje: `No se encontró el contrato "${args.nombre}".` };
      }
      lista.sort((a, b) => b.vehiculos - a.vehiculos);
      return { totalContratos: lista.length, contratos: lista };
    },
  },

  estadisticas_flota: {
    decl: {
      name: 'estadisticas_flota',
      description: 'Estadísticas globales de la flota: total de vehículos (activos/inactivos), total de conductores (activos), número de contratos y distribución por cliente. Úsalo para preguntas generales de tamaño de flota.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    run: async (supabase) => {
      const vehs = await fetchAll(supabase, 'vehiculos', 'estado, cliente, tipo_activo', q => q);
      const conds = await fetchAll(supabase, 'conductores', 'estado', q => q);
      const { data: contratos } = await supabase.from('contratos').select('id');
      const vehAct = vehs.filter(v => esActivo(v.estado)).length;
      const condAct = conds.filter(c => esActivo(c.estado)).length;
      const porCliente = new Map();
      vehs.forEach(v => {
        const k = (v.cliente || 'Sin cliente').trim() || 'Sin cliente';
        porCliente.set(k, (porCliente.get(k) || 0) + 1);
      });
      const clientes = [...porCliente.entries()].map(([cliente, vehiculos]) => ({ cliente, vehiculos })).sort((a, b) => b.vehiculos - a.vehiculos).slice(0, 20);
      return {
        vehiculos: { total: vehs.length, activos: vehAct, inactivos: vehs.length - vehAct },
        conductores: { total: conds.length, activos: condAct },
        contratos: (contratos || []).length,
        vehiculosPorCliente: clientes,
      };
    },
  },

  vehiculos_por_plataforma_gps: {
    decl: {
      name: 'vehiculos_por_plataforma_gps',
      description: 'Cuenta los vehiculos monitoreados por plataforma GPS segun el maestro de vehiculos (COLTRACK, FAGOR, GEOTAB y otras), los no monitoreados y el porcentaje de cobertura. Permite consultar una plataforma concreta. Por defecto cuenta solo vehiculos activos.',
      parameters: {
        type: 'OBJECT',
        properties: {
          plataforma: { type: 'STRING', description: 'Plataforma opcional, por ejemplo COLTRACK, FAGOR o GEOTAB' },
          incluir_inactivos: { type: 'BOOLEAN', description: 'True para incluir vehiculos inactivos; por defecto false' },
        },
      },
    },
    run: async (supabase, args) => {
      const incluirInactivos = args.incluir_inactivos === true;
      const rows = await fetchAll(supabase, 'vehiculos', 'placa, estado, gps_compañia', q =>
        incluirInactivos ? q : q.eq('estado', 'ACTIVO'));
      const canonical = raw => {
        const value = String(raw || '').trim().toUpperCase();
        if (!value || ['N/A', 'NA', 'NINGUNO', 'NO', 'SIN GPS', 'NO MONITOREADO'].includes(value)) return null;
        if (value.includes('COLTRACK')) return 'COLTRACK';
        if (value.includes('GEOTAB')) return 'GEOTAB';
        if (value.includes('FAGOR')) return 'FAGOR';
        return value;
      };
      const counts = new Map([['COLTRACK', 0], ['FAGOR', 0], ['GEOTAB', 0]]);
      let noMonitoreados = 0;
      for (const row of rows) {
        const platform = canonical(row.gps_compañia);
        if (!platform) noMonitoreados += 1;
        else counts.set(platform, (counts.get(platform) || 0) + 1);
      }
      const porPlataforma = [...counts.entries()]
        .map(([plataforma, vehiculos]) => ({ plataforma, vehiculos }))
        .sort((a, b) => b.vehiculos - a.vehiculos);
      const monitored = porPlataforma.reduce((sum, item) => sum + item.vehiculos, 0);
      const filtro = canonical(args.plataforma);
      const coincidencia = filtro
        ? porPlataforma.find(item => item.plataforma === filtro) || { plataforma: filtro, vehiculos: 0 }
        : null;
      return {
        alcance: incluirInactivos ? 'Todos los vehiculos' : 'Vehiculos activos',
        totalVehiculos: rows.length,
        monitoreados: monitored,
        noMonitoreados,
        coberturaPct: rows.length ? +((monitored / rows.length) * 100).toFixed(1) : 0,
        porPlataforma,
        plataformaConsultada: coincidencia,
        criterio: 'Asignacion registrada en vehiculos.gps_compañia',
      };
    },
  },

  auditoria_excesos: {
    decl: {
      name: 'auditoria_excesos',
      description: 'Excesos de velocidad guardados en la Auditoría de Flota (reportes GPS cargados de FAGOR, COLTRACK y GEOTAB; faltas graves >=80 km/h). Busca por placa y/o rango de fechas. Devuelve nº de eventos, cuántos son graves, velocidad máxima, plataformas y un detalle de los eventos. Úsalo para "¿la placa X presenta/tiene excesos de velocidad?" o para revisar las alertas guardadas de auditoría. Si no se indican fechas, busca en todo el histórico guardado.',
      parameters: {
        type: 'OBJECT',
        properties: {
          placa: { type: 'STRING', description: 'Placa a consultar (recomendado)' },
          fecha_inicio: { type: 'STRING', description: 'Inicio del rango YYYY-MM-DD (opcional)' },
          fecha_fin: { type: 'STRING', description: 'Fin del rango YYYY-MM-DD (opcional)' },
          solo_graves: { type: 'BOOLEAN', description: 'Si es true, solo faltas graves >=80 km/h (opcional)' },
        },
      },
    },
    run: async (supabase, args) => {
      // Mapa de cargas → plataforma (source), como en el módulo de Auditoría.
      const uploads = await fetchAll(supabase, 'file_uploads', 'id, source', q => q);
      const srcMap = new Map(uploads.map(u => [String(u.id), u.source]));
      const rows = await fetchAll(
        supabase,
        'batch_alerts',
        'plate, driver, alert_type, speed, timestamp, is_grave, location, upload_id',
        q => {
          let x = q;
          if (args.placa) x = x.ilike('plate', `%${String(args.placa).trim()}%`);
          if (args.fecha_inicio) x = x.gte('timestamp', `${String(args.fecha_inicio).trim()}T00:00:00.000-05:00`);
          if (args.fecha_fin) x = x.lte('timestamp', `${String(args.fecha_fin).trim()}T23:59:59.999-05:00`);
          if (args.solo_graves) x = x.eq('is_grave', true);
          return x;
        }
      );
      const rango = args.fecha_inicio || args.fecha_fin
        ? `${args.fecha_inicio || 'inicio'} a ${args.fecha_fin || 'hoy'}`
        : 'todo el histórico';
      if (rows.length === 0) {
        return { placa: args.placa || 'Todas', rango, totalEventos: 0, mensaje: `No hay excesos de velocidad guardados en la Auditoría de Flota para ${args.placa ? `la placa ${args.placa}` : 'ese filtro'}${args.fecha_inicio || args.fecha_fin ? ' en ese rango' : ''}.` };
      }
      const graves = rows.filter(r => r.is_grave === true).length;
      const velMax = rows.reduce((m, r) => Math.max(m, Number(r.speed) || 0), 0);
      const porFuente = {};
      const porPlaca = new Map();
      rows.forEach(r => {
        const src = srcMap.get(String(r.upload_id)) || 'N/A';
        porFuente[src] = (porFuente[src] || 0) + 1;
        const placa = norm(r.plate) || 'SIN_PLACA';
        const o = porPlaca.get(placa) || { placa, eventos: 0, graves: 0, velMax: 0 };
        o.eventos++; if (r.is_grave) o.graves++; o.velMax = Math.max(o.velMax, Number(r.speed) || 0);
        porPlaca.set(placa, o);
      });
      // Detalle: los 15 eventos más recientes (o más rápidos) para dar contexto.
      const detalle = rows
        .slice()
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
        .slice(0, 15)
        .map(r => ({
          fecha: String(r.timestamp).slice(0, 16).replace('T', ' '),
          placa: r.plate,
          conductor: r.driver || 'N/A',
          velocidad: Number(r.speed) || 0,
          grave: !!r.is_grave,
          plataforma: srcMap.get(String(r.upload_id)) || 'N/A',
          lugar: r.location || null,
        }));
      return {
        placa: args.placa || 'Todas',
        rango,
        totalEventos: rows.length,
        totalGraves: graves,
        velMax: +velMax.toFixed(1),
        porPlataforma: porFuente,
        por_placa: [...porPlaca.values()].sort((a, b) => b.eventos - a.eventos).slice(0, 40).map(o => ({ ...o, velMax: +o.velMax.toFixed(1) })),
        detalle,
      };
    },
  },
};

const buildSystemPrompt = () => `Eres "Asistente Torre de Control", un asistente de IA integrado al sistema de gestión de flota de Magnex.
Respondes en español, de forma clara, breve y gerencial. Hoy es ${fechaHoyColombia()} (hora Colombia, UTC-5).

CAPACIDADES (elige la herramienta adecuada):
- Ralentí por período/quincena, fichas de vehículo y conductor, consumo y CO₂ → listar_periodos, buscar_vehiculo, info_conductor, ralenti_por_periodo, top_conductores_ralenti, consumo_co2_por_contrato.
- Excesos de velocidad de un día o rango (por vehículo y por conductor, graves >=80) → excesos_velocidad. Si el usuario dice "hoy" u omite fecha, no pases fechas (la herramienta usa el día de hoy).
- Excesos de velocidad guardados en la Auditoría de Flota (reportes cargados FAGOR/COLTRACK/GEOTAB; "alertas autoguardadas"), por placa y/o rango → auditoria_excesos. Úsalo para "¿la placa X tiene/presenta excesos de velocidad?".
- Kilómetros recorridos en un día o rango (Geotab) → km_recorridos.
- Contratos con nº de vehículos y conductores asignados → listar_contratos (o resumen_contrato para uno solo con detalle de ralentí).
- Tamaño global de la flota (vehículos activos, conductores, contratos, por cliente) → estadisticas_flota.
- Vehículos monitoreados por plataforma GPS, cobertura y no monitoreados → vehiculos_por_plataforma_gps. Úsala para preguntas por COLTRACK, FAGOR, GEOTAB o comparaciones entre plataformas.

REGLAS ESTRICTAS:
- Para CUALQUIER dato de la base DEBES usar las herramientas. NUNCA inventes cifras, placas, nombres ni fechas.
- Puedes encadenar varias herramientas para responder una pregunta compuesta.
- Si una herramienta no devuelve datos, dilo con honestidad y sugiere cómo reformular (p. ej. usar listar_periodos para períodos de ralentí válidos, o verificar la placa/contrato).
- Los períodos de ralentí son quincenas (Q1 = día 1 al 15, Q2 = día 16 al fin de mes). Si el usuario menciona un mes o quincena sin fechas exactas, primero usa listar_periodos. Para excesos y km las fechas son días calendario normales (YYYY-MM-DD).
- No respondas sobre temas ajenos a la flota o la operación. Si te preguntan algo fuera de alcance, indícalo amablemente.
- Cuando muestres cifras clave, redáctalas de forma natural; el sistema ya muestra al usuario las tablas de datos crudos por separado, así que no las repitas exhaustivamente: resume e interpreta.
- Si el usuario pide generar, crear, descargar o preparar un informe, consulta todas las herramientas necesarias y presenta un resumen ejecutivo. La interfaz permite exportar cada resultado a Excel o PDF; indícale que use esos botones.`;

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
  const systemPrompt = buildSystemPrompt();
  const toolResults = [];

  for (let iter = 0; iter < 6; iter++) {
    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
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
