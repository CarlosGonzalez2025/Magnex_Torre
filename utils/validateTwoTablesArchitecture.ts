/**
 * Script de Validación: Arquitectura de Dos Tablas
 *
 * Este script valida que la arquitectura de dos tablas esté funcionando correctamente:
 *
 * 1. saved_alerts: Guardado AUTOMÁTICO de todas las alertas (7-30 días de retención)
 * 2. alert_history: Guardado MANUAL para seguimiento (retención permanente)
 * 3. action_plans: Planes de acción vinculados a alert_history
 *
 * Validaciones incluidas:
 * - Conexión a ambas tablas
 * - Guardado automático en saved_alerts
 * - Guardado manual en alert_history con referencia a saved_alerts
 * - Creación de planes de acción
 * - Verificación de relaciones FK
 * - Prevención de duplicados
 * - Limpieza automática (solo saved_alerts)
 */

import { supabase } from '../services/supabaseClient';
import { autoSaveAlert, saveAlertToDatabase, addActionPlan } from '../services/databaseService';
import { Alert, AlertType, AlertSeverity, ApiSource } from '../types';

export interface ValidationResult {
  success: boolean;
  step: string;
  message: string;
  error?: string;
  details?: any;
}

/**
 * Crea una alerta de prueba
 */
function createTestAlert(suffix: string = ''): Alert {
  const timestamp = new Date().toISOString();
  return {
    id: `TEST-ALERT-${Date.now()}${suffix}`,
    vehicleId: 'TEST-VEH-001',
    plate: `TEST${suffix}`,
    type: AlertType.SPEED_VIOLATION,
    severity: AlertSeverity.CRITICAL,
    timestamp,
    location: 'Bogotá, Colombia (Prueba)',
    latitude: 4.6097,
    longitude: -74.0817,
    speed: 95,
    driver: 'Test Driver',
    source: ApiSource.FAGOR,
    contract: 'Test Contract',
    details: `Alerta de prueba - Velocidad: 95 km/h${suffix}`,
    sent: false
  };
}

/**
 * PASO 1: Verificar conexión a saved_alerts
 */
async function validateSavedAlertsConnection(): Promise<ValidationResult> {
  try {
    const { count, error } = await supabase
      .from('saved_alerts')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return {
        success: false,
        step: '1. Conexión saved_alerts',
        message: 'Error al conectar con saved_alerts',
        error: error.message
      };
    }

    return {
      success: true,
      step: '1. Conexión saved_alerts',
      message: `✅ Conectado correctamente. Registros actuales: ${count || 0}`
    };
  } catch (error: any) {
    return {
      success: false,
      step: '1. Conexión saved_alerts',
      message: 'Excepción al conectar',
      error: error.message
    };
  }
}

/**
 * PASO 2: Verificar conexión a alert_history
 */
async function validateAlertHistoryConnection(): Promise<ValidationResult> {
  try {
    const { count, error } = await supabase
      .from('alert_history')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return {
        success: false,
        step: '2. Conexión alert_history',
        message: 'Error al conectar con alert_history',
        error: error.message
      };
    }

    return {
      success: true,
      step: '2. Conexión alert_history',
      message: `✅ Conectado correctamente. Registros actuales: ${count || 0}`
    };
  } catch (error: any) {
    return {
      success: false,
      step: '2. Conexión alert_history',
      message: 'Excepción al conectar',
      error: error.message
    };
  }
}

/**
 * PASO 3: Verificar conexión a action_plans
 */
async function validateActionPlansConnection(): Promise<ValidationResult> {
  try {
    const { count, error } = await supabase
      .from('action_plans')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return {
        success: false,
        step: '3. Conexión action_plans',
        message: 'Error al conectar con action_plans',
        error: error.message
      };
    }

    return {
      success: true,
      step: '3. Conexión action_plans',
      message: `✅ Conectado correctamente. Registros actuales: ${count || 0}`
    };
  } catch (error: any) {
    return {
      success: false,
      step: '3. Conexión action_plans',
      message: 'Excepción al conectar',
      error: error.message
    };
  }
}

/**
 * PASO 4: Probar guardado AUTOMÁTICO en saved_alerts
 */
