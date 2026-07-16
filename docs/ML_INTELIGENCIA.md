# Capa de Inteligencia (ML) — Torre de Control

Cómo el sistema aprende de la información que recolecta, **de forma controlada**.

---

## 1. La arquitectura en una frase

**El cerebro pesado corre offline; el agente solo lee resultados precalculados.**

```
GitHub Actions (cron diario, 04:10 COL)
   pandas + numpy + scikit-learn, sin límite de peso
   ml/train_driver_risk.py
            │
            │  escribe resultados (service_role)
            ▼
       Supabase  ──►  ml_driver_scores · ml_fleet_baselines
                      agent_interactions · ml_model_registry
            │
            │  lee filas ya calculadas (anon, milisegundos)
            ▼
   Vercel serverless          Frontend React
   api/agent.py               components/MlInsightsPanel.tsx
   (stdlib PURA)              (Dashboard)
```

### Por qué está separado así

`api/agent.py` corre como función serverless de Python en Vercel, que tiene un
límite de bundle de ~250MB y penaliza el arranque en frío. pandas + numpy pesan
~130MB y añadirían 2–4 segundos a **cada** respuesta del chat. PyTorch (~800MB)
directamente no cabe.

La separación no es un rodeo: es lo que permite tener ML potente **y** un chat que
responde al instante.

**Regla que no se rompe:**
- `requirements.txt` (raíz) → **sin dependencias, nunca**. Alimenta el bundle de Vercel.
- `ml/requirements.txt` → pandas/numpy/sklearn. Solo GitHub Actions.
- `.vercelignore` excluye `ml/` para que esto no pueda romperse por accidente.

---

## 2. Por qué NO hay redes neuronales (y no es una carencia)

Con datos tabulares de este volumen (~75k eventos, ~230 conductores con
exposición suficiente), un modelo estadístico robusto **gana** en precisión y,
sobre todo, es **explicable**.

A un conductor se le puede sustentar *"estás en el percentil 95 de frenadas
bruscas de la flota"*. Un *"riesgo 0.87"* salido de una red neuronal no se puede
defender frente a esa persona ni frente a un cliente — y un sistema de scoring
que no se puede defender deja de usarse en dos semanas.

Redes neuronales aquí serían complejidad, costo y opacidad sin retorno.

---

## 3. El modelo de riesgo (`ml/train_driver_risk.py`)

### Score 0–100 = suma ponderada de rangos percentiles

| Factor | Peso | Por qué |
|---|---|---|
| `graves_por_dia` | 0.40 | Exceso ≥80 km/h: el de mayor consecuencia |
| `excesos_por_dia` | 0.25 | Exceso 50–80 km/h |
| `frenadas_por_dia` | 0.20 | Conducción agresiva / anticipación deficiente |
| `velocidad_p95` | 0.15 | Velocidad **sostenida**, no el pico anecdótico |

Los pesos están explícitos y versionados en el código: un cambio de criterio de
negocio debe ser un cambio revisable, no un número mágico en una consulta.

### Cuatro decisiones que sostienen la credibilidad del número

1. **Percentiles, no z-scores.** La telemetría tiene outliers salvajes (un GPS
   defectuoso reporta 200 excesos en un día). La media y la desviación estándar
   se distorsionan; la mediana y el MAD no.

2. **Normalización por exposición.** Un conductor con 40 días activos y otro con
   3 no son comparables en conteos crudos. Todo se mide **por día activo**.

3. **Guardia de exposición mínima (3 días).** Con 1–2 días activos cualquier tasa
   es ruido: un evento en un día da "1.0 excesos/día", peor que el peor conductor
   real. En la corrida de validación esto excluyó **196 de 423 conductores** — es
   decir, casi la mitad del ranking habrían sido falsos críticos.

4. **Explicabilidad obligatoria.** Cada score guarda su desglose en `factores`
   (JSONB), y el panel lo muestra al expandir. Sin esto el score es un oráculo, y
   sobre un oráculo un supervisor no puede accionar.

### Qué aporta cada vista del panel

- **Mayor riesgo** — el ranking compuesto.
- **Empeorando** — pendiente de regresión sobre cubos semanales. **Esto es lo que
  hoy el sistema no puede ver:** un conductor que se degrada de forma sostenida
  durante semanas nunca cruza un umbral fijo y es invisible.
- **Atípicos** — `IsolationForest`. Complementa al ranking: el score dice "es peor
  que los demás", el bosque dice "esta *combinación* de conducta no se parece a
  nada en la flota" (p.ej. pocos excesos pero frenadas altísimas), un perfil raro
  que un orden lineal esconde a media tabla.

---

## 4. Higiene de datos que el modelo destapó

Al validar contra datos reales aparecieron dos problemas que ya estaban en la
base y nadie veía. Ambos se corrigen en el job, pero **conviene arreglarlos en la
fuente**:

1. **Conductores duplicados por grafía.** `'YORGUIN ROBLES PEÑA'` y
   `'Yorguin Robles Peña'` se contaban como dos personas: cada una recibía la
   mitad de la exposición y ambas aparecían en el top 10, con cifras falsas las
   dos. Se agrupa por `conductor_key` (mayúsculas, sin acentos, espacios
   colapsados). Relacionado con el bug de duplicados "PENDIENTE GOOGLE SHEETS".

2. **IDs de dispositivo en el campo `conductor`.** Valores como
   `013865BC1D00006B` — uno entraba al top 10 de riesgo con 106 excesos graves.
   Un ID de hardware en un ranking de **personas** invalida el tablero entero a
   ojos de un supervisor. Se excluyen y se **reportan en el log**, no se esconden.

---

## 5. El bucle de aprendizaje del asistente

### Estado actual: instrumentado, todavía no aprende

