# Módulo de Informe de Ralentí — documentación completa

> Estado: 16 de septiembre de 2026. Refleja el código en `main` a esa fecha.
> Cuando este documento y el código difieran, manda el código: los archivos y líneas
> citados son la fuente de verdad.

---

## 1. Qué es y qué se busca lograr

El **ralentí** es el tiempo en que un vehículo tiene el motor encendido sin desplazarse.
Es combustible quemado sin producir trabajo: cuesta dinero, emite CO₂ y desgasta el motor
—en particular el filtro de partículas (FAP), que necesita temperatura de escape alta para
regenerarse y se satura de hollín cuando el motor trabaja frío y estacionario.

El módulo existe para responder cinco preguntas sobre una flota de ~950 vehículos activos
repartidos entre tres plataformas de GPS:

1. **¿Cuánto ralentí hubo?** En horas, y como porcentaje del tiempo de motor encendido.
2. **¿Cuánto costó?** En galones, pesos y kilogramos de CO₂.
3. **¿Quién y qué lo produce?** Ranking por conductor y por vehículo.
4. **¿Está mejorando o empeorando?** Serie histórica por quincenas, con contraste
   estadístico que distingue una tendencia real del ruido.
5. **¿Dónde hay que intervenir?** Vehículos atípicos, segmentación de perfiles de conducta
   y predicción de reincidencia.

La unidad de tiempo del módulo es la **quincena**: del día 1 al 15, y del 16 al último día
del mes. Todo lo que no encaje en ese patrón se descarta del módulo (ver §7.3).

### Principio rector

**No se estima nada.** Si un dato no está medido, no se inventa: se excluye del cálculo y
se reporta aparte como faltante. Esta regla aparece una y otra vez en el código y es la
razón de buena parte de su complejidad — por ejemplo, un galón cuyo tipo de combustible no
está definido no entra al CO₂ con un factor promedio: queda fuera y se cuenta como
"pendiente por definir".

---

## 2. Vista general del flujo

```
  ARCHIVOS                          API
  (Coltrack, Fagor)                 (Geotab)
       │                               │
       │ carga manual                  │ cron horario
       ▼                               ▼
  TelemetryProcessor.tsx          /api/geotab-sync
  (detección por contenido)            │
       │                               ▼
       ▼                        geotab_daily_metrics
  importService.ts               (km/horas/ralentí/galones POR DÍA)
       │                               │
       │                               │ cron 2×/día
       │                               ▼
       │                        /api/geotab-ralenti-sync
       │                               │ (agrega por quincena)
       └───────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  ralentis_periodos           │  1 fila por vehículo × quincena
        │  ralentis_eventos            │  1 fila por episodio de ralentí
        └──────────────────────────────┘
                       │
        ┌──────────────┴───────────────┐
        ▼                              ▼
  Informe por Período           Análisis General
  (una quincena)                (serie de quincenas)
        │                              │
        ▼                              ▼
   PDF · Excel · correo           PDF comparativo
```

---

## 3. Las tres plataformas

La flota no está en un solo proveedor de GPS. Cada uno mide distinto y entrega distinto, y
eso condiciona todo el módulo.

| | Coltrack | Fagor | Geotab |
|---|---|---|---|
| Vehículos activos | 242 | 373 | 5 propios, pero cubre ~350 en total |
| Ingreso al módulo | Archivos | Archivos | **API automática** |
| Horas de motor | Sí, medidas | Sí, de la grilla | **Derivadas** (conducción + ralentí) |
| Galones de ralentí | Sí, por evento | Sí, por evento | Sí, desde sep-2026 (contador de la ECU) |
| Conductor por evento | Sí | Sí (`Operador`) | No — Geotab imputa conductor en <4% de los viajes |
| Coordenadas del evento | Sí | No | No |
| Encendidos/apagados | Sí | No | No |
| Umbral nativo de alerta | 10 min | 5 min | Lo aplica la regla en la plataforma |

**Geotab es una capa paralela, no un tercer grupo de vehículos.** Muchos vehículos cuyo
`gps_compañia` es FAGOR o COLTRACK también llevan equipo Geotab. Por eso existe la regla de
precedencia de §7.4.

---

## 4. Los archivos que se cargan

La detección es **por contenido, nunca por nombre de archivo**. El nombre puede cambiar sin
consecuencias; lo que importa son las cabeceras de las columnas. El catálogo vive en
`components/reports/TelemetryProcessor.tsx` y debe actualizarse en el mismo commit en que
cambie `services/importService.ts`.

### 4.1 Coltrack

