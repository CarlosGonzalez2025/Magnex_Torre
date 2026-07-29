import { createClient } from '@supabase/supabase-js';

// Supabase configuration - Uses environment variables with fallback
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

// Create and export Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export configuration for debugging
export const supabaseConfig = {
    url: SUPABASE_URL,
    isConfigured: !!import.meta.env.VITE_SUPABASE_URL,
};

// ── Availability tracking ──────────────────────────────────────────────────
// When Supabase returns a 402/quota error, all writes are skipped for
// RETRY_INTERVAL_MS to avoid console spam and unnecessary failed requests.
const RETRY_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
let _unavailableSince: number | null = null;

export function markSupabaseUnavailable(): void {
    if (_unavailableSince === null) {
        console.warn('[Supabase] Proyecto restringido — escrituras deshabilitadas hasta que se resuelva la cuota.');
    }
    _unavailableSince = Date.now();
}

export function isSupabaseAvailable(): boolean {
    if (_unavailableSince === null) return true;
    if (Date.now() - _unavailableSince > RETRY_INTERVAL_MS) {
        _unavailableSince = null; // reset y reintentar
        return true;
    }
    return false;
}

// ── Paginación ─────────────────────────────────────────────────────────────
// PostgREST corta toda respuesta en 1.000 filas y no avisa: la consulta
// devuelve 200 con las primeras mil y el resto desaparece en silencio. Cualquier
// lectura que pueda superar ese número tiene que pedir páginas.
const TAMANO_PAGINA = 1000;

/**
 * Recorre una consulta por páginas y devuelve TODAS las filas.
 *
 * Pensado para lecturas acotadas por una clave (un conductor, un período), donde
 * la profundidad del offset se queda en unos pocos miles. Para recorrer tablas
 * enteras usa el paginado por cursor de `reportService.fetchAllRowsPorFecha`:
 * el offset se degrada con la profundidad y acaba en "statement timeout".
 *
 * `estricto` decide qué pasa si una página falla después de los reintentos:
 *
 *   false (por defecto) — devuelve lo acumulado y avisa por consola. Para los
 *     sitios que agregan varias fuentes en paralelo, donde el fallo de una no
 *     debe tumbar el resto del cálculo (la Hoja de Vida y el puntaje ya
 *     descartaban esa fuente por su cuenta).
 *
 *   true — lanza. Para cuando una lista incompleta produce daño en lugar de un
 *     hueco: el mapa de IDs del import decide entre UPDATE e INSERT, así que un
 *     mapa a medias duplica filas en la base. Ahí es mejor que el import falle
 *     y se repita.
 */
export async function fetchPaginado<T = Record<string, unknown>>(
    construirQuery: () => any,
    opciones: { estricto?: boolean } = {},
): Promise<T[]> {
    const filas: T[] = [];
    let desde = 0;

    while (true) {
        try {
            // Reintento ante errores transitorios: si una página falla y se
            // aborta sin más, el resultado son datos PARCIALES silenciosos, que
            // es justo lo que este paginado viene a evitar.
            let data: any = null;
            let error: any = null;
            for (let intento = 1; intento <= 3; intento++) {
                ({ data, error } = await construirQuery().range(desde, desde + TAMANO_PAGINA - 1));
                if (!error) break;
                const code = String(error.code ?? '');
                const transitorio = code === '57014' || code === '503' || code === '504'
                    || String(error.message ?? '').toLowerCase().includes('statement timeout');
                if (intento === 3 || !transitorio) break;
                await new Promise(r => setTimeout(r, 400 * intento));
            }
            if (error) throw new Error(error.message);
            const pagina = (data ?? []) as T[];
            filas.push(...pagina);
            if (pagina.length < TAMANO_PAGINA) break;
            desde += TAMANO_PAGINA;
        } catch (e: any) {
            const msg = e?.message ?? String(e);
            if (opciones.estricto) {
                throw new Error(`Paginación incompleta (${filas.length} filas leídas): ${msg}`);
            }
            console.warn(`[Supabase] Paginación interrumpida tras ${filas.length} filas:`, msg);
            break;
        }
    }

    return filas;
}

export function isQuotaError(msg: string): boolean {
    const lower = (msg || '').toLowerCase();
    return lower.includes('restricted') || lower.includes('exceed') ||
           lower.includes('quota') || lower.includes('payment required');
}
