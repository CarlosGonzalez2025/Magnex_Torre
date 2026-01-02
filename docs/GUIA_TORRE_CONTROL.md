# 📋 Guía de Usuario - Torre de Control

## 🎯 Objetivo

Esta guía está diseñada para el personal de Torre de Control que supervisa las alertas de la flota vehicular en tiempo real y gestiona el seguimiento de infracciones y eventos críticos.

---

## 📊 Módulos Disponibles

El sistema Magnex Torre tiene 3 módulos de alertas:

| Módulo | Ícono | Uso Principal | Cuándo Usar |
|--------|-------|---------------|-------------|
| **Alertas** | 🔔 | Monitoreo en vivo | Emergencias, respuesta inmediata |
| **Auto-Guardadas** ⭐ | 💾 | Seguimiento y reportes | Gestión diaria, análisis, auditorías |
| **Historial** | 📝 | Gestión formal | Planes de acción, resolución de incidentes |

---

## ⭐ Módulo Principal: AUTO-GUARDADAS

### ¿Por qué es el módulo principal?

✅ **Información precisa y sin duplicados** - Sistema v2.0 con deduplicación inteligente
✅ **Funciona 24/7** - No depende de que el navegador esté abierto
✅ **Registro completo** - TODAS las alertas del sistema
✅ **Datos verídicos** - Validación estricta para cumplimiento PESV

---

## 🚀 Inicio Rápido

### Paso 1: Acceder al módulo

1. Abrir el sistema: `https://magnex-torre.vercel.app`
2. Click en el tab **"Auto-Guardadas"** 💾

### Paso 2: Vista principal

Verás una tabla con todas las alertas detectadas automáticamente:

**Columnas principales:**
- **Tipo**: Exceso de Velocidad, Frenada Brusca, Botón de Pánico, etc.
- **Placa**: Identificación del vehículo
- **Conductor**: Nombre del conductor asignado
- **Severidad**: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low
- **Fecha/Hora**: Momento exacto del evento
- **Ubicación**: Dirección donde ocurrió
- **Velocidad**: Velocidad al momento del evento
- **Contrato**: Cliente asociado
- **Estado**: Pendiente, En progreso, Resuelto
- **Guardado por**: "Sistema (Auto)" para alertas automáticas

---

## 🔍 Filtros Disponibles

### 1. Búsqueda Dinámica
**Campo:** Barra de búsqueda superior

**Busca en:**
- Placa del vehículo
- Nombre del conductor
- Tipo de alerta
- Detalles del evento
- Contrato/Cliente
- Ubicación

**Ejemplo:**
```
Buscar: "NPY688" → Muestra todas las alertas de esa placa
Buscar: "Frenada" → Muestra todas las frenadas bruscas
Buscar: "Juan" → Muestra alertas del conductor Juan
```

### 2. Filtro por Fecha
**Campos:** Fecha Inicio y Fecha Fin

**Uso:**
- Fecha Inicio: Desde qué fecha quieres ver alertas
- Fecha Fin: Hasta qué fecha

**Ejemplos:**
```
Alertas de hoy:
  Fecha Inicio: 2026-01-02
  Fecha Fin: 2026-01-02

Alertas de la semana:
  Fecha Inicio: 2025-12-26
  Fecha Fin: 2026-01-02
```

### 3. Filtro por Estado
**Opciones:**
- **Todos**: Muestra todas las alertas
- **Pendiente**: Alertas sin revisar
- **En Progreso**: Alertas en seguimiento
- **Resuelto**: Alertas completadas

### 4. Filtro por Severidad
**Opciones:**
- **Todos**: Todas las severidades
- **🔴 Critical**: Eventos críticos (Pánico, Colisión, Velocidad alta)
- **🟠 High**: Eventos graves (Frenada/Aceleración brusca)
- **🟡 Medium**: Eventos moderados
- **🟢 Low**: Eventos menores

---

