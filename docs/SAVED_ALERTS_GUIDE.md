# 📚 Guía de Conexión: saved_alerts

## 🔗 Estado de Conexión

✅ **La tabla `saved_alerts` está conectada al sistema**

### Configuración de Supabase

```typescript
// services/supabaseClient.ts
URL: https://ppqlbgpxwcbirarxtgam.supabase.co
Tabla: saved_alerts
Cliente: Configurado y exportado
```

---

## 📊 Flujo Actual de Alertas

### 1️⃣ Detección de Alertas (Automática - cada 5 minutos)

```
fetchData() en App.tsx
  ↓
detectAlerts() en alertService.ts
  ↓
Alertas detectadas → localStorage (caché)
  ↓
Se muestran en AlertPanel
```

**Almacenamiento:** `localStorage` (temporal)
**Frecuencia:** Cada 5 minutos
**Retención:** 24 horas en caché

### 2️⃣ Guardado en Base de Datos (Manual)

```
Usuario hace clic en "Guardar" en AlertPanel
  ↓
handleSaveAlert() en App.tsx (línea 243)
  ↓
saveAlertToDatabase() en databaseService.ts (línea 50)
  ↓
Verificar duplicados (línea 53-64)
  ↓
Si NO es duplicado → INSERT en saved_alerts
  ↓
Alerta guardada en Supabase ✅
```

**Almacenamiento:** `saved_alerts` en Supabase (permanente)
**Frecuencia:** Solo cuando el usuario hace clic
**Retención:** 7-30 días según configuración

---

## ⚠️ IMPORTANTE: Guardado NO es Automático

### 🔴 Estado Actual

❌ Las alertas **NO se guardan automáticamente** en `saved_alerts`
✅ Las alertas se guardan **solo manualmente** con el botón "Guardar"

### Razones del diseño actual:

1. **Evitar sobrecarga de BD**: No todas las alertas requieren acción
2. **Control de usuario**: El operador decide qué alertas son importantes
3. **Ahorro de espacio**: Solo se almacenan alertas relevantes
4. **Cumplimiento PESV**: Solo alertas con seguimiento van a BD

### Flujo de decisión:

```
Alerta detectada
  ↓
¿Es importante? → NO → Queda en caché 24h → Se elimina
  ↓
 SÍ
  ↓
Usuario hace clic "Guardar"
  ↓
Se guarda en saved_alerts
  ↓
Se puede crear plan de acción
  ↓
Queda en historial por 7-30 días
```

---

## 🔄 Proceso de Validación de Conexión

### Script de Prueba Creado:

```typescript
// utils/testSupabaseConnection.ts
import { runConnectionTest } from './utils/testSupabaseConnection';

// Ejecutar en consola del navegador:
runConnectionTest();
```

### Pasos de la Prueba:

1. ✅ Verificar conexión a Supabase
2. ✅ Insertar registro de prueba
3. ✅ Leer el registro insertado
4. ✅ Actualizar el registro
5. ✅ Verificar detección de duplicados
6. ✅ Eliminar registro de prueba

---

## 📝 Verificación Manual

### 1. Verificar tabla en Supabase

```sql
-- Ver estructura de la tabla
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'saved_alerts';

-- Ver total de registros
SELECT COUNT(*) FROM saved_alerts;

-- Ver últimas 5 alertas
SELECT plate, type, severity, timestamp, status
FROM saved_alerts
ORDER BY created_at DESC
LIMIT 5;
```

### 2. Probar guardado desde la UI

1. Ir a la pestaña "Alertas"
2. Esperar a que aparezca una alerta
3. Hacer clic en "Guardar"
4. Verificar mensaje de éxito
5. Ir a la pestaña "Historial"
6. Confirmar que la alerta aparece

### 3. Verificar en Supabase Dashboard

1. Ir a: https://supabase.com/dashboard
2. Seleccionar proyecto
3. Table Editor → saved_alerts
4. Ver registros guardados

---

## 🎯 Funciones Conectadas a saved_alerts