`api/agent.py` ahora registra cada interacción en `agent_interactions`:
pregunta, herramienta elegida, vía (`regex` / `fallback`), latencia y errores.
El id viaja al front, que muestra 👍/👎 y escribe `acierto`.

El registro es **síncrono a propósito**: en serverless el proceso se congela al
responder, así que un hilo en segundo plano perdería registros en silencio. Y
**nunca propaga excepciones** — si el log falla, el usuario igual recibe su
respuesta. Un tablero de telemetría no puede caerse por su propia telemetría.
(Verificado: el agente responde con normalidad aun sin la tabla creada.)

### Por qué el feedback humano es imprescindible

El router falla de dos formas, y solo una es visible:

- **Fallback** (`tool_elegida IS NULL`): "No estoy seguro de qué dato necesitas".
  Visible y fácil de contar.
- **Mis-routing silencioso**: mucho peor. Ejemplo real medido:
  *"cual conductor clavo los frenos mas veces este mes"* → el regex de frenadas
  busca `frenad`, "**frenos**" no matchea, y la pregunta se enruta con confianza a
  `info_conductor` buscando un conductor llamado *"clavo los frenos mas veces este
  mes"*. **El sistema no sabe que se equivocó.** Solo el 👎 del usuario lo revela.

Por eso el modelo se entrena únicamente con filas que tengan `acierto = true` o
`etiqueta_curada` puesta por un humano. Entrenar con las suposiciones del propio
router es como se **degrada** un sistema, no como mejora.

### El plan del router aprendido (siguiente paso, aún no implementado)

1. Acumular interacciones reales (semanas, no días).
2. Revisar los fallbacks agrupados: son el catálogo de lo que los usuarios piden
   y el sistema no cubre.
3. Entrenar offline un clasificador de intención (TF-IDF + regresión logística).
4. **Exportar los pesos a JSON plano** en `ml_model_registry.pesos`. `agent.py`
   hace la inferencia con stdlib puro — un producto punto, ~20 líneas. *El modelo
   viaja como datos, no como dependencia.*
5. El regex se mantiene como primera línea; el clasificador **solo** actúa cuando
   el regex no matchea. Se gana cobertura sin perder nada de lo que ya funciona.

---

## 6. Los controles — "que aprenda solo" nunca significa "que se despliegue solo"

Un modelo entrenado **no** entra a producción por el hecho de existir:

```
entrenado ──► sombra ──► [aprobación humana] ──► activo
                 │
                 └──► rechazado
```

- **`estado = 'sombra'`**: predice y registra, pero **no responde**. Corre una
  semana comparándose contra el regex antes de que nadie considere activarlo.
- **`aprobado_por` / `aprobado_at`**: la promoción a `activo` exige un humano
  identificado. La escritura de `ml_model_registry` es **solo `service_role`**:
  la aprobación no puede venir del navegador.
- **Un solo modelo activo por tipo**, garantizado por índice único parcial en la
  base. Sin eso, un despliegue concurrente deja al router respondiendo con dos
  cerebros distintos según a qué fila llegue primero.
- **El regex determinista nunca se elimina.** Es el suelo de seguridad.

> Un sistema que se reentrena solo y se despliega solo es un sistema que un
> martes empieza a dar cifras equivocadas a un cliente y nadie sabe por qué.

**Nota:** el scoring de riesgo (`driver_risk`) es determinista y explicable, así
que su recálculo diario no requiere aprobación — su fila en `ml_model_registry`
queda en `entrenado` como bitácora y no controla nada: el Dashboard lee
`ml_driver_scores` directamente. El estado `activo` está reservado para modelos
que sí deciden qué se le responde a un usuario (el router de intención), y esos
exigen aprobación humana explícita.

---

## 7. Operación

### Instalación (una sola vez)

1. Correr `migrations/ml_intelligence_v1.sql` en el SQL Editor de Supabase.
2. Cargar los secrets del repo en GitHub → Settings → Secrets → Actions:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

### Correr a mano

```bash
python -m venv .venv-ml
.venv-ml/Scripts/pip install -r ml/requirements.txt   # Linux/Mac: .venv-ml/bin/pip

export SUPABASE_URL="https://<proyecto>.supabase.co"

# Ensayo sin escribir (basta la anon key: solo lee)
export SUPABASE_ANON_KEY="<anon>"
python -m ml.train_driver_risk --ventana 90 --dry-run

# Corrida real (requiere service_role)
export SUPABASE_SERVICE_ROLE_KEY="<service_role>"
python -m ml.train_driver_risk --ventana 90
```

También se puede lanzar desde la pestaña **Actions** del repo
(*workflow_dispatch*), con `dry_run` opcional.

### Qué revisar cada mañana

El log del cron imprime el top 10, la distribución de niveles y los avisos de
calidad de datos. Las señales de alarma:

- Un salto brusco en `criticos` → normalmente es un problema de ingesta, no una
  flota que empeoró de un día para otro.
- Aviso de IDs de dispositivo → telemetría llegando sin conductor asignado.
- `conductores excluidos por muestra insuficiente` creciendo → cobertura de
  telemetría cayendo.

---

## 8. Pendiente / futuro

- [ ] Router de intención aprendido (sección 5) — **requiere acumular feedback primero**.
- [ ] Predicción de ralentí y consumo por contrato (cierre de período 29→28).
- [ ] Baselines por `tipo_activo` (hoy solo FLOTA y CONTRATO).
- [ ] Vista de histórico por conductor en el panel (`getHistorialConductor` ya
      existe en el servicio; falta el gráfico) — permitiría ver si un plan de
      acción efectivamente sirvió.
- [ ] Rotar la `SUPABASE_ANON_KEY`: está hardcodeada como fallback en
      `api/agent.py` y `services/supabaseClient.ts`, commiteada al repo.
