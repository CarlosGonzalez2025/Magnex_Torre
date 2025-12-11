# 🔊 Guía de Narración de Alertas (Text-to-Speech)

## 📋 Resumen

El sistema incluye **narración automática de alertas** usando Text-to-Speech (TTS) del navegador. Las alertas se narran en español con mensajes personalizados según el tipo.

---

## ✨ Características

✅ **Narración Automática**
- Alertas críticas se narran automáticamente
- Alertas altas se narran con mensaje corto
- Priorización: críticas interrumpen mensajes en curso

✅ **Mensajes Personalizados**
- Cada tipo de alerta tiene su propio mensaje
- Incluye detalles relevantes (placa, conductor, ubicación, velocidad)
- Frases claras y concisas en español

✅ **Control Total**
- Activar/desactivar narración
- Seleccionar voz en español
- Ajustar velocidad, tono y volumen
- Probar configuración

✅ **Sin Configuración Extra**
- Usa Web Speech API del navegador (nativo)
- No requiere APIs externas ni costos
- Funciona offline
- Compatible con Chrome, Edge, Safari

---

## 🎯 Mensajes por Tipo de Alerta

### **🚨 Críticas (Narración Completa - Alta Prioridad)**

#### **Exceso de Velocidad**
```
"Atención. Exceso de velocidad. Vehículo ABC123.
Conductor Juan Pérez. Velocidad 95 kilómetros por hora.
Ubicación: Calle 72 con Carrera 15, Bogotá."
```

#### **Botón de Pánico**
```
"Alerta crítica. Botón de pánico activado. Vehículo ABC123.
Conductor Juan Pérez. Ubicación: Calle 72 con Carrera 15, Bogotá.
Requiere atención inmediata."
```

#### **Colisión**
```
"Alerta crítica. Posible colisión detectada. Vehículo ABC123.
Conductor Juan Pérez. Ubicación: Calle 72 con Carrera 15, Bogotá.
Verificar estado del vehículo."
```

---

### **⚠️ Altas (Narración Corta - Prioridad Normal)**

#### **Frenada Brusca**
```
"Alerta. Frenada brusca detectada. Vehículo ABC123.
Conductor Juan Pérez. Ubicación: Calle 72 con Carrera 15, Bogotá."
```

#### **Aceleración Brusca**
```
"Alerta. Aceleración brusca detectada. Vehículo ABC123.
Conductor Juan Pérez. Ubicación: Calle 72 con Carrera 15, Bogotá."
```

---

### **📍 Otras Alertas**

#### **Parada No Autorizada**
```
"Alerta. Parada no autorizada. Vehículo ABC123.
Conductor Juan Pérez. Ubicación: Calle 72 con Carrera 15, Bogotá."
```

#### **Desviación de Ruta**
```
"Alerta. Desviación de ruta detectada. Vehículo ABC123.
Conductor Juan Pérez. Ubicación: Calle 72 con Carrera 15, Bogotá."
```

#### **Ralentí Excedido**
```
"Alerta. Tiempo de ralentí excedido. Vehículo ABC123.
Conductor Juan Pérez. Ubicación: Calle 72 con Carrera 15, Bogotá."
```

#### **Salida de Geocerca**
```
"Alerta. Salida de geocerca. Vehículo ABC123.
Conductor Juan Pérez. Ubicación: Calle 72 con Carrera 15, Bogotá."
```

#### **Combustible Bajo**
```
"Alerta. Nivel bajo de combustible. Vehículo ABC123.
Conductor Juan Pérez. Combustible restante: 10 litros."
```

#### **Mantenimiento Vencido**
```
"Recordatorio. Mantenimiento vencido. Vehículo ABC123.
Mantenimiento vencido hace 5 días."
```

---

## 🎛️ Configuración

### **Acceder a Configuración**

1. Click en el ícono de **volumen** (🔊) en la esquina superior derecha
2. Se abre el panel de configuración

### **Opciones Disponibles**

#### **1. Activar/Desactivar Narración**
```
Toggle: ON/OFF
- ON: Alertas se narran automáticamente
- OFF: Sin narración (solo alertas visuales)
```

#### **2. Seleccionar Voz**
```
Opciones:
- Predeterminada del sistema
- Voces en español disponibles (variedad según SO)

Ejemplo de voces:
- Microsoft Helena - Spanish (Spain)
- Google español de Estados Unidos
- Paulina (macOS)
```

#### **3. Velocidad**
```
Rango: 0.5x a 2.0x
Default: 1.0x (normal)

Recomendado:
- 0.8x - 1.0x para máxima claridad
- 1.2x - 1.5x para operadores experimentados
```

#### **4. Tono**
```
Rango: 0.5 a 2.0
Default: 1.0 (normal)

Ajuste según preferencia personal
```

#### **5. Volumen**
```
Rango: 0% a 100%
Default: 100%

Ajustar según ambiente de trabajo
```

---

## 🚀 Uso

### **Narración Automática**

El sistema narra automáticamente:

