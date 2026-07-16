# Validación de Alertas de Velocidad

Cómo el sistema decide si una alerta de exceso es real o un falso positivo.

---

## 1. La regla que sostiene todo el diseño

> **"No pude verificar" nunca puede convertirse en una afirmación sobre la
> conducta de una persona.**

Una alerta de exceso se le imputa a un conductor con nombre y apellido. El
veredicto tiene tres estados, no dos:

| Estado | Significa |
|---|---|
| `confirmada` | El informe del proveedor registra el exceso. |
| `descartada` | El informe está cargado y **no** registra el exceso → falso positivo. |
| `inconcluyente` | No se pudo verificar. **No es un veredicto.** |

`is_real_alert = NULL` en la base significa "no verificado", y eso es información
honesta. Escribir `true`/`false` sin haber comprobado sería afirmar algo que
nadie miró.

---

## 2. Por qué se reemplazó el agente RPA (y qué se aprendió)

El agente original (`services/rpaValidationService.ts`, jul 2026) abría Chrome,
navegaba el portal del proveedor por texto y leía el DOM. **Nunca funcionó**, y
el problema de fondo no era que estuviera roto sino qué hacía al fallar:

- Ante **cualquier** error caía en `runMockValidation()`, que devolvía
  `Math.random() > 0.15`. Comprobado ejecutándolo — misma placa, misma hora,
  misma plataforma, 6 corridas:

  ```
  #1 TRUE 83 km/h   #2 TRUE 83 km/h   #3 FALSE 98 km/h
  #4 TRUE 83 km/h   #5 TRUE 88 km/h   #6 TRUE 86 km/h
  ```

  Ese veredicto se escribía en `is_real_alert` y el motivo se enviaba por
  WhatsApp como `🤖 Validación:`.

- Fagor decidía con `textContent.includes('Velocidad')` — que matchea el
  **encabezado de la propia tabla**: cualquier página que cargara "confirmaba".
- Coltrack, si no encontraba la tabla, caía a `maxSpeed = 85` — inventando una
  velocidad por encima del umbral de grave.
- En Vercel no hay binario de Chrome (solo `puppeteer-core`, sin
  `@sparticuz/chromium`), así que el navegador nunca podía arrancar.
- El script de prueba (`scratch/test_rpa_agent.js`) importaba `.js` de un archivo
  `.ts` → `ERR_MODULE_NOT_FOUND`. **Por eso nada de esto se detectó.**

Verificado en la base: **cero filas** con `validation_reason` — ningún dato
fabricado llegó a producción. El peligro era latente: arreglar la config "obvia"
que faltaba (`SUPABASE_SERVICE_ROLE_KEY` en Vercel) lo habría **activado**.

**La lección de diseño:** el fallo estaba en el tipo de retorno. Un `boolean`
obliga a inventar un veredicto cuando la verificación falla. `inconcluyente`
tenía que ser representable.

---

## 3. Por qué NO se usa la API del proveedor (se investigó)

Parecía la opción obvia — el sistema ya consume ambas APIs. **No se puede:**

- **Coltrack** (`api.jsp`): responde 281 vehículos, pero es solo instantánea
  actual. No acepta parámetros de histórico.
- **Fagor** (`EstadoVehiculo.asmx`): el WSDL sí expone histórico
  (`InformePosiciones`, `InformeAlarmasGeo` con `VelPermitida`/`VelRegistrada`),
  pero **ambos exigen `idVehiculo`** y `EstadoActualFlota` devuelve el campo
  `Codigo` **vacío en los 497 vehículos** — no hay forma de mapear
  matrícula → id. `InformeGeocercas`, el único que acepta matrícula, devolvió
  **0 filas** contra eventos reales (solo cubre alarmas de geocerca).

**Para desbloquear la vía API** habría que pedirle a Fagor el mapeo
`matrícula → idVehiculo` (eso habilita `InformeAlarmasGeo`, que es exactamente el
informe correcto) y a Coltrack un endpoint de histórico.

---

## 4. La solución actual: el dato del proveedor que ya tienes

`alertas_diarias_gps` guarda `fecha` (**timestamp completo**, no solo el día),
`velocidad`, `latitud`/`longitud` y `lugar` por evento. Es la misma telemetría
que muestra el portal — sin navegador, sin scraping, sin depender del DOM de un
tercero.

```
Alerta de velocidad detectada
        │
        ▼
alert_validation_queue  (estado='pendiente')
        │
        │  worker Python, cron cada 2h
        ▼
alerts/validate_alerts.py
        │
        ├─ ¿Está cargado el informe de (proveedor, día)?
        │     NO  -> sigue 'pendiente', se REINTENTA   ← nunca 'descartada'
        │     SÍ  -> busca eventos de la placa en ±15 min
        │              hay  -> 'confirmada' + traza de evidencia
        │              no   -> 'descartada' (falso positivo)
        ▼
saved_alerts / alert_history  (is_real_alert, validation_reason)
```