| Archivo | Requisito | Se detecta por | Qué aporta |
|---|---|---|---|
| **Ralentí consolidado por vehículo** (CSV)<br>`Documento Ralenti 1 … Coltrack.csv` | **Obligatorio** | Columnas `Unidad` + `Ralentis excesivos` | `horas_motor_encendido` (el denominador del % de ralentí), `horas_motor_ralenti`, `kms_recorridos`, `encendidos_apagados` y consumo. **Es el único insumo de toda la flota que aporta encendidos/apagados.** |
| **Excesos de Ralentí semanal** (XLSX)<br>`Excesos_Ralentí_Semanal_DDMMAAAA_HHMM.xlsx` | Recomendado | `Placa` + `Inicio Exceso` + `Duracion` | Evento por evento con duración y **galones reales** → habilita CO₂ exacto, ranking por conductor y "mayor evento". Hay que subir **todas** las semanas que cubren la quincena. |
| **Ralentí detalle de eventos** (CSV)<br>`Documento Ralenti 2 … Coltrack.csv` | Opcional | `Nombre` + `Metros` + `Hora Reporte` | Alternativa cuando no existe el semanal. **La duración se estima por reparto uniforme y no trae galones.** Se ignora si se sube el semanal. |

### 4.2 Fagor

| Archivo | Requisito | Se detecta por | Qué aporta |
|---|---|---|---|
| **Grilla de telemetría diaria** (XLSX)<br>`Grid_telemetría….xlsx` | **Obligatorio** | `Matrícula` + `Horas Motor` + `Ralentí Tiempo Total` (en las primeras 15 filas) | Horas de motor encendido, ralentí **total**, km y galones. **Sin este archivo todo el ralentí de Fagor queda excluido del informe.** Hay que exportarlo con el rango exacto de la quincena. |
| **Informe de ralentí, evento por evento** (XLSX)<br>`15 de agosto Ralentí.xlsx`, `Documento Ralenti 2 … Fagor.xlsx` | **Obligatorio** | `Matrícula` + `T. Ralentí` (en las primeras 15 filas) | Duración real y `Gal. Consumidos` por evento → `ralentis_eventos`, más el conteo de excesivos. Habilita ranking por conductor. |

> **Cabecera desplazada.** El export de Fagor antepone dos filas de preámbulo (usuario +
> rango de fechas, y el título) y pone la cabecera en la **fila 3**. Hasta sep-2026 la
> detección del informe de ralentí solo miraba la fila 1 y el archivo se rechazaba en
> silencio con *"No se detectó ningún archivo válido"*. Corregido: ahora ambas detecciones
> escanean las primeras 15 filas.

> **Los dos archivos de Fagor son complementarios, no alternativos.** La grilla aporta
> motor/km/galones; el informe de ralentí aporta el conteo y el detalle. Cada carga conserva
> lo que aportó la otra (ver §6.2).

### 4.3 Geotab

**No se carga ningún archivo para el informe de ralentí.** Entra por API.

Los export `GA_…_Cumplimiento_y_Utilización_*.xlsx` y `GA_…_Scorecard_*.xlsx` **sí** se
cargan, pero alimentan únicamente los **informes mensuales** (`reportes_vehiculos`), no
`ralentis_periodos`. Es una decisión deliberada: mantiene el informe de ralentí
independiente de cargas manuales de Geotab. Verificado además que ninguno de esos dos
export trae columna de combustible.

### 4.4 Archivos que NO alimentan este módulo

Se mencionan porque se cargan en la misma pantalla y confunden:

- Consolidado de faltas por vehículo / por conductor (Coltrack) → informe mensual.
- Km por conductor, Kilometraje por selección (Fagor) → informe mensual.
- Alarmas de Excesos / Frenadas / Aceleraciones → informe mensual.
- Maestros de conductores (ambas plataformas) → mapa nombre→cédula del informe mensual.
- Cualquier archivo cargado con el ciclo mensual **29→28**: el módulo lo descarta (§7.3).

---

## 5. Cómo se cargan

**Informes → Procesador de Telemetría.** Se elige la plataforma, se fija el período (inicio
y fin de la quincena) y se sueltan los archivos.

El período que se fija en pantalla es el que se estampa en `periodo_inicio` / `periodo_fin`.
**Si se fija el ciclo mensual 29→28, los datos entran a la base pero el módulo de ralentí no
los ve.** Es el error operativo más frecuente y más silencioso.

Cada carga deja registro en `cargas_excel` (`tipo`, `nombre_archivo`, `estado_validacion`).
Si no hay registro, la carga no ocurrió.

---

## 6. Procesamiento por plataforma

### 6.1 Coltrack — `importarDatosPlanosColtrack`

1. Del CSV consolidado (`Ralenti 1`) se escribe una fila por vehículo en `ralentis_periodos`
   con `fuente='COLTRACK'`.
2. `consumo_combustible` **no** es el consumo total del vehículo: se prorratea al ralentí.

   ```
   consumo_combustible = Consumo de combustible × (horas_motor_en_ralenti / horas_motor_encendido)
   ```

   Si `horas_motor_encendido` es 0, el resultado es 0.
