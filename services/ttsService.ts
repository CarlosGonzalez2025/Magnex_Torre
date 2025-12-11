/**
 * Text-to-Speech Service para Alertas
 *
 * Utiliza Web Speech API del navegador para narrar alertas
 * en español con mensajes personalizados por tipo.
 *
 * Características:
 * - Narración automática de nuevas alertas
 * - Mensajes personalizados por tipo de alerta
 * - Voces en español del sistema
 * - Control de velocidad y volumen
 * - Cola de mensajes para múltiples alertas
 * - Configuración persistente (localStorage)
 */

import { Alert, AlertType } from '../types';

// ==================== CONFIGURATION ====================

interface TTSConfig {
  enabled: boolean;
  voice: string | null;  // Nombre de la voz preferida
  rate: number;          // Velocidad (0.1 a 10, default: 1)
  pitch: number;         // Tono (0 a 2, default: 1)
  volume: number;        // Volumen (0 a 1, default: 1)
  autoNarrate: boolean;  // Narrar automáticamente nuevas alertas
}

const DEFAULT_CONFIG: TTSConfig = {
  enabled: true,
  voice: null,  // null = usar voz predeterminada del sistema
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  autoNarrate: true
};

const CONFIG_STORAGE_KEY = 'tts-config';

// ==================== VOICE MANAGER ====================

class VoiceManager {
  private voices: SpeechSynthesisVoice[] = [];
  private voicesLoaded: boolean = false;

  constructor() {
    this.loadVoices();

    // Las voces pueden cargarse de forma asíncrona
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => {
        this.loadVoices();
      };
    }
  }

  private loadVoices(): void {
    this.voices = speechSynthesis.getVoices();
    this.voicesLoaded = true;
  }

  /**
   * Obtiene todas las voces disponibles en español
   */
  getSpanishVoices(): SpeechSynthesisVoice[] {
    if (!this.voicesLoaded) {
      this.loadVoices();
    }

    return this.voices.filter(voice =>
      voice.lang.startsWith('es') ||
      voice.lang.startsWith('spa')
    );
  }

  /**
   * Obtiene todas las voces disponibles
   */
  getAllVoices(): SpeechSynthesisVoice[] {
    if (!this.voicesLoaded) {
      this.loadVoices();
    }
    return this.voices;
  }

  /**
   * Obtiene voz por nombre
   */
  getVoiceByName(name: string): SpeechSynthesisVoice | null {
    return this.voices.find(voice => voice.name === name) || null;
  }

  /**
   * Obtiene voz predeterminada en español
   */
  getDefaultSpanishVoice(): SpeechSynthesisVoice | null {
    const spanishVoices = this.getSpanishVoices();

    // Preferir voces colombianas/latinoamericanas
    const preferred = spanishVoices.find(v =>
      v.lang.includes('CO') ||  // Colombia
      v.lang.includes('MX') ||  // México
      v.lang.includes('AR')     // Argentina
    );

    if (preferred) return preferred;

    // Sino, cualquier voz en español
    return spanishVoices[0] || null;
  }
}

// ==================== MESSAGE GENERATOR ====================

/**
 * Genera mensajes narrados personalizados por tipo de alerta
 */