**El precio:** el informe diario llega con retraso, así que la validación es
diferida (horas), no instantánea. A cambio es reproducible y auditable.

**Por qué hace falta la cola:** precisamente por ese retraso. Sin reintentos, una
alerta sin informe obligaría a inventar un veredicto — el pecado original del
agente anterior. Antes el disparo salía del navegador del usuario
(`services/databaseService.ts`), así que se perdía si cerraban la pestaña.

### La distinción crítica

**"El informe del día aún no llegó" ≠ "la alerta es falsa".** Ausencia de dato no
es evidencia de ausencia. Solo se descarta cuando el informe **sí** está cargado
y aun así no aparece el evento. Confundir esas dos cosas es exactamente como se
acusa a alguien con un dato que nadie verificó.

---

## 5. Verificación contra datos reales

Probado con WOV085 el 2026-07-15 (40 eventos, 19 excesos reales):

| Caso | Resultado | Correcto |
|---|---|---|
| 12:10 UTC — evento exacto de 87 km/h | `confirmada`, grave | ✅ |
| 12:35 UTC — a 9 min de un evento | `confirmada` (2 eventos) | ✅ |
| 09:00 UTC — sin eventos cerca | `descartada` | ✅ |
| 22:00 UTC — tras el último evento | `descartada` | ✅ |
| Hoy — informe sin cargar | `pendiente` (reintenta) | ✅ |
| Alerta de enero sin informe | `inconcluyente` | ✅ |

---

## 6. Parámetros (`alerts/validate_alerts.py`)

| Constante | Valor | Por qué |
|---|---|---|
| `VENTANA_MIN` | 15 min | La alerta se detecta sobre el feed en vivo; el informe lo genera el proveedor después, con su propio reloj. |
| `UMBRAL_EXCESO` | 50 km/h | Misma semántica que `api/agent.py` y `ml/train_driver_risk.py`. |
| `UMBRAL_GRAVE` | 80 km/h | Idem. |
| `MAX_INTENTOS` | 24 | Con cron cada 2h ≈ 2 días de margen. |
| `DIAS_MAX_ESPERA` | 3 | Si el informe no llegó, ya no llega: se cierra `inconcluyente`. |

> Si estos umbrales divergen de los del asistente y el dashboard, los tres darán
> veredictos distintos sobre el mismo evento.

---

## 7. Operación

### Instalación

1. Correr `migrations/alert_validation_queue_v1.sql` en el SQL Editor de Supabase.
   Incluye **dos índices en `saved_alerts`** que arreglan un problema medido: con
   ~64.000 filas, filtrar por `is_real_alert` u ordenar por `updated_at` revienta
   con `statement timeout` (57014).
2. Secrets en GitHub (Settings → Secrets → Actions): `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`.

### Correr a mano

```bash
export SUPABASE_URL="https://<proyecto>.supabase.co"
export SUPABASE_ANON_KEY="<anon>"          # basta para --dry-run (solo lee)
python -m alerts.validate_alerts --dry-run

export SUPABASE_SERVICE_ROLE_KEY="<service_role>"   # para escribir
python -m alerts.validate_alerts --limite 200
```

Sin `pip install`: el worker usa **solo la librería estándar** (urllib + json).

### Qué vigilar

- `reintentar` alto de forma sostenida → el informe diario no se está cargando.
- `inconcluyente` creciendo → informes que nunca llegan; revisar la ingesta.
- Muchas `descartada` → el detector en vivo genera falsos positivos; vale la pena
  revisar sus umbrales.

```sql
SELECT estado, veredicto, COUNT(*)
  FROM alert_validation_queue GROUP BY 1, 2;
```

---

## 8. Código obsoleto

`services/rpaValidationService.ts` y `api/validate-alert.ts` quedaron **sin
llamadores**. Se conservan por si algún día se quiere la captura de pantalla como
evidencia visual, lo que exigiría un worker con navegador (Vercel no puede).
Están desarmados: la simulación es opt-in con `RPA_MOCK_MODE=true`, va marcada
`simulado: true` y nunca se persiste.

**Recomendación: borrarlos.** Están en el historial de git si hicieran falta.

---

## 9. Pendiente

- [ ] Mostrar el veredicto y la traza de evidencia en `SavedAlertsPanel`
      (hoy `is_real_alert` se lee pero no se pinta).
- [ ] Pedir a Fagor el mapeo `matrícula → idVehiculo` para habilitar
      `InformeAlarmasGeo` y validar en minutos en vez de horas.
- [ ] Rotar credenciales: `api/coltrack.ts` tiene usuario y contraseña de Coltrack
      **hardcodeados y commiteados** (`COLTRACK_PASS = ']0zSKl549!9%'`).