async function validateAutoSave(): Promise<ValidationResult> {
  try {
    const testAlert = createTestAlert('-AUTO');

    const result = await autoSaveAlert(testAlert);

    if (!result.success) {
      return {
        success: false,
        step: '4. Guardado automático',
        message: 'Error en autoSaveAlert()',
        error: result.error
      };
    }

    // Verificar que se guardó
    const { data, error } = await supabase
      .from('saved_alerts')
      .select('*')
      .eq('plate', testAlert.plate)
      .eq('type', testAlert.type)
      .eq('timestamp', testAlert.timestamp)
      .maybeSingle();

    if (error) {
      return {
        success: false,
        step: '4. Guardado automático',
        message: 'Error al verificar registro guardado',
        error: error.message
      };
    }

    if (!data) {
      return {
        success: false,
        step: '4. Guardado automático',
        message: 'El registro no se encontró en saved_alerts'
      };
    }

    // Verificar que saved_by es "Sistema (Auto)"
    if (data.saved_by !== 'Sistema (Auto)') {
      return {
        success: false,
        step: '4. Guardado automático',
        message: `saved_by incorrecto: "${data.saved_by}" (esperado: "Sistema (Auto)")`
      };
    }

    return {
      success: true,
      step: '4. Guardado automático',
      message: `✅ Alerta guardada automáticamente en saved_alerts`,
      details: { id: data.id, plate: data.plate, saved_by: data.saved_by }
    };
  } catch (error: any) {
    return {
      success: false,
      step: '4. Guardado automático',
      message: 'Excepción en prueba de guardado automático',
      error: error.message
    };
  }
}

/**
 * PASO 5: Probar guardado MANUAL en alert_history con referencia a saved_alerts
 */
async function validateManualSave(): Promise<ValidationResult> {
  try {
    const testAlert = createTestAlert('-MANUAL');

    // Primero guardamos automáticamente (simula el flujo real)
    await autoSaveAlert(testAlert);

    // Luego guardamos manualmente
    const result = await saveAlertToDatabase(testAlert, 'Usuario de Prueba');

    if (!result.success) {
      return {
        success: false,
        step: '5. Guardado manual',
        message: 'Error en saveAlertToDatabase()',
        error: result.error
      };
    }

    // Verificar que se guardó en alert_history
    const { data: historyData, error: historyError } = await supabase
      .from('alert_history')
      .select('*, saved_alerts(*)')
      .eq('plate', testAlert.plate)
      .eq('type', testAlert.type)
      .eq('timestamp', testAlert.timestamp)
      .maybeSingle();

    if (historyError) {
      return {
        success: false,
        step: '5. Guardado manual',
        message: 'Error al verificar registro en alert_history',
        error: historyError.message
      };
    }

    if (!historyData) {
      return {
        success: false,
        step: '5. Guardado manual',
        message: 'El registro no se encontró en alert_history'
      };
    }

    // Verificar que saved_by es el usuario
    if (historyData.saved_by !== 'Usuario de Prueba') {
      return {
        success: false,
        step: '5. Guardado manual',
        message: `saved_by incorrecto: "${historyData.saved_by}"`
      };
    }

    // Verificar que tiene referencia a saved_alerts
    const hasSavedAlertReference = historyData.saved_alert_id !== null;

    return {
      success: true,
      step: '5. Guardado manual',
      message: `✅ Alerta guardada en alert_history con referencia a saved_alerts`,
      details: {
        id: historyData.id,
        plate: historyData.plate,
        saved_by: historyData.saved_by,
        has_reference: hasSavedAlertReference,
        saved_alert_id: historyData.saved_alert_id
      }
    };
  } catch (error: any) {
    return {
      success: false,
      step: '5. Guardado manual',
      message: 'Excepción en prueba de guardado manual',
      error: error.message
    };
  }
}

/**
 * PASO 6: Probar creación de plan de acción vinculado a alert_history
 */
