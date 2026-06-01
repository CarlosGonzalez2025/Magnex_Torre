/**
 * googleSheetsService.ts
 *
 * Sincroniza las tablas maestras (conductores, vehiculos, contratos) desde
 * Google Sheets (CSV público) hacia Supabase.
 *
 * Flujo:
 *   1. Fetch /api/google-sheets        → vehículos (placa como clave)
 *   2. Fetch /api/sheets-conductores   → conductores (cedula como clave)
 *   3. Upsert en Supabase (conductores, vehiculos, contratos)
 *   4. Soft-delete de registros que ya no están en el Sheet (estado → INACTIVO)
 *   5. Registra timestamp en tabla `configuracion`
 */

import { supabase } from './supabaseClient';

const PAGE_SIZE = 1000;

async function fetchAllRows<T = Record<string, unknown>>(query: any): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface VehiculoSheet {
  placa: string;
  contrato?: string;
  cliente?: string;
  marca?: string;
  linea?: string;
  tipo?: string;
  clase?: string;
  conductor?: string;
  estado?: string;
  [key: string]: unknown;
}

export interface ConductorSheet {
  nombres: string;
  cedula: string;
  cargo?: string;
  base?: string;
  estado?: string;
  proyecto?: string;
  tipo_licencia?: string;
  fecha_exp_particular?: string | null;
  fecha_venc_particular?: string | null;
  fecha_exp_publica?: string | null;
  fecha_venc_publica?: string | null;
  fecha_exp_moto?: string | null;
  fecha_venc_moto?: string | null;
  fecha_cap_manejo_def?: string | null;
  fecha_cap_peligrosas?: string | null;
  fecha_cap_alturas?: string | null;
  fecha_cap_otro?: string | null;
  resultado_prueba_ingreso?: string;
  resultado_prueba_periodica?: string;
  tipo_competencias?: string;
  vigencia_competencias?: string | null;
  fecha_revision_simit?: string | null;
  tipo_comparendo?: string;
  valor_comparendo?: number;
  ibutton?: string;
  [key: string]: unknown;
}

export interface SyncResult {
  conductoresSync: number;
  vehiculosSync: number;
  contratosSync: number;
  conductoresInactivados: number;
  vehiculosInactivados: number;
  errores: string[];
  timestamp: string;
}

export interface UltimaSync {
  conductores: string | null;
  vehiculos: string | null;
}

// ── URL base de las APIs ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? '';

// ── Fetch desde APIs proxy ────────────────────────────────────────────────────

async function fetchVehiculosSheet(): Promise<VehiculoSheet[]> {
  const res = await fetch(`${API_BASE}/api/google-sheets`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Error obteniendo vehículos de Sheets: HTTP ${res.status}`);
  const json = await res.json() as { success: boolean; data: VehiculoSheet[]; error?: string };
  if (!json.success) throw new Error(json.error ?? 'Error en respuesta de vehículos');
  return json.data ?? [];
}

async function fetchConductoresSheet(): Promise<ConductorSheet[]> {
  const res = await fetch(`${API_BASE}/api/sheets-conductores`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Error obteniendo conductores de Sheets: HTTP ${res.status}`);
  const json = await res.json() as { success: boolean; data: ConductorSheet[]; error?: string };
  if (!json.success) throw new Error(json.error ?? 'Error en respuesta de conductores');
  return json.data ?? [];
}

// ── Tracking de última sincronización ────────────────────────────────────────

async function registrarSync(tipo: 'conductores' | 'vehiculos'): Promise<void> {
  await supabase
    .from('configuracion')
    .upsert(
      { clave: `ultima_sync_${tipo}`, valor: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: 'clave' }
    );
}

export async function obtenerUltimaSync(): Promise<UltimaSync> {
  const { data } = await supabase
    .from('configuracion')
    .select('clave, valor')
    .in('clave', ['ultima_sync_conductores', 'ultima_sync_vehiculos']);

  const map = Object.fromEntries((data ?? []).map((r: { clave: string; valor: string | null }) => [r.clave, r.valor]));
  return {
    conductores: map.ultima_sync_conductores ?? null,
    vehiculos:   map.ultima_sync_vehiculos   ?? null,
  };
}

// ── Sincronización de contratos ───────────────────────────────────────────────

/**
 * Upserta contratos en Supabase y devuelve un mapa nombre → id.
 *
 * - Los nombres que vienen de `vehiculos` se upserta con datos completos
 *   (cliente, tipo/clase como proyecto).
 * - Los nombres extra (de conductores) solo se crean si no existen, sin
 *   sobreescribir datos ricos que ya tenga el contrato.
 */
