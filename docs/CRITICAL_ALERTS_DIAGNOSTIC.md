# 🔍 Diagnóstico de Alertas Críticas - Guía de Troubleshooting

## 📋 Problema Reportado

Usuario reporta que las **alertas críticas** no se están registrando de la manera correcta en el módulo de "Auto-Guardadas" (tabla `saved_alerts`).

## ✅ Soluciones Implementadas

### 1. **Límite de 1000 Registros SOLUCIONADO** ✓

**Problema:** Supabase tiene un límite por defecto de 1000 registros por consulta.

**Solución Implementada:**
- Modificamos `getAllAutoSavedAlerts()` para usar **paginación automática**
- Modificamos `getFilteredAutoSavedAlerts()` para usar **paginación automática**
- Ahora el sistema carga **TODOS** los registros sin límite, haciendo múltiples consultas de 1000 registros hasta obtener todos los datos

**Archivos Modificados:**
- `/services/databaseService.ts` (líneas 103-141 y 146-208)

**Resultado:**
El sistema ahora mostrará **todos** los registros guardados en la base de datos, no solo los primeros 1000.

---

### 2. **Sistema de Diagnóstico para Alertas Críticas** ✓

**Problema:** Necesitamos validar si las alertas críticas se están:
1. Detectando correctamente
2. Guardando en la base de datos
3. Apareciendo en la interfaz

**Solución Implementada:**
Agregamos **logs de diagnóstico detallados** en puntos clave del flujo:

#### 📍 **Punto 1: Detección de Alertas (App.tsx)**
```typescript
// Muestra cuántas alertas críticas se detectaron
console.log(`🚨 [DIAGNÓSTICO] Detectadas X alertas CRÍTICAS de Y totales`)
```

**Ubicación:** `/App.tsx` (líneas 114-120)

#### 📍 **Punto 2: Guardado en Base de Datos (databaseService.ts)**
```typescript
// Antes de guardar
console.log('🚨 [DIAGNÓSTICO] Guardando alerta CRÍTICA:', {...})

// Si hay error
console.error('🚨 [DIAGNÓSTICO] ERROR al guardar alerta CRÍTICA:', {...})

// Si se guardó exitosamente
console.log('✅ [DIAGNÓSTICO] Alerta CRÍTICA guardada exitosamente:', {...})
```

**Ubicación:** `/services/databaseService.ts` (líneas 82-111)

---

## 🔬 Cómo Usar el Sistema de Diagnóstico

### **Paso 1: Abrir la Consola del Navegador**
1. Abre el sistema en el navegador
2. Presiona `F12` o `Ctrl+Shift+I` (Windows/Linux) o `Cmd+Option+I` (Mac)
3. Ve a la pestaña **Console**

### **Paso 2: Esperar a que se Detecte una Alerta Crítica**

Las alertas críticas se generan cuando:
- ✅ **Exceso de Velocidad** (≥80 km/h) → `severity: 'critical'`
- ✅ **Botón de Pánico** activado → `severity: 'critical'`
- ✅ **Batería Desconectada** → `severity: 'critical'`

### **Paso 3: Observar los Logs**

#### ✅ **Flujo EXITOSO** (todo funciona bien):
```
🚨 [DIAGNÓSTICO] Detectadas 1 alertas CRÍTICAS de 3 totales:
   [{plate: "ABC123", type: "Exceso de Velocidad", severity: "critical"}]

🚨 [DIAGNÓSTICO] Guardando alerta CRÍTICA:
   {plate: "ABC123", type: "Exceso de Velocidad", severity: "critical", ...}

✅ [DIAGNÓSTICO] Alerta CRÍTICA guardada exitosamente:
   {id: 123, plate: "ABC123", severity: "critical", ...}
```

#### ❌ **Flujo CON ERRORES** (algo falla):

**Caso 1: Se detecta pero NO se guarda**
```
🚨 [DIAGNÓSTICO] Detectadas 1 alertas CRÍTICAS de 3 totales: [...]
❌ Error auto-saving alert to saved_alerts: [mensaje de error]
🚨 [DIAGNÓSTICO] ERROR al guardar alerta CRÍTICA: {error: "...", alertData: {...}}
```
→ **Problema:** Error en la base de datos (permisos, conexión, schema)

**Caso 2: NO se detecta ninguna alerta crítica**
```
[No aparece ningún log con "DIAGNÓSTICO"]
```
→ **Problema:** Los datos del vehículo NO cumplen las condiciones para alertas críticas

---

## 🔍 Análisis de Posibles Problemas

