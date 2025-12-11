/**
 * Componente de Configuración de Sonidos de Alerta
 *
 * Panel simple para controlar:
 * - Activar/desactivar sonidos
 * - Ajustar volumen
 * - Solo alertas críticas
 * - Probar sonido
 */

import React, { useState } from 'react';
import { Volume2, VolumeX, Play, X, Bell } from 'lucide-react';
import { useAlertSound } from '../services/alertSoundService';

interface AlertSoundSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AlertSoundSettings: React.FC<AlertSoundSettingsProps> = ({ isOpen, onClose }) => {
  const {
    config,
    updateConfig,
    playTestSound,
    isSupported
  } = useAlertSound();

  if (!isOpen) return null;

  if (!isSupported) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-900">Sonidos de Alerta</h3>
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
              Tu navegador no soporta Web Audio API
            </p>
            <p className="text-slate-400 text-sm mt-2">
              Por favor usa un navegador moderno
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Volume2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Configuración de Sonidos</h3>
              <p className="text-sm text-slate-600">Alertas sonoras automáticas</p>
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
                  <p className="font-semibold text-slate-900">Sonidos de Alerta</p>
                  <p className="text-sm text-slate-600">
                    {config.enabled ? 'Activados' : 'Desactivados'}
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

          {/* Solo Críticas */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-orange-600" />
                <div>
                  <p className="font-semibold text-slate-900">Solo Alertas Críticas</p>
                  <p className="text-sm text-slate-600">
                    Reproduce solo alertas de máxima prioridad
                  </p>
                </div>
              </div>
              <button
                onClick={() => updateConfig({ criticalOnly: !config.criticalOnly })}
                disabled={!config.enabled}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  config.criticalOnly ? 'bg-orange-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.criticalOnly ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
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
              className="w-full accent-blue-600"
              disabled={!config.enabled}
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>Silencio</span>
              <span>Medio</span>
              <span>Máximo</span>
            </div>
          </div>

          {/* Botón de Prueba */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <button
              onClick={playTestSound}
              disabled={!config.enabled}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
            >
              <Play className="w-5 h-5" />
              Probar Sonido
            </button>
          </div>

          {/* Información */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-800 mb-3">
              <strong>🔔 Tipos de Sonidos:</strong>
            </p>
            <div className="space-y-2 text-xs text-blue-700">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-600 rounded-full"></span>
                <span><strong>Críticas:</strong> 3 beeps rápidos urgentes</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-orange-600 rounded-full"></span>
                <span><strong>Altas:</strong> 2 beeps de alerta</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-600 rounded-full"></span>
                <span><strong>Medias:</strong> 1 beep largo</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                <span><strong>Bajas:</strong> 1 beep corto</span>
              </div>
            </div>
          </div>

          {/* Nota Importante */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm text-green-800">
              <strong>✅ Funciona en segundo plano:</strong> Los sonidos se reproducirán
              incluso cuando tengas otra pestaña activa. Solo necesitas mantener el navegador abierto.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 flex justify-end bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== COMPACT TOGGLE BUTTON ====================

export const AlertSoundToggle: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false);
  const { config, isSupported } = useAlertSound();

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
        title={config.enabled ? 'Sonidos activados' : 'Sonidos desactivados'}
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

      <AlertSoundSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </>
  );
};
