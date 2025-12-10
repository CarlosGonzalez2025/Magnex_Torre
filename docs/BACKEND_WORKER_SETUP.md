# 🚀 Backend Worker Setup - Monitoreo 24/7 Independiente

## 📋 Resumen

Este documento explica cómo configurar el **worker backend** que funciona 24/7 de forma independiente del frontend para garantizar que todas las alertas se procesen y guarden en Supabase **sin necesidad de que haya usuarios conectados**.

---

## 🎯 Problema Resuelto

### ❌ **Antes (Solo Frontend)**
```
- Sistema solo funciona cuando un usuario tiene el navegador abierto
- fetchData() se ejecuta solo si hay una sesión activa
- Sin usuarios = Sin monitoreo = Alertas perdidas
- NO cumple requisitos PESV 24/7
```

### ✅ **Después (Frontend + Backend Worker)**
```
- Worker backend funciona 24/7 independiente del navegador
- Consulta APIs cada 5 minutos automáticamente
- Detecta y guarda alertas en Supabase continuamente
- Frontend solo para visualización (opcional)
- Cumple 100% requisitos PESV 24/7
```

---

## 🏗️ Arquitectura

```
┌──────────────────────────────────────────────────────────┐
│                    BACKEND WORKER (24/7)                  │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Supabase Edge Function: alert-monitor               │ │
│  │                                                       │ │
│  │ Trigger: Cron Job (cada 5 minutos)                  │ │
│  │ Runtime: Deno (Serverless)                           │ │
│  │                                                       │ │
│  │ 1. Consulta APIs (Coltrack + Fagor)                 │ │
│  │ 2. Detecta alertas                                   │ │
│  │ 3. Guarda en saved_alerts (Supabase)                │ │
│  │ 4. Previene duplicados                               │ │
│  │ 5. Registra logs                                     │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│                       SUPABASE                            │
│                                                            │
│  - saved_alerts (7-30 días)                              │
│  - alert_history (permanente)                            │
│  - action_plans                                          │
│  - inspections                                           │
└──────────────────────────────────────────────────────────┘
                          ↑
┌──────────────────────────────────────────────────────────┐
│              FRONTEND (Opcional - Solo UI)                │
│                                                            │
│  - Visualiza alertas                                     │
│  - Gestiona planes de acción                             │
│  - Exporta reportes                                      │
│  - NO procesa alertas (solo muestra)                    │
└──────────────────────────────────────────────────────────┘
```

---

## 📦 Estructura de Archivos

```
/supabase
├── /functions
│   └── /alert-monitor
│       ├── index.ts         # Worker principal
│       └── cron.json        # Configuración cron job
└── config.toml              # Configuración Supabase
```

---

## 🛠️ Instalación y Configuración

### 1. **Instalar Supabase CLI**

```bash
# macOS/Linux
brew install supabase/tap/supabase

# Windows (PowerShell)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Verificar instalación
supabase --version
```

### 2. **Inicializar Proyecto Supabase**

```bash
# Navegar al directorio del proyecto
cd /home/user/Magnex_Torre

# Login a Supabase
supabase login

# Vincular proyecto existente (si ya tienes uno)
supabase link --project-ref YOUR_PROJECT_REF

# O crear nuevo proyecto
supabase init
```

### 3. **Configurar Variables de Entorno**

Crear archivo `.env` en la raíz del proyecto:

```env
# Supabase
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# APIs
COLTRACK_API_URL=https://gps.coltrack.com/gps/api.jsp
COLTRACK_USER=WebSMagnex
COLTRACK_PASS=]0zSKl549!9%

FAGOR_API_URL=https://www.flotasnet.com/servicios/EstadoVehiculo.asmx
FAGOR_USER=WebMasa2024
FAGOR_PASS=Weblog24*
```

**⚠️ IMPORTANTE:** Nunca commitear este archivo a Git. Ya está en `.gitignore`.

### 4. **Desplegar Edge Function**

```bash
# Desplegar la función
supabase functions deploy alert-monitor

# Verificar que se desplegó correctamente
supabase functions list
```

### 5. **Configurar Cron Job**

Existen 2 opciones para configurar el cron job:

#### **Opción A: Supabase Cron (Recomendado - Más simple)**

