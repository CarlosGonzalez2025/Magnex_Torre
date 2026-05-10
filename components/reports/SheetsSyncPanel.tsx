/**
 * SheetsSyncPanel
 * Panel de sincronización de maestros (conductores y vehículos) desde Google Sheets.
 * - Auto-sincroniza en segundo plano si han pasado más de 24 horas desde el último sync.
 * - Permite sincronización manual que reemplaza datos obsoletos (soft-delete incluido).
 */

import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, Users, Truck, FileText, Clock } from 'lucide-react';
import {
  sincronizarDesdeSheetsCompleto,
  sincronizarConductores,
  sincronizarVehiculos,
  obtenerUltimaSync,
  SyncResult,
  UltimaSync,
} from '../../services/googleSheetsService';
import { supabase } from '../../services/supabaseClient';

// ── Constantes ────────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas

// Flag de módulo para evitar que dos instancias del panel disparen el auto-sync a la vez
let autoSyncEnCursoGlobal = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (diff < 60_000)      return 'hace un momento';
  if (h === 0)            return `hace ${m} min`;
  if (h < 24)             return `hace ${h}h ${m > 0 ? `${m}m` : ''}`.trim();
  const d = Math.floor(h / 24);
  return `hace ${d} día${d > 1 ? 's' : ''}`;
}