async function syncContratos(
  vehiculos: VehiculoSheet[],
  extraNombres: string[] = [],
): Promise<Map<string, string>> {
  const contratoIdMap = new Map<string, string>();

  // 1. Contratos con datos completos (fuente: vehículos)
  const nombresVehiculos = new Set(
    vehiculos.map(v => v.contrato).filter(Boolean) as string[],
  );

  for (const nombre of nombresVehiculos) {
    const nombreTrimmed = nombre.trim();
    const veh = vehiculos.find(v => v.contrato === nombre)!;

    const payload = {
      nombre: nombreTrimmed,
      cliente: String(veh.cliente ?? '').trim(),
      proyecto: String(veh.tipo ?? veh.clase ?? '').trim(),
    };

    const { data: existing } = await supabase
      .from('contratos')
      .select('id')
      .eq('nombre', nombreTrimmed)
      .maybeSingle();

    if (existing) {
      const id = (existing as { id: string }).id;
      const { error } = await supabase.from('contratos').update(payload).eq('id', id);
      if (error) throw new Error(`Contrato ${nombreTrimmed}: ${error.message}`);
      contratoIdMap.set(nombreTrimmed, id);
    } else {
      const { data, error } = await supabase
        .from('contratos')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw new Error(`Contrato ${nombreTrimmed}: ${error.message}`);
      if (data) contratoIdMap.set(nombreTrimmed, (data as { id: string }).id);
    }
  }

  // 2. Contratos conocidos solo por conductores (nombre como única fuente)
  //    Se crean si no existen; si ya existen no se sobreescriben sus datos.
  const nombresExtra = extraNombres
    .map(n => n.trim())
    .filter(n => n && !nombresVehiculos.has(n));

  for (const nombreTrimmed of nombresExtra) {
    // Buscar primero para no sobreescribir datos ricos existentes
    const { data: existing } = await supabase
      .from('contratos').select('id').eq('nombre', nombreTrimmed).maybeSingle();

    if (existing) {
      contratoIdMap.set(nombreTrimmed, existing.id as string);
    } else {
      const { data } = await supabase
        .from('contratos')
        .insert({ nombre: nombreTrimmed })
        .select('id')
        .single();
      if (data) contratoIdMap.set(nombreTrimmed, (data as { id: string }).id);
    }
  }

  return contratoIdMap;
}

// ── Sincronización de vehículos ───────────────────────────────────────────────

async function syncVehiculos(
  vehiculos: VehiculoSheet[],
  contratoIdMap: Map<string, string>
): Promise<{ count: number; errores: string[]; inactivados: number }> {
  const errores: string[] = [];
  let count = 0;

  // Guard: no inactivar si el Sheet devolvió 0 registros (posible error de fetch)
  if (vehiculos.length === 0) {
    return { count: 0, errores: ['Sheet devolvió 0 vehículos — sincronización cancelada'], inactivados: 0 };
  }

  const placasActivas = new Set(vehiculos.map(v => String(v.placa ?? '').trim().toUpperCase()).filter(Boolean));

  for (const v of vehiculos) {
    if (!v.placa) continue;

    const contrato_id = v.contrato ? (contratoIdMap.get(v.contrato) ?? null) : null;

    const payload: Record<string, unknown> = {
      placa:       String(v.placa).trim().toUpperCase(),
      estado:      String(v.estado ?? 'ACTIVO').trim().toUpperCase(),
      cliente:     String(v.cliente ?? '').trim(),
      marca:       String(v.marca ?? '').trim(),
      linea:       String(v.linea ?? '').trim(),
      tipo_activo: String(v.tipo ?? v['Tipo de activo'] ?? '').trim(),
      clase_activo: String(v.clase ?? v['Clase activo'] ?? '').trim(),
      contrato_id,
      updated_at:  new Date().toISOString(),
    };

    const camposExtra = [
      'carroceria', 'tipo_combustible', 'modelo',
      'centro_costo_nombre', 'centro_costo_numero',
      'lugar', 'zona', 'coordinador', 'gps_compañia',
    ] as const;
    for (const campo of camposExtra) {
      const val = v[campo] ?? v[campo.toUpperCase()];
      if (val !== undefined && val !== '') payload[campo] = String(val).trim();
    }

    const { error } = await supabase
      .from('vehiculos')
      .upsert(payload, { onConflict: 'placa', ignoreDuplicates: false });

    if (error) errores.push(`Vehículo ${v.placa}: ${error.message}`);
    else count++;
  }

  // Soft-delete: marcar INACTIVO los que ya no están en el Sheet
  let inactivados = 0;
  try {
    const existentes = await fetchAllRows(
      supabase
        .from('vehiculos')
        .select('placa')
        .neq('estado', 'INACTIVO')
    );

    const placasInactivar = (existentes ?? [])
      .map((e: { placa: string }) => e.placa)
      .filter((p: string) => !placasActivas.has(p.trim().toUpperCase()));

    if (placasInactivar.length > 0) {
      await supabase
        .from('vehiculos')
        .update({ estado: 'INACTIVO', updated_at: new Date().toISOString() })
        .in('placa', placasInactivar);
      inactivados = placasInactivar.length;
    }
  } catch (e: unknown) {
    errores.push(`Inactivación vehículos: ${e instanceof Error ? e.message : String(e)}`);
  }

  await registrarSync('vehiculos');
  return { count, errores, inactivados };
}

