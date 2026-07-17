import React, { useEffect, useState } from 'react';
import { X, MapPin, Camera, Save, Loader2, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import {
  crearRegistroCampo, CATALOGO_EVENTOS, type Severidad,
} from '../services/registroCampoService';

interface Props {
  conductorId: string;
  conductorNombre: string;
  onClose: () => void;
  onRegistered?: () => void;
}

const severidadOpts: Array<{ v: Severidad; label: string; cls: string }> = [
  { v: 'leve',    label: 'Leve',    cls: 'bg-amber-500' },
  { v: 'grave',   label: 'Grave',   cls: 'bg-orange-500' },
  { v: 'critico', label: 'Crítico', cls: 'bg-red-600' },
];

export const RegistroCampoForm: React.FC<Props> = ({ conductorId, conductorNombre, onClose, onRegistered }) => {
  const [tipoEvento, setTipoEvento] = useState(CATALOGO_EVENTOS[0].value);
  const [severidad, setSeveridad] = useState<Severidad>(CATALOGO_EVENTOS[0].sugerida);
  const [descripcion, setDescripcion] = useState('');
  const [evidencia, setEvidencia] = useState<File | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('loading');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Geolocalización automática al abrir
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus('ok');
      },
      () => setGeoStatus('error'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  // Ajusta la severidad sugerida al cambiar el tipo
  const onTipoChange = (v: string) => {
    setTipoEvento(v);
    const cat = CATALOGO_EVENTOS.find(c => c.value === v);
    if (cat) setSeveridad(cat.sugerida);
  };

  const handleSubmit = async () => {
    if (!descripcion.trim()) {
      setError('La descripción es obligatoria.');
      return;
    }
    setSaving(true);
    setError('');
    const res = await crearRegistroCampo({
      conductorId,
      conductorNombre,
      tipoEvento,
      severidad,
      descripcion,
      latitud: geo?.lat ?? null,
      longitud: geo?.lng ?? null,
      evidencia,
    });
    setSaving(false);
    if (res.success) {
      setDone(true);
      onRegistered?.();
      setTimeout(onClose, 1600);
    } else {
      setError(res.error || 'No se pudo registrar.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-orange-500" />
            Registrar comportamiento
          </h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Conductor: <span className="font-medium text-slate-700 dark:text-slate-300">{conductorNombre}</span></p>

          {done ? (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-5 h-5" /> Registro guardado. El puntaje se actualizó.
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" /> {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de evento</label>
                <select
                  value={tipoEvento}
                  onChange={(e) => onTipoChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white"
                >
                  {CATALOGO_EVENTOS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Severidad</label>
                <div className="flex gap-2">
                  {severidadOpts.map(s => (
                    <button
                      key={s.v}
                      type="button"
                      onClick={() => setSeveridad(s.v)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium text-white transition-opacity ${s.cls} ${severidad === s.v ? 'opacity-100 ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-800' : 'opacity-50'}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descripción *</label>
                <textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={3}
                  placeholder="¿Qué ocurrió?"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Evidencia fotográfica (opcional)</label>
                <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer text-sm text-slate-500 hover:border-blue-400">
                  <Camera className="w-4 h-4" />
                  {evidencia ? evidencia.name : 'Tomar / subir foto'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => setEvidencia(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              {/* Trazabilidad automática */}
              <div className="text-xs rounded-lg bg-slate-50 dark:bg-slate-700/40 p-3 space-y-1">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <MapPin className="w-3.5 h-3.5" />
                  {geoStatus === 'loading' && 'Obteniendo ubicación…'}
                  {geoStatus === 'ok' && geo && `Ubicación: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`}
                  {geoStatus === 'error' && 'Ubicación no disponible (se registrará sin geo).'}
                </div>
                <p className="text-slate-400">Fecha/hora y usuario se registran automáticamente. El registro es inmutable.</p>
              </div>

              <button
                onClick={handleSubmit}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Registrando…' : 'Registrar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegistroCampoForm;