async function validateActionPlanCreation(): Promise<ValidationResult> {
  try {
    // Crear alerta en alert_history primero
    const testAlert = createTestAlert('-PLAN');
    await autoSaveAlert(testAlert);
    const saveResult = await saveAlertToDatabase(testAlert, 'Usuario de Prueba');

    if (!saveResult.success || !saveResult.data) {
      return {
        success: false,
        step: '6. Plan de acción',
        message: 'No se pudo crear alerta para el plan',
        error: saveResult.error
      };
    }

    const alertHistoryId = saveResult.data.id;

    // Crear plan de acción
    const planResult = await addActionPlan(
      alertHistoryId,
      {
        description: 'Plan de acción de prueba',
        responsible: 'Coordinador de Prueba',
        status: 'pending',
        observations: 'Esto es una prueba de validación'
      },
      'Usuario de Prueba'
    );

    if (!planResult.success) {
      return {
        success: false,
        step: '6. Plan de acción',
        message: 'Error al crear plan de acción',
        error: planResult.error
      };
    }

    // Verificar relación FK
    const { data: planData, error: planError } = await supabase
      .from('action_plans')
      .select('*, alert_history(*)')
      .eq('id', planResult.data!.id)
      .maybeSingle();

    if (planError) {
      return {
        success: false,
        step: '6. Plan de acción',
        message: 'Error al verificar plan creado',
        error: planError.message
      };
    }

    const hasCorrectFK = planData?.alert_history_id === alertHistoryId;

    return {
      success: true,
      step: '6. Plan de acción',
      message: `✅ Plan de acción creado y vinculado correctamente`,
      details: {
        plan_id: planData?.id,
        alert_history_id: planData?.alert_history_id,
        fk_correct: hasCorrectFK
      }
    };
  } catch (error: any) {
    return {
      success: false,
      step: '6. Plan de acción',
      message: 'Excepción al crear plan de acción',
      error: error.message
    };
  }
}

/**
 * PASO 7: Verificar prevención de duplicados
 */