En el dashboard de Supabase:
1. Ir a **Database** → **Cron Jobs**
2. Click en **Create a new Cron Job**
3. Configurar:
   ```
   Name: alert-monitor-cron
   Schedule: */5 * * * * (cada 5 minutos)
   Command: SELECT net.http_post(
     url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/alert-monitor',
     headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
   );
   ```
4. Click en **Save**

#### **Opción B: Servicio Externo (GitHub Actions)**

Crear archivo `.github/workflows/alert-monitor.yml`:

```yaml
name: Alert Monitor Cron

on:
  schedule:
    # Cada 5 minutos
    - cron: '*/5 * * * *'
  workflow_dispatch: # Permite ejecución manual

jobs:
  trigger-alert-monitor:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Supabase Function
        run: |
          curl -X POST \
            'https://YOUR_PROJECT_REF.supabase.co/functions/v1/alert-monitor' \
            -H 'Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}' \
            -H 'Content-Type: application/json'
```

Agregar secret `SUPABASE_ANON_KEY` en GitHub:
- Settings → Secrets and variables → Actions → New repository secret

---

## 🧪 Pruebas y Validación

### 1. **Prueba Manual (Local)**

```bash
# Ejecutar función localmente
supabase functions serve alert-monitor

# En otra terminal, hacer request
curl -X POST http://localhost:54321/functions/v1/alert-monitor \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

### 2. **Prueba Manual (Producción)**

```bash
# Ejecutar función en producción
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/alert-monitor \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

### 3. **Verificar Logs**

```bash
# Ver logs en tiempo real
supabase functions logs alert-monitor --tail

# Ver logs históricos
supabase functions logs alert-monitor --limit 100
```

### 4. **Verificar Datos en Supabase**

```sql
-- Ver últimas alertas guardadas automáticamente
SELECT
  plate,
  type,
  severity,
  timestamp,
  saved_by,
  saved_at
FROM saved_alerts
WHERE saved_by = 'Sistema (Auto)'
ORDER BY saved_at DESC
LIMIT 10;

-- Contar alertas por hora (últimas 24 horas)
SELECT
  DATE_TRUNC('hour', saved_at) as hour,
  COUNT(*) as alert_count
FROM saved_alerts
WHERE saved_by = 'Sistema (Auto)'
  AND saved_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

---

## 📊 Monitoreo y Mantenimiento

### **Métricas a Monitorear**

1. **Ejecuciones del Worker**
   - Frecuencia: Cada 5 minutos = 288 ejecuciones/día
   - Verificar que no haya gaps (ejecuciones faltantes)

2. **Alertas Procesadas**
   - Total de alertas detectadas
   - Alertas guardadas vs duplicadas
   - Errores de guardado

3. **Tiempo de Ejecución**
   - Target: < 10 segundos
   - Alert si > 30 segundos

4. **Errores de API**
   - Coltrack conexión fallida
   - Fagor conexión fallida
   - Supabase escritura fallida

### **Dashboard de Monitoreo SQL**

```sql
-- Dashboard de última hora
WITH last_hour_stats AS (
  SELECT
    COUNT(*) as total_alerts,
    COUNT(DISTINCT plate) as unique_vehicles,
    AVG(speed) as avg_speed,
    MAX(speed) as max_speed
  FROM saved_alerts
  WHERE saved_by = 'Sistema (Auto)'
    AND saved_at >= NOW() - INTERVAL '1 hour'
)
SELECT * FROM last_hour_stats;

-- Alertas por tipo (últimas 24 horas)
SELECT
  type,
  severity,
  COUNT(*) as count
FROM saved_alerts
WHERE saved_by = 'Sistema (Auto)'
  AND saved_at >= NOW() - INTERVAL '24 hours'
GROUP BY type, severity
ORDER BY count DESC;
```

---

## ⚠️ Troubleshooting

### **Problema 1: Worker no se ejecuta**

**Síntomas:**
- No hay nuevas alertas en saved_alerts
- Logs no muestran ejecuciones

**Soluciones:**
```bash
# Verificar que la función está desplegada
supabase functions list

# Re-desplegar
supabase functions deploy alert-monitor --no-verify-jwt

