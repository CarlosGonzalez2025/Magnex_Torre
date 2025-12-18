# ⏰ Configurar Cron Job para Worker de Alertas en Supabase

## 🎯 Objetivo
Configurar un cron job que ejecute la función `alert-monitor` cada 5 minutos automáticamente.

---

## ✅ MÉTODO 1: pg_cron (Recomendado - Gratis)

### **Paso 1: Habilitar Extensión pg_cron**

1. Ve a tu proyecto en Supabase Dashboard
2. En el menú lateral, ve a **"Database"**
3. Click en **"Extensions"** (en el menú de Database)
4. Busca **"pg_cron"**
5. Click en el botón **"Enable"** o toggle para activarla
6. Espera unos segundos a que se active

### **Paso 2: Crear el Cron Job**

1. En el menú de Database, ve a **"SQL Editor"**
2. Click en **"New query"**
3. Copia y pega este código:

```sql
-- Habilitar pg_cron si no está habilitado
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Otorgar permisos necesarios
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Crear el cron job que ejecuta cada 5 minutos
SELECT cron.schedule(
  'alert-monitor-every-5-minutes',  -- Nombre del job
  '*/5 * * * *',                     -- Cada 5 minutos
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/alert-monitor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_ANON_KEY'
      ),
      body := jsonb_build_object()
    ) AS request_id;
  $$
);
```

4. **IMPORTANTE:** Reemplaza:
   - `YOUR_PROJECT_REF` con tu Project Reference ID
   - `YOUR_ANON_KEY` con tu Anon Key

**¿Dónde encontrar estos valores?**
- Dashboard → Settings → API
- **Project URL:** `https://YOUR_PROJECT_REF.supabase.co`
- **anon public key:** Copia el valor de "anon" / "public"

### **Paso 3: Ejecutar el Query**

1. Click en **"Run"** o presiona `Ctrl+Enter`
2. Deberías ver un mensaje de éxito
3. El job está ahora programado ✅

### **Paso 4: Verificar que Funciona**

Ejecuta este query para ver tus cron jobs:

```sql
SELECT
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job;
```

**Esperado:** Ver tu job `alert-monitor-every-5-minutes` con `active = true`

---

## ✅ MÉTODO 2: Cron Job Externo (Alternativa Gratuita)

Si pg_cron no funciona, usa un servicio externo gratuito:

### **Opción A: cron-job.org (Gratis, Sin registro)**

1. Ve a https://cron-job.org/en/
2. Click **"Create cronjob"**
3. Configura:
   - **Title:** Alert Monitor Magnex
   - **URL:** `https://YOUR_PROJECT_REF.supabase.co/functions/v1/alert-monitor`
   - **Schedule:** Every 5 minutes
   - **Headers:** Agregar:
     ```
     Content-Type: application/json
     Authorization: Bearer YOUR_ANON_KEY
     ```
4. Click **"Create"**

### **Opción B: EasyCron (Gratis hasta 100 tareas)**

1. Ve a https://www.easycron.com/
2. Registrarse (gratis)
3. Click **"Add Cron Job"**
4. Configurar:
   - **URL:** `https://YOUR_PROJECT_REF.supabase.co/functions/v1/alert-monitor`
   - **Cron Expression:** `*/5 * * * *`
   - **HTTP Method:** POST
   - **Custom Headers:**
     ```
     Content-Type: application/json
     Authorization: Bearer YOUR_ANON_KEY
     ```
5. Click **"Create"**

### **Opción C: GitHub Actions (Gratis si tienes repo privado)**

Crear archivo `.github/workflows/alert-monitor.yml`:

```yaml
name: Alert Monitor Cron

on:
  schedule:
    - cron: '*/5 * * * *'  # Cada 5 minutos
  workflow_dispatch:  # Permite ejecución manual

jobs:
  trigger-worker:
    runs-on: ubuntu-latest
    steps:
      - name: Call Supabase Function
        run: |
          curl -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            https://YOUR_PROJECT_REF.supabase.co/functions/v1/alert-monitor
```

**Configurar secret:**
1. GitHub repo → Settings → Secrets → Actions
2. New repository secret
3. Name: `SUPABASE_ANON_KEY`
4. Value: Tu anon key

---

## ✅ MÉTODO 3: Supabase Edge Functions con Database Webhook

### **Paso 1: Crear Tabla de Control**

```sql
-- Tabla para controlar ejecución del worker
CREATE TABLE IF NOT EXISTS worker_control (
  id SERIAL PRIMARY KEY,
  last_execution TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending'
);

-- Insertar registro inicial
INSERT INTO worker_control (id, last_execution, status)
VALUES (1, NOW(), 'pending')
ON CONFLICT (id) DO NOTHING;
```

