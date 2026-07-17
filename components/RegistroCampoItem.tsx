import React, { useState } from 'react';
import { MessageSquarePlus, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import {
  getNotasByRegistro, agregarNotaSeguimiento, type NotaSeguimiento,
} from '../services/registroCampoService';
import type { RegistroCampo } from '../services/hojaDeVidaService';

const sevCls: Record<string, string> = {
  critico: 'bg-red-600', grave: 'bg-orange-500', leve: 'bg-amber-400',
};

export const RegistroCampoItem: React.FC<{ registro: RegistroCampo }> = ({ registro: r }) => {
  const [open, setOpen] = useState(false);
  const [notas, setNotas] = useState<NotaSeguimiento[]>([]);
  const [loading, setLoading] = useState(false);
  const [nueva, setNueva] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    setLoading(true);
    setNotas(await getNotasByRegistro(r.id));
    setLoading(false);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && notas.length === 0) cargar();
  };

  const enviar = async () => {
    if (!nueva.trim()) return;
    setSaving(true); setError('');
    const res = await agregarNotaSeguimiento(r.id, nueva);
    setSaving(false);
    if (res.success) { setNueva(''); cargar(); }
    else setError(res.error || 'No se pudo agregar la nota.');
  };

  return (
    <div className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${sevCls[String(r.severidad).toLowerCase()] ?? 'bg-slate-400'}`} />
          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{r.tipo_evento}</span>
        </div>
        <span className="text-xs text-slate-400 shrink-0">{new Date(r.created_at).toLocaleString()}</span>
      </div>
      <p className="text-slate-600 dark:text-slate-400 text-sm">{r.descripcion}</p>
      {r.registrado_por_nombre && <p className="text-xs text-slate-400">por {r.registrado_por_nombre}</p>}

      <button onClick={toggle} className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:underline">
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Seguimiento{notas.length > 0 ? ` (${notas.length})` : ''}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          ) : notas.length === 0 ? (
            <p className="text-xs text-slate-400">Sin notas de seguimiento.</p>
          ) : (
            <ul className="space-y-1.5">
              {notas.map((n) => (
                <li key={n.id} className="text-xs bg-slate-50 dark:bg-slate-700/40 rounded-lg p-2">
                  <p className="text-slate-700 dark:text-slate-300">{n.nota}</p>
                  <p className="text-slate-400 mt-0.5">{n.autor_nombre || '—'} · {new Date(n.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex items-center gap-2">
            <input
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
              placeholder="Agregar nota de seguimiento…"
              className="flex-1 px-2 py-1.5 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white"
            />
            <button onClick={enviar} disabled={saving || !nueva.trim()} className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegistroCampoItem;
