import { supabase } from './supabaseClient';

/**
 * Control de envío de los informes mensuales por contrato.
 *
 * La marca se guarda por contrato y por MES LÓGICO del período. Los períodos
 * corren del 29 al 28, así que el mes lógico es el del fin de período (misma
 * regla que `etiquetaMesPeriodo`). Se usa el mes y no el par exacto de fechas
 * para que la marca sobreviva a un ajuste de un día en el rango: lo que el
 * usuario marca es "el informe de AGOSTO 2026 de este contrato".
 *
 * Ver migración `migrations/envios_informes_mensuales_v1.sql`.
 */

const TABLA = 'envios_informes_mensuales';

export interface EnvioMensual {
  contratoId: string;
  mes: string;
  enviado: boolean;
  enviadoAt: string | null;
  enviadoPor: string | null;
}

/** Mes lógico 'YYYY-MM' de un período (el del fin de período). */
export function mesPeriodo(periodoFin: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(periodoFin ?? ''));
  return m ? `${m[1]}-${m[2]}` : '';
}

interface FilaEnvio {
  contrato_id: string;
  mes: string;
  enviado: boolean;
  enviado_at: string | null;
  enviado_por: string | null;
}

function aEnvio(fila: FilaEnvio): EnvioMensual {
  return {
    contratoId: String(fila.contrato_id),
    mes: String(fila.mes),
    enviado: Boolean(fila.enviado),
    enviadoAt: fila.enviado_at ?? null,
    enviadoPor: fila.enviado_por ?? null,
  };
}

/**
 * Marcas de envío de un mes, indexadas por `contrato_id`.
 *
 * Solo devuelve las filas marcadas como enviadas: un contrato ausente del mapa
 * es un contrato pendiente, y así la UI no necesita distinguir entre "nunca se
 * marcó" y "se marcó y se desmarcó".
 */
export async function listarEnviosMensuales(mes: string): Promise<Map<string, EnvioMensual>> {
  const mapa = new Map<string, EnvioMensual>();
  if (!mes) return mapa;

  const { data, error } = await supabase
    .from(TABLA)
    .select('contrato_id, mes, enviado, enviado_at, enviado_por')
    .eq('mes', mes)
    .eq('enviado', true);

  if (error) throw new Error(error.message);

  for (const fila of (data ?? []) as FilaEnvio[]) {
    mapa.set(String(fila.contrato_id), aEnvio(fila));
  }
  return mapa;
}

/**
 * Marca o desmarca el informe mensual de un contrato.
 *
 * Es un UPSERT sobre (contrato_id, mes): desmarcar deja la fila con
 * `enviado = false` en lugar de borrarla, para conservar el rastro de quién y
 * cuándo la había marcado antes.
 */
export async function marcarEnvioMensual(params: {
  contratoId: string;
  periodoInicio: string;
  periodoFin: string;
  enviado: boolean;
  usuario?: string | null;
}): Promise<EnvioMensual> {
  const mes = mesPeriodo(params.periodoFin);
  if (!params.contratoId) throw new Error('El contrato no está identificado.');
  if (!mes) throw new Error(`Período fin inválido: ${params.periodoFin}`);

  const fila = {
    contrato_id: params.contratoId,
    mes,
    periodo_inicio: params.periodoInicio || null,
    periodo_fin: params.periodoFin || null,
    enviado: params.enviado,
    enviado_at: params.enviado ? new Date().toISOString() : null,
    enviado_por: params.enviado ? (params.usuario ?? null) : null,
  };

  const { data, error } = await supabase
    .from(TABLA)
    .upsert(fila, { onConflict: 'contrato_id,mes' })
    .select('contrato_id, mes, enviado, enviado_at, enviado_por')
    .single();

  if (error) throw new Error(error.message);
  return aEnvio(data as FilaEnvio);
}
