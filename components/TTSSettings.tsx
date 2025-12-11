/**
 * Componente de Configuración de Text-to-Speech
 *
 * Permite al usuario configurar:
 * - Activar/desactivar narración
 * - Seleccionar voz en español
 * - Ajustar velocidad, tono y volumen
 * - Probar voz
 * - Alternar entre mensaje completo o corto
 */

import React, { useState } from 'react';
import { Volume2, VolumeX, Play, Settings, X } from 'lucide-react';
import { useTTS } from '../services/ttsService';

interface TTSSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TTSSettings: React.FC<TTSSettingsProps> = ({ isOpen, onClose }) => {
  const {
    config,
    voices,
    updateConfig,
    testVoice,
    isSupported
  } = useTTS();

  const [testText, setTestText] = useState('Esta es una prueba de narración de alertas');

  if (!isOpen) return null;

  if (!isSupported) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-900">Narración de Alertas</h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="text-center py-8">
            <VolumeX className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 font-medium">
              Tu navegador no soporta Text-to-Speech
            </p>
            <p className="text-slate-400 text-sm mt-2">
              Por favor usa Chrome, Edge o Safari
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleTestVoice = () => {
    testVoice(testText);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Volume2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Configuración de Narración</h3>
              <p className="text-sm text-slate-600">Alertas narradas automáticamente</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Activar/Desactivar */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {config.enabled ? (
                  <Volume2 className="w-5 h-5 text-blue-600" />
                ) : (
                  <VolumeX className="w-5 h-5 text-slate-400" />
                )}
                <div>
                  <p className="font-semibold text-slate-900">Narración Automática</p>
                  <p className="text-sm text-slate-600">
                    {config.enabled ? 'Activada' : 'Desactivada'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => updateConfig({ enabled: !config.enabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.enabled ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Selección de Voz */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Voz en Español
            </label>
            <select
              value={config.voice || ''}
              onChange={(e) => updateConfig({ voice: e.target.value || null })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!config.enabled}
            >
              <option value="">Predeterminada del sistema</option>
              {voices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              {voices.length} voces disponibles en español
            </p>
          </div>

          {/* Velocidad */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Velocidad: {config.rate.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={config.rate}
              onChange={(e) => updateConfig({ rate: parseFloat(e.target.value) })}
              className="w-full"
              disabled={!config.enabled}
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>Lento</span>
              <span>Normal</span>
              <span>Rápido</span>
            </div>
          </div>

          {/* Tono */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Tono: {config.pitch.toFixed(1)}
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={config.pitch}
              onChange={(e) => updateConfig({ pitch: parseFloat(e.target.value) })}
              className="w-full"
              disabled={!config.enabled}
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>Grave</span>
              <span>Normal</span>
              <span>Agudo</span>
            </div>
          </div>

          {/* Volumen */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Volumen: {Math.round(config.volume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.volume}
              onChange={(e) => updateConfig({ volume: parseFloat(e.target.value) })}
              className="w-full"
              disabled={!config.enabled}
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>Silencio</span>
              <span>Medio</span>
              <span>Máximo</span>
            </div>
          </div>

          {/* Prueba de Voz */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Probar Voz
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Escribe un texto para probar..."
                disabled={!config.enabled}
              />
              <button
                onClick={handleTestVoice}
                disabled={!config.enabled}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Probar
              </button>
            </div>
          </div>

          {/* Ejemplos de Mensajes */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">
              Ejemplos de Narración:
            </p>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-start gap-2">
                <span className="text-red-600 font-bold">•</span>
                <p>
                  <strong>Exceso de Velocidad:</strong> "Atención. Exceso de velocidad. Vehículo ABC123.
                  Conductor Juan Pérez. Velocidad 95 kilómetros por hora."
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-red-600 font-bold">•</span>
                <p>
                  <strong>Botón de Pánico:</strong> "Alerta crítica. Botón de pánico activado.
                  Vehículo ABC123. Requiere atención inmediata."
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-orange-600 font-bold">•</span>
                <p>
                  <strong>Frenada Brusca:</strong> "Alerta. Frenada brusca detectada.
                  Vehículo ABC123. Conductor Juan Pérez."
                </p>
              </div>
            </div>
          </div>

          {/* Información */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-800">
              <strong>💡 Nota:</strong> Las alertas críticas se narrarán automáticamente con alta prioridad,
              interrumpiendo cualquier narración en curso.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 flex justify-end gap-3 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== COMPACT TOGGLE BUTTON ====================

export const TTSToggleButton: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false);
  const { config, updateConfig, isSupported } = useTTS();

  if (!isSupported) return null;

  return (
    <>
      <button
        onClick={() => setShowSettings(true)}
        className={`relative p-2 rounded-lg transition-all ${
          config.enabled
            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
        }`}
        title={config.enabled ? 'Narración activada' : 'Narración desactivada'}
      >
        {config.enabled ? (
          <Volume2 className="w-5 h-5" />
        ) : (
          <VolumeX className="w-5 h-5" />
        )}
        {config.enabled && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></span>
        )}
      </button>

      <TTSSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </>
  );
};
