import React, { useState } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { X, ShieldCheck, ShieldAlert, ShieldX, Download, ClipboardPlus, Image as ImageIcon, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { puedeRegistrarCampo } from '../services/registroCampoService';
import { RegistroCampoForm } from './RegistroCampoForm';
import { renderCarnetPNG, carnetPdfBlob, descargar } from '../services/carnetExport';
import type { Semaforo } from '../services/puntajeService';

export const semaforoMeta: Record<Semaforo, { icon: React.ComponentType<{ className?: string }>; grad: string; label: string }> = {
  VERDE:    { icon: ShieldCheck, grad: 'from-green-500 to-emerald-400', label: 'OK' },
  AMARILLO: { icon: ShieldAlert, grad: 'from-amber-500 to-yellow-400', label: 'Alerta' },
  ROJO:     { icon: ShieldX,     grad: 'from-red-500 to-rose-400', label: 'Crítico' },
};

export interface CarnetLic { tipo: string; categoria: string | null; fecha_venc: string | null; estado: string | null }

export interface CarnetData {
  conductorId: string;
  nombres: string;
  cedula: string;
  cargo?: string | null;
  proyecto?: string | null;
  estado?: string | null;
  fotoUrl?: string | null;
  tieneIbutton: boolean;
  carnetToken?: string | null;
  tipoLicencia?: string | null;
  puntaje: number | null;
  semaforo: Semaforo | null;
  detonadores: string[];
  licencias?: CarnetLic[];
}

// Velocímetro SVG (medidor de estado): zonas rojo/ámbar/verde + aguja + número.
export function GaugeSVG({ puntaje, size = 150 }: { puntaje: number | null; size?: number }) {
  const p = Math.max(0, Math.min(100, puntaje ?? 0));
  const cx = size / 2, cy = size / 2, r = size / 2 - 14;
  const pol = (val: number, rad: number) => {
    const a = Math.PI + (val / 100) * Math.PI;
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
  };
  const arcPath = (a: number, b: number) => {
    const [x1, y1] = pol(a, r); const [x2, y2] = pol(b, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const [nx, ny] = pol(p, r - 10);
  return (
    <svg width={size} height={size / 2 + 30} viewBox={`0 0 ${size} ${size / 2 + 30}`}>
      <path d={arcPath(0, 100)} fill="none" stroke="#e2e8f0" strokeWidth={12} strokeLinecap="round" />
      <path d={arcPath(0, 60)} fill="none" stroke="#dc2626" strokeWidth={12} />
      <path d={arcPath(60, 85)} fill="none" stroke="#f59e0b" strokeWidth={12} />
      <path d={arcPath(85, 100)} fill="none" stroke="#16a34a" strokeWidth={12} />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#0f172a" strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={5} fill="#0f172a" />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={26} fontWeight="bold" fill="currentColor">{puntaje != null ? puntaje : '—'}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={12} fill="#94a3b8">/ 100</text>
    </svg>
  );
}

interface Props {
  data: CarnetData;
  onClose: () => void;
  onRegistered?: () => void;
}

function carnetUrl(token?: string | null): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/?carnet=${token ?? ''}`;
}

export const CarnetDigital: React.FC<Props> = ({ data, onClose, onRegistered }) => {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null);
  const canRegister = puedeRegistrarCampo(user);

  const exportar = async (tipo: 'png' | 'pdf') => {
    setExporting(tipo);
    try {
      const qrCanvas = document.getElementById('carnet-qr-canvas') as HTMLCanvasElement | null;
      const png = await renderCarnetPNG({
        nombres: data.nombres, cedula: data.cedula, cargo: data.cargo, proyecto: data.proyecto,
        fotoUrl: data.fotoUrl, tieneIbutton: data.tieneIbutton,
        tipoLicencia: data.tipoLicencia, licencias: data.licencias,
      }, qrCanvas);
      if (tipo === 'png') {
        descargar(`carnet_${data.cedula}`, png, 'png');
      } else {
        const blob = await carnetPdfBlob(png);
        descargar(`carnet_${data.cedula}`, blob, 'pdf');
      }
    } catch (e) {
      alert('No se pudo generar el carnet: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(null);
    }
  };

  const sem = data.semaforo ? semaforoMeta[data.semaforo] : null;
  const SemIcon = sem?.icon;
  const url = carnetUrl(data.carnetToken);
  const initials = (data.nombres || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('');

  const descargarQR = () => {
    const svg = document.getElementById('carnet-qr-svg');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `carnet_${data.cedula}.svg`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Franja del logo */}
        <div className="flex items-center justify-center py-2 bg-white border-b border-slate-100">
          <img src="/logo.png" alt="Magnex" className="h-6 object-contain" />
        </div>
        {/* Cabecera con semáforo */}
        <div className={`p-5 text-white bg-gradient-to-br ${sem?.grad ?? 'from-slate-500 to-slate-400'} relative`}>
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-4">
            {data.fotoUrl ? (
              <img src={data.fotoUrl} alt={data.nombres} className="w-16 h-16 rounded-2xl object-cover border-2 border-white/50" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center font-bold text-xl">{initials}</div>
            )}
            <div className="min-w-0">
              <h3 className="text-lg font-bold leading-tight truncate">{data.nombres}</h3>
              <p className="text-white/80 text-sm">CC {data.cedula}</p>
              {data.cargo && <p className="text-white/70 text-xs truncate">{data.cargo}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-4">
            {SemIcon && <SemIcon className="w-5 h-5" />}
            <span className="font-semibold">{sem?.label ?? 'Sin puntaje'}</span>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="p-5 space-y-4">
          {/* Velocímetro del puntaje */}
          <div className="flex flex-col items-center -mt-1 text-slate-900 dark:text-white">
            <GaugeSVG puntaje={data.puntaje} size={168} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {data.proyecto && <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{data.proyecto}</span>}
            {data.estado && <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{data.estado}</span>}
            <span className={`px-2 py-0.5 rounded ${data.tieneIbutton ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
              {data.tieneIbutton ? 'iButton ✓' : 'Sin iButton'}
            </span>
          </div>

          {data.detonadores.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.detonadores.map((d, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs">⚠ {d}</span>
              ))}
            </div>
          )}

          {/* Licencias */}
          {data.licencias && data.licencias.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Licencias</p>
              {data.licencias.map((l, i) => {
                const s = (l.estado || '').toLowerCase();
                const cls = s.includes('vencid') ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  : s.includes('vigente') ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400';
                return (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-700 dark:text-slate-300">{l.tipo}{l.categoria ? ` · ${l.categoria}` : ''}</span>
                    <div className="flex items-center gap-2">
                      {l.fecha_venc && <span className="text-xs text-slate-400">{new Date(l.fecha_venc).toLocaleDateString()}</span>}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{l.estado || '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* QR */}
          <div className="flex flex-col items-center gap-2 pt-2">
            <div className="p-3 bg-white rounded-xl border border-slate-200">
              <QRCodeSVG id="carnet-qr-svg" value={url} size={148} level="M" includeMargin />
            </div>
            {/* Canvas oculto en alta resolución: fuente del QR para exportar */}
            <QRCodeCanvas id="carnet-qr-canvas" value={url} size={300} level="M" includeMargin style={{ display: 'none' }} />
            <p className="text-xs text-slate-400 text-center">Escanea para ver el carnet · el QR solo contiene un token opaco</p>
            <div className="flex items-center gap-2">
              <button onClick={descargarQR} className="flex items-center gap-1.5 text-xs text-slate-500 hover:underline">
                <Download className="w-3.5 h-3.5" /> Solo QR
              </button>
            </div>
          </div>

          {/* Descargar carnet para imprimir (físico, perforable) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => exportar('png')}
              disabled={exporting !== null}
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg disabled:opacity-50"
            >
              {exporting === 'png' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />} Imagen
            </button>
            <button
              onClick={() => exportar('pdf')}
              disabled={exporting !== null}
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} PDF
            </button>
          </div>

          {canRegister && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium"
            >
              <ClipboardPlus className="w-4 h-4" /> Registrar comportamiento
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <RegistroCampoForm
          conductorId={data.conductorId}
          conductorNombre={data.nombres}
          onClose={() => setShowForm(false)}
          onRegistered={onRegistered}
        />
      )}
    </div>
  );
};

export default CarnetDigital;