| Función | Archivo | Línea | Acción |
|---------|---------|-------|--------|
| `saveAlertToDatabase()` | databaseService.ts | 50 | INSERT |
| `getAllSavedAlerts()` | databaseService.ts | 114 | SELECT |
| `getFilteredAlerts()` | databaseService.ts | 139 | SELECT con filtros |
| `updateAlertStatus()` | databaseService.ts | 189 | UPDATE |
| `deleteAlert()` | databaseService.ts | 214 | DELETE |
| `cleanupResolvedAlerts()` | dataCleanupService.ts | 80 | DELETE (limpieza automática) |
| `cleanupExcessAlerts()` | dataCleanupService.ts | 125 | DELETE (exceso) |
| `checkDuplicate()` | dataCleanupService.ts | 275 | SELECT (verificación) |

---

## 🔐 Validación de Duplicados

### Cómo funciona:

```typescript
// databaseService.ts línea 53-64
const isDuplicate = await DataCleanupService.checkDuplicate('saved_alerts', {
  plate: alert.plate,        // Misma placa
  timestamp: alert.timestamp, // Mismo timestamp
  type: alert.type           // Mismo tipo
});

if (isDuplicate) {
  return {
    success: false,
    error: 'Esta alerta ya fue guardada anteriormente'
  };
}
```

### Criterios de duplicado:

- ✅ Misma **placa** + **timestamp** + **tipo**
- ✅ Previene registros redundantes
- ✅ Ahorra espacio en BD

---

## 🗑️ Limpieza Automática

### Configuración actual:

```typescript
// config/dataRetentionConfig.ts
resolvedAlerts: {
  retentionDays: 7,   // Alertas resueltas → 7 días
  maxRecords: 1000
}

activeAlerts: {
  retentionDays: 30,  // Alertas activas → 30 días
  maxRecords: 500
}

autoCleanup: {
  enabled: true,
  cleanupIntervalDays: 7,  // Limpieza cada 7 días
  cleanupHour: 2           // A las 2 AM
}
```

### Qué se elimina:

| Tipo | Condición |
|------|-----------|
| Alertas con `status='resolved'` | > 7 días O > 1000 registros |
| Alertas con `status='pending'` o `'in_progress'` | > 30 días O > 500 registros |

---

## ⚙️ Cómo Habilitar Guardado Automático

### Opción 1: Guardar TODAS las alertas automáticamente

**Ventajas:**
- ✅ Historial completo de todos los eventos
- ✅ Sin intervención manual
- ✅ No se pierde ninguna alerta

**Desventajas:**
- ❌ Mayor consumo de espacio en BD
- ❌ Muchas alertas sin seguimiento
- ❌ Puede llenar la BD rápidamente

### Opción 2: Guardar solo alertas CRÍTICAS automáticamente

**Ventajas:**
- ✅ Balance entre automatización y control
- ✅ Solo se guardan eventos importantes
- ✅ Menor consumo de espacio

**Desventajas:**
- ❌ Alertas de baja prioridad se pierden
- ❌ Requiere configuración de criterios

### Opción 3: Guardar según reglas de negocio

**Ventajas:**
- ✅ Máximo control y flexibilidad
- ✅ Se adapta a necesidades específicas
- ✅ Eficiente en uso de recursos

**Desventajas:**
- ❌ Más complejo de implementar
- ❌ Requiere mantenimiento de reglas

---

## 🚀 Próximos Pasos

### Si quieres habilitar guardado automático:

1. Definir criterios (¿todas?, ¿solo críticas?, ¿reglas?)
2. Modificar `fetchData()` en App.tsx
3. Agregar lógica de guardado automático
4. Configurar límites de almacenamiento
5. Ajustar políticas de retención

### Si el guardado manual es suficiente:

✅ **El sistema ya está correctamente configurado**
✅ **No requiere cambios adicionales**

---

## 📞 Soporte

Si tienes dudas o necesitas modificar el comportamiento:

1. Ejecutar `runConnectionTest()` para verificar conexión
2. Revisar logs en consola del navegador
3. Verificar tabla en Supabase Dashboard
4. Revisar esta documentación

---

**Última actualización:** 2025-12-06
**Versión:** 1.0