### **Problema A: Alertas críticas NO se detectan**

**Posible Causa 1: Datos de velocidad no llegan**
```typescript
// En alertService.ts línea 53:
if (vehicle.speed >= ALERT_THRESHOLDS.SPEED_LIMIT) { // 80 km/h
```
**Verificar:** ¿El campo `vehicle.speed` tiene datos válidos?

**Posible Causa 2: Eventos de pánico no llegan con el texto esperado**
```typescript
// En alertService.ts línea 64-67:
if (eventUpper.includes('PANICO') ||
    eventUpper.includes('PANIC') ||
    eventUpper.includes('SOS') ||
    eventUpper.includes('BOTON PANICO'))
```
**Verificar:** ¿El campo `vehicle.event` contiene alguno de estos textos?

### **Problema B: Se detectan pero NO se guardan**

**Posible Causa 1: Error de permisos en Supabase**
```
ERROR: permission denied for table saved_alerts
```
**Solución:** Verificar políticas RLS en Supabase

**Posible Causa 2: Schema incorrecto**
```
ERROR: column "severity" does not exist
```
**Solución:** Verificar que la tabla `saved_alerts` tiene la columna `severity` con tipo `text`

**Posible Causa 3: Tipo de dato incorrecto**
```
ERROR: invalid input syntax for type ...
```
**Solución:** El enum `AlertSeverity.CRITICAL` se convierte a string `'critical'` - verificar compatibilidad

### **Problema C: Se guardan pero NO aparecen en la interfaz**

**Posible Causa: Filtro de severidad activo**
1. Ir al módulo "Auto-Guardadas"
2. Verificar el filtro de "Severidad" - debe estar en **"Todas"**
3. Si está en otro valor, cambiar a "Todas" o "Críticas"

---

## 📊 Verificación en Base de Datos (Supabase)

### **Query SQL para verificar alertas críticas:**
```sql
SELECT
  id,
  plate,
  type,
  severity,
  timestamp,
  saved_at,
  saved_by
FROM saved_alerts
WHERE severity = 'critical'
ORDER BY timestamp DESC
LIMIT 50;
```

### **Query para contar alertas por severidad:**
```sql
SELECT
  severity,
  COUNT(*) as total
FROM saved_alerts
GROUP BY severity
ORDER BY
  CASE severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END;
```

---

## 🛠️ Próximos Pasos (Si el Problema Persiste)

### **1. Verificar Configuración de Alertas**
```typescript
// En alertService.ts - Umbrales configurados:
const ALERT_THRESHOLDS = {
  SPEED_LIMIT: 80, // km/h → Genera alerta crítica
  IDLE_TIME_MINUTES: 10,
  LOW_FUEL: 15
};
```

### **2. Revisar Tipos de Alerta Críticas**
```typescript
// Estos tipos generan severity: CRITICAL
- AlertType.SPEED_VIOLATION → Exceso de Velocidad (≥80 km/h)
- AlertType.PANIC_BUTTON → Botón de Pánico
- AlertType.BATTERY_DISCONNECT → Batería Desconectada
```

### **3. Verificar Estructura de Datos**
Asegurarse que el objeto `Alert` tiene estos campos:
- `severity: 'critical'` (string, no enum)
- `type: AlertType` (enum)
- `plate: string`
- `timestamp: string` (ISO format)

---

## 📞 Reporte de Problema

Si después de revisar los logs y queries SQL el problema persiste, proporciona:

1. **Logs de consola** completos (F12 → Console → copiar todo)
2. **Resultado de la query SQL** de alertas críticas
3. **Datos de ejemplo** de un vehículo que debería generar alerta crítica:
   ```json
   {
     "plate": "ABC123",
     "speed": 85,
     "event": "...",
     "driver": "...",
     "timestamp": "..."
   }
   ```

---

## ✅ Checklist de Verificación

- [ ] Abrí la consola del navegador (F12)
- [ ] Vi logs con `[DIAGNÓSTICO]`
- [ ] Verifiqué que hay vehículos con velocidad ≥80 km/h o eventos de pánico
- [ ] Ejecuté query SQL en Supabase
- [ ] Verifiqué que el filtro de severidad está en "Todas"
- [ ] El límite de 1000 registros ya está solucionado ✓
- [ ] Los logs muestran que las alertas críticas se guardan exitosamente

---

**Fecha de Implementación:** 2025-12-18
**Archivos Modificados:**
- `/services/databaseService.ts`
- `/App.tsx`
- `/docs/CRITICAL_ALERTS_DIAGNOSTIC.md` (este archivo)
