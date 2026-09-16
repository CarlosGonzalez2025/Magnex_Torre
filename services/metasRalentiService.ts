import { supabase } from './supabaseClient';

/**
 * Metas del informe de ralentí, leídas de `config_metas_ralenti`.
 *
 * Estaban escritas a mano en tres sitios del código y mal dimensionadas: eran valores de
 * UN vehículo aplicados al TOTAL de la flota, así que el PDF del cliente llegaba a imprimir
 * "3.228 gal sobre meta". Ahora se normalizan por vehículo y por día, de modo que escalan
 * con el tamaño de la flota y siguen significando lo mismo con 300 o con 900 vehículos.
 *
 * Ver migrations/config_metas_ralenti_v1.sql para el origen de los valores sembrados.
 */

export interface MetasRalenti {
  /** % de ralentí sobre motor encendido. */
  pctRalenti: number;
  /** Galones quemados en ralentí por vehículo y día. */
  galonesVehiculoDia: number;
  /** Costo del ralentí en COP por vehículo y día. */
  costoVehiculoDia: number;
  /** TRUE = son la línea base medida, no una meta acordada con el cliente. */
  provisional: boolean;
  /** TRUE = se están usando los valores de respaldo porque no se pudo leer la tabla. */
  desdeRespaldo: boolean;
}

/**
 * Respaldo para que el informe NUNCA quede sin metas: si la migración todavía no se
 * corrió, o Supabase no responde, se usan estos valores en vez de romper la pantalla.
 * Son la misma línea base que siembra la migración (abril-mayo 2026).
 */
export const METAS_RESPALDO: MetasRalenti = {
  pctRalenti: 42.8,
  galonesVehiculoDia: 0.325,
  costoVehiculoDia: 3644,
  provisional: true,
  desdeRespaldo: true,
};

const CLAVES = {
  pct_ralenti: 'pctRalenti',
  galones_vehiculo_dia: 'galonesVehiculoDia',
  costo_vehiculo_dia: 'costoVehiculoDia',
} as const;

// Las metas cambian muy rara vez y el informe las consulta en cada render: se cachean
// por 5 minutos para no ir a la base en cada cambio de filtro.
const TTL_MS = 5 * 60 * 1000;
let cache: { valor: MetasRalenti; expira: number } | null = null;

/** Invalida la caché. La llama la pantalla de configuración tras guardar. */
export function invalidarCacheMetas(): void {
  cache = null;
}

export async function obtenerMetasRalenti(): Promise<MetasRalenti> {
  if (cache && Date.now() < cache.expira) return cache.valor;

  try {
    const { data, error } = await supabase
      .from('config_metas_ralenti')
      .select('clave, valor, provisional');

    if (error || !data || data.length === 0) {
      if (error) console.warn('[metasRalenti] no se pudieron leer las metas, se usa el respaldo:', error.message);
      return METAS_RESPALDO;
    }

    const metas: MetasRalenti = { ...METAS_RESPALDO, desdeRespaldo: false, provisional: false };
    let encontradas = 0;
    for (const fila of data) {
      const campo = CLAVES[fila.clave as keyof typeof CLAVES];
      if (!campo) continue;
      const valor = Number(fila.valor);
      if (!Number.isFinite(valor)) continue;
      (metas as any)[campo] = valor;
      if (fila.provisional) metas.provisional = true;
      encontradas++;
    }

    // Si falta alguna clave, el respaldo cubre ese hueco y la meta sigue siendo
    // provisional: mejor una cifra declarada que un cero silencioso.
    if (encontradas < Object.keys(CLAVES).length) metas.provisional = true;

    cache = { valor: metas, expira: Date.now() + TTL_MS };
    return metas;
  } catch (e: any) {
    console.warn('[metasRalenti] excepción leyendo las metas, se usa el respaldo:', e?.message);
    return METAS_RESPALDO;
  }
}

/** Guarda una meta y baja la bandera de provisional. */
export async function guardarMetaRalenti(
  clave: keyof typeof CLAVES,
  valor: number,
  usuario?: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('config_metas_ralenti')
    .update({
      valor,
      provisional: false,
      updated_at: new Date().toISOString(),
      updated_by: usuario ?? null,
    })
    .eq('clave', clave);

  invalidarCacheMetas();
  return error ? { ok: false, error: error.message } : { ok: true };
}
