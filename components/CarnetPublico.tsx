import React, { useEffect, useState } from 'react';
import { Loader2, ClipboardPlus, LogIn, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { puedeRegistrarCampo } from '../services/registroCampoService';
import { RegistroCampoForm } from './RegistroCampoForm';
import { semaforoMeta, GaugeSVG } from './CarnetDigital';
import type { Semaforo } from '../services/puntajeService';

interface CarnetPublicoData {
  conductor_id: string;
  nombres: string;
  cedula_masked: string;
  cargo: string | null;
  proyecto: string | null;
  estado: string | null;
  foto_url: string | null;
  tiene_ibutton: boolean;
  puntaje: number | null;
  semaforo: Semaforo | null;
  detonadores: string[];
  fecha_calculo: string | null;
  registros_campo: number;
}

/**
 * Vista pública del carnet al escanear el QR. Resuelve el token contra
 * /api/carnet (server-side, datos mínimos). Solo un supervisor AUTENTICADO
 * con permiso puede registrar un comportamiento; el resto es solo lectura.
 */
export const CarnetPublico: React.FC<{ token: string }> = ({ token }) => {
  const { user, isAuthenticated } = useAuth();
  const [data, setData] = useState<CarnetPublicoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const apiBase = (import.meta as any).env?.VITE_API_BASE ?? '';
      const res = await fetch(`${apiBase}/api/carnet?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo cargar el carnet.');
      setData(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  const canRegister = puedeRegistrarCampo(user);
  const sem = data?.semaforo ? semaforoMeta[data.semaforo] : null;
  const SemIcon = sem?.icon;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : error || !data ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 text-center shadow-xl">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-slate-300">{error || 'Carnet no encontrado.'}</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className={`p-6 text-white bg-gradient-to-br ${sem?.grad ?? 'from-slate-500 to-slate-400'}`}>
              <div className="flex items-center gap-4">
                {data.foto_url ? (
                  <img src={data.foto_url} alt={data.nombres} className="w-20 h-20 rounded-2xl object-cover border-2 border-white/50" />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center font-bold text-2xl">
                    {(data.nombres || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('')}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-xl font-bold leading-tight">{data.nombres}</h2>
                  <p className="text-white/80 text-sm">CC {data.cedula_masked}</p>
                  {data.cargo && <p className="text-white/70 text-xs">{data.cargo}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-5">
                {SemIcon && <SemIcon className="w-6 h-6" />}
                <span className="font-semibold text-lg">{sem?.label ?? 'Sin puntaje'}</span>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Velocímetro del puntaje (dato vivo — solo en la versión digital) */}
              <div className="flex flex-col items-center -mt-1 text-slate-900 dark:text-white">
                <GaugeSVG puntaje={data.puntaje} size={172} />
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {data.proyecto && <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{data.proyecto}</span>}
                {data.estado && <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{data.estado}</span>}
                <span className={`px-2 py-0.5 rounded ${data.tiene_ibutton ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                  {data.tiene_ibutton ? 'iButton ✓' : 'Sin iButton'}
                </span>
              </div>

              {data.detonadores.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {data.detonadores.map((d, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs">⚠ {d}</span>
                  ))}
                </div>
              )}

              <p className="text-xs text-slate-400">
                {data.registros_campo} registro(s) de campo · {data.fecha_calculo ? `puntaje al ${new Date(data.fecha_calculo).toLocaleDateString()}` : 'puntaje pendiente'}
              </p>

              {/* Acción del supervisor */}
              {isAuthenticated ? (
                canRegister ? (
                  <button
                    onClick={() => setShowForm(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium"
                  >
                    <ClipboardPlus className="w-4 h-4" /> Registrar comportamiento
                  </button>
                ) : (
                  <p className="text-sm text-center text-slate-500">Tu usuario no tiene permiso para registrar comportamientos.</p>
                )
              ) : (
                <a
                  href="/"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                >
                  <LogIn className="w-4 h-4" /> Inicia sesión como supervisor
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {showForm && data && (
        <RegistroCampoForm
          conductorId={data.conductor_id}
          conductorNombre={data.nombres}
          onClose={() => setShowForm(false)}
          onRegistered={load}
        />
      )}
    </div>
  );
};

export default CarnetPublico;
