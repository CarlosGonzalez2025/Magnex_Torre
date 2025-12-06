# 🏗️ Arquitectura de Dos Tablas para Alertas

## 📊 Resumen

El sistema utiliza **DOS tablas separadas** con propósitos distintos:

| Tabla | Propósito | Guardado | Retención | Gestión |
|-------|-----------|----------|-----------|---------|
| **`saved_alerts`** | Registro completo de TODAS las alertas | **AUTOMÁTICO** | 7-30 días | Análisis, reportes, auditoría PESV |
| **`alert_history`** | Alertas con seguimiento activo | **MANUAL** | Permanente | Gestión, planes de acción, resolución |

---

## 🔄 Flujo Completo de Alertas

```
┌─────────────────────────────────────────────────────────────┐
│ 1. DETECCIÓN (cada 5 minutos)                               │
│    fetchData() → detectAlerts()                             │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. GUARDADO AUTOMÁTICO EN saved_alerts                      │
│    autoSaveAlert() → Supabase.saved_alerts.insert()         │
│    ✅ TODAS las alertas                                     │
│    ✅ Sin intervención manual                               │
│    ✅ Para cumplimiento PESV                                │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. MOSTRAR EN PANEL                                          │
│    AlertPanel → Usuario ve las alertas                      │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
                   ¿Requiere seguimiento?
                          │
                ┌─────────┴─────────┐
                │                   │
               NO                  SÍ
                │                   │
                ↓                   ↓
┌───────────────────────┐  ┌──────────────────────────────────┐
│ 4A. PERMANECE EN      │  │ 4B. GUARDADO MANUAL EN           │
│     saved_alerts      │  │     alert_history                │
│                       │  │                                  │
│ Se limpia después     │  │  saveAlertToDatabase()           │
│ de 7-30 días         │  │  → Supabase.alert_history.insert()│
│                       │  │                                  │
│                       │  │  ✅ Solo alertas importantes     │
│                       │  │  ✅ Con referencia a saved_alerts│
│                       │  │  ✅ NO se elimina automáticamente│
└───────────────────────┘  └──────────┬───────────────────────┘
                                      ↓
                          ┌────────────────────────────┐
                          │ 5. GESTIÓN Y SEGUIMIENTO   │
                          │    - Crear planes de acción│
                          │    - Actualizar estado     │
                          │    - Resolver              │
                          └────────────────────────────┘
```

---

## 📋 Tabla 1: `saved_alerts` (Registro Automático)

### Propósito
- Registro completo de **TODAS** las alertas detectadas
- Para análisis, reportes y cumplimiento PESV
- Retención temporal según políticas