## 📅 Flujo de Trabajo Diario

### 🌅 Al Inicio del Turno

1. **Abrir módulo "Auto-Guardadas"**
2. **Filtrar por fecha de hoy**
   ```
   Fecha Inicio: [Hoy]
   Fecha Fin: [Hoy]
   ```
3. **Filtrar por severidad "Critical"**
4. **Revisar alertas críticas primero**

### 🔍 Durante el Turno

**Revisar alertas nuevas cada 30-60 minutos:**

1. Refrescar la vista (F5 o botón refrescar)
2. Verificar nuevas alertas
3. Evaluar si requieren acción inmediata

**Criterios de acción:**

| Tipo de Alerta | Acción Inmediata | Seguimiento |
|----------------|------------------|-------------|
| 🚨 Botón de Pánico | ✅ Llamar al conductor | Guardar en Historial |
| 🚗 Colisión | ✅ Contactar emergencias | Guardar en Historial |
| ⚡ Exceso Velocidad | ⚠️ Evaluar gravedad | Si > 100 km/h guardar |
| 🛑 Frenada Brusca | ℹ️ Monitorear patrón | Si es recurrente, guardar |

### 📊 Al Final del Turno

1. **Revisar todas las alertas del día**
2. **Exportar reporte a Excel**
   - Click en botón "Exportar a Excel" 📥
   - Archivo se descarga automáticamente
3. **Identificar tendencias**
   - ¿Conductores con más infracciones?
   - ¿Horas con más eventos?
   - ¿Tipos de alerta más frecuentes?

---

## 📥 Exportar a Excel

### Paso a Paso

1. **Aplicar filtros deseados**
   ```
   Ejemplo: Alertas críticas de la semana
   - Fecha Inicio: 2025-12-26
   - Fecha Fin: 2026-01-02
   - Severidad: Critical
   ```

2. **Click en "Exportar a Excel"** 📥

3. **Archivo descargado**
   - Nombre: `alertas_auto_guardadas_YYYY-MM-DD.xlsx`
   - Ubicación: Carpeta de descargas

4. **Contenido del Excel**
   - Todas las columnas de la tabla
   - Con filtros aplicados
   - Formato profesional

### Usos del Excel

✅ Reportes semanales/mensuales
✅ Presentaciones a gerencia
✅ Auditorías PESV
✅ Análisis de tendencias
✅ Documentación de cumplimiento

---

## 📝 Guardar en Historial

### ¿Cuándo guardar en Historial?

Una alerta debe guardarse en "Historial" cuando:

✅ **Requiere plan de acción formal**
- Capacitación al conductor
- Sanción disciplinaria
- Seguimiento especial

✅ **Es un evento crítico grave**
- Botón de pánico activado
- Colisión confirmada
- Exceso de velocidad extremo (>120 km/h)

✅ **Necesita documentación permanente**
- Para auditorías
- Para seguros
- Para procesos legales

### Cómo guardar

1. **En "Auto-Guardadas"**: Identificar la alerta
2. **Click en botón "Guardar"** (si está disponible)
3. **O copiar información y:**
   - Ir al tab "Historial"
   - Crear nueva entrada manual
   - Asignar plan de acción

---

## 🎯 Casos de Uso Comunes

### Caso 1: Conductor con Exceso de Velocidad Recurrente

**Situación:**
- NPY688 aparece 3 veces en "Frenada Brusca" en un día

**Acción:**
1. Filtrar por placa: "NPY688"
2. Verificar patrón de horarios
3. Si es recurrente:
   - Guardar en "Historial"
   - Crear plan de acción
   - Contactar supervisor de flota

### Caso 2: Botón de Pánico Activado

**Situación:**
- Alerta "Botón de Pánico" - Placa XYZ123

**Acción INMEDIATA:**
1. ✅ Contactar al conductor (llamada/radio)
2. ✅ Verificar ubicación en mapa
3. ✅ Si no responde: Contactar autoridades
4. ✅ Guardar en "Historial" con detalles
5. ✅ Seguimiento hasta resolución