```javascript
// CRÍTICAS (severity === 'critical')
Exceso de Velocidad    → Mensaje completo + Alta prioridad
Botón de Pánico        → Mensaje completo + Alta prioridad
Colisión               → Mensaje completo + Alta prioridad

// ALTAS (severity === 'high')
Frenada Brusca         → Mensaje corto + Prioridad normal
Aceleración Brusca     → Mensaje corto + Prioridad normal
```

**Comportamiento:**
- ✅ Alertas críticas **interrumpen** cualquier narración en curso
- ✅ Alertas altas se **agregan a cola** si hay narración activa
- ✅ Mensajes se narran uno por uno (no se solapan)

### **Priorización**

```
Alta Prioridad (Críticas):
  → Cancela mensaje actual
  → Narra inmediatamente
  → Limpia cola de mensajes

Normal (Altas):
  → Se agrega a cola
  → Espera su turno
  → No interrumpe
```

---

## 🧪 Pruebas

### **Probar Configuración**

1. Abrir panel de configuración (🔊)
2. Ajustar velocidad, tono, volumen
3. Escribir texto en "Probar Voz"
4. Click en "Probar"
5. Escuchar resultado

**Textos de prueba recomendados:**

```
"Atención. Exceso de velocidad. Vehículo ABC123.
Conductor Juan Pérez. Velocidad 95 kilómetros por hora."

"Alerta crítica. Botón de pánico activado.
Vehículo ABC123. Requiere atención inmediata."
```

### **Simular Alerta Real**

```typescript
// En consola del navegador
import ttsEngine from './services/ttsService';

const testAlert = {
  plate: 'TEST123',
  driver: 'Conductor de Prueba',
  type: 'Exceso de Velocidad',
  severity: 'critical',
  speed: 95,
  location: 'Calle 72 con Carrera 15, Bogotá',
  timestamp: new Date().toISOString(),
  // ... otros campos
};

ttsEngine.narrateAlert(testAlert, 'high');
```

---

## 🔧 Solución de Problemas

### **Problema 1: No se escucha narración**

**Posibles causas:**
1. Narración desactivada
2. Volumen en 0%
3. Navegador no soporta TTS
4. Altavoces/audífonos desconectados

**Solución:**
```
1. Verificar toggle ON en configuración
2. Aumentar volumen en configuración
3. Usar Chrome, Edge o Safari
4. Verificar conexión de audio
5. Probar con "Probar Voz"
```

### **Problema 2: Voz en idioma incorrecto**

**Causa:** Voz predeterminada no es en español

**Solución:**
```
1. Abrir configuración TTS
2. Seleccionar voz en español de la lista
3. Probar con "Probar Voz"
4. Guardar (automático)
```

### **Problema 3: Narración muy rápida/lenta**

**Solución:**
```
1. Abrir configuración
2. Ajustar slider de Velocidad
3. Probar hasta encontrar velocidad cómoda
4. Recomendado: 0.8x - 1.2x
```

### **Problema 4: Múltiples alertas se solapan**

**Esto NO debería pasar**

El sistema usa cola de mensajes:
- Solo 1 narración a la vez
- Resto en cola (máximo 10)

Si ocurre:
```
1. Reload página
2. Verificar consola por errores
3. Reportar bug con detalles
```

---

## 💻 Compatibilidad de Navegadores

| Navegador | Soporte | Calidad | Notas |
|-----------|---------|---------|-------|
| **Chrome** | ✅ Excelente | ⭐⭐⭐⭐⭐ | Mejor soporte, múltiples voces |
| **Edge** | ✅ Excelente | ⭐⭐⭐⭐⭐ | Voces de Microsoft, muy buena calidad |
| **Safari** | ✅ Bueno | ⭐⭐⭐⭐ | Voces nativas de macOS/iOS |
| **Firefox** | ⚠️ Limitado | ⭐⭐⭐ | Funciona pero menos voces |
| **Opera** | ✅ Bueno | ⭐⭐⭐⭐ | Basado en Chromium |

**Recomendado:** Chrome o Edge para mejor experiencia

---

## 🎨 Personalización Avanzada

### **Modificar Mensajes**

**Archivo:** `/services/ttsService.ts`

**Función:** `generateAlertMessage()`

```typescript
case AlertType.SPEED_VIOLATION:
  return `Atención. Exceso de velocidad. Vehículo ${plate}...`;
  // ↑ Modificar este texto
```

### **Agregar Nuevos Tipos**

```typescript
case 'MI_NUEVA_ALERTA':
  return `Mensaje personalizado para mi alerta...`;
```

### **Cambiar Prioridades**

**Archivo:** `/App.tsx` líneas 121-133

```typescript
if (alert.severity === 'critical') {
  ttsEngine.narrateAlert(alert, 'high');  // ← Alta prioridad
} else if (alert.severity === 'high') {
  ttsEngine.narrateAlertShort(alert, 'normal');  // ← Normal
}

// Agregar más condiciones:
else if (alert.type === 'MI_TIPO') {
  ttsEngine.narrateCustom('Mensaje personalizado', 'high');
}
```