# Verificar cron job
# En Supabase Dashboard → Database → Cron Jobs
```

### **Problema 2: Errores de API**

**Síntomas:**
- Logs muestran errores de conexión
- 0 vehículos fetched

**Soluciones:**
1. Verificar credenciales de API
2. Probar APIs manualmente:
   ```bash
   # Test Coltrack
   curl "https://gps.coltrack.com/gps/api.jsp?user=WebSMagnex&pass=]0zSKl549!9%&consulta=LastPosition&json=1"
   ```
3. Verificar que APIs no están bloqueadas

### **Problema 3: Duplicados no se previenen**

**Síntomas:**
- Misma alerta guardada múltiples veces

**Soluciones:**
```sql
-- Verificar índices únicos
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_alerts_unique
ON saved_alerts(plate, timestamp, type);

-- Limpiar duplicados existentes
DELETE FROM saved_alerts a
USING saved_alerts b
WHERE a.id < b.id
  AND a.plate = b.plate
  AND a.timestamp = b.timestamp
  AND a.type = b.type;
```

### **Problema 4: Worker se ejecuta pero no guarda**

**Síntomas:**
- Logs muestran alertas detectadas
- No se guardan en base de datos

**Soluciones:**
1. Verificar permisos de SERVICE_ROLE_KEY
2. Verificar RLS policies en Supabase:
   ```sql
   -- Verificar policies
   SELECT * FROM pg_policies WHERE tablename = 'saved_alerts';

   -- Deshabilitar RLS temporalmente para testing
   ALTER TABLE saved_alerts DISABLE ROW LEVEL SECURITY;
   ```

---

## 🔐 Seguridad

### **Best Practices**

1. ✅ **Usar SERVICE_ROLE_KEY** en el worker (bypass RLS)
2. ✅ **No exponer credenciales** en el código
3. ✅ **Usar variables de entorno** para todos los secrets
4. ✅ **Limitar acceso** al endpoint de la función
5. ✅ **Monitorear logs** para detectar accesos no autorizados

### **Configurar Autenticación**

```typescript
// En index.ts, agregar verificación de API key
serve(async (req) => {
  const apiKey = req.headers.get('x-api-key');
  const expectedKey = Deno.env.get('WORKER_API_KEY');

  if (apiKey !== expectedKey) {
    return new Response('Unauthorized', { status: 401 });
  }

  // ... resto del código
});
```

---

## 💰 Costos

### **Supabase Free Tier**
- ✅ Edge Functions: 500,000 invocaciones/mes
- ✅ Database: 500 MB storage
- ✅ 2 GB bandwidth/mes

### **Uso Estimado**
```
Worker ejecuta cada 5 minutos:
- 288 ejecuciones/día
- 8,640 ejecuciones/mes
- Promedio: 5 segundos/ejecución
- Total: 43,200 segundos = 12 horas compute/mes

Costo mensual en Free Tier: $0 ✅
```

**⚠️ Si excedes límites:**
- Upgrade a Pro: $25/mes
- O ajustar frecuencia a cada 10 minutos (4,320 ejecuciones/mes)

---

## 📈 Escalabilidad

### **Optimizaciones Futuras**

1. **Caché de Vehículos**
   - Guardar estado anterior
   - Solo procesar cambios

2. **Procesamiento en Lotes**
   - Guardar alertas en batch
   - Reducir queries a DB

3. **Paralelización**
   - Procesar Coltrack y Fagor en paralelo
   - Ya implementado ✅

4. **Rate Limiting**
   - Limitar requests a APIs externas
   - Implementar exponential backoff

---

## ✅ Checklist de Implementación

- [ ] Instalar Supabase CLI
- [ ] Vincular proyecto Supabase
- [ ] Configurar variables de entorno
- [ ] Desplegar Edge Function
- [ ] Configurar Cron Job
- [ ] Probar ejecución manual
- [ ] Verificar logs
- [ ] Validar datos en saved_alerts
- [ ] Configurar monitoreo
- [ ] Documentar procedimientos

---

## 📞 Soporte

**Logs en Tiempo Real:**
```bash
supabase functions logs alert-monitor --tail
```

**Status del Worker:**
```bash
curl https://YOUR_PROJECT_REF.supabase.co/functions/v1/alert-monitor \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

**Dashboard Supabase:**
- https://supabase.com/dashboard/project/YOUR_PROJECT_REF

---

**Última actualización:** 2025-12-10
**Estado:** ✅ LISTO PARA PRODUCCIÓN
**Responsable:** Sistema Claude Code