3. Si además se subió el semanal de excesos, se hace una **reconciliación**: los galones y
   el conteo de excesivos pasan a salir de los eventos reales, y se **preservan**
   `horas_motor_encendido`, `horas_motor_ralenti`, `kms_recorridos` y `encendidos_apagados`
   de la fila ya existente (patrón `ex` en `importService.ts`).

### 6.2 Fagor — `importarDatosPlanosFagor`

1. La grilla se agrega por matrícula: horas de motor, ralentí total, km, galones.
2. El informe de ralentí se recorre evento por evento:
   - `T. Ralentí` numérico se interpreta como **fracción de día** → `× 24 × 3600` = segundos.
   - `Fecha Inicio` (o `Fecha Alarma` como respaldo) y `Fecha Fin` se normalizan a reloj
     de pared local, sin pasar por UTC, para que no se corra el día.
   - `Operador` resuelve el conductor contra el maestro; los placeholders no se imputan.
3. El universo escrito es la **unión** de ambos archivos: un vehículo que solo aparece en la
   grilla también entra, porque suma al denominador y mejora la cobertura de motor.
4. **Cada carga preserva lo que la otra aportó.** Antes de escribir se lee la fila existente
   del período y los campos que el archivo actual no trae se conservan:

   | Campo | Prioridad |
   |---|---|
   | `horas_motor_encendido`, `kms_recorridos` | grilla de esta carga → valor existente |
   | `horas_motor_ralenti`, `consumo_combustible` | grilla de esta carga → valor existente (si > 0) → agregado de alarmas |
   | `ralentis_excesivos` | informe de ralentí de esta carga → valor existente |

   Solo se hereda de una fila que **ya sea de Fagor**: heredar de una fila de Geotab o
   Coltrack y publicarla bajo `fuente='FAGOR'` mezclaría plataformas en una misma fila.

   > Sin esta lectura previa, subir el informe de ralentí sin la grilla dejaba
   > `horas_motor_encendido` en 0 y el vehículo entero se caía del cálculo del %.

### 6.3 Geotab — API, dos crons

**`/api/geotab-sync`** — cada hora (`0 * * * *`).
Trae los viajes (`Trip`) de los últimos 3 días calendario y escribe una fila por
(día, dispositivo) en `geotab_daily_metrics`: km, horas de conducción, horas de ralentí,
viajes y galones de ralentí.

> `fromDate` se ancla a las **00:00 de Colombia** del primer día pedido. Anclarlo a un
> instante a mitad de día —lo que hacía `Date.now() − días×24h`— devolvía solo la cola del
> día más viejo, que se guardaba como si fuera el día completo y pisaba la fila buena. Entre
> agosto y septiembre de 2026 la tabla llegó a conservar el 13–30 % de los km reales.

**`/api/geotab-ralenti-sync`** — dos veces al día (05:30 y 17:30 UTC).
Agrega `geotab_daily_metrics` por quincena hacia `ralentis_periodos`, y baja los eventos
individuales de la regla **Idling** de MyGeotab hacia `ralentis_eventos`.

Procesa la quincena en curso **y** la que contiene "hace 3 días", de modo que cada quincena
recibe tres pasadas después de cerrar.

> Antes procesaba solo la quincena de "hoy". El día 31, al agregar 16→31, ese día 31 aún no
> tenía viajes; y desde el día 1 la quincena en curso ya era otra. **El último día de cada
> quincena se perdía siempre.**

#### Decisiones de diseño de Geotab

1. **Horas de motor derivadas.** `TripDetailEngineHours` daba 2.733 h para 279 vehículos en
   16 días, incompatible con los 326.841 km del mismo período: es una lectura de odómetro
   con muestreo grueso. Se usa:

   ```
   horas_motor_encendido = horas_conduccion + horas_ralenti
   ```

2. **Galones medidos con el contador de la ECU** (desde sep-2026). El diagnóstico
   `DiagnosticDeviceTotalIdleFuelId` —"Combustible total utilizado al ralentí (desde la
   instalación del dispositivo telemático)"— es un contador acumulativo de por vida. El
   consumo sale de **restar lecturas consecutivas**; cada diferencia se imputa al día de la
   lectura anterior, y una diferencia negativa (contador reiniciado) se descarta.

   La resta se hace por día porque una quincena son ~143.000 lecturas y el tope de la API
   es 50.000.

   Validado sobre 3 días y 369 vehículos: **311 con dato (84 %), 0,28 gal/h**. Fagor,
   midiendo la misma flota con sus propios sensores, daba **0,27 gal/h**.

3. **NULL ≠ 0.** Un vehículo sin lectura de ECU no es un vehículo que no consumió nada.
   `galones_ralenti` y `consumo_combustible` quedan en NULL cuando no hubo medición.

