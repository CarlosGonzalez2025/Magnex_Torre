/**
 * Alert Sound Service
 *
 * Sistema de sonidos de alerta que funciona incluso cuando
 * la pestaña del navegador no está activa.
 *
 * Características:
 * - Sonidos diferentes por tipo de alerta
 * - Funciona en background (pestaña no activa)
 * - Web Audio API para generar tonos
 * - Control de volumen
 * - Configuración persistente
 */

import { Alert, AlertType, AlertSeverity } from '../types';

// ==================== CONFIGURATION ====================

interface SoundConfig {
  enabled: boolean;
  volume: number;          // 0 a 1
  criticalOnly: boolean;   // Solo alertas críticas
}

const DEFAULT_CONFIG: SoundConfig = {
  enabled: true,
  volume: 0.7,
  criticalOnly: false
};

const CONFIG_STORAGE_KEY = 'alert-sound-config';

// ==================== SOUND PATTERNS ====================

/**
 * Patrones de sonido por severidad
 * Cada patrón es un array de [frecuencia, duración]
 */
const SOUND_PATTERNS = {
  critical: [
    // Patrón urgente: 3 beeps rápidos + pausa + repetir
    [1000, 150], [0, 50], [1000, 150], [0, 50], [1000, 150], [0, 300],
    [1000, 150], [0, 50], [1000, 150], [0, 50], [1000, 150]
  ],
  high: [
    // Patrón alerta: 2 beeps + pausa
    [800, 200], [0, 100], [800, 200]
  ],
  medium: [
    // Patrón advertencia: 1 beep largo
    [600, 300]
  ],
  low: [
    // Patrón informativo: 1 beep corto
    [400, 150]
  ]
};

/**
 * Sonidos específicos por tipo de alerta (opcional)
 */
const ALERT_TYPE_SOUNDS: Partial<Record<AlertType, [number, number][]>> = {
  [AlertType.PANIC_BUTTON]: [
    // Patrón de pánico: beeps muy rápidos y agudos
    [1200, 100], [0, 50], [1200, 100], [0, 50], [1200, 100], [0, 50],
    [1200, 100], [0, 50], [1200, 100], [0, 50], [1200, 100]
  ],
  [AlertType.SPEED_VIOLATION]: [
    // Patrón velocidad: 2 tonos descendentes
    [900, 200], [0, 100], [700, 300]
  ],
  [AlertType.COLLISION]: [
    // Patrón colisión: tono continuo urgente
    [1100, 500], [0, 200], [1100, 500]
  ]
};

// ==================== AUDIO ENGINE ====================

class AudioEngine {
  private audioContext: AudioContext | null = null;
  private config: SoundConfig;
  private isPlaying: boolean = false;

  constructor() {
    this.config = this.loadConfig();
    this.initAudioContext();
  }

  /**
   * Inicializa AudioContext
   */
  private initAudioContext(): void {
    try {
      // Crear AudioContext (compatible con Safari)
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();

      // Resume AudioContext si está suspendido (requerido en algunos navegadores)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
    } catch (error) {
      console.error('Error initializing AudioContext:', error);
    }
  }

  /**
   * Carga configuración desde localStorage
   */
  private loadConfig(): SoundConfig {
    try {
      const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Error loading sound config:', error);
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
      console.error('Error saving sound config:', error);
    }
  }

  /**
   * Actualiza configuración
   */
  updateConfig(updates: Partial<SoundConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  /**
   * Obtiene configuración actual
   */
  getConfig(): SoundConfig {
    return { ...this.config };
  }

  /**
   * Reproduce un tono
   */
  private playTone(frequency: number, duration: number, volume: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.audioContext || frequency === 0) {
        setTimeout(resolve, duration);
        return;
      }

      try {
        // Crear oscillator (generador de tono)
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        // Configurar oscillator
        oscillator.type = 'sine';  // Onda sinusoidal (tono suave)
        oscillator.frequency.value = frequency;

        // Configurar volumen con fade in/out
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(
          volume,
          this.audioContext.currentTime + 0.01
        );
        gainNode.gain.linearRampToValueAtTime(
          0,
          this.audioContext.currentTime + duration / 1000 - 0.01
        );

        // Conectar
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        // Reproducir
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration / 1000);

        // Resolver cuando termine
        setTimeout(resolve, duration);
      } catch (error) {
        console.error('Error playing tone:', error);
        setTimeout(resolve, duration);
      }
    });
  }

  /**
   * Reproduce un patrón de sonido
   */
  private async playPattern(pattern: [number, number][], volume: number): Promise<void> {
    this.isPlaying = true;

    for (const [frequency, duration] of pattern) {
      if (!this.isPlaying) break;
      await this.playTone(frequency, duration, volume);
    }

    this.isPlaying = false;
  }

  /**
   * Reproduce sonido de alerta
   */
  async playAlert(alert: Alert): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Si criticalOnly está activo, solo reproducir críticas
    if (this.config.criticalOnly && alert.severity !== 'critical') {
      return;
    }

    // Asegurar que AudioContext está activo
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Seleccionar patrón
    let pattern: [number, number][] | undefined;

    // Primero verificar si hay patrón específico para el tipo
    if (ALERT_TYPE_SOUNDS[alert.type]) {
      pattern = ALERT_TYPE_SOUNDS[alert.type];
    } else {
      // Sino, usar patrón por severidad
      pattern = SOUND_PATTERNS[alert.severity as keyof typeof SOUND_PATTERNS];
    }

    if (!pattern) {
      pattern = SOUND_PATTERNS.medium;  // Fallback
    }

    // Reproducir patrón
    console.log(`[Sound] Playing alert: ${alert.type} (${alert.severity})`);
    await this.playPattern(pattern, this.config.volume);
  }

  /**
   * Reproduce sonido de prueba
   */
  async playTestSound(): Promise<void> {
    if (!this.audioContext) {
      this.initAudioContext();
    }

    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Patrón de prueba: escala ascendente
    const testPattern: [number, number][] = [
      [400, 150], [0, 50],
      [500, 150], [0, 50],
      [600, 150], [0, 50],
      [700, 200]
    ];

    await this.playPattern(testPattern, this.config.volume);
  }

  /**
   * Detiene reproducción actual
   */
  stop(): void {
    this.isPlaying = false;
  }

  /**
   * Verifica si el navegador soporta Web Audio API
   */
  isSupported(): boolean {
    return !!(window.AudioContext || (window as any).webkitAudioContext);
  }
}

// ==================== SINGLETON INSTANCE ====================

export const audioEngine = new AudioEngine();

// ==================== REACT HOOK ====================

import React from 'react';

/**
 * Hook para usar sonidos en componentes React
 */
export function useAlertSound() {
  const [config, setConfig] = React.useState<SoundConfig>(audioEngine.getConfig());

  const updateConfig = (updates: Partial<SoundConfig>) => {
    audioEngine.updateConfig(updates);
    setConfig(audioEngine.getConfig());
  };

  const playAlert = (alert: Alert) => {
    return audioEngine.playAlert(alert);
  };

  const playTestSound = () => {
    return audioEngine.playTestSound();
  };

  const stop = () => {
    audioEngine.stop();
  };

  return {
    config,
    updateConfig,
    playAlert,
    playTestSound,
    stop,
    isSupported: audioEngine.isSupported()
  };
}

// ==================== EXPORT ====================

export default audioEngine;