### Estructura
```sql
CREATE TABLE saved_alerts (
  id UUID PRIMARY KEY,
  alert_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  plate TEXT NOT NULL,
  driver TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,  -- critical, high, medium, low
  timestamp TIMESTAMPTZ NOT NULL,  -- Hora del EVENTO
  location TEXT NOT NULL,
  speed NUMERIC NOT NULL,
  details TEXT NOT NULL,
  contract TEXT,
  source TEXT NOT NULL,  -- FAGOR, COLTRACK
  status TEXT DEFAULT 'pending',
  saved_at TIMESTAMPTZ DEFAULT NOW(),  -- Hora de GUARDADO
  saved_by TEXT DEFAULT 'Sistema (Auto)',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Características
- ✅ Guardado **AUTOMÁTICO** cada 5 minutos
- ✅ Prevención de duplicados (placa + timestamp + tipo)
- ✅ Limpieza automática cada 7 días
- ✅ Exportación a Excel antes de eliminar

### Política de Retención
| Estado | Retención | Máximo Registros |
|--------|-----------|------------------|
| `resolved` | 7 días | 1,000 |
| `pending` / `in_progress` | 30 días | 500 |

### Función de Guardado
```typescript
// App.tsx - Línea 108-116
if (newAlerts.length > 0) {
  Promise.all(
    newAlerts.map(alert => autoSaveAlert(alert))
  ).catch(error => {
    console.error('Error auto-guardando alertas:', error);
  });
}
```

---

## 📋 Tabla 2: `alert_history` (Seguimiento Manual)

### Propósito
- Alertas que **requieren seguimiento y gestión**
- Para planes de acción, resolución y auditoría
- Retención permanente hasta resolución

### Estructura
```sql
CREATE TABLE alert_history (
  id UUID PRIMARY KEY,
  saved_alert_id UUID REFERENCES saved_alerts(id),  -- Relación
  alert_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  plate TEXT NOT NULL,
  driver TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  speed NUMERIC NOT NULL,
  details TEXT NOT NULL,
  contract TEXT,
  source TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  saved_by TEXT NOT NULL,  -- Usuario que guardó
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Características
- ✅ Guardado **MANUAL** por el usuario
- ✅ Relación con `saved_alerts` vía `saved_alert_id`
- ❌ NO se elimina con limpieza automática
- ✅ Permite planes de acción (tabla `action_plans`)

### Función de Guardado
```typescript
// databaseService.ts - Línea 107
export async function saveAlertToDatabase(alert: Alert, savedBy: string) {
  // 1. Verificar duplicados en alert_history
  // 2. Buscar referencia en saved_alerts
  // 3. Insertar en alert_history con referencia
}
```

---

## 🔗 Relación Entre Tablas

```
saved_alerts (1) ──────── (0..1) alert_history
    │                           │
    │                           │
    │                      action_plans (0..*)
    │                           │
    └───────────────────────────┘
         saved_alert_id FK
```

### Ejemplo de Relación
```typescript
// alert_history tiene referencia a saved_alerts
alert_history {
  id: "uuid-123",
  saved_alert_id: "uuid-456",  // ← Referencia a saved_alerts
  plate: "ABC123",
  type: "Exceso de Velocidad",
  ...
}

// Si existe en saved_alerts
saved_alerts {
  id: "uuid-456",
  plate: "ABC123",
  type: "Exceso de Velocidad",
  saved_by: "Sistema (Auto)",  // ← Guardado automático
  ...
}
```

---

## 🧹 Limpieza Automática

### ¿Qué se Limpia?
| Tabla | ¿Se Limpia? | Frecuencia | Condición |
|-------|-------------|------------|-----------|
| **`saved_alerts`** | ✅ SÍ | Cada 7 días | Alertas > 7-30 días |
| **`alert_history`** | ❌ NO | Nunca | Permanente hasta resolución manual |
| `inspections` | ✅ SÍ | Cada 7 días | Inspecciones > 7 días |
| `action_plans` | ✅ SÍ | Cada 7 días | Planes completados > 30 días |

### Configuración
```typescript
// config/dataRetentionConfig.ts
export const DATA_RETENTION_CONFIG = {
  resolvedAlerts: {
    retentionDays: 7,
    maxRecords: 1000,
    archiveBeforeDelete: true
  },
  activeAlerts: {
    retentionDays: 30,
    maxRecords: 500,
    archiveBeforeDelete: true
  },
  autoCleanup: {
    enabled: true,
    cleanupIntervalDays: 7,
    cleanupHour: 2  // 2 AM
  }
};
```

---

## 📊 Consultas y Estadísticas

### Obtener Alertas en Seguimiento
```typescript
// Lee de alert_history
const { data } = await supabase
  .from('alert_history')
  .select(`
    *,
    action_plans (*)
  `)
  .order('timestamp', { ascending: false });
```

### Obtener Todas las Alertas (Análisis)
```typescript
// Lee de saved_alerts
const { data } = await supabase
  .from('saved_alerts')
  .select('*')
  .order('timestamp', { ascending: false });
```

### Estadísticas de Uso
```typescript
// dataCleanupService.ts
const stats = await DataCleanupService.getDatabaseStats();
// Retorna: alertCount, inspectionCount, actionPlanCount, estimatedSizeMB
```

---

## ✅ Garantías del Sistema

### 1. No Pérdida de Datos de Gestión
✅ `alert_history` **nunca** se limpia automáticamente
✅ Planes de acción se mantienen intactos
✅ Historial de seguimiento permanente

### 2. Cumplimiento PESV
✅ `saved_alerts` registra todas las alertas (7-30 días)
✅ Suficiente para análisis y reportes regulatorios
✅ Exportación automática antes de eliminar

### 3. Prevención de Duplicados
✅ Verificación en `saved_alerts` antes de guardar
✅ Verificación en `alert_history` antes de agregar
✅ Criterio: placa + timestamp + tipo

### 4. Eficiencia de Almacenamiento
✅ Limpieza automática cada 7 días
✅ Solo alertas importantes en `alert_history`
✅ Gestión de límites por tipo de dato

---

## 🔧 Funciones Principales

| Función | Tabla | Propósito |
|---------|-------|-----------|
| `autoSaveAlert()` | `saved_alerts` | Guardado automático de todas las alertas |
| `saveAlertToDatabase()` | `alert_history` | Guardado manual para seguimiento |
| `getAllSavedAlerts()` | `alert_history` | Obtener alertas en seguimiento |
| `getFilteredAlerts()` | `alert_history` | Filtrar alertas en seguimiento |
| `updateAlertStatus()` | `alert_history` | Actualizar estado de seguimiento |
| `deleteAlert()` | `alert_history` | Eliminar alerta de seguimiento |
| `cleanupResolvedAlerts()` | `saved_alerts` | Limpiar alertas antiguas |
| `checkDuplicate()` | Ambas | Verificar duplicados |

---

## 🚀 Casos de Uso

### Caso 1: Alerta de Exceso de Velocidad
```
1. Sistema detecta velocidad > 80 km/h
2. autoSaveAlert() → saved_alerts ✅ (automático)
3. Operador ve alerta en panel
4. Operador decide NO requerir seguimiento
5. Alerta permanece en saved_alerts
6. Se elimina después de 7 días ✅
```

### Caso 2: Alerta Crítica con Seguimiento
```
1. Sistema detecta botón de pánico
2. autoSaveAlert() → saved_alerts ✅ (automático)
3. Operador ve alerta en panel
4. Operador hace clic en "Guardar" 🔘
5. saveAlertToDatabase() → alert_history ✅ (manual)
6. Se crea plan de acción
7. Se hace seguimiento hasta resolver
8. Permanece en alert_history ✅ (nunca se elimina)
9. saved_alerts se limpia después de 7 días
```

---

## 📝 Verificación Post-Implementación

### 1. Verificar Tabla `saved_alerts`
```sql
SELECT COUNT(*) FROM saved_alerts;
SELECT * FROM saved_alerts WHERE saved_by = 'Sistema (Auto)' LIMIT 5;
```

### 2. Verificar Tabla `alert_history`
```sql
SELECT COUNT(*) FROM alert_history;
SELECT * FROM alert_history WHERE saved_by != 'Sistema (Auto)' LIMIT 5;
```

### 3. Verificar Relación
```sql
SELECT
  ah.plate,
  ah.type,
  ah.saved_by,
  sa.id as saved_alert_id
FROM alert_history ah
LEFT JOIN saved_alerts sa ON ah.saved_alert_id = sa.id
LIMIT 5;
```

---

**Última actualización:** 2025-12-06
**Versión:** 2.0 (Arquitectura de Dos Tablas)
