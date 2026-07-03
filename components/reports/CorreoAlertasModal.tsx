import React, { useEffect, useState } from 'react';
import { X, Copy, Check, Mail } from 'lucide-react';
import type { CorreoAlertas } from '../../services/dailyEmailTemplates';

interface CorreoAlertasModalProps {
  correo: CorreoAlertas;
  contratoNombre: string;
  onClose: () => void;
}

export const CorreoAlertasModal: React.FC<CorreoAlertasModalProps> = ({ correo, contratoNombre, onClose }) => {
  const [asunto, setAsunto] = useState(correo.asunto);
  const [cuerpo, setCuerpo] = useState(correo.cuerpo);
  const [copiado, setCopiado] = useState(false);

  // Re-inicializa el contenido cuando cambia el correo (otro contrato).
  useEffect(() => {
    setAsunto(correo.asunto);
    setCuerpo(correo.cuerpo);
    setCopiado(false);
  }, [correo]);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(cuerpo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Fallback para navegadores sin permisos de clipboard
      const ta = document.createElement('textarea');
      ta.value = cuerpo;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
  };

  const abrirCorreo = () => {
    const url = `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    window.location.href = url;
  };

  const esCritico = correo.tipo === 'critico';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${esCritico ? 'bg-red-100 dark:bg-red-950/40' : 'bg-emerald-100 dark:bg-emerald-950/40'}`}>
              <Mail className={`w-5 h-5 ${esCritico ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-slate-100">Correo de alertas — {contratoNombre}</h2>
              <span className={`text-xs font-semibold ${esCritico ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {esCritico ? 'Plantilla crítica (excesos ≥ 80 km/h)' : 'Plantilla preventiva (sin excesos ≥ 80 km/h)'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Asunto</label>
            <input
              type="text"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Mensaje (editable)</label>
            <textarea
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              rows={18}
              className="w-full px-3 py-2 text-xs leading-relaxed font-mono border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Sugerencia: usa <span className="font-semibold">Copiar</span> y pega en tu correo. El botón "Abrir en correo" puede recortar mensajes largos en algunos clientes.
          </p>
        </div>

        {/* Pie */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Cerrar
          </button>
          <button
            onClick={abrirCorreo}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors"
          >
            <Mail className="w-4 h-4" /> Abrir en correo
          </button>
          <button
            onClick={copiar}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>
    </div>
  );
};