// ── Sincronización de conductores ─────────────────────────────────────────────

async function syncConductores(
  conductores: ConductorSheet[],
  contratoIdMap: Map<string, string> = new Map(),
): Promise<{ count: number; errores: string[]; inactivados: number }> {
  const errores: string[] = [];
  let count = 0;

  // Guard: no inactivar si el Sheet devolvió 0 registros
  if (conductores.length === 0) {
    return { count: 0, errores: ['Sheet devolvió 0 conductores — sincronización cancelada'], inactivados: 0 };
  }

  const cedulasActivas = new Set(conductores.map(c => String(c.cedula ?? '').trim()).filter(Boolean));

  for (const c of conductores) {
    if (!c.cedula) continue;

    const proyectoNombre = String(c.proyecto ?? '').trim();
    const payload: Record<string, unknown> = {
      nombres:                    String(c.nombres ?? '').trim(),
      cedula:                     String(c.cedula).trim(),
      cargo:                      String(c.cargo ?? '').trim(),
      base:                       String(c.base ?? '').trim(),
      estado:                     String(c.estado ?? 'ACTIVO').trim().toUpperCase(),
      proyecto:                   proyectoNombre,
      contrato_id:                contratoIdMap.get(proyectoNombre) ?? null,
      tipo_licencia:              String(c.tipo_licencia ?? '').trim(),
      fecha_exp_particular:       c.fecha_exp_particular       || null,
      fecha_venc_particular:      c.fecha_venc_particular      || null,
      fecha_exp_publica:          c.fecha_exp_publica          || null,
      fecha_venc_publica:         c.fecha_venc_publica         || null,
      fecha_exp_moto:             c.fecha_exp_moto             || null,
      fecha_venc_moto:            c.fecha_venc_moto            || null,
      fecha_cap_manejo_def:       c.fecha_cap_manejo_def       || null,
      fecha_cap_peligrosas:       c.fecha_cap_peligrosas       || null,
      fecha_cap_alturas:          c.fecha_cap_alturas          || null,
      fecha_cap_otro:             c.fecha_cap_otro             || null,
      resultado_prueba_ingreso:   String(c.resultado_prueba_ingreso  ?? '').trim(),
      resultado_prueba_periodica: String(c.resultado_prueba_periodica ?? '').trim(),
      tipo_competencias:          String(c.tipo_competencias   ?? '').trim(),
      vigencia_competencias:      c.vigencia_competencias      || null,
      fecha_revision_simit:       c.fecha_revision_simit       || null,
      tipo_comparendo:            String(c.tipo_comparendo     ?? '').trim(),
      valor_comparendo:           Number(c.valor_comparendo    ?? 0),
      ibutton:                    String(c.ibutton             ?? '').trim(),
      updated_at:                 new Date().toISOString(),
    };

    const { error } = await supabase
      .from('conductores')
      .upsert(payload, { onConflict: 'cedula', ignoreDuplicates: false });

    if (error) errores.push(`Conductor ${c.cedula}: ${error.message}`);
    else count++;
  }

  // Soft-delete: marcar INACTIVO los que ya no están en el Sheet
  let inactivados = 0;
  try {
    const existentes = await fetchAllRows(
      supabase
        .from('conductores')
        .select('cedula')
        .neq('estado', 'INACTIVO')
    );

    const cedulasInactivar = (existentes ?? [])
      .map((e: { cedula: string }) => e.cedula)
      .filter((c: string) => !cedulasActivas.has(c.trim()));

    if (cedulasInactivar.length > 0) {
      await supabase
        .from('conductores')
        .update({ estado: 'INACTIVO', updated_at: new Date().toISOString() })
        .in('cedula', cedulasInactivar);
      inactivados = cedulasInactivar.length;
    }
  } catch (e: unknown) {
    errores.push(`Inactivación conductores: ${e instanceof Error ? e.message : String(e)}`);
  }

  await registrarSync('conductores');
  return { count, errores, inactivados };
}