### Caso 3: Reporte Semanal PESV

**Situación:**
- Necesitas generar reporte semanal

**Acción:**
1. Ir a "Auto-Guardadas"
2. Filtrar:
   ```
   Fecha Inicio: [Lunes]
   Fecha Fin: [Domingo]
   ```
3. Exportar a Excel
4. Analizar:
   - Total de alertas por tipo
   - Conductores con más infracciones
   - Horarios críticos
   - Tendencias vs semana anterior

---

## ⚙️ Características del Sistema v2.0

### Sistema de Deduplicación Inteligente

**Problema anterior:**
- Un vehículo a 85 km/h generaba 4 alertas del mismo evento ❌

**Solución v2.0:**
- Mismo vehículo genera solo 1 alerta ✅

**Ventanas de deduplicación:**
```
Exceso de Velocidad: 15 minutos
Frenada Brusca: 10 minutos
Aceleración Brusca: 10 minutos
Botón de Pánico: 60 minutos (1 hora)
Colisión: 1440 minutos (24 horas)
```

**Beneficio:**
✅ Información limpia y precisa
✅ Sin spam de alertas duplicadas
✅ Datos confiables para Torre de Control

### Validación de Eventos Críticos

**Eventos críticos (Pánico, Colisión):**
- Se validan en ventana de 24 horas
- Si ya existe una alerta similar → Se rechaza
- Garantiza eventos únicos

**Beneficio:**
✅ No duplicados de eventos críticos
✅ Información verídica para reportes
✅ Cumplimiento PESV garantizado

---

## 📊 Interpretación de Datos

### Estados de Alerta

| Estado | Significado | Acción |
|--------|-------------|--------|
| **Pending** (🔵) | Sin revisar | Revisar y evaluar |
| **In Progress** (🟡) | En seguimiento | Continuar seguimiento |
| **Resolved** (🟢) | Completado | Cerrado, solo consulta |

### Severidades

| Severidad | Color | Criterio | Tiempo de Respuesta |
|-----------|-------|----------|---------------------|
| **Critical** | 🔴 | Pánico, Colisión, Velocidad >100 | Inmediato (< 5 min) |
| **High** | 🟠 | Frenada/Aceleración brusca | 30 minutos |
| **Medium** | 🟡 | Eventos moderados | Fin de turno |
| **Low** | 🟢 | Eventos menores | Semanal |

### Tipos de Alerta Comunes

1. **Exceso de Velocidad**
   - Límite: 80 km/h
   - Muestra velocidad exacta
   - Si > 100 km/h → Acción inmediata

2. **Frenada Brusca**
   - Indica conducción agresiva
   - Patrón recurrente → Capacitación

3. **Aceleración Brusca**
   - Indica conducción agresiva
   - Patrón recurrente → Capacitación

4. **Botón de Pánico**
   - SIEMPRE requiere acción inmediata
   - Verificar seguridad del conductor

5. **Colisión**
   - Verificar estado del vehículo
   - Contactar al conductor
   - Notificar a seguros si es necesario

---

## 🚨 Protocolo de Emergencias

### Alerta de Pánico o Colisión

**Procedimiento:**

1. **Primeros 2 minutos:**
   - ✅ Intentar contactar al conductor (3 intentos)
   - ✅ Verificar ubicación GPS en mapa
   - ✅ Anotar hora exacta y ubicación

2. **Si NO responde (minuto 3-5):**
   - ✅ Contactar supervisor de flota
   - ✅ Evaluar envío de autoridades
   - ✅ Contactar vehículo más cercano

3. **Documentación (minuto 5-10):**
   - ✅ Guardar en "Historial"
   - ✅ Crear registro detallado
   - ✅ Adjuntar capturas de pantalla
   - ✅ Anotar todas las acciones tomadas

