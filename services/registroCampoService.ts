/**
 * registroCampoService.ts
 *
 * Alta de registros de comportamiento en campo (QR). Cada registro queda
 * trazado con usuario (auth.uid), fecha/hora del servidor y geolocalización,
 * y es INMUTABLE (la tabla no admite UPDATE/DELETE vía RLS). El seguimiento
 * se hace agregando notas, nunca editando.
 *
 * Tras insertar, dispara el recálculo del puntaje para que el impacto se
 * refleje de inmediato en el carnet y la hoja de vida.
 */

import { supabase } from './supabaseClient';
import { normalizeConductorKey } from './hojaDeVidaService';
import { calcularPuntaje } from './puntajeService';
import { uploadFile } from './fileStorageService';
import type { User } from '../contexts/AuthContext';

export type Severidad = 'leve' | 'grave' | 'critico';

export const CATALOGO_EVENTOS: Array<{ value: string; label: string; sugerida: Severidad }> = [
  { value: 'exceso_velocidad',   label: 'Exceso de velocidad',            sugerida: 'grave' },
  { value: 'no_ibutton',         label: 'No uso de iButton',              sugerida: 'critico' },
  { value: 'incumple_protocolo', label: 'Incumplimiento de protocolo',    sugerida: 'critico' },
  { value: 'sin_epp',            label: 'Sin EPP / dotación',             sugerida: 'grave' },
  { value: 'uso_celular',        label: 'Uso de celular conduciendo',     sugerida: 'grave' },
  { value: 'conduccion_agresiva',label: 'Conducción agresiva',            sugerida: 'grave' },
  { value: 'documentos',         label: 'Documentos vencidos/incompletos',sugerida: 'leve' },
  { value: 'otro',               label: 'Otro',                           sugerida: 'leve' },
];

/**
 * ¿Puede este usuario registrar comportamientos en campo?
 * Autenticado + (acceso total | permiso de módulo carnet_campo/hoja-vida) y no viewer.
 */
export function puedeRegistrarCampo(user: User | null): boolean {
  if (!user) return false;
  if (user.role === 'viewer') return false;
  if (user.allowedModules === null) return true; // admin / superadmin
  return user.allowedModules.includes('carnet_campo') || user.allowedModules.includes('hoja-vida');
}

export interface NuevoRegistroCampo {
  conductorId: string;
  conductorNombre?: string;
  tipoEvento: string;
  severidad: Severidad;
  descripcion: string;
  latitud?: number | null;
  longitud?: number | null;
  evidencia?: File | null;
}

export async function crearRegistroCampo(
  input: NuevoRegistroCampo,
): Promise<{ success: boolean; error?: string; recalculo?: boolean }> {
  try {
    // 1) Identidad del autor desde la sesión real (lo exige la RLS: registrado_por = auth.uid()).
    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData?.user;
    if (!authUser) {
      return { success: false, error: 'Debes iniciar sesión como supervisor para registrar.' };
    }

    // 2) Evidencia opcional (reutiliza el bucket de adjuntos existente).
    let evidencia_url: string | null = null;
    if (input.evidencia) {
      const up = await uploadFile(input.evidencia, `carnet/${input.conductorId}`);
      if (up.success && up.data) evidencia_url = up.data.url;
      // Si el bucket no está disponible, se registra igual sin evidencia (no se bloquea).
    }

    const nombreAutor =
      (authUser.user_metadata?.name as string) ||
      authUser.email ||
      'Supervisor';

    // 3) Inserción inmutable.
    const { error: errIns } = await supabase.from('conductor_campo_registros').insert({
      conductor_id: input.conductorId,
      conductor_key: input.conductorNombre ? normalizeConductorKey(input.conductorNombre) : null,
      tipo_evento: input.tipoEvento,
      severidad: input.severidad,
      descripcion: input.descripcion.trim(),
      evidencia_url,
      latitud: input.latitud ?? null,
      longitud: input.longitud ?? null,
      registrado_por: authUser.id,
      registrado_por_nombre: nombreAutor,
      registrado_por_email: authUser.email ?? null,
      dispositivo: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
    });

    if (errIns) return { success: false, error: errIns.message };

    // 4) Recalcular puntaje para reflejar el impacto en carnet + hoja de vida.
    const { error: errCalc } = await calcularPuntaje(input.conductorId, { persist: true });
    return { success: true, recalculo: !errCalc };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface NotaSeguimiento {
  id: string;
  nota: string;
  autor_nombre: string | null;
  created_at: string;
}

/** Notas de seguimiento de un registro (orden cronológico). */
export async function getNotasByRegistro(registroId: string): Promise<NotaSeguimiento[]> {
  try {
    const { data } = await supabase
      .from('conductor_registro_notas')
      .select('id, nota, autor_nombre, created_at')
      .eq('registro_id', registroId)
      .order('created_at', { ascending: true });
    return (data ?? []) as NotaSeguimiento[];
  } catch { return []; }
}

/** Nota de seguimiento (append-only) sobre un registro existente. */
export async function agregarNotaSeguimiento(
  registroId: string,
  nota: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData?.user;
    if (!authUser) return { success: false, error: 'Sesión requerida.' };

    const { error } = await supabase.from('conductor_registro_notas').insert({
      registro_id: registroId,
      nota: nota.trim(),
      autor_id: authUser.id,
      autor_nombre: (authUser.user_metadata?.name as string) || authUser.email || 'Supervisor',
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
