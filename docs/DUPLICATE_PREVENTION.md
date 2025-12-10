# 🔍 Sistema de Prevención de Duplicados

## 🎯 Pregunta: ¿Cómo diferencia el sistema si una alerta ya fue registrada?

---

## ⚡ Respuesta Rápida

El sistema usa **3 campos clave** para identificar alertas únicas:

```
Criterio Único = plate + timestamp + type

Ejemplo:
  "ABC123" + "2025-12-10T14:30:00.000Z" + "Exceso de Velocidad"
```

Si estos 3 valores coinciden → **ES DUPLICADO** ❌

---

## 🏗️ Arquitectura de Prevención

El sistema tiene **3 niveles** de protección contra duplicados:

```
┌─────────────────────────────────────────────────────────┐
│         NIVEL 1: Frontend (Memoria - Temporal)          │
│                                                          │
│  App.tsx - Deduplicación en tiempo real                │
│  - Ventana: Últimos 5 minutos                          │
│  - Criterio: vehicleId + type                          │
│  - Propósito: Evitar mostrar alertas repetidas         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│    NIVEL 2: Frontend → DB (saved_alerts)                │
│                                                          │
│  autoSaveAlert() - Antes de guardar                     │
│  - Verifica en saved_alerts                             │
│  - Criterio: plate + timestamp + type                   │
│  - Propósito: Evitar duplicados en BD                   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│    NIVEL 3: Backend Worker → DB (saved_alerts)          │
│                                                          │
│  alert-monitor - Antes de guardar                       │
│  - Verifica en saved_alerts                             │
│  - Criterio: plate + timestamp + type                   │
│  - Propósito: Evitar duplicados del worker              │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Implementación Detallada

### **NIVEL 1: Frontend - Deduplicación en Memoria**

**Ubicación:** `/App.tsx` líneas 95-103

**Código:**
```typescript
// Remove duplicates (same vehicle + same type within last 5 minutes)
const uniqueAlerts = allAlerts.filter((alert, index, self) => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return index === self.findIndex(a =>
    a.vehicleId === alert.vehicleId &&
    a.type === alert.type &&
    new Date(a.timestamp) >= fiveMinutesAgo
  );
});
```

**Cómo funciona:**
1. Combina alertas nuevas con existentes en memoria
2. Filtra duplicados considerando ventana de 5 minutos
3. Mantiene solo la primera ocurrencia de cada alerta

**Propósito:**
- ✅ Evitar mostrar alertas repetidas en UI
- ✅ Reducir ruido visual
- ⚠️ **NO persiste** en base de datos (solo memoria)

**Ejemplo:**
```javascript
// T=14:30:00 - Primera detección
Alert { vehicleId: "V123", type: "Exceso de Velocidad" }  // ✅ Mostrar

// T=14:31:00 - Segunda detección (1 min después)
Alert { vehicleId: "V123", type: "Exceso de Velocidad" }  // ❌ Ocultar (duplicado)

// T=14:36:00 - Tercera detección (6 min después)
Alert { vehicleId: "V123", type: "Exceso de Velocidad" }  // ✅ Mostrar (fuera de ventana)
```

---

### **NIVEL 2: Frontend → Base de Datos**

**Ubicación:** `/services/databaseService.ts` líneas 51-63

**Código:**
```typescript
export async function autoSaveAlert(alert: Alert) {
  // 1. Verificar duplicados en saved_alerts
  const isDuplicate = await DataCleanupService.checkDuplicate('saved_alerts', {
    plate: alert.plate,        // ← Campo 1
    timestamp: alert.timestamp, // ← Campo 2
    type: alert.type           // ← Campo 3
  });

  // 2. Si ya existe, retornar éxito sin guardar
  if (isDuplicate) {
    console.log('Alerta duplicada, no se guarda');
    return { success: true };  // ← NO es error, simplemente ya existe
  }

  // 3. Si NO existe, guardar en base de datos
  const { data, error } = await supabase
    .from('saved_alerts')
    .insert(alertData);
}
```

**Función auxiliar:** `/services/dataCleanupService.ts` líneas 276-296

```typescript
static async checkDuplicate(
  table: 'saved_alerts' | 'alert_history' | 'inspections',
  uniqueFields: Record<string, any>
): Promise<boolean> {
  try {
    // Construye query dinámicamente con los campos únicos
    let query = supabase
      .from(table)
      .select('id', { count: 'exact', head: true });

    // Aplica filtros por cada campo
    Object.entries(uniqueFields).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    // Ejecuta query y retorna si existe
    const { count, error } = await query;
    return (count || 0) > 0;  // true si count > 0
  } catch (error) {
    console.error('Error al verificar duplicados:', error);
    return false;
  }
}
```

**Query SQL equivalente:**
```sql
SELECT COUNT(id)
FROM saved_alerts
WHERE plate = 'ABC123'
  AND timestamp = '2025-12-10T14:30:00.000Z'
  AND type = 'Exceso de Velocidad';