4. **Seguimiento:**
   - ✅ Actualizar estado cada 15 minutos
   - ✅ Mantener comunicación hasta resolución
   - ✅ Generar reporte de incidente

---

## 📈 Reportes y Análisis

### Reporte Diario

**Información a incluir:**
- Total de alertas del día
- Alertas críticas (desglose)
- Top 5 conductores con más infracciones
- Horarios con más eventos
- Acciones tomadas

**Cómo generar:**
1. Filtrar por fecha de hoy
2. Exportar a Excel
3. Analizar datos
4. Crear resumen ejecutivo

### Reporte Semanal

**Información a incluir:**
- Tendencias vs semana anterior
- Conductores recurrentes
- Tipos de alerta más frecuentes
- Patrones identificados
- Recomendaciones de capacitación

### Reporte Mensual PESV

**Información a incluir:**
- Cumplimiento de políticas
- Estadísticas de infracciones
- Planes de acción implementados
- Resultados de capacitaciones
- Tendencias mensuales

---

## ❓ Preguntas Frecuentes

### 1. ¿Por qué veo alertas duplicadas en fechas anteriores?

**R:** Las alertas anteriores al 2 de enero de 2026 fueron generadas con el sistema v1.0 que no tenía deduplicación. A partir del v2.0, ya NO se generan duplicados.

### 2. ¿Cada cuánto se actualizan las alertas?

**R:** El sistema detecta alertas cada 5 minutos de forma automática, 24/7.

### 3. ¿Puedo eliminar alertas?

**R:** No directamente. Las alertas se mantienen por 7-30 días según su estado y luego se eliminan automáticamente (con exportación a Excel antes de eliminar).

### 4. ¿Qué significa "Guardado por: Sistema (Auto)"?

**R:** Indica que la alerta fue detectada y guardada automáticamente por el sistema, no por un usuario manual.

### 5. ¿Puedo modificar una alerta?

**R:** No en "Auto-Guardadas". Si necesitas gestionar una alerta, debes guardarla en "Historial" donde sí puedes modificar estado, agregar notas, etc.

### 6. ¿Funcionan los filtros en el Excel exportado?

**R:** Sí, el Excel exportado refleja exactamente los filtros que aplicaste en la interfaz.

---

## 🎓 Mejores Prácticas

### ✅ DO (Hacer)

1. **Revisar alertas regularmente** (cada 30-60 minutos)
2. **Aplicar filtros** para enfocarte en lo importante
3. **Exportar reportes** al final de cada turno
4. **Documentar acciones** en "Historial" para casos graves
5. **Identificar patrones** para prevención
6. **Responder INMEDIATAMENTE** a alertas críticas

### ❌ DON'T (No Hacer)

1. **No ignorar alertas críticas** (Pánico, Colisión)
2. **No esperar al final del día** para revisar alertas graves
3. **No confiar solo en memoria** - Documenta todo
4. **No guardar TODAS las alertas** en Historial - Solo las importantes
5. **No olvidar exportar** antes de aplicar filtros diferentes

---

## 📞 Soporte y Contacto

**Para problemas técnicos:**
- Contactar a TI/Sistemas

**Para dudas sobre procedimientos:**
- Consultar al Supervisor de Torre de Control

**Para reportar bugs del sistema:**
- Crear issue en GitHub o contactar al desarrollador

---

## 📝 Registro de Cambios

### v2.0 (2 de Enero 2026)
- ✅ Sistema inteligente de deduplicación
- ✅ Validación de eventos críticos
- ✅ Worker 24/7 independiente
- ✅ Logs mejorados de auditoría
- ✅ Sin duplicados garantizado

### v1.0 (Anterior)
- Sistema básico de alertas
- Guardado manual
- Posibles duplicados

---

**Última actualización:** 2 de Enero 2026
**Versión del sistema:** v2.0
**Módulo:** Auto-Guardadas (SavedAlertsPanel)