### **Paso 2: Crear Función que Actualiza Cada 5 Minutos**

```sql
-- Función que se ejecuta periódicamente
CREATE OR REPLACE FUNCTION trigger_worker()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Actualizar registro para trigger webhook
  UPDATE worker_control
  SET last_execution = NOW(), status = 'pending'
  WHERE id = 1;
END;
$$;
```

### **Paso 3: Configurar pg_cron para Actualizar Tabla**

```sql
SELECT cron.schedule(
  'update-worker-control',
  '*/5 * * * *',
  'SELECT trigger_worker();'
);
```

### **Paso 4: Configurar Database Webhook**

1. Dashboard → Database → Webhooks
2. Create a new webhook:
   - **Table:** `worker_control`
   - **Events:** `UPDATE`
   - **Type:** `HTTP Request`
   - **URL:** `https://YOUR_PROJECT_REF.supabase.co/functions/v1/alert-monitor`
   - **HTTP Method:** `POST`
   - **Headers:**
     ```json
     {
       "Content-Type": "application/json",
       "Authorization": "Bearer YOUR_ANON_KEY"
     }
     ```

---

## 🧪 Validación: ¿Cómo Verificar que Funciona?

### **Test 1: Ver Cron Jobs Activos**

```sql
-- Ver todos los cron jobs
SELECT * FROM cron.job;

-- Ver historial de ejecuciones (últimas 10)
SELECT
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

### **Test 2: Ver Logs de la Función**

1. Dashboard → Edge Functions → alert-monitor
2. Click en **"Logs"**
3. Deberías ver ejecuciones cada 5 minutos

### **Test 3: Ver Alertas Guardadas por el Worker**

```sql
SELECT
  plate,
  type,
  severity,
  saved_by,
  saved_at,
  timestamp
FROM saved_alerts
WHERE saved_by = 'Backend Worker'
ORDER BY saved_at DESC
LIMIT 20;
```

---

## 🔧 Comandos Útiles de pg_cron

### **Ver todos los jobs:**
```sql
SELECT * FROM cron.job;
```

### **Desactivar un job:**
```sql
SELECT cron.unschedule('alert-monitor-every-5-minutes');
```

### **Modificar schedule de un job:**
```sql
-- Primero eliminar el viejo
SELECT cron.unschedule('alert-monitor-every-5-minutes');

-- Crear nuevo con diferente schedule
SELECT cron.schedule(
  'alert-monitor-every-5-minutes',
  '*/10 * * * *',  -- Cada 10 minutos
  $$ SELECT net.http_post(...) $$
);
```

### **Ver ejecuciones fallidas:**
```sql
SELECT *
FROM cron.job_run_details
WHERE status = 'failed'
ORDER BY start_time DESC;
```

---

## 🚨 Troubleshooting

### **Problema: "extension pg_cron does not exist"**
**Solución:** Habilitar extensión desde Database → Extensions

### **Problema: "permission denied for schema cron"**
**Solución:** Ejecutar:
```sql
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
```

### **Problema: No veo ejecuciones en los logs**
**Causas posibles:**
1. URL incorrecta (verificar PROJECT_REF)
2. Anon key incorrecta
3. Edge Function no desplegada

**Verificar:**
```sql
-- Ver últimas ejecuciones y errores
SELECT
  jobid,
  status,
  return_message,
  start_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'alert-monitor-every-5-minutes')
ORDER BY start_time DESC
LIMIT 5;
```

### **Problema: Función devuelve 401 Unauthorized**
**Solución:** Verificar que el Anon Key sea correcto:
1. Dashboard → Settings → API
2. Copiar "anon public" key (no confundir con service_role)

---

## 📊 Ejemplo Completo Listo para Copiar

```sql
-- PASO 1: Habilitar pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- PASO 2: Otorgar permisos
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- PASO 3: Crear cron job
SELECT cron.schedule(
  'alert-monitor-every-5-minutes',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://rtsmagnex-alts.supabase.co/functions/v1/alert-monitor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
      ),
      body := jsonb_build_object()
    ) AS request_id;
  $$
);

-- PASO 4: Verificar que se creó
SELECT * FROM cron.job WHERE jobname = 'alert-monitor-every-5-minutes';
```

**⚠️ RECUERDA:** Reemplazar URL y Authorization con tus valores reales.

---

## ✅ Resultado Esperado

Una vez configurado correctamente:

- ✅ El worker se ejecuta cada 5 minutos automáticamente
- ✅ Funciona 24/7 sin necesidad de navegador abierto
- ✅ Puedes ver logs en Dashboard → Edge Functions
- ✅ Las alertas se guardan con `saved_by = 'Backend Worker'`

---

**Fecha:** 2025-12-18
**Última Actualización:** 2025-12-18
