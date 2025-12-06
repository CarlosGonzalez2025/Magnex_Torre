import { useEffect, useState } from 'react';
import { DataCleanupService } from '../services/dataCleanupService';
import { shouldRunAutoCleanup } from '../config/dataRetentionConfig';

export interface CleanupStatus {
  isRunning: boolean;
  lastRun: Date | null;
  lastResult: {
    deletedAlerts: number;
    deletedInspections: number;
    deletedActionPlans: number;
  } | null;
}

/**
 * Hook para ejecutar limpieza automática de datos
 *
 * Este hook se ejecuta al iniciar la aplicación y verifica si es necesario
 * ejecutar una limpieza automática según las políticas configuradas.
 */
export function useAutoCleanup() {
  const [status, setStatus] = useState<CleanupStatus>({
    isRunning: false,
    lastRun: null,
    lastResult: null
  });

  useEffect(() => {
    checkAndRunCleanup();
  }, []);

  const checkAndRunCleanup = async () => {
    try {
      // Obtener fecha de última limpieza
      const lastCleanupStr = localStorage.getItem('lastCleanupDate');
      const lastCleanupDate = lastCleanupStr ? new Date(lastCleanupStr) : null;

      // Verificar si se debe ejecutar
      if (!shouldRunAutoCleanup(lastCleanupDate)) {
        // Cargar último resultado si existe
        const lastResultStr = localStorage.getItem('lastCleanupResult');
        if (lastResultStr) {
          const lastResult = JSON.parse(lastResultStr);
          setStatus({
            isRunning: false,
            lastRun: lastCleanupDate,
            lastResult: lastResult
          });
        }
        return;
      }

      // Ejecutar limpieza
      setStatus(prev => ({ ...prev, isRunning: true }));

      const result = await DataCleanupService.runFullCleanup(true);

      const cleanupResult = {
        deletedAlerts: result.deletedAlerts,
        deletedInspections: result.deletedInspections,
        deletedActionPlans: result.deletedActionPlans
      };

      // Guardar resultado
      localStorage.setItem('lastCleanupResult', JSON.stringify(cleanupResult));

      setStatus({
        isRunning: false,
        lastRun: new Date(),
        lastResult: cleanupResult
      });

      // Notificar al usuario si se eliminaron datos
      const totalDeleted = result.deletedAlerts + result.deletedInspections + result.deletedActionPlans;
      if (totalDeleted > 0) {
        console.log(`✅ Limpieza automática completada: ${totalDeleted} registros eliminados`);
      }
    } catch (error) {
      console.error('❌ Error en limpieza automática:', error);
      setStatus(prev => ({ ...prev, isRunning: false }));
    }
  };

  /**
   * Ejecuta limpieza manual
   */
  const runManualCleanup = async (): Promise<void> => {
    setStatus(prev => ({ ...prev, isRunning: true }));

    try {
      const result = await DataCleanupService.runFullCleanup(true);

      const cleanupResult = {
        deletedAlerts: result.deletedAlerts,
        deletedInspections: result.deletedInspections,
        deletedActionPlans: result.deletedActionPlans
      };

      localStorage.setItem('lastCleanupResult', JSON.stringify(cleanupResult));

      setStatus({
        isRunning: false,
        lastRun: new Date(),
        lastResult: cleanupResult
      });

      return Promise.resolve();
    } catch (error) {
      setStatus(prev => ({ ...prev, isRunning: false }));
      return Promise.reject(error);
    }
  };

  return {
    status,
    runManualCleanup
  };
}
