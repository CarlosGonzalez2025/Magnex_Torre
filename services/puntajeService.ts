/**
 * puntajeService.ts
 *
 * Motor de PUNTAJE (100→0) y SEMÁFORO por conductor, basado en REGLAS
 * (no ML). Los pesos viven en la tabla `config_puntaje` (tuneables sin
 * redeploy); el cálculo agrega, en solo lectura, los eventos que ya
 * producen otros módulos y persiste un snapshot en `conductor_scores`.
 *
 * REGLA DE ORO: solo LEE de las tablas de otros módulos (alertas, ralentí,
 * mensuales, inspecciones) y ESCRIBE únicamente en `conductor_scores`
 * (tabla propia del ecosistema). No altera nada existente.
 *
 * Semáforo (Fase 2 §8):
 *   🔴 ROJO      = puntaje < umbral_alerta  O  algún detonador crítico activo
 *   🟡 AMARILLO  = umbral_alerta ≤ puntaje < umbral_ok
 *   🟢 VERDE     = puntaje ≥ umbral_ok  y  sin detonadores
 *
 * Detonadores críticos (override → ROJO sin importar el puntaje):
 *   no_ibutton · simit_vigente · reincidencia_grave · protocolo_critico
 */

import { supabase, fetchPaginado } from './supabaseClient';
import { normalizeConductorKey } from './hojaDeVidaService';
import { getVerificacionByCedula, getCapacitacionesByCedula } from './documentosService';

// ── Topes por categoría (evitan que una categoría muy voluminosa aplaste el
//    puntaje). Son perillas de ajuste; podrían moverse a config_puntaje si se
//    quiere tunearlas sin redeploy. Los excesos y los registros de campo NO se
//    topan: son la señal de seguridad real.
const CAP_RALENTI = -10;
const CAP_INSPECCIONES = -15;
const CAP_FRENADAS = -10;
const CAP_DOC_VENCIDO = -30;
const REINCIDENCIA_GRAVE_UMBRAL = 3; // ≥3 excesos graves en la ventana = reincidencia

// ── Pesos por defecto (fallback si faltara una clave en config_puntaje) ───────
const PESOS_DEFAULT: Record<string, number> = {
  base_inicial: 100,
  ventana_dias: 90,
  umbral_ok: 85,
  umbral_alerta: 60,
  pen_exceso_grave: -8,
  pen_exceso_moderado: -3,
  pen_no_ibutton: -15,
  pen_simit_vigente: -20,
  pen_frenada_brusca: -1,
  pen_ralenti_exceso: -2,
  pen_inspeccion_fallida: -5,
  pen_doc_vencido: -10,
  pen_campo_leve: -5,
  pen_campo_grave: -15,
  pen_campo_critico: -25,
  mult_reincidencia: 1.5,
  rec_capacitacion: 5,
  rec_mes_sin_excesos: 10,
};

export type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO';

export interface DesgloseItem {
  factor: string;
  cantidad?: number;
  puntos: number;
}

export interface PuntajeResult {
  conductor_id: string;
  conductor_key: string;
  puntaje: number;
  semaforo: Semaforo;
  detonadores: string[];
  desglose: DesgloseItem[];
  fecha_calculo: string;
}

// ── Carga y cache de pesos ────────────────────────────────────────────────────

let pesosCache: Record<string, number> | null = null;