4. **Sin conductor.** `conductor_id` siempre nulo y `conductor_nombre = 'NO REGISTRA'`.
   Geotab imputa conductor en menos del 4 % de los viajes y no se inventa.

5. **Sin encendidos/apagados.** Geotab no lo expone; queda en 0.

---

## 7. Modelo de datos

### 7.1 `ralentis_periodos` — una fila por vehículo y quincena

| Columna | Tipo | Significado |
|---|---|---|
| `vehiculo_id` | UUID | FK a `vehiculos` |
| `periodo_inicio`, `periodo_fin` | DATE | Límites de la quincena |
| `ralentis_excesivos` | NUMERIC | Nº de eventos sobre el umbral del proveedor |
| `horas_motor_encendido` | NUMERIC | **Denominador del % de ralentí** |
| `horas_motor_ralenti` | NUMERIC | Ralentí **total** (incluye los cortos) |
| `kms_recorridos` | NUMERIC | Km del período |
| `consumo_combustible` | NUMERIC | Galones quemados en ralentí. NULL = sin medición |
| `encendidos_apagados` | NUMERIC | Ciclos de encendido. Solo Coltrack lo aporta |
| `fuente` | TEXT | `COLTRACK` / `FAGOR` / `GEOTAB` / NULL (histórico previo a ago-2026) |

**Clave única: `(vehiculo_id, periodo_inicio, periodo_fin)` — sin `fuente`, a propósito.**
Una sola fila por vehículo y período. Sumar las horas de motor de dos plataformas sobre el
mismo vehículo sería físicamente imposible. (En `reportes_vehiculos`, del informe mensual,
la clave **sí** incluye `fuente` y ahí las plataformas se suman: es otro modelo.)

### 7.2 `ralentis_eventos` — una fila por episodio

| Columna | Significado |
|---|---|
| `vehiculo_id`, `conductor_id` | FK a los maestros (pueden ser nulos) |
| `placa`, `conductor_nombre` | Datos crudos de identificación |
| `fecha_inicio`, `fecha_fin`, `duracion_segundos` | Ventana del episodio |
| `galones_consumidos` | Galones del episodio (0 en Geotab) |
| `ubicacion`, `latitud`, `longitud` | Solo Coltrack |
| `proveedor` | `COLTRACK` / `FAGOR` / `GEOTAB` |
| `periodo_inicio`, `periodo_fin` | Quincena a la que pertenece |

**Clave única: `(placa, fecha_inicio, proveedor)`** — idempotente: recargar el mismo archivo
no duplica.

### 7.3 Qué cuenta como quincena

```js
function isQuincenaPeriodo(inicio, fin) {
  // mismo año y mismo mes, y además
  // (día 1 → día 15)  ó  (día 16 → último día del mes)
}
```

Todo lo demás se descarta del módulo. En `ralentis_periodos` conviven períodos de otra
procedencia —el informe mensual usa ciclos 29→28— que distorsionarían el comparativo.

### 7.4 Precedencia entre plataformas

Como hay una sola fila por vehículo y período, hay que decidir quién escribe:

- **Geotab escribe solo** donde no hay fila, o donde la fila ya es suya (`fuente='GEOTAB'`).
- **`fuente` NULL** (histórico previo a ago-2026) se trata como no-Geotab: tampoco se pisa.
- **Coltrack y Fagor escriben siempre** y estampan su fuente, desplazando a Geotab.

El criterio: Coltrack y Fagor traen eventos reales, galones por evento y conductor; Geotab
no trae conductor. Donde hay datos más ricos, mandan.

---

## 8. Variables y fórmulas

### 8.1 Núcleo — `services/ralentiMetrics.ts`

Es la fuente única de verdad de la agregación. **Todas las métricas de motor se calculan
solo sobre las filas con `horas_motor_encendido > 0`** (`motorRows`).

> Las filas con encendido = 0 y ralentí > 0 inflaban el % a valores físicamente imposibles
> porque sumaban al numerador sin aportar al denominador. Ese ralentí se aísla como
> `ralentiHuerfano` y se reporta como señal de calidad, no se suma.

