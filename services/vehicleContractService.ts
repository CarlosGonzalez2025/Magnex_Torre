import { supabase, fetchPaginado, isSupabaseAvailable } from './supabaseClient';

/**
 * Resolución placa → contrato para las fuentes que NO traen el contrato en su
 * propia respuesta (hoy: Geotab).
 *
 * Coltrack y Fagor devuelven el contrato en el registro del vehículo y además
 * pasan por el enriquecimiento con Google Sheets de `fleetService`. Geotab no:
 * sus ExceptionEvent solo identifican el dispositivo, así que el contrato hay
 * que buscarlo contra el maestro.
 *
 * La fuente es `vehiculos` + `contratos` (no el CSV de Sheets) por dos razones:
 *   1. Es la misma que ya usa el pipeline de cargas masivas, que resuelve el
 *      contrato de Geotab correctamente.
 *   2. Evita meter una petición a Google en el ciclo de refresco de alertas.
 *
 * `vehiculos` se sincroniza desde Sheets vía googleSheetsService, así que el
 * dato es el mismo con un salto de indirección.
 */

/**
 * Clave de comparación de placas: mayúsculas y solo alfanuméricos.
 * Absorbe las variantes de formato entre proveedores ("ngk627", "NGK-627",
 * "NGK 627" → "NGK627"). El cruce exacto que se usaba antes fallaba con
 * cualquiera de ellas.
 */
export function normalizePlate(placa: unknown): string {
  return String(placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

interface VehiculoContrato {
  placa: string | null;
  contratos: { nombre: string | null } | { nombre: string | null }[] | null;
}

// El maestro cambia con cargas puntuales, no en el ciclo de refresco. Se cachea
// para no releer 1.000+ filas en cada tick de alertas (cada 30-60 s).
const TTL_MS = 30 * 60 * 1000;
let cache: { mapa: Map<string, string>; expira: number } | null = null;
let enVuelo: Promise<Map<string, string>> | null = null;

/**
 * Mapa placa normalizada → nombre de contrato.
 *
 * Nunca lanza: ante cualquier fallo devuelve un mapa vacío y quien llama
 * conserva su valor por defecto. Un contrato ausente es un hueco; una excepción
 * aquí tumbaría el ciclo de alertas entero.
 */
export async function getVehicleContractMap(): Promise<Map<string, string>> {
  if (cache && Date.now() < cache.expira) return cache.mapa;
  if (enVuelo) return enVuelo;

  if (!isSupabaseAvailable()) return cache?.mapa ?? new Map();

  enVuelo = (async () => {
    try {
      const filas = await fetchPaginado<VehiculoContrato>(() =>
        supabase.from('vehiculos').select('placa, contratos(nombre)')
      );

      const mapa = new Map<string, string>();
      for (const fila of filas) {
        const clave = normalizePlate(fila.placa);
        if (!clave) continue;
        // PostgREST devuelve el embebido como objeto o como array según la
        // cardinalidad que infiera del esquema; hay que aceptar ambos.
        const rel = Array.isArray(fila.contratos) ? fila.contratos[0] : fila.contratos;
        const nombre = (rel?.nombre ?? '').trim();
        if (nombre) mapa.set(clave, nombre);
      }

      // Un mapa vacío casi siempre significa lectura fallida (RLS, cuota), no
      // una flota sin contratos: conservar el cache previo es más seguro.
      if (mapa.size === 0 && cache) return cache.mapa;

      cache = { mapa, expira: Date.now() + TTL_MS };
      console.log(`[Contratos] Maestro placa→contrato cargado (${mapa.size} vehículos)`);
      return mapa;
    } catch (error) {
      console.warn('[Contratos] No se pudo cargar el maestro placa→contrato:', error);
      return cache?.mapa ?? new Map<string, string>();
    } finally {
      enVuelo = null;
    }
  })();

  return enVuelo;
}

/** Busca el contrato de una placa. Devuelve null si no se puede resolver. */
export function resolveContract(
  placa: unknown,
  mapa: Map<string, string> | null | undefined
): string | null {
  if (!mapa || mapa.size === 0) return null;
  const clave = normalizePlate(placa);
  if (!clave) return null;
  return mapa.get(clave) ?? null;
}

/** Fuerza la recarga en el próximo uso (tras sincronizar el maestro). */
export function invalidateVehicleContractMap(): void {
  cache = null;
}
