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
- Coltrack: `Documento Ralenti 1 … Coltrack.csv` (agregado) + `Excesos_Ralentí_Semanal_*.xlsx` (eventos).
- Fagor: `Documento Ralenti 1 … Fagor.xlsx` (agregado) + `Documento Ralenti 2 … Fagor.xlsx` (eventos).
- Un solo agregado por plataforma por periodo. Rango = la quincena exacta.
- `ralentis_periodos` es **compartida** con el informe mensual: NO borrarla; el re-import la sobrescribe.
- `ralentis_eventos` es exclusiva del módulo de ralentí: segura de limpiar por periodo.