function generateAlertMessage(alert: Alert): string {
  const { type, plate, driver, speed, location, details } = alert;

  switch (type) {
    case AlertType.SPEED_VIOLATION:
      return `Atención. Exceso de velocidad. Vehículo ${plate}. Conductor ${driver}. Velocidad ${speed} kilómetros por hora. Ubicación: ${location}.`;

    case AlertType.PANIC_BUTTON:
      return `Alerta crítica. Botón de pánico activado. Vehículo ${plate}. Conductor ${driver}. Ubicación: ${location}. Requiere atención inmediata.`;

    case AlertType.HARSH_BRAKE:
      return `Alerta. Frenada brusca detectada. Vehículo ${plate}. Conductor ${driver}. Ubicación: ${location}.`;

    case AlertType.HARSH_ACCELERATION:
      return `Alerta. Aceleración brusca detectada. Vehículo ${plate}. Conductor ${driver}. Ubicación: ${location}.`;

    case AlertType.COLLISION:
      return `Alerta crítica. Posible colisión detectada. Vehículo ${plate}. Conductor ${driver}. Ubicación: ${location}. Verificar estado del vehículo.`;

    case AlertType.UNAUTHORIZED_STOP:
      return `Alerta. Parada no autorizada. Vehículo ${plate}. Conductor ${driver}. Ubicación: ${location}.`;

    case AlertType.ROUTE_DEVIATION:
      return `Alerta. Desviación de ruta detectada. Vehículo ${plate}. Conductor ${driver}. Ubicación: ${location}.`;

    case AlertType.IDLE_TIME_EXCEEDED:
      return `Alerta. Tiempo de ralentí excedido. Vehículo ${plate}. Conductor ${driver}. Ubicación: ${location}.`;

    case AlertType.GEOFENCE_EXIT:
      return `Alerta. Salida de geocerca. Vehículo ${plate}. Conductor ${driver}. Ubicación: ${location}.`;

    case AlertType.LOW_FUEL:
      return `Alerta. Nivel bajo de combustible. Vehículo ${plate}. Conductor ${driver}. ${details}.`;

    case AlertType.MAINTENANCE_DUE:
      return `Recordatorio. Mantenimiento vencido. Vehículo ${plate}. ${details}.`;

    default:
      return `Alerta. ${type}. Vehículo ${plate}. Conductor ${driver}. Ubicación: ${location}.`;
  }
}

/**
 * Genera mensaje corto para notificación rápida
 */
function generateShortMessage(alert: Alert): string {
  const { type, plate } = alert;

  switch (type) {
    case AlertType.SPEED_VIOLATION:
      return `Exceso de velocidad. Vehículo ${plate}.`;

    case AlertType.PANIC_BUTTON:
      return `Botón de pánico. Vehículo ${plate}.`;

    case AlertType.HARSH_BRAKE:
      return `Frenada brusca. Vehículo ${plate}.`;

    case AlertType.HARSH_ACCELERATION:
      return `Aceleración brusca. Vehículo ${plate}.`;

    case AlertType.COLLISION:
      return `Posible colisión. Vehículo ${plate}.`;

    default:
      return `${type}. Vehículo ${plate}.`;
  }
}

// ==================== TTS ENGINE ====================

class TTSEngine {
  private voiceManager: VoiceManager;
  private config: TTSConfig;
  private messageQueue: string[] = [];
  private isSpeaking: boolean = false;

  constructor() {
    this.voiceManager = new VoiceManager();
    this.config = this.loadConfig();
  }

  /**
   * Carga configuración desde localStorage
   */
  private loadConfig(): TTSConfig {
    try {
      const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Error loading TTS config:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Guarda configuración en localStorage
   */
  private saveConfig(): void {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(this.config));
    } catch (error) {
      console.error('Error saving TTS config:', error);
    }
  }

  /**
   * Actualiza configuración
   */
  updateConfig(updates: Partial<TTSConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  /**
   * Obtiene configuración actual
   */
  getConfig(): TTSConfig {
    return { ...this.config };
  }

  /**
   * Obtiene voces disponibles en español
   */
  getAvailableVoices(): SpeechSynthesisVoice[] {
    return this.voiceManager.getSpanishVoices();
  }

  /**
   * Narra un mensaje
   */
  speak(text: string, priority: 'high' | 'normal' = 'normal'): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.config.enabled) {
        resolve();
        return;
      }

      // Verificar soporte del navegador
      if (!('speechSynthesis' in window)) {
        console.warn('Text-to-Speech not supported in this browser');
        reject(new Error('TTS not supported'));
        return;
      }

      // Crear utterance
      const utterance = new SpeechSynthesisUtterance(text);

      // Configurar voz
      if (this.config.voice) {
        const voice = this.voiceManager.getVoiceByName(this.config.voice);
        if (voice) {
          utterance.voice = voice;
        }
      } else {
        // Usar voz predeterminada en español
        const defaultVoice = this.voiceManager.getDefaultSpanishVoice();
        if (defaultVoice) {
          utterance.voice = defaultVoice;
        }
      }