export async function cargarPesos(force = false): Promise<Record<string, number>> {
  if (pesosCache && !force) return pesosCache;
  try {
    const { data, error } = await supabase.from('config_puntaje').select('clave, valor');
    if (error) throw error;
    const map = { ...PESOS_DEFAULT };
    for (const row of (data ?? []) as Array<{ clave: string; valor: number }>) {
      map[row.clave] = Number(row.valor);
    }
    pesosCache = map;
    return map;
  } catch {
    pesosCache = { ...PESOS_DEFAULT };
    return pesosCache;
  }
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function fechaLimiteVentana(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function estaVencido(fecha: string | null | undefined): boolean {
  if (!fecha) return false;
  const v = new Date(fecha);
  if (Number.isNaN(v.getTime())) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return v.getTime() < hoy.getTime();
}

function estaVigente(fecha: string | null | undefined): boolean {
  if (!fecha) return false;
  const v = new Date(fecha);
  if (Number.isNaN(v.getTime())) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return v.getTime() >= hoy.getTime();
}

// ── Cálculo del puntaje de un conductor ───────────────────────────────────────

export async function calcularPuntaje(
  conductorId: string,
  opts: { persist?: boolean } = {},
): Promise<{ data: PuntajeResult | null; error?: string }> {
  try {
    const P = await cargarPesos();
    const ventana = Math.round(P.ventana_dias || 90);
    const desde = fechaLimiteVentana(ventana);

    // 1) Identidad + banderas documentales (tabla espejo limpia)
    const { data: conductor, error: errC } = await supabase
      .from('hv_conductores')
      .select('*')
      .eq('id', conductorId)
      .maybeSingle();
    if (errC) throw errC;
    if (!conductor) return { data: null, error: 'Conductor no encontrado' };
    const c = conductor as Record<string, any>;
    const key = normalizeConductorKey(c.nombres);
    const telemetriaId = c.telemetria_ref_id ?? null; // puente a alertas/ralentí/mensuales
    // Fuentes vivas de documentos (reemplazan columnas desactualizadas de la base).
    const [verif, capac] = await Promise.all([
      getVerificacionByCedula(String(c.cedula ?? '')),
      getCapacitacionesByCedula(String(c.cedula ?? '')),
    ]);

    // 2) Eventos en paralelo (aislados: un fallo no tumba el cálculo)
    const [alertasRes, ralentiRes, campoRes, mensualRes, inspRes] = await Promise.all([
      // Paginado: sin él PostgREST devolvía solo las primeras 1.000 alertas y el
      // puntaje ignoraba el resto, precisamente en los conductores que más
      // eventos acumulan. Medido en producción sobre la ventana de 90 días, dos
      // conductores la superan: 2.311 y 1.687 alertas, de las que se contaban
      // 1.000. Al truncar por arriba, el peor conductor de la flota podía salir
      // mejor puntuado que otro con menos eventos.
      telemetriaId
        ? fetchPaginado<any>(() => supabase
            .from('alertas_diarias_gps')
            .select('velocidad, infraccion_80_kmh, excesos_50_80_kmh, frenadas_bruscas')
            .eq('conductor_id', telemetriaId)
            .gte('fecha', desde)
            .order('fecha', { ascending: true })
          ).then(data => ({ data }))
        : Promise.resolve({ data: [] }),
      telemetriaId
        ? supabase
            .from('ralentis_eventos')
            .select('id', { count: 'exact', head: true })
            .eq('conductor_id', telemetriaId)
            .gte('fecha_inicio', desde)
            .then(r => r, () => ({ count: 0 }))
        : Promise.resolve({ count: 0 }),
      supabase
        .from('conductor_campo_registros')
        .select('severidad')
        .eq('conductor_id', conductorId)
        .gte('created_at', desde)
        .then(r => r, () => ({ data: [] })),
      telemetriaId
        ? supabase
            .from('reportes_conductores')
            .select('excesos_10_kph, excesos_20_kph, excesos_30_kph, excesos_40_kph, excesos_50_kph, excesos_60_kph, excesos_80_kph, periodo_fin')
            .eq('conductor_id', telemetriaId)
            .order('periodo_fin', { ascending: false })
            .limit(1)
            .then(r => r, () => ({ data: [] }))
        : Promise.resolve({ data: [] }),
      supabase
        .from('preoperational_inspections')
        .select('status, inspection_date')
        .ilike('driver', `%${c.nombres}%`)
        .gte('inspection_date', desde)
        .then(r => r, () => ({ data: [] })),
    ]);

    const desglose: DesgloseItem[] = [];
    const detonadores: string[] = [];
    let puntaje = P.base_inicial || 100;

    // ── Excesos y frenadas (alertas_diarias_gps) ───────────────────────────────
    const alertas = ((alertasRes as any).data ?? []) as any[];
    let graves = 0, moderados = 0, frenadas = 0;
    for (const a of alertas) {
      const grave = (a.infraccion_80_kmh ?? 0) > 0 || (a.velocidad ?? 0) >= 80;
      const moderado = !grave && ((a.excesos_50_80_kmh ?? 0) > 0 || (a.velocidad ?? 0) >= 50);
      if (grave) graves++;
      else if (moderado) moderados++;
      if ((a.frenadas_bruscas ?? 0) > 0) frenadas++;
    }

    // Reincidencia: si hay ≥ umbral de excesos graves, se multiplica su castigo
    // y se enciende el detonador crítico.
    const reincidencia = graves >= REINCIDENCIA_GRAVE_UMBRAL;
    if (graves > 0) {
      let pts = graves * P.pen_exceso_grave;
      if (reincidencia) pts *= (P.mult_reincidencia || 1.5);
      pts = Math.round(pts);
      puntaje += pts;
      desglose.push({ factor: reincidencia ? 'exceso_grave (reincidencia)' : 'exceso_grave', cantidad: graves, puntos: pts });
      if (reincidencia) detonadores.push('reincidencia_grave');
    }
    if (moderados > 0) {
      const pts = moderados * P.pen_exceso_moderado;
      puntaje += pts;
      desglose.push({ factor: 'exceso_moderado', cantidad: moderados, puntos: pts });
    }
    if (frenadas > 0) {
      const pts = Math.max(CAP_FRENADAS, frenadas * P.pen_frenada_brusca);
      puntaje += pts;
      desglose.push({ factor: 'frenada_brusca', cantidad: frenadas, puntos: pts });
    }

    // ── Ralentí (con tope) ─────────────────────────────────────────────────────
    const ralenti = (ralentiRes as any).count ?? 0;
    if (ralenti > 0) {
      const pts = Math.max(CAP_RALENTI, ralenti * P.pen_ralenti_exceso);
      puntaje += pts;
      desglose.push({ factor: 'ralenti', cantidad: ralenti, puntos: pts });
    }

    // ── iButton (detonador crítico) ────────────────────────────────────────────
    const sinIbutton = !c.ibutton || String(c.ibutton).trim() === '';
    if (sinIbutton) {
      puntaje += P.pen_no_ibutton;
      desglose.push({ factor: 'no_ibutton', puntos: P.pen_no_ibutton });
      detonadores.push('no_ibutton');
    }

    // ── SIMIT / comparendo (detonador crítico) ─────────────────────────────────
    // Prioriza la verificación documental (fuente viva); si no hay, usa la base.
    const tieneComparendo = verif
      ? verif.numero_comparendos > 0 || verif.valor_comparendos > 0
      : (c.tipo_comparendo && String(c.tipo_comparendo).trim() !== '') || Number(c.valor_comparendo ?? 0) > 0;
    if (tieneComparendo) {
      puntaje += P.pen_simit_vigente;
      desglose.push({ factor: 'simit_vigente', puntos: P.pen_simit_vigente });
      detonadores.push('simit_vigente');
    }

    // ── Documentos vencidos (con tope) ─────────────────────────────────────────
    // Con verificación: cuenta licencias con alerta "Vencido". Sin ella: fechas de la base.
    let vencidos: number;
    if (verif) {
      vencidos = verif.licencias.filter(l => (l.alerta || '').toLowerCase().includes('vencid')).length;
    } else {
      const fechasVenc = [
        c.fecha_venc_particular, c.fecha_venc_publica, c.fecha_venc_moto,
        c.fecha_cap_manejo_def, c.fecha_cap_peligrosas, c.fecha_cap_alturas,
        c.fecha_cap_otro, c.vigencia_competencias,
      ];
      vencidos = fechasVenc.filter(estaVencido).length;
    }
    if (vencidos > 0) {
      const pts = Math.max(CAP_DOC_VENCIDO, vencidos * P.pen_doc_vencido);
      puntaje += pts;
      desglose.push({ factor: 'documento_vencido', cantidad: vencidos, puntos: pts });
    }

    // ── Manejo defensivo vencido (detonador crítico) ───────────────────────────
    // Solo si tiene certificados y NINGUNO está vigente (el más próximo es vencido).
    if (capac.total > 0 && capac.proximo_vencimiento && capac.proximo_vencimiento.vencida) {
      puntaje += P.pen_doc_vencido;
      desglose.push({ factor: 'manejo_defensivo_vencido', puntos: P.pen_doc_vencido });
      detonadores.push('manejo_defensivo_vencido');
    }

    // ── Inspecciones fallidas (Sin inspección / Fuera de tiempo, con tope) ─────
    const insp = ((inspRes as any).data ?? []) as any[];
    const inspFallidas = insp.filter(i => i.status && /sin|fuera/i.test(i.status)).length;
    if (inspFallidas > 0) {
      const pts = Math.max(CAP_INSPECCIONES, inspFallidas * P.pen_inspeccion_fallida);
      puntaje += pts;
      desglose.push({ factor: 'inspeccion_fallida', cantidad: inspFallidas, puntos: pts });
    }

    // ── Registros de campo (QR) por severidad ──────────────────────────────────
    const campo = ((campoRes as any).data ?? []) as Array<{ severidad: string }>;
    let leves = 0, gravesC = 0, criticos = 0;
    for (const r of campo) {
      const s = String(r.severidad || 'leve').toLowerCase();
      if (s === 'critico') criticos++;
      else if (s === 'grave') gravesC++;
      else leves++;
    }
    if (leves > 0)  { const pts = leves  * P.pen_campo_leve;    puntaje += pts; desglose.push({ factor: 'campo_leve',    cantidad: leves,    puntos: pts }); }
    if (gravesC > 0){ const pts = gravesC* P.pen_campo_grave;   puntaje += pts; desglose.push({ factor: 'campo_grave',   cantidad: gravesC,  puntos: pts }); }
    if (criticos > 0){
      const pts = criticos * P.pen_campo_critico;
      puntaje += pts;
      desglose.push({ factor: 'campo_critico', cantidad: criticos, puntos: pts });
      detonadores.push('protocolo_critico');
    }

    // ── Recuperaciones ─────────────────────────────────────────────────────────
    const capsVigentes = [
      c.fecha_cap_manejo_def, c.fecha_cap_peligrosas, c.fecha_cap_alturas,
      c.fecha_cap_otro, c.vigencia_competencias,
    ].filter(estaVigente).length;
    if (capsVigentes > 0) {
      const pts = capsVigentes * P.rec_capacitacion;
      puntaje += pts;
      desglose.push({ factor: 'capacitacion_vigente', cantidad: capsVigentes, puntos: pts });
    }

    const ultimoMes = ((mensualRes as any).data ?? [])[0];
    if (ultimoMes) {
      const excMes =
        (ultimoMes.excesos_10_kph ?? 0) + (ultimoMes.excesos_20_kph ?? 0) + (ultimoMes.excesos_30_kph ?? 0) +
        (ultimoMes.excesos_40_kph ?? 0) + (ultimoMes.excesos_50_kph ?? 0) + (ultimoMes.excesos_60_kph ?? 0) +
        (ultimoMes.excesos_80_kph ?? 0);
      if (excMes === 0) {
        puntaje += P.rec_mes_sin_excesos;
        desglose.push({ factor: 'mes_sin_excesos', puntos: P.rec_mes_sin_excesos });
      }
    }

    // ── Clamp 0..100 ───────────────────────────────────────────────────────────
    puntaje = Math.max(0, Math.min(100, Math.round(puntaje)));

    // ── Semáforo ───────────────────────────────────────────────────────────────
    const umbralOk = P.umbral_ok || 85;
    const umbralAlerta = P.umbral_alerta || 60;
    let semaforo: Semaforo;
    if (detonadores.length > 0 || puntaje < umbralAlerta) semaforo = 'ROJO';
    else if (puntaje < umbralOk) semaforo = 'AMARILLO';
    else semaforo = 'VERDE';

    const fecha_calculo = new Date().toISOString().slice(0, 10);
    const result: PuntajeResult = {
      conductor_id: conductorId,
      conductor_key: key,
      puntaje,
      semaforo,
      detonadores,
      desglose,
      fecha_calculo,
    };

    // 3) Persistir snapshot (upsert por conductor + día)
    if (opts.persist !== false) {
      const { error: errUp } = await supabase
        .from('conductor_scores')
        .upsert(
          {
            conductor_id: conductorId,
            conductor_key: key,
            fecha_calculo,
            puntaje,
            semaforo,
            ventana_dias: ventana,
            detonadores,
            desglose,
          },
          { onConflict: 'conductor_id,fecha_calculo' },
        );
      if (errUp) return { data: result, error: `Calculado pero no persistido: ${errUp.message}` };
    }

    return { data: result };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Recálculo por lote (procesa con concurrencia limitada) ────────────────────

export async function recalcularLote(
  conductorIds: string[],
  onProgress?: (hechos: number, total: number) => void,
  concurrencia = 5,
): Promise<{ ok: number; fallidos: number }> {
  let ok = 0, fallidos = 0, hechos = 0;
  const total = conductorIds.length;
  const cola = [...conductorIds];

  async function worker() {
    while (cola.length > 0) {
      const id = cola.shift();
      if (!id) break;
      const { error } = await calcularPuntaje(id, { persist: true });
      if (error) fallidos++; else ok++;
      hechos++;
      onProgress?.(hechos, total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrencia, total) }, worker));
  return { ok, fallidos };
}
