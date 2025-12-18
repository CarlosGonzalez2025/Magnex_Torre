# 🚀 Guía Rápida: Desplegar Worker de Alertas 24/7

## ⚠️ PROBLEMA IDENTIFICADO

**Actualmente:** Las alertas solo se guardan cuando el navegador está abierto (frontend).
**Solución:** Desplegar el backend worker que funciona 24/7 independientemente del navegador.

---

## 📋 Estado Actual

✅ **Archivos del worker creados:**
- `/supabase/functions/alert-monitor/index.ts` - Worker principal
- `/supabase/functions/alert-monitor/cron.json` - Configuración cron (cada 5 min)
- `/scripts/deploy-worker.sh` - Script de deployment

❌ **Worker NO desplegado en Supabase** → Por eso solo funciona con navegador abierto

---

## 🎯 Objetivo

Desplegar el worker para que funcione **24/7 sin necesidad de navegador abierto**:
- ✅ Detecta alertas cada 5 minutos automáticamente
- ✅ Consulta APIs (Coltrack/Fagor) directamente
- ✅ Guarda alertas en `saved_alerts` tabla
- ✅ Previene duplicados
- ✅ Funciona independientemente del frontend

---

## 🔧 OPCIÓN 1: Deployment Manual (Dashboard de Supabase)

### **Paso 1: Acceder a Supabase Dashboard**
1. Ve a https://supabase.com/dashboard
2. Inicia sesión con tu cuenta
3. Selecciona tu proyecto de Magnex Torre

### **Paso 2: Crear Edge Function**
1. En el menú lateral, ve a **"Edge Functions"**
2. Click en **"Create a new function"**
3. Nombre: `alert-monitor`
4. Click **"Create function"**

### **Paso 3: Copiar Código del Worker**

Abre el archivo local `/supabase/functions/alert-monitor/index.ts` y copia TODO el contenido.

Pégalo en el editor de Supabase.

### **Paso 4: Desplegar**
1. Click en **"Deploy"** o **"Save & Deploy"**
2. Espera a que se complete el deployment (1-2 minutos)
3. Verás un mensaje de confirmación

### **Paso 5: Configurar Cron Job**
1. En la misma sección de Edge Functions
2. Selecciona tu función `alert-monitor`
3. Ve a la pestaña **"Settings"** o **"Cron"**
4. Click **"Add Cron Job"**
5. Configura:
   - **Name:** `alert-monitor-cron`
   - **Schedule:** `*/5 * * * *` (cada 5 minutos)
   - **Enabled:** ✅ Activado
6. Click **"Save"**

### **Paso 6: Configurar Variables de Entorno**
1. En Settings de la función, ve a **"Environment Variables"** o **"Secrets"**
2. Agrega las siguientes variables:

```
COLTRACK_API_URL=https://api.coltrack.com/endpoint
COLTRACK_USER=tu_usuario_coltrack
COLTRACK_PASS=tu_contraseña_coltrack
FAGOR_API_URL=https://api.fagor.com/endpoint
FAGOR_USER=tu_usuario_fagor
FAGOR_PASS=tu_contraseña_fagor
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_anon_key
```

**⚠️ IMPORTANTE:** Reemplaza los valores con tus credenciales reales.

### **Paso 7: Verificar que Funciona**
1. Ve a **"Logs"** en la función
2. Espera 5 minutos
3. Deberías ver logs como:
```
✅ Worker ejecutado exitosamente
📊 Procesados 794 vehículos
🚨 Detectadas 5 alertas nuevas
💾 Guardadas 5 alertas en saved_alerts
```

---

## 🔧 OPCIÓN 2: Deployment con CLI (Más Rápido)

### **Paso 1: Instalar Supabase CLI**

**En Windows:**
```bash
npm install -g supabase
```

**En macOS/Linux:**
```bash
brew install supabase/tap/supabase
```

### **Paso 2: Login en Supabase**
```bash
supabase login
```
Se abrirá el navegador para autenticación.

### **Paso 3: Vincular Proyecto**
```bash
supabase link --project-ref TU_PROJECT_ID
```

**¿Dónde encontrar PROJECT_ID?**
- Dashboard de Supabase → Settings → General → Reference ID

### **Paso 4: Configurar Variables de Entorno**

Crea archivo `.env.local` en `/supabase/functions/alert-monitor/`:
```env
COLTRACK_API_URL=https://api.coltrack.com/endpoint
COLTRACK_USER=tu_usuario
COLTRACK_PASS=tu_contraseña
FAGOR_API_URL=https://api.fagor.com/endpoint
FAGOR_USER=tu_usuario
FAGOR_PASS=tu_contraseña
```

### **Paso 5: Desplegar Worker**
```bash
cd /ruta/a/Magnex_Torre
supabase functions deploy alert-monitor
```

### **Paso 6: Configurar Cron Job**