-- Si COUNT > 0 → Duplicado ❌
-- Si COUNT = 0 → Único ✅
```

**Propósito:**
- ✅ Evitar duplicados en base de datos
- ✅ Protección a nivel de aplicación
- ✅ Funciona con cualquier tabla (saved_alerts, alert_history)

---

### **NIVEL 3: Backend Worker → Base de Datos**

**Ubicación:** `/supabase/functions/alert-monitor/index.ts` líneas 314-333

**Código:**
```typescript
async function checkDuplicate(
  supabase: any,
  plate: string,
  timestamp: string,
  type: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from('saved_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('plate', plate)
    .eq('timestamp', timestamp)
    .eq('type', type);

  if (error) {
    console.error('[DB] Error checking duplicate:', error);
    return false;
  }

  return (count || 0) > 0;
}

// Uso en el worker
for (const alert of allAlerts) {
  const isDuplicate = await checkDuplicate(
    supabase,
    alert.plate,
    alert.timestamp,
    alert.type
  );

  if (isDuplicate) {
    duplicateCount++;
    console.log(`[DB] Duplicate skipped: ${alert.plate} - ${alert.type}`);
    continue;  // ← Salta al siguiente
  }

  // Guardar solo si NO es duplicado
  const success = await saveAlert(supabase, alert);
}
```

**Propósito:**
- ✅ Evitar duplicados del worker 24/7
- ✅ Misma lógica que frontend
- ✅ Logs detallados de duplicados detectados

---

## 🧪 Ejemplos Prácticos

### **Caso 1: Mismo vehículo, misma alerta, mismo momento**

```javascript
// Primera ejecución (14:30:00)
Alert {
  plate: "ABC123",
  timestamp: "2025-12-10T14:30:00.000Z",
  type: "Exceso de Velocidad",
  speed: 95
}
// ✅ Guardado en saved_alerts (ID: 1)

// Segunda ejecución (14:35:00 - siguiente ciclo)
Alert {
  plate: "ABC123",
  timestamp: "2025-12-10T14:30:00.000Z",  // ← MISMO timestamp
  type: "Exceso de Velocidad",
  speed: 95
}
// ❌ DUPLICADO - NO se guarda
// Razón: plate + timestamp + type coinciden
```

**Log esperado:**
```
[DB] Duplicate alert skipped: ABC123 - Exceso de Velocidad
```

---

### **Caso 2: Mismo vehículo, misma alerta, diferente momento**

```javascript
// Primera detección (14:30:00)
Alert {
  plate: "ABC123",
  timestamp: "2025-12-10T14:30:00.000Z",
  type: "Exceso de Velocidad",
  speed: 95
}
// ✅ Guardado (ID: 1)

// Segunda detección (14:40:00)
Alert {
  plate: "ABC123",
  timestamp: "2025-12-10T14:40:00.000Z",  // ← Diferente timestamp
  type: "Exceso de Velocidad",
  speed: 98
}
// ✅ GUARDADO - NO es duplicado
// Razón: timestamp diferente = evento diferente
```

**Log esperado:**
```
[DB] ✅ Alert saved: ABC123 - Exceso de Velocidad
```

---

### **Caso 3: Mismo vehículo, mismo momento, diferentes alertas**

```javascript
// Alerta 1
Alert {
  plate: "ABC123",
  timestamp: "2025-12-10T14:30:00.000Z",
  type: "Exceso de Velocidad",
  speed: 95
}
// ✅ Guardado (ID: 1)

// Alerta 2 (mismo timestamp)
Alert {
  plate: "ABC123",
  timestamp: "2025-12-10T14:30:00.000Z",  // ← MISMO timestamp
  type: "Frenada Brusca",                  // ← Diferente tipo
  speed: 95
}
// ✅ GUARDADO - NO es duplicado
// Razón: type diferente = alerta diferente
```

**Log esperado:**
```
[DB] ✅ Alert saved: ABC123 - Exceso de Velocidad
[DB] ✅ Alert saved: ABC123 - Frenada Brusca
```

---

### **Caso 4: Diferentes vehículos, misma alerta**

```javascript
// Vehículo 1
Alert {
  plate: "ABC123",
  timestamp: "2025-12-10T14:30:00.000Z",
  type: "Exceso de Velocidad"
}
// ✅ Guardado (ID: 1)

// Vehículo 2 (mismo timestamp)
Alert {
  plate: "XYZ789",                         // ← Diferente placa
  timestamp: "2025-12-10T14:30:00.000Z",
  type: "Exceso de Velocidad"
}
// ✅ GUARDADO - NO es duplicado
// Razón: plate diferente = vehículo diferente
```

---

## 🔐 Protección Adicional: Índice Único (Opcional)

Para **garantizar** a nivel de base de datos que no se guarden duplicados, puedes crear un índice único:

### **SQL para crear índice único:**

```sql
-- Crear índice único compuesto
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_alerts_unique
ON saved_alerts(plate, timestamp, type);
```

**Ventajas:**
- ✅ Protección a nivel de base de datos (más segura)
- ✅ PostgreSQL rechaza inserts duplicados automáticamente
- ✅ No depende del código de aplicación

**Desventajas:**
- ⚠️ Si intentas insertar duplicado, retorna error (no silencioso)
- ⚠️ Requiere manejar errores de constraint violation

**Ejemplo de manejo:**
```typescript
try {
  const { data, error } = await supabase
    .from('saved_alerts')
    .insert(alertData);

  if (error?.code === '23505') {  // Unique violation
    console.log('Duplicado detectado por índice único');
    return { success: true };  // No es error
  }
} catch (e) {
  // Manejar error
}
```

---

## 📊 Flujo Completo

```
┌────────────────────────────────────────────────┐
│ 1. Detección de Alerta                         │
│    - Vehículo ABC123 excede velocidad          │
│    - Speed: 95 km/h                             │
│    - Timestamp: 2025-12-10T14:30:00.000Z       │
└────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────┐
│ 2. Nivel 1: Deduplicación en Memoria          │
│    - Buscar en alertas activas (5 min)        │
│    - ¿Existe ABC123 + Velocidad?              │
│      → NO → Continuar                          │
└────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────┐
│ 3. Mostrar en UI (Tab "Alertas")              │
│    - Usuario ve la alerta                      │
│    - Puede copiar o guardar manualmente        │
└────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────┐
│ 4. Nivel 2: autoSaveAlert()                    │
│    - Verificar en saved_alerts:                │
│      SELECT COUNT(*) WHERE                     │
│        plate = 'ABC123' AND                    │
│        timestamp = '2025-12-10T14:30:00' AND   │
│        type = 'Exceso de Velocidad'            │
│    - Resultado: 0 (no existe)                  │
│      → Guardar en saved_alerts                 │
└────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────┐
│ 5. Guardado en saved_alerts                    │
│    - INSERT INTO saved_alerts                  │
│    - saved_by: 'Sistema (Auto)'                │
│    - ID generado: UUID                         │
└────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────┐
│ 6. Siguiente ciclo (5 min después)             │
│    - Worker detecta misma alerta               │
│    - Nivel 3: checkDuplicate()                 │
│    - Resultado: 1 (ya existe)                  │
│      → ❌ NO guardar (duplicado)               │
│      → duplicateCount++                        │
└────────────────────────────────────────────────┘
```

---

## 🧪 Validación del Sistema

### **Query para detectar duplicados existentes:**

```sql
-- Buscar alertas duplicadas en saved_alerts
SELECT
  plate,
  timestamp,
  type,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id) as alert_ids