      // Configurar parámetros
      utterance.rate = this.config.rate;
      utterance.pitch = this.config.pitch;
      utterance.volume = this.config.volume;
      utterance.lang = 'es-CO';  // Español colombiano

      // Eventos
      utterance.onend = () => {
        this.isSpeaking = false;
        this.processQueue();
        resolve();
      };

      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        this.isSpeaking = false;
        this.processQueue();
        reject(event);
      };

      // Si es alta prioridad, cancelar mensaje actual y hablar inmediatamente
      if (priority === 'high') {
        speechSynthesis.cancel();
        this.messageQueue = [];
        speechSynthesis.speak(utterance);
        this.isSpeaking = true;
      } else {
        // Agregar a cola
        if (this.isSpeaking) {
          this.messageQueue.push(text);
        } else {
          speechSynthesis.speak(utterance);
          this.isSpeaking = true;
        }
      }
    });
  }

  /**
   * Procesa cola de mensajes
   */
  private processQueue(): void {
    if (this.messageQueue.length > 0 && !this.isSpeaking) {
      const nextMessage = this.messageQueue.shift();
      if (nextMessage) {
        this.speak(nextMessage);
      }
    }
  }

  /**
   * Detiene narración actual
   */
  stop(): void {
    speechSynthesis.cancel();
    this.messageQueue = [];
    this.isSpeaking = false;
  }

  /**
   * Pausa narración
   */
  pause(): void {
    speechSynthesis.pause();
  }

  /**
   * Reanuda narración
   */
  resume(): void {
    speechSynthesis.resume();
  }

  /**
   * Narra una alerta (mensaje completo)
   */
  narrateAlert(alert: Alert, priority: 'high' | 'normal' = 'normal'): Promise<void> {
    if (!this.config.autoNarrate) {
      return Promise.resolve();
    }

    const message = generateAlertMessage(alert);
    console.log('[TTS] Narrating alert:', message);
    return this.speak(message, priority);
  }

  /**
   * Narra alerta con mensaje corto
   */
  narrateAlertShort(alert: Alert, priority: 'high' | 'normal' = 'normal'): Promise<void> {
    if (!this.config.autoNarrate) {
      return Promise.resolve();
    }

    const message = generateShortMessage(alert);
    console.log('[TTS] Narrating short alert:', message);
    return this.speak(message, priority);
  }

  /**
   * Narra texto personalizado
   */
  narrateCustom(text: string, priority: 'high' | 'normal' = 'normal'): Promise<void> {
    return this.speak(text, priority);
  }
}

// ==================== SINGLETON INSTANCE ====================

export const ttsEngine = new TTSEngine();

// ==================== REACT HOOK ====================

/**
 * Hook para usar TTS en componentes React
 */
export function useTTS() {
  const [config, setConfig] = React.useState<TTSConfig>(ttsEngine.getConfig());
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([]);

  React.useEffect(() => {
    // Cargar voces
    setVoices(ttsEngine.getAvailableVoices());

    // Actualizar voces cuando se carguen
    const updateVoices = () => {
      setVoices(ttsEngine.getAvailableVoices());
    };

    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const updateConfig = (updates: Partial<TTSConfig>) => {
    ttsEngine.updateConfig(updates);
    setConfig(ttsEngine.getConfig());
  };

  const narrateAlert = (alert: Alert, priority: 'high' | 'normal' = 'normal') => {
    return ttsEngine.narrateAlert(alert, priority);
  };

  const narrateAlertShort = (alert: Alert, priority: 'high' | 'normal' = 'normal') => {
    return ttsEngine.narrateAlertShort(alert, priority);
  };

  const narrateCustom = (text: string, priority: 'high' | 'normal' = 'normal') => {
    return ttsEngine.narrateCustom(text, priority);
  };

  const stop = () => {
    ttsEngine.stop();
  };

  const testVoice = (text: string = 'Esta es una prueba de voz') => {
    return ttsEngine.speak(text);
  };

  return {
    config,
    voices,
    updateConfig,
    narrateAlert,
    narrateAlertShort,
    narrateCustom,
    stop,
    testVoice,
    isSupported: 'speechSynthesis' in window
  };
}

// ==================== EXPORT ====================

export default ttsEngine;

// Helper para importar React
import React from 'react';