| Variable | Fórmula |
|---|---|
| `totalHorasEncendido` | Σ `horas_motor_encendido` sobre `motorRows` |
| `totalHorasRalenti` | Σ `horas_motor_ralenti` sobre `motorRows` |
| `ralentiHuerfano` | Σ `horas_motor_ralenti` de las filas con encendido = 0 |
| `totalKm` | Σ `kms_recorridos` sobre `motorRows` |
| `totalGalones` | Σ `consumo_combustible` sobre **todas** las filas |
| `horasConduccion` | `max(totalHorasEncendido − totalHorasRalenti, 0)` |
| **`pctRalenti`** | `totalHorasRalenti / totalHorasEncendido × 100` |
| `pctConduccion` | `horasConduccion / totalHorasEncendido × 100` |
| `velocidadMedia` | `totalKm / horasConduccion` (km/h ponderada) |
| `kmPorHoraRalenti` | `totalKm / totalHorasRalenti` (eficiencia) |
| `kmPorVehiculoActivo` | `totalKm / vehiculosConMotor` |
| `coberturaMotorPct` | `vehiculosConMotor / vehiculosActivos × 100` |
| `filasRalentiMayorEnc` | Nº de filas con `ralentí > encendido × 1,02` (violación física) |
| `datoInconsistente` | `coberturaMotorPct < 98` **o** `filasRalentiMayorEnc > 0` |

**Identidad que se verifica:** `Motor = Conducción + Ralentí`, con tolerancia del 2 %
(`identityDeviation`). Se cumple por construcción; si se desvía, hay un error de agregación.

### 8.2 Umbral de alerta por proveedor

```js
UMBRAL_RALENTI_SEG = { COLTRACK: 600, FAGOR: 300, GEOTAB: 0 }   // segundos
// Cualquier otro proveedor: 300
```

Cada plataforma define la alerta con su propio umbral y **no se normaliza**. Geotab va en 0
a propósito: sus eventos vienen de la regla *Idling*, que ya aplicó su umbral en la
plataforma — todo evento que llega es un exceso por definición, y volver a filtrarlo aquí
descartaría alertas legítimas.

**`alertEvents`** = eventos que superan el umbral de su proveedor **y** cuyo conductor no
contiene "TALLER". Toda la analítica de excesos se calcula sobre este conjunto, no sobre los
eventos crudos.

### 8.3 Exclusiones

| Regla | Efecto |
|---|---|
| Conductor contiene **"TALLER"** | Vehículo en mantenimiento: se excluye **por completo** del informe |
| Conductor placeholder (`N/A`, `NO REGISTRA`, `SIN CONDUCTOR`, `DESCONOCIDO`, `NO ASIGNADO`, `NINGUNO`, vacío) | Se excluye solo de las métricas que destacan a una persona: "mayor evento único" y los Top |

### 8.4 CO₂ y costo

Factores **FECOC/UPME**, kg CO₂ por galón:

| Combustible | kg CO₂/gal | COP/gal |
|---|---|---|
| Diésel / ACPM | 10,15 | 11.200 |
| Gasolina / corriente | 8,81 | 16.000 |
| GLP | 6,47 | *(sin precio cargado)* |
| Eléctrico | 0 | 0 |

El tipo sale de `vehiculos.tipo_combustible` y el emparejamiento es por substring, para
tolerar variantes de captura. Los precios se mantienen **a mano**: no hay API oficial
estable de precios en Colombia. Actualizar cuando cambie la regulación del Ministerio de
Minas / SICOM.

```
co2Kg   = Σ (galones_del_tipo × factor_del_tipo)
costo   = Σ (galones_del_tipo × precio_del_tipo)
costAvgDaily      = costo / días del período
co2FactorEfectivo = co2Kg / totalGalones     ← para que el desglose diario reconcilie
costFactorEfectivo= costo / totalGalones
```

> ### ⚠ Discrepancia conocida entre las dos vistas
>
> Los dos informes tratan distinto un galón cuyo tipo de combustible **no está definido**:
>
> - **Informe por Período** lo **excluye** del CO₂ y del costo, y lo reporta aparte como
>   `galonesSinTipo` / `vehiculosSinTipo` ("pendiente por definir").
> - **Análisis General** lo **imputa como diésel** (10,15 kg/gal y $11.200/gal) por el
>   valor por defecto de `getCO2Factor` / `getPrecioGalon`.
>
> Con **98 vehículos activos sin `tipo_combustible`**, las dos vistas pueden mostrar CO₂ y
> costo distintos para la misma quincena. Conviene unificarlo hacia el criterio del Informe
> por Período, que es el que respeta el principio de no estimar.

### 8.5 Métricas del Informe por Período

| Métrica | Fórmula |
|---|---|
| `totalRalentisExcesivos` | `alertEvents.length` — **no** el conteo del agregado |
| `horasRalentiMas5Min` | Σ duración de `alertEvents` / 3600 |
| `pctRalentiMas5MinDeRalenti` | `horasRalentiMas5Min / totalHorasMotorRalenti × 100` |
| `pctRalentiMas5MinDeEncendido` | `horasRalentiMas5Min / totalHorasMotorEncendido × 100` |
| `promedioEventoSegundos` | Σ duración / nº de `alertEvents` |
| `eventosMas30Min` | `alertEvents` con duración > 1.800 s |
| `mayorEventoSegundos` | Máxima duración entre `alertEvents` **con conductor identificado** |
| `placaCritica` | Placa con mayor tiempo acumulado en `alertEvents` |