FROM saved_alerts
GROUP BY plate, timestamp, type
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
```

**Resultado esperado:**
```
(0 rows)
```
✅ Si retorna 0 filas = Sin duplicados

---

### **Query para monitorear duplicados detectados:**

```sql
-- Ver estadísticas de duplicados (últimas 24h)
-- Nota: Requiere logging en worker_logs

SELECT
  DATE_TRUNC('hour', executed_at) as hour,
  SUM(alerts_detected) as total_detected,
  SUM(alerts_saved) as total_saved,
  SUM(alerts_duplicates) as total_duplicates,
  ROUND(
    (SUM(alerts_duplicates)::decimal / SUM(alerts_detected) * 100),
    2
  ) as duplicate_rate_pct
FROM worker_logs
WHERE executed_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

---

## ⚙️ Configuración Adicional

### **Variables importantes:**

```typescript
// Frontend: App.tsx
const DUPLICATE_WINDOW = 5 * 60 * 1000;  // 5 minutos en ms

// Backend: index.ts
const CHECK_DUPLICATE_FIELDS = ['plate', 'timestamp', 'type'];
```

### **Ajustar ventana de deduplicación:**

```typescript
// Si quieres cambiar de 5 a 10 minutos:
const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
```

---

## 🎯 Resumen Ejecutivo