Vía CLI:
```bash
supabase functions cron create alert-monitor-cron \
  --function alert-monitor \
  --schedule "*/5 * * * *"
```

O vía Dashboard (ver Opción 1, Paso 5).

### **Paso 7: Verificar**
```bash
supabase functions logs alert-monitor
```

---

## 🧪 Validación: ¿Cómo Saber Si Funciona?

### **Test 1: Verificar en Logs**
1. Dashboard → Edge Functions → alert-monitor → Logs
2. Deberías ver ejecuciones cada 5 minutos
3. Busca mensajes como:
   ```
   ✅ Worker ejecutado
   📊 Procesados X vehículos
   🚨 Detectadas X alertas
   ```

### **Test 2: Verificar en Base de Datos**

Ejecuta esta query en Supabase SQL Editor:
```sql
SELECT
  id,
  plate,
  type,
  severity,
  saved_by,
  saved_at
FROM saved_alerts
WHERE saved_by = 'Backend Worker'
ORDER BY saved_at DESC
LIMIT 10;
```

**Esperado:** Ver alertas guardadas por "Backend Worker"

### **Test 3: Cerrar Navegador y Esperar**
1. Cierra completamente el navegador (todas las pestañas)
2. Espera 10-15 minutos
3. Abre el sistema nuevamente
4. Ve a Auto-Guardadas
5. **Esperado:** Ver alertas nuevas guardadas durante el tiempo que estuvo cerrado

---

## 🔍 Troubleshooting

### **Problema: No veo logs**
**Causa:** Cron job no configurado o desactivado
**Solución:** Verificar en Dashboard → Edge Functions → Cron que esté ✅ Enabled

### **Problema: Error 401 Unauthorized**
**Causa:** Variables de entorno incorrectas
**Solución:** Verificar credenciales de APIs en Secrets/Environment Variables

### **Problema: Error connecting to Supabase**
**Causa:** SUPABASE_URL o SUPABASE_ANON_KEY incorrectos
**Solución:**
1. Dashboard → Settings → API
2. Copiar **Project URL** y **anon public key**
3. Actualizar variables de entorno

### **Problema: Worker no detecta alertas**
**Causa:** APIs no responden o credenciales incorrectas
**Solución:** Verificar logs para ver error específico de la API

### **Problema: Alertas duplicadas**
**Causa:** Frontend y backend guardando al mismo tiempo
**Solución:** El sistema tiene prevención de duplicados, esto es normal y no guardará duplicados

---

## 📊 Arquitectura Final (Después del Deployment)

```
┌─────────────────────────────────────────────────────────┐
│                    SISTEMA COMPLETO                      │
└─────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌──────────────────┐
│   FRONTEND       │         │   BACKEND        │
│   (Navegador)    │         │   (Supabase)     │
├──────────────────┤         ├──────────────────┤
│ • Detecta        │         │ • Cron cada 5min │
│   alertas si     │         │ • Consulta APIs  │
│   está abierto   │         │ • Detecta alert. │
│ • Guarda en DB   │         │ • Guarda en DB   │
│ • Reproduce      │    +    │ • 24/7 SIEMPRE   │
│   sonidos        │         │ • Sin navegador  │
│                  │         │                  │
│ ⚠️ Solo si       │         │ ✅ SIEMPRE       │
│   navegador      │         │   ACTIVO         │
│   abierto        │         │                  │
└──────────────────┘         └──────────────────┘
         │                            │
         └────────────┬───────────────┘
                      ▼
         ┌────────────────────────┐
         │   SUPABASE DATABASE    │
         │   saved_alerts table   │
         └────────────────────────┘

 🔄 PREVENCIÓN DE DUPLICADOS:
 - Ambos sistemas verifican antes de guardar
 - Criterio único: plate + timestamp + type
```

---

## ✅ Checklist Final

Después del deployment, verifica:

- [ ] Worker desplegado en Supabase
- [ ] Cron job configurado (cada 5 minutos)
- [ ] Variables de entorno configuradas
- [ ] Logs muestran ejecuciones exitosas
- [ ] Base de datos tiene alertas de "Backend Worker"
- [ ] Sistema funciona con navegador cerrado

---

## 🎯 Resultado Esperado

**ANTES (Sin worker):**
```
Navegador ABIERTO  → ✅ Guarda alertas
Navegador CERRADO  → ❌ NO guarda nada
```

**DESPUÉS (Con worker):**
```
Navegador ABIERTO  → ✅ Guarda alertas (frontend)
Navegador CERRADO  → ✅ Guarda alertas (backend worker)
                      ✅ Funciona 24/7
                      ✅ Sin interrupciones
```

---

## 📞 ¿Necesitas Ayuda?

Si tienes problemas con el deployment:
1. Comparte los logs del worker
2. Comparte el error específico que ves
3. Verifica que las credenciales de APIs sean correctas

---

**Fecha de Creación:** 2025-12-18
**Última Actualización:** 2025-12-18
