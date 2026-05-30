/**
 * SheetsSyncPanel
 * Panel de sincronización de maestros (conductores y vehículos) desde Google Sheets.
 * - Auto-sincroniza en segundo plano si han pasado más de 24 horas desde el último sync.
 * - Permite sincronización manual que reemplaza datos obsoletos (soft-delete incluido).
 */

import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, Users, Truck, FileText, Clock, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
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
  const [pendingDrivers, setPendingDrivers]   = useState<any[]>([]);
  const [pendingVehicles, setPendingVehicles] = useState<any[]>([]);
  const [expanded, setExpanded]       = useState(false);
  const mountedRef                    = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Carga inicial: conteo + última sync + auto-sync si procede ────────────

  const cargarPendientes = async () => {
    try {
      const { data: dPending } = await supabase
        .from('conductores')
        .select('id, nombres, cedula, ibutton')
        .eq('proyecto', 'PENDIENTE GOOGLE SHEETS');
      
      const { data: vPending } = await supabase
        .from('vehiculos')
        .select('id, placa, cliente')
        .eq('cliente', 'PENDIENTE GOOGLE SHEETS');

      // Obtener KMs para conductores pendientes
      const driverIds = (dPending ?? []).map(d => d.id);
      const driverKmsMap: Record<string, number> = {};
      if (driverIds.length > 0) {
        const { data: dKms } = await supabase
          .from('coltrack_datos_conductor')
          .select('conductor_id, kms')
          .in('conductor_id', driverIds);
        
        if (dKms) {
          dKms.forEach(row => {
            const id = row.conductor_id;
            driverKmsMap[id] = (driverKmsMap[id] || 0) + Number(row.kms || 0);
          });
        }
      }

      // Obtener KMs para vehículos pendientes
      const vehicleIds = (vPending ?? []).map(v => v.id);
      const vehicleKmsMap: Record<string, number> = {};
      if (vehicleIds.length > 0) {
        const { data: vKms } = await supabase
          .from('coltrack_datos_vehiculo')
          .select('vehiculo_id, kms')
          .in('vehiculo_id', vehicleIds);
        
        if (vKms) {
          vKms.forEach(row => {
            const id = row.vehiculo_id;
            vehicleKmsMap[id] = (vehicleKmsMap[id] || 0) + Number(row.kms || 0);
          });
        }
      }

      const driversWithKms = (dPending ?? []).map(c => ({
        ...c,
        kms: driverKmsMap[c.id] || 0
      }));

      const vehiclesWithKms = (vPending ?? []).map(v => ({
        ...v,
        kms: vehicleKmsMap[v.id] || 0
      }));

      if (mountedRef.current) {
        setPendingDrivers(driversWithKms);
        setPendingVehicles(vehiclesWithKms);
      }
    } catch (err) {
      console.error('Error al cargar pendientes de Google Sheets:', err);
    }
  };

  const descargarExcelPendientes = () => {
    try {
      const wb = XLSX.utils.book_new();

      const dataConductores = pendingDrivers.map(c => ({
        'Nombre Conductor': c.nombres,
        'Cédula': c.cedula,
        'iButton': c.ibutton || 'Sin asignar',
        'KM Recorridos (Plataforma)': Number(c.kms || 0)
      }));

      const dataVehiculos = pendingVehicles.map(v => ({
        'Placa': v.placa,
        'KM Recorridos (Plataforma)': Number(v.kms || 0),
        'Estado': 'Pendiente en Google Sheets'
      }));

      if (dataConductores.length > 0) {
        const wsCond = XLSX.utils.json_to_sheet(dataConductores);
        XLSX.utils.book_append_sheet(wb, wsCond, 'Conductores Pendientes');
      }

      if (dataVehiculos.length > 0) {
        const wsVeh = XLSX.utils.json_to_sheet(dataVehiculos);
        XLSX.utils.book_append_sheet(wb, wsVeh, 'Vehículos Pendientes');
      }

      XLSX.writeFile(wb, `registros_pendientes_sheets_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Error al generar Excel de pendientes:', err);
      alert('Error generando el archivo de Excel.');
    }
  };

  const cargarConteo = async () => {
    const [{ count: c }, { count: v }, { count: ct }] = await Promise.all([
      supabase.from('conductores').select('*', { count: 'exact', head: true }).eq('estado', 'ACTIVO'),
      supabase.from('vehiculos').select('*', { count: 'exact', head: true }).eq('estado', 'ACTIVO'),
      supabase.from('contratos').select('*', { count: 'exact', head: true }),
    ]);
    if (mountedRef.current) setConteo({ conductores: c ?? 0, vehiculos: v ?? 0, contratos: ct ?? 0 });
    await cargarPendientes();
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

          {/* ── Registros Pendientes en Google Sheets ── */}
          {(pendingDrivers.length > 0 || pendingVehicles.length > 0) && (
            <div className="border-t border-slate-100 dark:border-slate-700 pt-3.5 mt-3 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5 text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Registros pendientes de Google Sheets ({pendingDrivers.length + pendingVehicles.length})
                </p>
                <button
                  onClick={descargarExcelPendientes}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold transition-all shadow-sm"
                  title="Descargar listado en formato Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Descargar Excel</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Estos registros se crearon provisionalmente durante el procesamiento de archivos planos satelitales. Para normalizarlos, agrégalos en tu hoja principal de Google Sheets y haz clic en <strong>Sincronizar Todo</strong>.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Conductores Pendientes */}
                {pendingDrivers.length > 0 && (
                  <div className="bg-amber-500/5 dark:bg-amber-500/10 rounded-xl border border-amber-500/20 p-3 space-y-2">
                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex justify-between items-center">
                      <span>👤 Conductores ({pendingDrivers.length})</span>
                    </p>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 divide-y divide-amber-500/10 dark:divide-amber-500/20">
                      {pendingDrivers.map((c) => (
                        <div key={c.id} className="text-xs pt-1.5 first:pt-0">
                          <p className="font-semibold text-slate-700 dark:text-slate-300">{c.nombres}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center flex-wrap gap-1.5 mt-0.5">
                            <span>CC:</span>
                            <code className="bg-slate-100 dark:bg-slate-950 px-1 py-0.5 rounded font-mono font-bold text-[9px] text-slate-700 dark:text-slate-300">{c.cedula}</code>
                            {c.ibutton && (
                              <>
                                <span>iButton:</span>
                                <code className="bg-slate-100 dark:bg-slate-950 px-1 py-0.5 rounded font-mono text-[9px] text-slate-700 dark:text-slate-300">{c.ibutton}</code>
                              </>
                            )}
                            <span className="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold text-[9px]">
                              KM: {(c.kms || 0).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km
                            </span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Vehículos Pendientes */}
                {pendingVehicles.length > 0 && (
                  <div className="bg-amber-500/5 dark:bg-amber-500/10 rounded-xl border border-amber-500/20 p-3 space-y-2">
                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                      <span>🚘 Vehículos ({pendingVehicles.length})</span>
                    </p>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 divide-y divide-amber-500/10 dark:divide-amber-500/20">
                      {pendingVehicles.map((v) => (
                        <div key={v.id} className="text-xs pt-1.5 first:pt-0">
                          <p className="font-semibold text-slate-700 dark:text-slate-300">
                            Placa: <code className="bg-slate-105 dark:bg-slate-950 px-1.5 py-0.5 rounded font-bold font-mono text-[10px] text-amber-700 dark:text-amber-400">{v.placa}</code>
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center flex-wrap gap-2 mt-0.5">
                            <span>Estado: Pendiente Sincronización Maestro</span>
                            <span className="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold text-[9px]">
                              KM: {(v.kms || 0).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km
                            </span>
                          </p>
                        </div>
                      ))}
                    </div>
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