| Pregunta | Respuesta |
|----------|-----------|
| **¿Qué hace único a una alerta?** | `plate + timestamp + type` |
| **¿Cuántos niveles de protección hay?** | 3 niveles (Memoria, Frontend→DB, Worker→DB) |
| **¿Se pueden guardar duplicados?** | No, sistema previene en todos los niveles |
| **¿Qué pasa si se intenta duplicado?** | Se detecta, NO se guarda, retorna success:true |
| **¿Cómo validar que funciona?** | Query SQL para buscar duplicados (0 rows) |
| **¿Hay protección en base de datos?** | Opcional: Índice único compuesto |

---

## 🔍 Logs de Ejemplo

### **Logs del Worker (sin duplicados):**
```
🚀 Alert Monitor Worker started
📡 Fetching fleet data...
📊 Total vehicles: 78 (Coltrack: 45, Fagor: 33)
🔍 Detecting alerts...
⚠️  Detected 12 alerts
💾 Saving alerts to database...
✅ Alert saved: ABC123 - Exceso de Velocidad
✅ Alert saved: XYZ789 - Frenada Brusca
✅ Alert saved: DEF456 - Exceso de Velocidad
...
✅ Worker completed successfully
{
  "alerts": {
    "detected": 12,
    "saved": 12,
    "duplicates": 0,
    "errors": 0
  }
}
```

### **Logs del Worker (con duplicados detectados):**
```
🚀 Alert Monitor Worker started
📡 Fetching fleet data...
📊 Total vehicles: 78 (Coltrack: 45, Fagor: 33)
🔍 Detecting alerts...
⚠️  Detected 12 alerts
💾 Saving alerts to database...
✅ Alert saved: ABC123 - Exceso de Velocidad
[DB] Duplicate skipped: ABC123 - Exceso de Velocidad
✅ Alert saved: XYZ789 - Frenada Brusca
[DB] Duplicate skipped: XYZ789 - Frenada Brusca
[DB] Duplicate skipped: DEF456 - Exceso de Velocidad
...
✅ Worker completed successfully
{
  "alerts": {
    "detected": 12,
    "saved": 5,
    "duplicates": 7,  ← Duplicados detectados
    "errors": 0
  }
}
```

---

**Última actualización:** 2025-12-10
**Documento:** Prevención de Duplicados - Sistema Completo