function necesitaSync(ultima: UltimaSync): boolean {
  const ahora = Date.now();
  const check = (ts: string | null) =>
    !ts || (ahora - new Date(ts).getTime()) > SYNC_INTERVAL_MS;
  return check(ultima.conductores) || check(ultima.vehiculos);
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Conteo {
  conductores: number;
  vehiculos: number;
  contratos: number;
}

export const SheetsSyncPanel: React.FC = () => {
  const [syncing, setSyncing]         = useState<'none' | 'all' | 'conductores' | 'vehiculos'>('none');
  const [autoSync, setAutoSync]       = useState(false);
  const [result, setResult]           = useState<SyncResult | null>(null);
  const [conteo, setConteo]           = useState<Conteo>({ conductores: 0, vehiculos: 0, contratos: 0 });
  const [ultimaSync, setUltimaSync]   = useState<UltimaSync>({ conductores: null, vehiculos: null });
  const [expanded, setExpanded]       = useState(false);
  const mountedRef                    = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Carga inicial: conteo + última sync + auto-sync si procede ────────────

  const cargarConteo = async () => {
    const [{ count: c }, { count: v }, { count: ct }] = await Promise.all([
      supabase.from('conductores').select('*', { count: 'exact', head: true }),
      supabase.from('vehiculos').select('*', { count: 'exact', head: true }),
      supabase.from('contratos').select('*', { count: 'exact', head: true }),
    ]);
    if (mountedRef.current) setConteo({ conductores: c ?? 0, vehiculos: v ?? 0, contratos: ct ?? 0 });
  };

  useEffect(() => {
    const init = async () => {
      await cargarConteo();

      const ultima = await obtenerUltimaSync();
      if (!mountedRef.current) return;
      setUltimaSync(ultima);

      // Auto-sync en segundo plano si hace más de 24h
      if (necesitaSync(ultima) && !autoSyncEnCursoGlobal) {
        autoSyncEnCursoGlobal = true;
        setAutoSync(true);
        try {
          const res = await sincronizarDesdeSheetsCompleto();
          if (!mountedRef.current) return;
          setResult(res);
          const nuevaSync = await obtenerUltimaSync();
          if (mountedRef.current) {
            setUltimaSync(nuevaSync);
            await cargarConteo();
          }
        } catch {
          // silencioso — el usuario puede sincronizar manualmente
        } finally {
          autoSyncEnCursoGlobal = false;
          if (mountedRef.current) setAutoSync(false);
        }
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync manual ───────────────────────────────────────────────────────────

  const runSync = async (tipo: 'all' | 'conductores' | 'vehiculos') => {
    setSyncing(tipo);
    setResult(null);
    try {
      let res: SyncResult;
      if (tipo === 'all')          res = await sincronizarDesdeSheetsCompleto();
      else if (tipo === 'conductores') res = await sincronizarConductores();
      else                         res = await sincronizarVehiculos();

      setResult(res);
      const nuevaSync = await obtenerUltimaSync();
      setUltimaSync(nuevaSync);
      await cargarConteo();
    } catch (err: unknown) {
      setResult({
        conductoresSync: 0, vehiculosSync: 0, contratosSync: 0,
        conductoresInactivados: 0, vehiculosInactivados: 0,
        errores: [err instanceof Error ? err.message : String(err)],
        timestamp: new Date().toISOString(),
      });
    } finally {
      setSyncing('none');
    }
  };

  // ── Derivados para la UI ──────────────────────────────────────────────────

  const haySyncEnCurso = syncing !== 'none' || autoSync;
  const sinErrores     = result && result.errores.length === 0;

  // Timestamp más antiguo de los dos (el que determina si está desactualizado)
  const ultimaActualizacion = (() => {
    const ts = [ultimaSync.conductores, ultimaSync.vehiculos].filter(Boolean) as string[];
    if (ts.length === 0) return null;
    return ts.reduce((oldest, t) =>
      new Date(t).getTime() < new Date(oldest).getTime() ? t : oldest
    );
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">

      {/* ── Header siempre visible ── */}
      <button
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center
            ${autoSync ? 'bg-blue-100 dark:bg-blue-950/40' : 'bg-emerald-100 dark:bg-emerald-950/40'}`}>
            <RefreshCw className={`w-4 h-4
              ${autoSync ? 'text-blue-500 animate-spin' : 'text-emerald-600 dark:text-emerald-400'}`} />
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
              Sincronizar Maestros desde Google Sheets
              {autoSync && (
                <span className="text-xs font-normal text-blue-500 dark:text-blue-400">
                  · actualizando automáticamente…
                </span>
              )}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
              {conteo.conductores} conductores · {conteo.vehiculos} vehículos
              {ultimaActualizacion && (
                <>
                  <span className="mx-1">·</span>
                  <Clock className="w-3 h-3 inline" />
                  <span>última sync {formatRelativeTime(ultimaActualizacion)}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <span className="text-slate-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* ── Contenido expandible ── */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-700 space-y-3">

          {/* Indicadores de conteo */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Conductores</p>
                <p className="font-bold text-slate-800 dark:text-slate-200">{conteo.conductores}</p>
                {ultimaSync.conductores && (
                  <p className="text-xs text-slate-400">{formatRelativeTime(ultimaSync.conductores)}</p>
                )}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 flex items-center gap-2">
              <Truck className="w-4 h-4 text-purple-500 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Vehículos</p>
                <p className="font-bold text-slate-800 dark:text-slate-200">{conteo.vehiculos}</p>
                {ultimaSync.vehiculos && (
                  <p className="text-xs text-slate-400">{formatRelativeTime(ultimaSync.vehiculos)}</p>
                )}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Contratos</p>
                <p className="font-bold text-slate-800 dark:text-slate-200">{conteo.contratos}</p>
              </div>
            </div>
          </div>

          {/* Descripción */}
          <div className="text-xs text-slate-500 dark:text-slate-400 bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 space-y-1">
            <p className="font-medium text-blue-700 dark:text-blue-400">¿Cómo funciona?</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>La sincronización ocurre <strong>automáticamente</strong> al abrir la app si han pasado más de 24 horas.</li>
              <li>Los registros eliminados del Sheet se marcan como <strong>INACTIVO</strong> (no se borran para conservar historial).</li>
              <li>Los datos operacionales (Excel Coltrack) se cargan aparte y se cruzan por cédula / placa.</li>
            </ul>
          </div>

          {/* Botones de sincronización manual */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => runSync('all')}
              disabled={haySyncEnCurso}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {syncing === 'all'
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <RefreshCw className="w-4 h-4" />}
              Sincronizar Todo
            </button>
            <button
              onClick={() => runSync('conductores')}
              disabled={haySyncEnCurso}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 text-slate-700 dark:text-slate-300 text-sm transition-colors"
            >
              {syncing === 'conductores'
                ? <div className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                : <Users className="w-3.5 h-3.5" />}
              Solo Conductores
            </button>
            <button
              onClick={() => runSync('vehiculos')}
              disabled={haySyncEnCurso}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 text-slate-700 dark:text-slate-300 text-sm transition-colors"
            >
              {syncing === 'vehiculos'
                ? <div className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                : <Truck className="w-3.5 h-3.5" />}
              Solo Vehículos
            </button>
          </div>

          {/* Resultado */}
          {result && (
            <div className={`rounded-lg p-3 text-sm space-y-1
              ${sinErrores ? 'bg-green-50 dark:bg-green-950/20' : 'bg-amber-50 dark:bg-amber-950/20'}`}>
              <div className="flex items-center gap-2">
                {sinErrores
                  ? <CheckCircle className="w-4 h-4 text-green-600" />
                  : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                <span className={`font-semibold
                  ${sinErrores ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  {sinErrores ? 'Sincronización completada' : 'Sincronización con advertencias'}
                </span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 pl-6 space-y-0.5">
                {result.conductoresSync > 0 && (
                  <p>✓ {result.conductoresSync} conductores actualizados
                    {(result.conductoresInactivados ?? 0) > 0 &&
                      ` · ${result.conductoresInactivados} marcados inactivos`}
                  </p>
                )}
                {result.vehiculosSync > 0 && (
                  <p>✓ {result.vehiculosSync} vehículos actualizados
                    {(result.vehiculosInactivados ?? 0) > 0 &&
                      ` · ${result.vehiculosInactivados} marcados inactivos`}
                  </p>
                )}
                {result.contratosSync > 0 && <p>✓ {result.contratosSync} contratos sincronizados</p>}
                {result.errores.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {result.errores.slice(0, 5).map((e, i) => (
                      <p key={i} className="text-red-600 dark:text-red-400">⚠ {e}</p>
                    ))}
                    {result.errores.length > 5 && (
                      <p className="text-red-500">… y {result.errores.length - 5} errores más</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