### 8.6 Semáforos

Ambos se derivan del mismo `pctRalenti`, con meta del **10 %**:

| `pctRalenti` | Riesgo operacional | Riesgo FAP / AdBlue |
|---|---|---|
| < 10 % | **Bajo** — operación eficiente | **Bajo** — el filtro opera a temperatura correcta |
| 10 – 15 % | **Medio** — desviación moderada | **Moderado** — riesgo de saturación a mediano plazo |
| > 15 % | **Alto** — exceso severo | **Crítico** — peligro de taponamiento por hollín |

### 8.7 Metas y deltas

```
deltaPct         = pctRalenti − 10          (meta: 10 % de ralentí)
deltaGalones     = totalGalones − 37        (meta: 37 galones por quincena)
deltaCostoDiario = costAvgDaily − 28000     (meta: $28.000 COP/día)
```

### 8.8 Detección de vehículos atípicos

Sobre el tiempo acumulado en `alertEvents` por placa:

```
umbral = media + 1,2 × desviación estándar
```

Se marca un vehículo como anómalo si supera ese umbral **y** acumula más de 1 hora. Se
reporta `excessRatio = tiempo_del_vehículo / media`.

### 8.9 Proyección del período siguiente

Heurística sencilla, con topes para que no se dispare:

```
trendRatio    = pctRalenti / prevPctRalenti
predictedPct  = clamp(pctRalenti × f, 1, 100)
   donde f = 1,15 si trendRatio > 1,5
           = 0,85 si trendRatio < 0,5
           = trendRatio en otro caso
predictedGalones = totalGalones × (predictedPct / pctRalenti)
predictedCosto   = predictedGalones × costFactorEfectivo
```

### 8.10 Analítica de la serie — `services/ralentiAnalytics.ts`

Criterio: **nunca afirmar una tendencia que el dato no sostiene.** Con 8–9 quincenas una
pendiente puede ser puro ruido.

- **`regresionLineal`** — mínimos cuadrados sobre `y = a + b·x`. Devuelve pendiente,
  intercepto, **R²**, error estándar de la pendiente, estadístico **t**, grados de libertad
  (`n − 2`) y si es **significativa** al 95 %. Requiere al menos 3 puntos: con 2 la recta es
  exacta y no dice nada.
- Los valores críticos de t se **tabulan** (gl 1→20) en vez de usar 1,96: con muestras
  pequeñas la diferencia llevaría a declarar tendencias inexistentes.
- **`correlacion`** — Pearson, con interpretación verbal: nula (<0,3), débil (<0,5),
  moderada (<0,7), fuerte (≥0,7).
- **`detectarAtipicos`** — z-score del **residuo contra la recta ajustada**, no contra la
  media, para no marcar como atípico lo que es simple tendencia. Umbral |z| ≥ 2.
- **`descomponerCambio`** — separa cuánto de un cambio viene de que la flota creció y cuánto
  de que cada vehículo se comporta distinto:

  ```
  Δtotal = (N_actual − N_base) × I_base   +   N_actual × (I_actual − I_base)
           └──── efecto flota ────┘           └──── efecto intensidad ────┘
  con I = total / vehículos
  ```

  Es indispensable en esta serie: la incorporación de Geotab sumó ~250 vehículos de golpe, y
  sin esta descomposición cualquier subida agregada se leería como un empeoramiento de
  conducta que no ocurrió.

---

## 9. Capa de aprendizaje automático — `services/ralentiML.ts`

Corre **en el navegador**, sobre el alcance filtrado, y es **determinista** (semilla fija
42 + k-means++): el mismo alcance produce siempre la misma segmentación, de modo que un
informe firmado sea reproducible.

> No se mezcla con la capa `ml/` (riesgo de conductor, entrenada offline con
> pandas/sklearn): son modelos distintos, sobre entidades distintas, con ciclos de vida
> distintos.

### 9.1 Variables del perfil por vehículo

Cinco rasgos, promediados sobre las quincenas del vehículo (mínimo **3 quincenas**, y al
menos **12 vehículos** para que el modelo corra):

1. **% Ralentí** — `ralentí / motor × 100`
2. **Horas de ralentí por quincena** — `ralentí / nº quincenas`
3. **Duración media del evento (min)** — `segundos / nº eventos / 60`
4. **Eventos por quincena** — `nº eventos / nº quincenas`
5. **% de eventos > 30 min** — `largos / nº eventos × 100`

### 9.2 Segmentación (no supervisada)

- **z-score obligatorio** antes de k-means: sin estandarizar, "horas de ralentí" (orden 10²)
  aplastaría a "% de eventos largos" (orden 10⁻¹) y el clúster se decidiría por una sola
  variable.
