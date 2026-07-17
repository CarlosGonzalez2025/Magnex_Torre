import React, { useEffect, useState, useCallback } from 'react';
import {
  FileUser, Search, ArrowLeft, ShieldCheck, ShieldAlert, ShieldX,
  IdCard, GraduationCap, Gauge, ClipboardCheck,
  AlertTriangle, Clock, Fuel, Activity, Camera, Loader2, RefreshCw,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import { RegistroCampoItem } from './RegistroCampoItem';
import {
  listConductores, listContratos, getHojaDeVida, sincronizarHvDesdeSheet,
  type ConductorListItem, type HojaDeVida as HojaDeVidaData,
  type DocumentoVigencia, type EstadoVigencia,
} from '../services/hojaDeVidaService';
import { sincronizarVerificacionDocumental, sincronizarCapacitaciones } from '../services/documentosService';
import { calcularPuntaje, type Semaforo } from '../services/puntajeService';
import { CarnetDigital, type CarnetData } from './CarnetDigital';
import { IdCard as IdCardIcon, FileDown } from 'lucide-react';
import { generarHojaVidaPdf } from '../services/hojaVidaPdf';
import { descargar } from '../services/carnetExport';

// =====================================================
// Helpers de presentación
// =====================================================

const vigenciaStyle: Record<EstadoVigencia, string> = {
  vigente:    'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  por_vencer: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  vencido:    'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  sin_dato:   'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
};

const vigenciaLabel: Record<EstadoVigencia, string> = {
  vigente: 'Vigente', por_vencer: 'Por vencer', vencido: 'Vencido', sin_dato: 'Sin dato',
};

function DocList({ docs }: { docs: DocumentoVigencia[] }) {
  if (docs.length === 0) {
    return <p className="text-sm text-slate-400">Sin registros.</p>;
  }
  return (
    <div className="space-y-2">
      {docs.map((d, i) => (
        <div key={i} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-700 dark:text-slate-300">{d.etiqueta}</span>
          <div className="flex items-center gap-2">
            {d.fecha && <span className="text-xs text-slate-400">{new Date(d.fecha).toLocaleDateString()}</span>}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${vigenciaStyle[d.estado]}`}>
              {vigenciaLabel[d.estado]}
              {d.estado === 'por_vencer' && d.diasRestantes != null ? ` (${d.diasRestantes}d)` : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertaVenc({ alerta }: { alerta: string | null }) {
  const a = (alerta || '').toLowerCase();
  const cls = a.includes('vencid') ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
    : a.includes('vigente') ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
    : a.includes('vencer') || a.includes('proximo') || a.includes('próximo') ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
    : 'bg-slate-100 dark:bg-slate-700 text-slate-500';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{alerta || 'Sin dato'}</span>;
}

function Section({ title, icon: Icon, children, accent }: {
  title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; accent?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <h3 className={`flex items-center gap-2 font-semibold text-slate-900 dark:text-white mb-4 ${accent ?? ''}`}>
        <Icon className="w-5 h-5" />
        {title}
      </h3>
      {children}
    </div>
  );
}

// Puntaje / semáforo. En Fase 3 aún no se calcula (viene en Fase 4): mostramos
// estado "pendiente" en lugar de inventar un número.
function ScoreCard({ hv }: { hv: HojaDeVidaData }) {
  const s = hv.score;
  if (!s) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-5 flex items-center gap-3">
        <Clock className="w-6 h-6 text-slate-400" />
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-300">Puntaje pendiente de cálculo</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">El motor de puntaje y semáforo se activa en la Fase 4.</p>
        </div>
      </div>
    );
  }
  const semaforo = {
    VERDE:    { icon: ShieldCheck, cls: 'from-green-500 to-emerald-400', label: 'OK' },
    AMARILLO: { icon: ShieldAlert, cls: 'from-amber-500 to-yellow-400', label: 'Alerta' },
    ROJO:     { icon: ShieldX,     cls: 'from-red-500 to-rose-400', label: 'Crítico' },
  }[s.semaforo];
  const Icon = semaforo.icon;
  return (
    <div className={`rounded-xl p-5 text-white bg-gradient-to-br ${semaforo.cls}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-6 h-6" />
          <span className="font-semibold">{semaforo.label}</span>
        </div>
        <span className="text-3xl font-bold">{s.puntaje.toFixed(0)}<span className="text-lg opacity-80">/100</span></span>
      </div>
      {s.detonadores.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {s.detonadores.map((d, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full bg-white/20 text-xs">{d}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================
// Detalle: Hoja de Vida de un conductor
// =====================================================

function DetalleHojaDeVida({ conductorId, onBack }: { conductorId: string; onBack: () => void }) {
  const [hv, setHv] = useState<HojaDeVidaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recalc, setRecalc] = useState(false);
  const [showCarnet, setShowCarnet] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const exportarPdf = async (hvData: HojaDeVidaData) => {
    setExportingPdf(true);
    try {
      const blob = await generarHojaVidaPdf(hvData);
      descargar(`hoja_vida_${hvData.conductor.cedula}`, blob, 'pdf');
    } catch (e) {
      alert('No se pudo generar el PDF: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportingPdf(false);
    }
  };

  const cargarHv = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await getHojaDeVida(conductorId);
    if (err) setError(err);
    else setHv(data);
    setLoading(false);
  }, [conductorId]);

  const recalcularPuntaje = async () => {
    setRecalc(true);
    const { data, error: err } = await calcularPuntaje(conductorId, { persist: true });
    if (data) {
      setHv(prev => prev ? {
        ...prev,
        score: {
          puntaje: data.puntaje,
          semaforo: data.semaforo,
          detonadores: data.detonadores,
          desglose: data.desglose,
          fecha_calculo: data.fecha_calculo,
        },
      } : prev);
    } else if (err) {
      setError(err);
    }
    setRecalc(false);
  };

  useEffect(() => { cargarHv(); }, [cargarHv]);

  // Cálculo automático del puntaje al abrir si aún no existe snapshot.
  useEffect(() => {
    if (hv && !hv.score && !recalc) recalcularPuntaje();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hv]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }
  if (error || !hv) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p className="text-slate-600 dark:text-slate-300">{error || 'No se pudo cargar la hoja de vida.'}</p>
        <button onClick={onBack} className="mt-4 text-blue-600 hover:underline">Volver</button>
      </div>
    );
  }

  const c = hv.conductor;
  const initials = (c.nombres || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600">
          <ArrowLeft className="w-4 h-4" /> Volver al listado
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportarPdf(hv)}
            disabled={exportingPdf}
            className="flex items-center gap-2 text-sm px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg disabled:opacity-50"
          >
            {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Exportar PDF
          </button>
          <button
            onClick={() => setShowCarnet(true)}
            className="flex items-center gap-2 text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            <IdCardIcon className="w-4 h-4" /> Ver carnet / QR
          </button>
        </div>
      </div>

      {/* Cabecera identidad */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col sm:flex-row gap-5 sm:items-center">
        <div className="flex items-center gap-4">
          {c.foto_url ? (
            <img src={c.foto_url} alt={c.nombres} className="w-20 h-20 rounded-2xl object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-bold text-2xl">
              {initials}
            </div>
          )}
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{c.nombres}</h2>
            <p className="text-slate-500 dark:text-slate-400">CC {c.cedula}</p>
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              {c.cargo && <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{c.cargo}</span>}
              {c.proyecto && <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{c.proyecto}</span>}
              {c.estado && <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{c.estado}</span>}
              {c.ibutton ? (
                <span className="px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">iButton ✓</span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">Sin iButton</span>
              )}
            </div>
          </div>
        </div>
        <div className="sm:ml-auto sm:w-72 space-y-2">
          <ScoreCard hv={hv} />
          <button
            onClick={recalcularPuntaje}
            disabled={recalc}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {recalc ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {hv.score ? 'Actualizar puntaje' : 'Calcular puntaje'}
          </button>
          {hv.score && hv.score.desglose.length > 0 && (
            <details className="text-xs bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 p-2">
              <summary className="cursor-pointer text-slate-600 dark:text-slate-400">Desglose del puntaje</summary>
              <ul className="mt-2 space-y-1">
                {hv.score.desglose.map((d, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="text-slate-600 dark:text-slate-400">{d.factor}{d.cantidad ? ` ×${d.cantidad}` : ''}</span>
                    <span className={(d.puntos ?? 0) < 0 ? 'text-red-600' : 'text-green-600'}>{d.puntos > 0 ? '+' : ''}{d.puntos}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Licencias — desde verificación documental (fallback a la base) */}
        <Section title="Licencias de conducción" icon={IdCard}>
          {hv.verificacion && hv.verificacion.licencias.length > 0 ? (
            <>
              <p className="text-xs text-slate-400 mb-2">
                Verificado {hv.verificacion.fecha_validacion ? new Date(hv.verificacion.fecha_validacion).toLocaleDateString() : '—'}
                {hv.verificacion.link_runt && <> · <a href={hv.verificacion.link_runt} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">RUNT</a></>}
              </p>
              <div className="space-y-2">
                {hv.verificacion.licencias.map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-700 dark:text-slate-300">{l.tipo}{l.categoria ? ` · ${l.categoria}` : ''}</span>
                    <div className="flex items-center gap-2">
                      {l.fecha_venc && <span className="text-xs text-slate-400">{new Date(l.fecha_venc).toLocaleDateString()}</span>}
                      <AlertaVenc alerta={l.alerta} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Tipo: {c.tipo_licencia || '—'} <span className="text-xs text-amber-500">(sin verificación documental)</span></p>
              <DocList docs={hv.licencias} />
            </>
          )}
        </Section>

        {/* Capacitaciones — Manejo Defensivo (fuente viva) */}
        <Section title="Capacitaciones — Manejo Defensivo" icon={GraduationCap}>
          {hv.capacitacionesMD.total === 0 ? (
            <p className="text-sm text-slate-400">Sin certificados de manejo defensivo registrados.</p>
          ) : (
            <>
              {hv.capacitacionesMD.proximo_vencimiento && (
                <div className={`mb-3 p-3 rounded-lg text-sm ${
                  hv.capacitacionesMD.proximo_vencimiento.vencida
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                    : (hv.capacitacionesMD.proximo_vencimiento.dias_para_vencer ?? 999) <= 30
                      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                      : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                }`}>
                  <span className="font-semibold">Vencimiento vigente más próximo: </span>
                  {hv.capacitacionesMD.proximo_vencimiento.fecha_vencimiento
                    ? new Date(hv.capacitacionesMD.proximo_vencimiento.fecha_vencimiento).toLocaleDateString()
                    : '—'}
                  {hv.capacitacionesMD.proximo_vencimiento.vencida
                    ? ' · VENCIDA'
                    : hv.capacitacionesMD.proximo_vencimiento.dias_para_vencer != null
                      ? ` · en ${hv.capacitacionesMD.proximo_vencimiento.dias_para_vencer} días`
                      : ''}
                </div>
              )}
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {hv.capacitacionesMD.intervenciones.map((cap, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm border-b border-slate-100 dark:border-slate-700/50 pb-1">
                    <div className="min-w-0">
                      <p className="text-slate-700 dark:text-slate-300 truncate">{cap.vehiculo || cap.tipo || 'Certificado'}</p>
                      <p className="text-xs text-slate-400">
                        Cert: {cap.fecha_certificado ? new Date(cap.fecha_certificado).toLocaleDateString() : '—'} · Vence: {cap.fecha_vencimiento ? new Date(cap.fecha_vencimiento).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {cap.link_certificado && <a href={cap.link_certificado} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Cert</a>}
                      {cap.link_certificado_ayg && <a href={cap.link_certificado_ayg} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">AYG</a>}
                      <span className={`px-1.5 py-0.5 rounded text-xs ${cap.vencida ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-green-100 dark:bg-green-900/30 text-green-600'}`}>
                        {cap.vencida ? 'Vencida' : 'Vigente'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>

        {/* Otras capacitaciones y competencias (base) */}
        <Section title="Otras capacitaciones y competencias" icon={GraduationCap}>
          <DocList docs={hv.capacitaciones} />
        </Section>

        {/* SIMIT / Comparendos — desde verificación documental (fallback a la base) */}
        <Section title="SIMIT / Comparendos" icon={AlertTriangle} accent={(hv.verificacion ? hv.verificacion.numero_comparendos > 0 : hv.simit.tiene_comparendo) ? 'text-red-600' : ''}>
          {hv.verificacion ? (
            <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
              <p>Validado: {hv.verificacion.fecha_validacion ? new Date(hv.verificacion.fecha_validacion).toLocaleDateString() : '—'}
                {hv.verificacion.link_simit && <> · <a href={hv.verificacion.link_simit} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Evidencia SIMIT</a></>}
              </p>
              <p>Comparendos: <span className="font-semibold">{hv.verificacion.numero_comparendos}</span> · Valor: ${hv.verificacion.valor_comparendos.toLocaleString()}</p>
              {hv.verificacion.acuerdos_pago && <p>Acuerdos de pago: {hv.verificacion.acuerdos_pago}{hv.verificacion.estado_acuerdos ? ` (${hv.verificacion.estado_acuerdos})` : ''}</p>}
              {hv.verificacion.comparendos.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {hv.verificacion.comparendos.map((cp, i) => (
                    <li key={i} className="text-xs text-slate-500 dark:text-slate-400">• {cp.fecha || '—'} {cp.codigo || ''} {cp.descripcion || ''}</li>
                  ))}
                </ul>
              )}
              {hv.verificacion.numero_comparendos > 0 && (
                <p className="mt-2 inline-flex items-center gap-1 text-red-600 font-medium"><ShieldX className="w-4 h-4" /> Detonador crítico potencial</p>
              )}
            </div>
          ) : (
            <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
              <p className="text-xs text-amber-500">Sin verificación documental — datos de la base:</p>
              <p>Última revisión SIMIT: {hv.simit.fecha_revision ? new Date(hv.simit.fecha_revision).toLocaleDateString() : '—'}</p>
              <p>Tipo de comparendo: {hv.simit.tipo_comparendo || 'Ninguno'}</p>
              <p>Valor: ${hv.simit.valor_comparendo.toLocaleString()}</p>
            </div>
          )}
        </Section>

        {/* Riesgo ML (complementario) */}
        <Section title="Riesgo relativo (ML — referencial)" icon={Activity}>
          {hv.mlRiesgo ? (
            <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
              <p>Nivel: <span className="font-semibold">{hv.mlRiesgo.risk_nivel}</span></p>
              <p>Score de riesgo: {hv.mlRiesgo.risk_score.toFixed(1)} <span className="text-xs text-slate-400">(100 = mayor riesgo, escala inversa al puntaje)</span></p>
              <p>Tendencia: {hv.mlRiesgo.tendencia}</p>
              <p className="text-xs text-slate-400">Calculado {new Date(hv.mlRiesgo.fecha_calculo).toLocaleDateString()}. Indicador complementario, no es el puntaje del carnet.</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Sin cálculo de riesgo ML para este conductor.</p>
          )}
        </Section>

        {/* Desempeño mensual */}
        <Section title="Desempeño mensual" icon={Gauge}>
          {hv.desempenoMensual.length === 0 ? (
            <p className="text-sm text-slate-400">Sin informes mensuales.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 pr-3">Periodo</th>
                    <th className="py-2 pr-3">Calif.</th>
                    <th className="py-2 pr-3">Excesos</th>
                    <th className="py-2 pr-3">Frenadas</th>
                    <th className="py-2">Kms</th>
                  </tr>
                </thead>
                <tbody>
                  {hv.desempenoMensual.slice(0, 6).map((m, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50">
                      <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{new Date(m.periodo_fin).toLocaleDateString()}</td>
                      <td className="py-2 pr-3">{m.calificacion ?? '—'}</td>
                      <td className="py-2 pr-3">{m.excesos_total}</td>
                      <td className="py-2 pr-3">{m.frenadas_bruscas}</td>
                      <td className="py-2">{m.kms != null ? Math.round(m.kms) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Alertas + ralentí */}
        <Section title="Alertas y telemetría (últimos 90 días)" icon={Gauge}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Excesos graves" value={hv.resumenAlertas.excesos_graves} danger={hv.resumenAlertas.excesos_graves > 0} />
            <Metric label="Excesos moderados" value={hv.resumenAlertas.excesos_moderados} />
            <Metric label="Frenadas bruscas" value={hv.resumenAlertas.frenadas_bruscas} />
            <Metric label="Velocidad máx." value={`${hv.resumenAlertas.velocidad_max} km/h`} />
            <div className="col-span-2 flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <Fuel className="w-4 h-4" /> Eventos de ralentí (histórico): <span className="font-semibold">{hv.ralentiEventos}</span>
            </div>
          </div>
        </Section>

        {/* Inspecciones */}
        <Section title="Inspecciones preoperacionales" icon={ClipboardCheck}>
          {hv.inspecciones.length === 0 ? (
            <p className="text-sm text-slate-400">Sin inspecciones asociadas (vínculo por nombre — aproximado).</p>
          ) : (
            <div className="space-y-2 text-sm">
              {hv.inspecciones.slice(0, 8).map((ins, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300">{new Date(ins.fecha).toLocaleDateString()} · {ins.placa}</span>
                  <span className="text-slate-500">{ins.status} ({ins.findings})</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Registros de campo (QR) — con notas de seguimiento */}
        <Section title="Registros de campo (QR)" icon={Camera}>
          {hv.registrosCampo.length === 0 ? (
            <p className="text-sm text-slate-400">Sin registros de comportamiento en campo.</p>
          ) : (
            <div className="space-y-3 text-sm">
              {hv.registrosCampo.slice(0, 12).map((r) => (
                <RegistroCampoItem key={r.id} registro={r} />
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Timeline unificado */}
      <Section title="Línea de tiempo de eventos" icon={Clock}>
        {hv.timeline.length === 0 ? (
          <p className="text-sm text-slate-400">Sin eventos recientes.</p>
        ) : (
          <div className="space-y-2">
            {hv.timeline.map((ev, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-xs text-slate-400 w-28 shrink-0">{new Date(ev.fecha).toLocaleDateString()}</span>
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                  ev.severidad === 'critico' ? 'bg-red-600' :
                  ev.severidad === 'grave' ? 'bg-orange-500' :
                  ev.severidad === 'leve' ? 'bg-amber-400' : 'bg-slate-400'
                }`} />
                <div>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{ev.tipo}</span>
                  <span className="text-slate-500 dark:text-slate-400"> — {ev.detalle}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {showCarnet && (
        <CarnetDigital
          data={{
            conductorId: c.id,
            nombres: c.nombres,
            cedula: c.cedula,
            cargo: c.cargo,
            proyecto: c.proyecto,
            estado: c.estado,
            fotoUrl: c.foto_url,
            tieneIbutton: !!(c.ibutton && String(c.ibutton).trim()),
            carnetToken: (c.carnet_token as string | null | undefined) ?? null,
            tipoLicencia: c.tipo_licencia ?? null,
            puntaje: hv.score ? hv.score.puntaje : null,
            semaforo: hv.score ? (hv.score.semaforo as Semaforo) : null,
            detonadores: hv.score ? hv.score.detonadores : [],
            licencias: hv.verificacion
              ? hv.verificacion.licencias.map(l => ({ tipo: l.tipo, categoria: l.categoria, fecha_venc: l.fecha_venc, estado: l.alerta }))
              : hv.licencias.map(l => ({
                  tipo: l.etiqueta, categoria: null, fecha_venc: l.fecha,
                  estado: l.estado === 'vigente' ? 'Vigente' : l.estado === 'vencido' ? 'Vencido' : l.estado === 'por_vencer' ? 'Por vencer' : null,
                })),
          } satisfies CarnetData}
          onClose={() => setShowCarnet(false)}
          onRegistered={cargarHv}
        />
      )}
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${danger ? 'bg-red-50 dark:bg-red-900/20' : 'bg-slate-50 dark:bg-slate-700/40'}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-lg font-bold ${danger ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>{value}</p>
    </div>
  );
}

// =====================================================
// Listado + buscador
// =====================================================

const PAGE_SIZE_OPTS = [10, 25, 50, 100];

function EstadoBadge({ estado, enSheet }: { estado?: string | null; enSheet?: boolean }) {
  if (enSheet === false) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">Retirado del Sheet</span>;
  }
  const activo = (estado ?? '').toUpperCase() !== 'INACTIVO';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      activo
        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
    }`}>
      {estado || 'ACTIVO'}
    </span>
  );
}

export const HojaDeVida: React.FC = () => {
  const [items, setItems] = useState<ConductorListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);
  const [proyecto, setProyecto] = useState('');
  const [incluirRetirados, setIncluirRetirados] = useState(false);
  const [contratos, setContratos] = useState<string[]>([]);

  // Sincronización desde Sheets
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Paginación
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => { listContratos().then(setContratos); }, []);

  // Cualquier cambio de filtro vuelve a la página 1
  useEffect(() => { setPage(1); }, [search, soloActivos, proyecto, incluirRetirados, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, total } = await listConductores({ search, soloActivos, proyecto, incluirRetirados, page, pageSize });
    setItems(data);
    setTotal(total);
    setLoading(false);
  }, [search, soloActivos, proyecto, incluirRetirados, page, pageSize]);

  const sincronizar = async () => {
    setSyncing(true);
    setSyncMsg('Sincronizando conductores…');
    const r = await sincronizarHvDesdeSheet();
    if (!r.success) { setSyncMsg(`Error (conductores): ${r.error || 'falló'}`); setSyncing(false); return; }

    setSyncMsg('Sincronizando verificación documental…');
    const v = await sincronizarVerificacionDocumental();

    setSyncMsg('Sincronizando capacitaciones…');
    const cap = await sincronizarCapacitaciones();

    const partes = [
      `✓ ${r.sincronizados} conductores (${r.conPuente} c/telemetría)`,
      v.success ? `${v.procesados} verificaciones` : `verif: ${v.error}`,
      cap.success ? `${cap.procesados} capacitaciones` : `capac: ${cap.error}`,
    ];
    setSyncMsg(partes.join(' · '));
    listContratos().then(setContratos);
    load();
    setSyncing(false);
  };

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce
    return () => clearTimeout(t);
  }, [load]);

  if (selected) {
    return <DetalleHojaDeVida conductorId={selected} onBack={() => setSelected(null)} />;
  }

  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);

  const selectCls = 'px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white text-sm';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileUser className="w-7 h-7 text-blue-600" />
            Hoja de Vida del Conductor
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Expediente consolidado: identidad, documentos, desempeño, alertas, EPP y registros de campo.
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1">
          <button
            onClick={sincronizar}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {syncing ? 'Sincronizando…' : 'Sincronizar desde Sheets'}
          </button>
          {syncMsg && <span className="text-xs text-slate-500 dark:text-slate-400 max-w-xs text-right">{syncMsg}</span>}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o cédula..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder-slate-400 text-sm"
          />
        </div>
        <select value={proyecto} onChange={(e) => setProyecto(e.target.value)} className={selectCls}>
          <option value="">Todos los contratos</option>
          {contratos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 px-1 whitespace-nowrap">
          <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} className="rounded" />
          Solo activos
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 px-1 whitespace-nowrap">
          <input type="checkbox" checked={incluirRetirados} onChange={(e) => setIncluirRetirados(e.target.checked)} className="rounded" />
          Incluir retirados
        </label>
      </div>

      {/* Datatable */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                <th className="py-3 px-4 font-semibold">Conductor</th>
                <th className="py-3 px-4 font-semibold hidden md:table-cell">Contrato</th>
                <th className="py-3 px-4 font-semibold hidden sm:table-cell">Cargo</th>
                <th className="py-3 px-4 font-semibold">Estado</th>
                <th className="py-3 px-4 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-blue-600 mx-auto" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-slate-500 dark:text-slate-400">No se encontraron conductores con esos filtros.</td></tr>
              ) : (
                items.map((c) => {
                  const initials = (c.nombres || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('');
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelected(c.id)}
                      className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer"
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          {c.foto_url ? (
                            <img src={c.foto_url} alt={c.nombres} className="w-9 h-9 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-bold text-xs shrink-0">{initials}</div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white truncate max-w-[220px]">{c.nombres}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">CC {c.cedula}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 hidden md:table-cell truncate max-w-[180px]">{c.proyecto || '—'}</td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 hidden sm:table-cell truncate max-w-[160px]">{c.cargo || '—'}</td>
                      <td className="py-2.5 px-4"><EstadoBadge estado={c.estado} enSheet={c.en_sheet} /></td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">Ver →</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación (dark-aware) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <span>Mostrar</span>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200">
              {PAGE_SIZE_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span>por página</span>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {desde}–{hasta} de <span className="font-semibold text-slate-900 dark:text-white">{total}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={page <= 1} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40" title="Primera"><ChevronsLeft className="w-4 h-4" /></button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40" title="Anterior"><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-3 text-sm text-slate-700 dark:text-slate-300">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40" title="Siguiente"><ChevronRight className="w-4 h-4" /></button>
            <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40" title="Última"><ChevronsRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HojaDeVida;