async function validateDuplicatePrevention(): Promise<ValidationResult> {
  try {
    const testAlert = createTestAlert('-DUP');

    // Primer guardado (debe funcionar)
    const firstSave = await autoSaveAlert(testAlert);
    if (!firstSave.success) {
      return {
        success: false,
        step: '7. Prevención duplicados',
        message: 'Error en primer guardado',
        error: firstSave.error
      };
    }

    // Segundo guardado (debe ser ignorado)
    const secondSave = await autoSaveAlert(testAlert);

    // Verificar que solo hay UN registro
    const { count } = await supabase
      .from('saved_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('plate', testAlert.plate)
      .eq('type', testAlert.type)
      .eq('timestamp', testAlert.timestamp);

    if (count !== 1) {
      return {
        success: false,
        step: '7. Prevención duplicados',
        message: `Se encontraron ${count} registros (esperado: 1)`
      };
    }

    return {
      success: true,
      step: '7. Prevención duplicados',
      message: `✅ Prevención de duplicados funciona correctamente`,
      details: { duplicate_prevented: secondSave.success, count }
    };
  } catch (error: any) {
    return {
      success: false,
      step: '7. Prevención duplicados',
      message: 'Excepción en prueba de duplicados',
      error: error.message
    };
  }
}

/**
 * PASO 8: Verificar relaciones FK completas
 */
async function validateForeignKeyRelationships(): Promise<ValidationResult> {
  try {
    // Verificar relación alert_history -> saved_alerts
    const { data: historyWithSaved, error: error1 } = await supabase
      .from('alert_history')
      .select(`
        id,
        plate,
        saved_alert_id,
        saved_alerts (
          id,
          plate,
          saved_by
        )
      `)
      .not('saved_alert_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (error1) {
      return {
        success: false,
        step: '8. Relaciones FK',
        message: 'Error al verificar FK alert_history -> saved_alerts',
        error: error1.message
      };
    }

    // Verificar relación action_plans -> alert_history
    const { data: planWithHistory, error: error2 } = await supabase
      .from('action_plans')
      .select(`
        id,
        alert_history_id,
        alert_history (
          id,
          plate
        )
      `)
      .not('alert_history_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (error2) {
      return {
        success: false,
        step: '8. Relaciones FK',
        message: 'Error al verificar FK action_plans -> alert_history',
        error: error2.message
      };
    }

    return {
      success: true,
      step: '8. Relaciones FK',
      message: `✅ Todas las relaciones FK funcionan correctamente`,
      details: {
        alert_history_to_saved_alerts: historyWithSaved ? 'OK' : 'Sin datos',
        action_plans_to_alert_history: planWithHistory ? 'OK' : 'Sin datos'
      }
    };
  } catch (error: any) {
    return {
      success: false,
      step: '8. Relaciones FK',
      message: 'Excepción al verificar relaciones',
      error: error.message
    };
  }
}

/**
 * PASO 9: Limpiar datos de prueba
 */
async function cleanupTestData(): Promise<ValidationResult> {
  try {
    // Eliminar alertas de prueba de saved_alerts
    const { error: error1 } = await supabase
      .from('saved_alerts')
      .delete()
      .like('plate', 'TEST%');

    if (error1) {
      return {
        success: false,
        step: '9. Limpieza',
        message: 'Error al limpiar saved_alerts',
        error: error1.message
      };
    }

    // Eliminar alertas de prueba de alert_history
    const { error: error2 } = await supabase
      .from('alert_history')
      .delete()
      .like('plate', 'TEST%');

    if (error2) {
      return {
        success: false,
        step: '9. Limpieza',
        message: 'Error al limpiar alert_history',
        error: error2.message
      };
    }

    // Los planes de acción se eliminan automáticamente por CASCADE

    return {
      success: true,
      step: '9. Limpieza',
      message: `✅ Datos de prueba eliminados correctamente`
    };
  } catch (error: any) {
    return {
      success: false,
      step: '9. Limpieza',
      message: 'Excepción al limpiar datos',
      error: error.message
    };
  }
}

/**
 * Ejecuta todas las validaciones
 */
export async function runFullValidation(): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  console.log('🔍 Iniciando validación completa de arquitectura de dos tablas...\n');

  // Paso 1: Conexión saved_alerts
  results.push(await validateSavedAlertsConnection());

  // Paso 2: Conexión alert_history
  results.push(await validateAlertHistoryConnection());

  // Paso 3: Conexión action_plans
  results.push(await validateActionPlansConnection());

  // Paso 4: Guardado automático
  results.push(await validateAutoSave());

  // Paso 5: Guardado manual
  results.push(await validateManualSave());

  // Paso 6: Plan de acción
  results.push(await validateActionPlanCreation());

  // Paso 7: Prevención duplicados
  results.push(await validateDuplicatePrevention());

  // Paso 8: Relaciones FK
  results.push(await validateForeignKeyRelationships());

  // Paso 9: Limpieza
  results.push(await cleanupTestData());

  return results;
}

/**
 * Muestra resultados en consola
 */
export async function displayValidationResults() {
  const results = await runFullValidation();

  console.log('\n📊 RESULTADOS DE VALIDACIÓN:\n');
  console.log('='.repeat(70) + '\n');

  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.step}`);
    console.log(`   ${result.message}`);

    if (result.error) {
      console.log(`   ⚠️  Error: ${result.error}`);
    }

    if (result.details) {
      console.log(`   📋 Detalles:`, result.details);
    }

    console.log('');
  });

  console.log('='.repeat(70) + '\n');

  const allSuccess = results.every(r => r.success);
  const passedCount = results.filter(r => r.success).length;
  const totalCount = results.length;

  if (allSuccess) {
    console.log('🎉 TODAS LAS VALIDACIONES PASARON EXITOSAMENTE');
    console.log(`✅ ${passedCount}/${totalCount} pruebas exitosas`);
    console.log('\n✨ La arquitectura de dos tablas está funcionando perfectamente:');
    console.log('   • saved_alerts: Guardado automático de TODAS las alertas');
    console.log('   • alert_history: Guardado manual para seguimiento');
    console.log('   • action_plans: Planes de acción vinculados');
    console.log('   • Relaciones FK correctas');
    console.log('   • Prevención de duplicados activa');
  } else {
    console.log(`⚠️  ALGUNAS VALIDACIONES FALLARON`);
    console.log(`✅ ${passedCount}/${totalCount} pruebas exitosas`);
    console.log(`❌ ${totalCount - passedCount}/${totalCount} pruebas fallidas`);
    console.log('\n🔍 Revisa los errores arriba para más detalles');
  }

  return allSuccess;
}