- **k-means++** con k elegido entre 2 y 5 por **silueta media**.
- Los grupos se ordenan por horas de ralentí descendente.
- **Atípicos**: los 5 vehículos más lejanos a su centroide, y solo si la distancia > 3.

### 9.3 Predicción de reincidencia (supervisada)

Pregunta: *¿este vehículo estará en el quintil superior de ralentí la próxima quincena?*

- **Etiqueta**: `y = 1` si en la quincena siguiente el ralentí del vehículo supera el umbral
  del quintil superior (percentil 80) de esa quincena.
- **Modelo**: regresión logística con descenso de gradiente — tasa 0,3, 3.000 iteraciones,
  regularización L2 = 0,01.
- **Validación temporal**: se entrena con todas las quincenas menos la última transición y
  se evalúa sobre esa última. Requiere > 40 filas de entrenamiento, > 15 de prueba y ambas
  clases presentes.
- **Métricas**: AUC y las de clasificación al umbral 0,5, contrastadas contra la **tasa
  base** del período de prueba.
- **Salida**: los 8 vehículos con mayor probabilidad, puntuados sobre su última quincena
  observada.

---

## 10. Los informes

### 10.1 Informe por Período (`RalentiReports.tsx`)

Una quincena en detalle. Filtros por cliente, contrato, tipo de activo y placa.

Contiene: tarjetas de resumen (vehículos evaluados, galones, costo, CO₂, % de ralentí,
riesgo operacional, riesgo FAP), comparación contra la quincena anterior, Top 10 de
conductores y de vehículos (por tiempo total y por evento máximo), tabla de eventos
detallada, tendencia diaria de CO₂, vehículos atípicos y proyección.

### 10.2 Análisis General (`RalentiAnalisisGeneral.tsx`)

La serie de quincenas cerradas. Añade por período las banderas de completitud:

- **`enCurso`** — la quincena no ha terminado: cifras parciales por definición.
- **`sinCombustible`** — hay ralentí pero 0 galones → **CO₂ y costo no son comparables**.
- **`datoInconsistente`** — cobertura de motor < 98 % o violaciones físicas.
- **`ralentiHuerfano`** — horas de ralentí excluidas del % por no tener motor.

Contiene: evolución del % de ralentí, horas de conducción vs ralentí excesivo, eficiencia
(km por hora de ralentí, velocidad media), regresión con R² y significancia, descomposición
flota/intensidad, segmentación k-means y predicción de reincidencia.

### 10.3 Salidas

| Formato | Dónde | Notas |
|---|---|---|
| **PDF ejecutivo** | `InformeRalentiPDF` en `pdfTemplates.tsx` | Portada con KPIs, Top 10 conductores, detalle |
| **PDF comparativo** | `descargarPDFAnalisisGeneral` | La serie de quincenas |
| **Excel** | `descargarArchivo` | Detalle de eventos |
| **Correo** | Plantillas de envío | **Sin recomendaciones automáticas** desde sep-2026 |

> **Regla de redacción.** Los informes se escriben para que los entienda alguien que no sabe
> de telemetría. La jerga va al tooltip, no al cuerpo. Y **siempre hay que revisar el PDF
> generado**, no solo la pantalla.

---

## 11. Controles de calidad

| Control | Dónde | Qué detecta |
|---|---|---|
| Cobertura de motor < 98 % | `ralentiMetrics` | Faltan consolidados de horas de motor |
| `ralentí > encendido × 1,02` | `ralentiMetrics` | Violación física: error de agregación |
| Identidad Motor = Conducción + Ralentí (±2 %) | `identityDeviation` | Error de agregación |
| `ralentiHuerfano > 0` | `ralentiMetrics` | Filas con ralentí sin motor |
| `advertenciaCoberturaMotor` | `importService` | Avisa al operador al terminar una carga |
| Guard de quincena | `isQuincenaPeriodo` | Períodos mensuales que contaminarían la serie |
| `truncado` de Geotab | `/api/geotab` | Se alcanzó el tope de 50.000 eventos/lecturas |
| `migracionPendiente` | `/api/geotab-sync` | Falta correr una migración en Supabase |

---

## 12. Operación

### 12.1 Crons (`vercel.json`)

| Ruta | Horario (UTC) | Qué hace |
|---|---|---|
| `/api/geotab-sync` | `0 * * * *` | Últimos 3 días calendario → `geotab_daily_metrics` |
| `/api/geotab-ralenti-sync` | `30 5 * * *` | Quincena en curso + la anterior |
| `/api/geotab-ralenti-sync` | `30 17 * * *` | Segunda pasada, por si un rango quedó pendiente |

### 12.2 Recargas puntuales

```
/api/geotab-sync?inicio=2026-08-01&fin=2026-08-15
/api/geotab-ralenti-sync?inicio=2026-08-01&fin=2026-08-15
```