// ── Función principal de sincronización ──────────────────────────────────────

export async function sincronizarDesdeSheetsCompleto(): Promise<SyncResult> {
  const errores: string[] = [];

  const [vehiculosSheet, conductoresSheet] = await Promise.all([
    fetchVehiculosSheet().catch((e: unknown) => {
      errores.push(`Vehículos Sheets: ${e instanceof Error ? e.message : String(e)}`);
      return [] as VehiculoSheet[];
    }),
    fetchConductoresSheet().catch((e: unknown) => {
      errores.push(`Conductores Sheets: ${e instanceof Error ? e.message : String(e)}`);
      return [] as ConductorSheet[];
    }),
  ]);

  // Contratos primero: combinar nombres de vehículos y conductores
  const proyectosConductores = conductoresSheet
    .map(c => String(c.proyecto ?? '').trim())
    .filter(Boolean);

  let contratoIdMap = new Map<string, string>();
  if (vehiculosSheet.length > 0 || proyectosConductores.length > 0) {
    contratoIdMap = await syncContratos(vehiculosSheet, proyectosConductores);
  }
  const contratosSync = contratoIdMap.size;

  const [resVeh, resCond] = await Promise.all([
    vehiculosSheet.length > 0
      ? syncVehiculos(vehiculosSheet, contratoIdMap)
      : Promise.resolve({ count: 0, errores: [] as string[], inactivados: 0 }),
    conductoresSheet.length > 0
      ? syncConductores(conductoresSheet, contratoIdMap)
      : Promise.resolve({ count: 0, errores: [] as string[], inactivados: 0 }),
  ]);

  errores.push(...resVeh.errores, ...resCond.errores);

  return {
    conductoresSync:      resCond.count,
    vehiculosSync:        resVeh.count,
    contratosSync,
    conductoresInactivados: resCond.inactivados,
    vehiculosInactivados:   resVeh.inactivados,
    errores,
    timestamp: new Date().toISOString(),
  };
}

// ── Sincronización individual ─────────────────────────────────────────────────

export async function sincronizarVehiculos(): Promise<SyncResult> {
  const errores: string[] = [];
  const vehiculosSheet = await fetchVehiculosSheet();
  const contratoIdMap = await syncContratos(vehiculosSheet);
  const res = await syncVehiculos(vehiculosSheet, contratoIdMap);
  errores.push(...res.errores);
  return {
    conductoresSync: 0,
    vehiculosSync:   res.count,
    contratosSync:   contratoIdMap.size,
    conductoresInactivados: 0,
    vehiculosInactivados:   res.inactivados,
    errores,
    timestamp: new Date().toISOString(),
  };
}

export async function sincronizarConductores(): Promise<SyncResult> {
  const errores: string[] = [];
  const conductoresSheet = await fetchConductoresSheet();

  // Construir mapa de contratos desde los proyectos de conductores
  const proyectos = conductoresSheet.map(c => String(c.proyecto ?? '').trim()).filter(Boolean);
  const contratoIdMap = await syncContratos([], proyectos);

  const res = await syncConductores(conductoresSheet, contratoIdMap);
  errores.push(...res.errores);
  return {
    conductoresSync: res.count,
    vehiculosSync:   0,
    contratosSync:   contratoIdMap.size,
    conductoresInactivados: res.inactivados,
    vehiculosInactivados:   0,
    errores,
    timestamp: new Date().toISOString(),
  };
}

// ── Lookups en Supabase ───────────────────────────────────────────────────────

export async function getConductorByCedula(cedula: string) {
  const { data } = await supabase
    .from('conductores')
    .select('*')
    .eq('cedula', cedula.trim())
    .maybeSingle();
  return data;
}

export async function getVehiculoByPlaca(placa: string) {
  const { data } = await supabase
    .from('vehiculos')
    .select('*, contratos(*)')
    .eq('placa', placa.trim().toUpperCase())
    .maybeSingle();
  return data;
}
