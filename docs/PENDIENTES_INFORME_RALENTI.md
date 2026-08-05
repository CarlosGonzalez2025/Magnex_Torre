# Informe de Ralentí — Cambios realizados y pendientes

Rama: `feat/ralenti-co2-por-combustible`
Última actualización: 2026-06-14

## ✅ Cambios realizados (commit `feat(ralenti): eventos reales Coltrack + umbral de alerta por proveedor`)

1. **Ingesta del archivo semanal Coltrack** (`Excesos_Ralentí_Semanal_*.xlsx`)
   en `services/importService.ts` → `importarDatosPlanosColtrack`:
   - Se detecta por columnas (`Placa` + `Inicio Exceso` + `Duracion`).
   - Se escribe en `ralentis_eventos` con **duración y galones reales por evento**.
   - Reemplaza la duración **sintética** (reparto uniforme) del CSV "Ralenti 2"
     cuando el semanal está presente.
2. **Fuente única de galones** (reconciliación): con el semanal, `ralentis_periodos`
   toma `consumo_combustible` y `ralentis_excesivos` de los eventos reales y
   **preserva** `horas_motor_encendido` / `horas_motor_ralenti` (denominador del %).
3. **Umbral de alerta NATIVO por proveedor** en `components/reports/RalentiReports.tsx`:
   - Coltrack ≥ 10 min (600 s), Fagor ≥ 5 min (300 s). No se normaliza.
   - Toda la analítica de excesos (nº alertas, mayor evento, promedio, ranking,
     anomalías, tendencia/CO₂) se calcula sobre `alertEvents` (eventos ≥ umbral).
4. **"Mayor evento único"** se mide solo entre eventos con **conductor identificado**
   (excluye N/A, No registra…), alineado con los Top.
5. **PDF**: "Desperdicio de Combustible" → "Consumo de Combustible en Ralentí".
6. **UI**: instrucciones de Coltrack documentan el archivo semanal.

## ⏳ Pendientes

### 1. Migración de base de datos (bloqueante para recargar) — la ejecuta el operador en Supabase
El trigger de `updated_at` falla porque falta la columna. Ejecutar:
```sql
alter table ralentis_periodos add column if not exists updated_at timestamptz not null default now();
-- Preventivo (si el mismo trigger existe en eventos):
alter table ralentis_eventos  add column if not exists updated_at timestamptz not null default now();
```

### 2. Decisión de criterio: fuente de galones / CO₂ en las tarjetas de resumen
Hoy las tarjetas de **galones / CO₂ / % ralentí** usan el **ralentí total** del agregado,
mientras que las de **alertas** usan el umbral por proveedor. Falta decidir si galones/CO₂
deben derivarse también de los eventos ≥ umbral (agrupados por combustible) para congruencia total.

### 3. Decisión de criterio: definición oficial del "% ralentí"
Headline actual = ralentí **total** / encendido. Alternativa = ralentí **excesivo** (≥ umbral) / encendido.

### 4. Texto narrativo del PDF (menor)
`services/pdfTemplates.tsx` (~línea 3286) aún dice "mayor **desperdicio** continuo de combustible".
Evaluar cambiarlo a "mayor **consumo** continuo de combustible en ralentí".

### 5. ¿Excluir N/A también en otras métricas?
"Promedio por evento" y "eventos > 30 min" hoy se calculan sobre todas las alertas.
Definir si también deben excluir conductores no identificados.

### 6. Operativo de recarga
La detección es **por columnas, nunca por nombre de archivo**. Lo que cada insumo aporta:

**Coltrack**
- `Documento Ralenti 1 … Coltrack.csv` / `Ralenti_Coltrack.csv` — cabeceras `Unidad` + `Ralentis excesivos`.
  Único archivo que aporta `horas_motor_encendido` (denominador del % Ralentí). **Obligatorio.**
- `Excesos_Ralentí_Semanal_*.xlsx` — cabeceras `Placa` + `Inicio Exceso` + `Duracion`.
  Eventos con duración y galones reales. **Se pueden subir varios**: una quincena la cubren 2–3 semanales
  y desde jul-2026 el ingestor los procesa todos (antes solo tomaba el último y su agregado sobrescribía
  los totales del período). Los eventos fuera del rango del período se descartan y se reportan como advertencia.
- `Documento Ralenti 2 … Coltrack.csv` — `Nombre` + `Metros` + `Hora Reporte`. Solo si NO hay semanales;
  la duración es estimada por reparto uniforme y no trae galones.

**Fagor**
- `Documento Ralenti 2 … Fagor.xlsx` / `Ralenti 1|2|3.xlsx` — cabeceras `Matrícula` + `T. Ralentí`.
  Eventos con duración real y `Gal. Consumidos`. **Obligatorio.**
- `Km_Vehículos_Fagor*.xlsx` — cabeceras `Matrícula` + `Km. Recorridos`. Aporta `Horas Motor` →
  `horas_motor_encendido`. **Obligatorio** para que el % Ralentí sea válido; expórtelo con el rango
  exacto de la quincena (el export mensual sobredimensiona el denominador).
- ⚠️ `Documento Ralenti 1 … Fagor.xlsx` **no** es el agregado de ralentí: sus cabeceras son
  `Conductor` + `Km. Recorridos`, por lo que el ingestor lo clasifica como *Km por conductor* y solo
  alimenta `reportes_conductores`. Cargarlo sin `Km_Vehículos` deja `horas_motor_encendido = 0`
  y dispara la advertencia de cobertura de motor.

**Geotab** — no alimenta el informe de ralentí (decisión jun-2026): escribe solo en `reportes_*`.

**Reglas comunes**
- Un solo agregado por plataforma por periodo. Rango = **la quincena exacta** (1→15 o 16→fin de mes);
  el Análisis General y el comparativo histórico descartan cualquier período que no sea quincena.
- `ralentis_periodos` es **compartida** con el informe mensual: NO borrarla; el re-import la sobrescribe.
- `ralentis_eventos` es exclusiva del módulo de ralentí: segura de limpiar por periodo.

### 7. Propuesta abierta: horas de motor de Fagor a nivel vehículo
`Documento Ralenti 1 … Fagor.xlsx` ya trae `Horas Motor` y `Ralentí Tiempo Total` por día y conductor,
con la `Matrícula` en cada fila. Se podría derivar el agregado por vehículo sumando por matrícula y
alimentar `ralentis_periodos` sin exigir `Km_Vehículos`. Requiere decisión: hoy ese archivo se consume
únicamente como *Km por conductor* y cambiarlo altera el denominador de períodos ya cargados.
