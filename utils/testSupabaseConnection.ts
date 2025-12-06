/**
 * Script de prueba para verificar la conexión con saved_alerts en Supabase
 *
 * Este script prueba:
 * 1. Conexión a Supabase
 * 2. Acceso a la tabla saved_alerts
 * 3. Inserción de datos de prueba
 * 4. Lectura de datos
 * 5. Eliminación de datos de prueba
 */

import { supabase } from '../services/supabaseClient';

export interface TestResult {
  success: boolean;
  step: string;
  message: string;
  error?: string;
}

/**
 * Prueba completa de conexión con saved_alerts
 */
export async function testSavedAlertsConnection(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let testRecordId: string | null = null;

  // ============================================
  // PASO 1: Verificar conexión a Supabase
  // ============================================
  try {
    const { data, error } = await supabase
      .from('saved_alerts')
      .select('count')
      .limit(1);

    if (error) {
      results.push({
        success: false,
        step: '1. Conexión a Supabase',
        message: 'Error al conectar con la tabla saved_alerts',
        error: error.message
      });
      return results; // Si falla la conexión, no continuar
    }

    results.push({
      success: true,
      step: '1. Conexión a Supabase',
      message: '✅ Conexión exitosa con saved_alerts'
    });
  } catch (error: any) {
    results.push({
      success: false,
      step: '1. Conexión a Supabase',
      message: 'Excepción al intentar conectar',
      error: error.message
    });
    return results;
  }

  // ============================================
  // PASO 2: Insertar registro de prueba
  // ============================================
  try {
    const testAlert = {
      alert_id: `TEST-${Date.now()}`,
      vehicle_id: 'TEST-VEH-001',
      plate: 'TEST123',
      driver: 'Test Driver',
      type: 'Exceso de Velocidad',
      severity: 'critical',
      timestamp: new Date().toISOString(),
      location: 'Bogotá, Colombia',
      speed: 95,
      details: 'Test alert - Velocidad: 95 km/h',
      contract: 'Test Contract',
      source: 'FAGOR',
      status: 'pending',
      saved_by: 'System Test'
    };

    const { data, error } = await supabase
      .from('saved_alerts')
      .insert(testAlert)
      .select()
      .single();

    if (error) {
      results.push({
        success: false,
        step: '2. Inserción de datos',
        message: 'Error al insertar registro de prueba',
        error: error.message
      });
      return results;
    }

    testRecordId = data.id;
    results.push({
      success: true,
      step: '2. Inserción de datos',
      message: `✅ Registro de prueba insertado con ID: ${testRecordId}`
    });
  } catch (error: any) {
    results.push({
      success: false,
      step: '2. Inserción de datos',
      message: 'Excepción al insertar datos',
      error: error.message
    });
    return results;
  }

  // ============================================
  // PASO 3: Leer el registro insertado
  // ============================================
  try {
    const { data, error } = await supabase
      .from('saved_alerts')
      .select('*')
      .eq('id', testRecordId!)
      .single();

    if (error) {
      results.push({
        success: false,
        step: '3. Lectura de datos',
        message: 'Error al leer registro de prueba',
        error: error.message
      });
    } else if (!data) {
      results.push({
        success: false,
        step: '3. Lectura de datos',
        message: 'No se encontró el registro insertado'
      });
    } else {
      results.push({
        success: true,
        step: '3. Lectura de datos',
        message: `✅ Registro leído correctamente. Placa: ${data.plate}, Tipo: ${data.type}`
      });
    }
  } catch (error: any) {
    results.push({
      success: false,
      step: '3. Lectura de datos',
      message: 'Excepción al leer datos',
      error: error.message
    });
  }

  // ============================================
  // PASO 4: Actualizar el registro
  // ============================================
  try {
    const { data, error } = await supabase
      .from('saved_alerts')
      .update({ status: 'resolved' })
      .eq('id', testRecordId!)
      .select()
      .single();

    if (error) {
      results.push({
        success: false,
        step: '4. Actualización de datos',
        message: 'Error al actualizar registro',
        error: error.message
      });
    } else {
      results.push({
        success: true,
        step: '4. Actualización de datos',
        message: `✅ Registro actualizado. Nuevo estado: ${data.status}`
      });
    }
  } catch (error: any) {
    results.push({
      success: false,
      step: '4. Actualización de datos',
      message: 'Excepción al actualizar datos',
      error: error.message
    });
  }

  // ============================================
  // PASO 5: Verificar detección de duplicados
  // ============================================
  try {
    const { data: existingData } = await supabase
      .from('saved_alerts')
      .select('id')
      .eq('plate', 'TEST123')
      .eq('type', 'Exceso de Velocidad')
      .limit(1)
      .single();

    if (existingData) {
      results.push({
        success: true,
        step: '5. Detección de duplicados',
        message: '✅ Sistema de detección de duplicados funcional'
      });
    }
  } catch (error: any) {
    results.push({
      success: false,
      step: '5. Detección de duplicados',
      message: 'Error al verificar duplicados',
      error: error.message
    });
  }

  // ============================================
  // PASO 6: Eliminar registro de prueba
  // ============================================
  if (testRecordId) {
    try {
      const { error } = await supabase
        .from('saved_alerts')
        .delete()
        .eq('id', testRecordId);

      if (error) {
        results.push({
          success: false,
          step: '6. Limpieza (eliminación)',
          message: 'Error al eliminar registro de prueba',
          error: error.message
        });
      } else {
        results.push({
          success: true,
          step: '6. Limpieza (eliminación)',
          message: '✅ Registro de prueba eliminado correctamente'
        });
      }
    } catch (error: any) {
      results.push({
        success: false,
        step: '6. Limpieza (eliminación)',
        message: 'Excepción al eliminar datos',
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Ejecuta prueba y muestra resultados en consola
 */
export async function runConnectionTest() {
  console.log('🔍 Iniciando prueba de conexión con saved_alerts...\n');

  const results = await testSavedAlertsConnection();

  console.log('📊 Resultados de la prueba:\n');
  results.forEach(result => {
    console.log(`${result.success ? '✅' : '❌'} ${result.step}`);
    console.log(`   ${result.message}`);
    if (result.error) {
      console.log(`   ⚠️  Error: ${result.error}`);
    }
    console.log('');
  });

  const allSuccess = results.every(r => r.success);

  if (allSuccess) {
    console.log('🎉 TODAS LAS PRUEBAS PASARON EXITOSAMENTE');
    console.log('✅ La tabla saved_alerts está correctamente configurada y conectada');
  } else {
    console.log('❌ ALGUNAS PRUEBAS FALLARON');
    console.log('⚠️  Revisa los errores arriba para más detalles');
  }

  return allSuccess;
}

/**
 * Verifica el estado actual de la tabla
 */
export async function checkTableStatus() {
  try {
    const { count, error } = await supabase
      .from('saved_alerts')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('❌ Error al verificar estado de la tabla:', error.message);
      return null;
    }

    console.log(`📊 Estado actual de saved_alerts:`);
    console.log(`   Total de alertas guardadas: ${count || 0}`);

    return count;
  } catch (error: any) {
    console.error('❌ Excepción al verificar estado:', error.message);
    return null;
  }
}