Los rangos con combustible hay que pedirlos **en tramos de ~3 días**: el tope de 50.000
lecturas de `StatusData` no alcanza para más.

### 12.3 Herramientas de diagnóstico (`scratch/`)

| Script | Para qué |
|---|---|
| `geotab_backfill_ralenti.cjs` | Repara un rango: verifica el despliegue, re-sincroniza por tramos, contrasta contra Geotab con 2 % de tolerancia y solo entonces reagrega. Simulacro de solo lectura por defecto; escribe con `--ejecutar` |
| `geotab_probe_combustible.cjs` | Sonda local de diagnósticos de combustible (necesita `GEOTAB_PASSWORD`) |
| `audit_ralenti_fuentes.mjs` | Procedencia de las filas por período |

Y en el proxy, `POST /api/geotab { action: 'fuelDiagnostics' }` con `explorar` o `medir`:
solo lectura, corre donde están las credenciales.

---

## 13. Limitaciones conocidas

### Por plataforma

| | Coltrack | Fagor | Geotab |
|---|---|---|---|
| Conductor por evento | ✅ | ✅ | ❌ siempre "NO REGISTRA" |
| Coordenadas | ✅ | ❌ | ❌ |
| Encendidos/apagados | ✅ | ❌ | ❌ |
| Horas de motor | medidas | medidas | **derivadas** |
| Galones | reales | reales | medidos, 84 % de cobertura |

### Generales

1. **~58 vehículos Geotab sin lectura de ECU** quedarán en NULL de combustible. La
   presentación de "sin medición" frente a "$0" está **pendiente** en la UI.
2. **98 vehículos activos sin `tipo_combustible`** en el maestro → CO₂ y costo se excluyen
   (Informe por Período) o se imputan como diésel (Análisis General). Ver §8.4.
3. **Placas que Geotab reporta y no están en el maestro `vehiculos`** se omiten: su ralentí
   no entra al informe. Al 16-sep-2026: `KZV978`, `LJS676`.
4. **Los precios de combustible se mantienen a mano** y no se versionan por fecha: un
   informe reconstruido de un período pasado usa los precios de hoy.
5. **La quincena en curso** muestra transitoriamente más ralentí excesivo que total: los
   episodios cierran antes que el viaje que los contiene. Se resuelve al cerrar el día.
6. **`CRON_SECRET` no está definido en Vercel**: los endpoints de sincronización son
   invocables por cualquiera.

---

## 14. Glosario

| Término | Definición |
|---|---|
| **Ralentí** | Motor encendido sin desplazamiento |
| **Ralentí excesivo / alerta** | Episodio que supera el umbral nativo de su proveedor |
| **Ralentí huérfano** | Horas de ralentí en filas sin horas de motor: excluidas del %, señal de calidad |
| **Quincena** | 1→15 ó 16→último día del mes. **No** el ciclo mensual 29→28 |
| **Cobertura de motor** | % de vehículos del período con `horas_motor_encendido > 0` |
| **Fuente** | Plataforma que escribió la fila de período |
| **Proveedor** | Plataforma que originó un evento |
| **FAP** | Filtro de partículas diésel: se satura de hollín con el motor frío y estacionario |
| **Efecto flota vs intensidad** | Descomposición de un cambio agregado entre "hay más vehículos" y "cada vehículo se comporta distinto" |

---

## 15. Archivos de referencia

| Archivo | Responsabilidad |
|---|---|
| `components/reports/TelemetryProcessor.tsx` | Pantalla de carga y catálogo de insumos |
| `services/importService.ts` | Ingesta de Coltrack, Fagor y Geotab por archivo |
| `api/geotab.ts` | Proxy JSON-RPC de MyGeotab + sonda de combustible |
| `api/geotab-sync.ts` | Cron horario → `geotab_daily_metrics` |
| `api/geotab-ralenti-sync.ts` | Cron quincenal → `ralentis_periodos` / `ralentis_eventos` |
| `services/ralentiMetrics.ts` | Agregación de motor/ralentí (fuente única) |
| `services/ralentiAnalytics.ts` | Regresión, correlación, atípicos, descomposición |
| `services/ralentiML.ts` | k-means y regresión logística |
| `components/reports/RalentiReports.tsx` | Informe por Período |
| `components/reports/RalentiAnalisisGeneral.tsx` | Análisis General |
| `services/pdfTemplates.tsx` | PDF ejecutivo y comparativo |

### Migraciones

`reports_telemetry_ralentis_periodos_v2.sql` · `reports_telemetry_ralentis_eventos_v3.sql` ·
`ralentis_periodos_fuente_v1.sql` · `geotab_daily_metrics_v1.sql` ·
`geotab_daily_galones_ralenti_v1.sql`