---

## 📊 API Reference

### **ttsEngine**

```typescript
import ttsEngine from './services/ttsService';

// Narrar alerta (mensaje completo)
ttsEngine.narrateAlert(alert, 'high');

// Narrar alerta (mensaje corto)
ttsEngine.narrateAlertShort(alert, 'normal');

// Narrar texto personalizado
ttsEngine.narrateCustom('Texto a narrar', 'normal');

// Detener narración
ttsEngine.stop();

// Pausar/Reanudar
ttsEngine.pause();
ttsEngine.resume();

// Actualizar configuración
ttsEngine.updateConfig({
  enabled: true,
  voice: 'Microsoft Helena - Spanish (Spain)',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0
});

// Obtener configuración
const config = ttsEngine.getConfig();

// Obtener voces disponibles
const voices = ttsEngine.getAvailableVoices();
```

### **useTTS() Hook (React)**

```typescript
import { useTTS } from './services/ttsService';

function MyComponent() {
  const {
    config,          // Configuración actual
    voices,          // Voces disponibles
    updateConfig,    // Actualizar config
    narrateAlert,    // Narrar alerta
    narrateCustom,   // Narrar texto
    stop,            // Detener
    testVoice,       // Probar voz
    isSupported      // ¿Navegador soporta TTS?
  } = useTTS();

  // Usar...
  narrateAlert(myAlert, 'high');
}
```

---

## 🔐 Privacidad y Seguridad

### **¿Dónde se procesa?**

✅ **Local (navegador)**
- Todo el procesamiento es local
- No se envía audio a servidores externos
- No requiere conexión a internet (después de cargar)

### **¿Se graban las narraciones?**

❌ **No**
- No se graban narraciones
- No se almacenan audios
- Todo es en tiempo real

### **¿Qué datos se guardan?**

✅ **Solo configuración (localStorage)**
```javascript
{
  "enabled": true,
  "voice": "Microsoft Helena - Spanish (Spain)",
  "rate": 1.0,
  "pitch": 1.0,
  "volume": 1.0,
  "autoNarrate": true
}
```

---

## 📈 Mejores Prácticas

### **Para Operadores**

1. ✅ **Activar narración** para no tener que mirar pantalla constantemente
2. ✅ **Ajustar velocidad** según experiencia (1.0x - 1.2x)
3. ✅ **Probar configuración** al inicio del turno
4. ✅ **Usar audífonos** en ambientes ruidosos

### **Para Supervisores**

1. ✅ **Capacitar operadores** sobre uso de TTS
2. ✅ **Verificar configuración** estándar del equipo
3. ✅ **Documentar preferencias** por turno
4. ✅ **Habilitar solo para alertas críticas** si hay mucho ruido

### **Para Administradores**

1. ✅ **Verificar soporte** en navegadores de la empresa
2. ✅ **Configurar voces** predeterminadas del sistema
3. ✅ **Personalizar mensajes** según necesidades
4. ✅ **Monitorear feedback** de operadores

---

## 🎯 Casos de Uso

### **Centro de Control 24/7**

```
Beneficio: Operador puede monitorear sin ver pantalla
Configuración:
- Narración: ON
- Velocidad: 1.0x
- Volumen: 80%
- Solo críticas narradas
```

### **Supervisión en Terreno**

```
Beneficio: Alertas mientras se hace otra tarea
Configuración:
- Narración: ON
- Velocidad: 1.2x (más rápido)
- Volumen: 100%
- Todas las alertas narradas
```

### **Ambiente Ruidoso**

```
Beneficio: Solo alertas críticas con volumen alto
Configuración:
- Narración: ON
- Velocidad: 0.8x (más lento para claridad)
- Volumen: 100%
- Solo críticas
- Usar audífonos
```

---

## ✅ Checklist de Implementación

- [x] Crear servicio TTS (ttsService.ts)
- [x] Crear componente de configuración (TTSSettings.tsx)
- [x] Integrar con sistema de alertas (App.tsx)
- [x] Agregar botón de toggle en header
- [x] Mensajes personalizados por tipo
- [x] Sistema de prioridades
- [x] Cola de mensajes
- [x] Configuración persistente
- [x] Documentación completa

---

## 🚀 Próximos Pasos (Opcional)

### **Mejoras Futuras**

1. **Múltiples idiomas**
   - Inglés, portugués
   - Selección automática según navegador

2. **Personalización por usuario**
   - Guardar preferencias en Supabase
   - Sincronizar entre dispositivos

3. **Alertas por ubicación**
   - "Vehículo en zona norte"
   - Mencionar geocercas específicas

4. **Integración con síntesis avanzada**
   - Google Cloud TTS (mejor calidad)
   - Amazon Polly
   - Microsoft Azure

---

**Última actualización:** 2025-12-10
**Versión:** 1.0
**Estado:** ✅ PRODUCCIÓN LISTA
