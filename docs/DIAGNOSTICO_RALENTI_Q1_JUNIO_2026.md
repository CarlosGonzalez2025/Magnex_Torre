# Diagnóstico de integridad — Informe de Ralentí / "Análisis General"
**Fecha:** 2026-07-08 · **Rol:** Data Engineer + Fullstack · **Rama:** `feat/geotab-integration`

## 0. Stack detectado (para compatibilidad de cambios)
| Capa | Tecnología |
|------|-----------|
| Frontend | Vite + React 19 (SPA, TypeScript) · Tailwind · Lucide · Recharts |
| Backend/API | Funciones serverless en `/api` (Vercel) + Supabase Edge Functions (`supabase/functions`) |
| BD | PostgreSQL gestionado por **Supabase**; acceso desde el cliente vía `@supabase/supabase-js` |
| ETL | `services/importService.ts` (parseo XLSX/CSV con `xlsx`, upserts a Supabase) |
| Despliegue | Vercel (frontend + `/api`), Supabase (BD + cron `geotab-sync`) |

**Fuente que lee la pestaña "Análisis General":** tablas `ralentis_periodos` (resumen por vehículo/quincena) y `ralentis_eventos` (eventos individuales). Componente: [`components/reports/RalentiAnalisisGeneral.tsx`](../components/reports/RalentiAnalisisGeneral.tsx). No hay endpoint intermedio: el frontend consulta Supabase directo (`fetchAll`, líneas 491–519).

> **Nota de acceso a datos:** el Excel `Grid_telemetría Masa Stork_195.xlsx` **no está en el repo**. La auditoría se hizo contra la **BD Supabase real** (`ralentis_periodos`/`ralentis_eventos`), que es la fuente efectiva que el dashboard renderiza. Los CSV crudos originales por proveedor sí están (`coltrack/`, `fagor/`, `ralentis flota/`), pero la verdad operativa que ve el usuario vive en esas dos tablas.

---

## 1. Conclusión ejecutiva (la premisa del reporte está invertida)

**Q1 Junio 2026 NO es un período anómalo: es el ÚNICO período correcto.** Los otros 5 períodos (Abr Q1 → Jun Q2) están **rotos por cobertura incompleta de "Horas Motor Encendido"**, lo que dispara su `% Ralentí` a valores físicamente imposibles (80–99%).

Evidencia (BD real, solo quincenas):

| Período | Filas | Veh únicos | **Veh con motor>0** | Σ H.Motor Enc | Σ Ralentí | **% Ralentí** | Filas enc=0 & ral>0 | Eventos-alerta |
|---------|------|-----------|--------------------|--------------|-----------|--------------|--------------------|----------------|
| Abr Q1 (BASE) | 624 | 624 | **267** | 11 481 h | 11 358 h | **98.92%** ⚠ | 309 | 25 094 |
| Abr Q2 | 624 | 624 | 281 | 14 859 h | 12 670 h | **85.27%** ⚠ | 309 | 21 406 |
| May Q1 | 622 | 622 | 281 | 14 859 h | 12 590 h | **84.73%** ⚠ | 307 | 24 258 |
| May Q2 | 613 | 613 | 287 | 16 116 h | 13 434 h | **83.36%** ⚠ | 298 | 20 879 |
| **Jun Q1** | 603 | 603 | **576** ✅ | 33 286 h | 13 227 h | **39.74%** ✅ | **3** | 5 159 |
| Jun Q2 | 577 | 577 | 261 | 12 750 h | 10 217 h | **80.13%** ⚠ | 285 | 18 065 |

El "salto" de Horas Motor (11 481 → 33 286 h, +190%) **no es un doble conteo**: es que Jun Q1 tiene **576 vehículos con horas de motor reales** vs. ~280 en los demás. Normalizado por vehículo el valor es sanísimo: **3.85 h/día de motor encendido** (media histórica 2.9–3.5 h/día). Ningún vehículo supera 24 h/día. **No hay duplicados** veh–período en ningún período (0 filas extra).

---

## 2. Causa raíz (con archivo y línea)

### 2.1 Filas "ralentí huérfano" (encendido=0, ralentí>0) — el bug de la fuente
Cuando un período se carga **solo con archivos de ralentí/excesos** (sin el consolidado de horas de motor), el ETL crea filas con `horas_motor_encendido = 0` pero `horas_motor_ralenti > 0`:

- **Fagor** — [`services/importService.ts:3370`](../services/importService.ts#L3370): rama "Solo archivos de Ralentí" escribe literal `horas_motor_encendido: 0`.
- **Coltrack** — rama equivalente de excesos semanales ([`importService.ts:2594+`](../services/importService.ts#L2594)) conserva `horas_motor_encendido` **solo si** existe el archivo "Ralenti 1"; si no, queda 0.

En Abr–May y Jun Q2 se cargaron principalmente estos archivos → ~300 vehículos por período quedaron con motor=0. En **Jun Q1 se cargó el consolidado completo** (576 vehículos con horas de motor) → por eso es el único período "sano".

### 2.2 El agregado mezcla ambos universos — el bug de lógica (backend/frontend)
En [`RalentiAnalisisGeneral.tsx:586`](../components/reports/RalentiAnalisisGeneral.tsx#L586):
```ts
const pctRalenti = totalHorasEncendido > 0 ? (totalHorasRalenti / totalHorasEncendido) * 100 : 0;
```
`totalHorasRalenti` (línea 568) **suma el ralentí de TODAS las filas**, incluidas las de `encendido=0`, mientras que esas mismas filas aportan **0 al denominador**. Resultado: el numerador arrastra ralentí de vehículos que no contribuyen al denominador → `%` inflado.

**Prueba:** en Abr Q1, del total 11 358 h de ralentí, **5 969 h son "huérfanas"** (de filas con encendido=0). Descontándolas: `(11 358 − 5 969) / 11 481 = 46.9%` — coherente con el 39.74% de Jun Q1. El 98.92% es un artefacto aritmético.

### 2.3 La comparación entre períodos usa **totales absolutos**, no normalizados
`pctVsBaselineEventos/Galones/CO2` ([líneas 610–615](../components/reports/RalentiAnalisisGeneral.tsx#L610)) comparan totales crudos contra la base. Con la cobertura oscilando 261↔576 vehículos, **toda métrica absoluta oscila con la cobertura, no con el comportamiento**. De ahí el "rebote +250.2% de eventos" en Jun Q2 (5 159 → 18 065): es cambio de cobertura de archivos de eventos, **no** un retroceso real de la flota.

### 2.4 Identidad `Motor = Conducción + Ralentí`
La tabla **no almacena conducción**; el módulo la **deriva** como `max(encendido − ralentí, 0)` ([línea 587](../components/reports/RalentiAnalisisGeneral.tsx#L587)). Por construcción no puede "violarse" en el agregado. A nivel fila sí hay **15 violaciones físicas** (`ralentí > encendido`, 0.77% de 1 953 filas con motor>0), **14 concentradas en Jun Q1** → dato sucio menor a sanear, pero no explica la magnitud.

**Veredicto:** combinación de **(c) datos incompletos en la fuente** [causa primaria] + **(a) lógica de agregación que no normaliza por cobertura** [amplificador]. **No** es (b) rango de fechas —el guard `isQuincenaPeriodo` es correcto— ni (d) doble conteo —0 duplicados—.

---

## 3. Fixes propuestos
1. **Métrica `% Ralentí` normalizada por vehículos activos** (motor>0): calcular numerador y denominador **solo sobre filas con `horas_motor_encendido > 0`**. Cambia números históricos mostrados (los corrige).
2. **Bandera de calidad por período/fila**: si `|Conducción + Ralentí − Motor| / Motor > 2%` → marca visual "dato inconsistente" (Objetivo 2).
3. **Saneo fuente**: opción de recalcular `horas_motor_encendido` desde eventos, o excluir filas huérfanas del ratio (no del inventario).
4. **Comparativos normalizados** por vehículo activo (h/veh, eventos/veh) en vez de totales crudos.
5. **Suite de pruebas** que verifique la identidad y la normalización para impedir regresión.

---

## 4. Implementación aplicada (Objetivos 2 y 3)

Decisión del cliente: **corregir en sitio + nueva tabla + blindar el ETL**.

### 4.1 Fix de la métrica (`% Ralentí` normalizado) — corrige números históricos
- Lógica extraída a **`services/ralentiMetrics.ts`** (`computeMotorMetrics`), fuente única y testeada.
- `RalentiAnalisisGeneral.tsx` ahora la consume: H.Motor, Ralentí, Conducción y `% Ralentí` se calculan **solo sobre vehículos con motor > 0**. El ralentí "huérfano" (filas encendido=0) queda fuera del ratio y se conserva como señal de calidad.

**Antes vs. Ahora (BD real, validado con el módulo real):**
| Período | % Ral ANTES | % Ral AHORA | Cobertura motor | Identidad (dev) |
|---------|------------|------------|-----------------|-----------------|
| Abr Q1 | 98.92% | **46.94%** | 43% | 0.000% |
| Abr Q2 | 85.27% | **47.55%** | 45% | 0.000% |
| May Q1 | 84.73% | **47.55%** | 45% | 0.000% |
| May Q2 | 83.36% | **50.35%** | 47% | 0.000% |
| Jun Q1 | 39.74% | **39.48%** | 96% | 0.000% |
| Jun Q2 | 80.13% | **47.19%** | 45% | 0.000% |

Los períodos ahora son **comparables** (todos ~40–50%, no artefactos de 80–99%). Jun Q1 sigue siendo el mejor, ahora legítimamente.

### 4.2 Nueva tabla "Eficiencia Operativa por Período" (frontend)
Añadida en `RalentiAnalisisGeneral.tsx`, mismo sistema visual (tabla `#003366`, badges, dark mode). Columnas: Km recorridos, Km/veh activo, H.Motor, H.Conducción (%), Ralentí Total (%), Velocidad media ponderada, Km/h ralentí, % Gal ralentí, y **Validación cruzada** (bandera `⚑ Inconsistente` si cobertura < 98% o hay filas ralentí>encendido). Normalizada por vehículos activos (motor > 0).
- **`% Gal ralentí` = N/D**: el total de galones **no se persiste** (solo la porción de ralentí). Requiere capturar `galones_totales` en el ETL a futuro (no hay backfill posible para histórico).
- **Nota de velocidad**: en períodos marcados inconsistentes (cobertura ~45%) la velocidad media puede salir irreal (p.ej. Abr Q1 = 179 km/h) por km presentes con horas de motor subrepresentadas; la bandera ya advierte de no comparar esas filas.

### 4.3 Blindaje del ETL
`services/importService.ts`: nuevo `advertenciaCoberturaMotor()` que, tras cada carga Coltrack/Fagor, verifica la cobertura de horas de motor del período y devuelve una advertencia si < 98%. Se propaga en `ImportResult.advertencias` y se renderiza en `TelemetryProcessor.tsx`.

### 4.4 Pruebas (regresión)
`services/ralentiMetrics.test.ts` (Node test runner, sin dependencias nuevas):
```
node --test services/ralentiMetrics.test.ts   → 7/7 pass
```
Cubre: identidad Motor=Conducción+Ralentí, que las filas huérfanas NO inflen el %, banderas de cobertura y de violación física, métricas de eficiencia y guards de división por cero.

### 4.5 Migración de BD
**No se requiere** para lo entregado (usa `kms_recorridos`, ya existente). Migración *opcional futura* solo si se quiere activar `% Gal ralentí`: `ALTER TABLE ralentis_periodos ADD COLUMN galones_totales numeric;` + capturar el total en el ETL (Coltrack "Consumo de combustible" y Fagor "Galones").

### 4.6 Compatibilidad
`npx tsc --noEmit` → 0 errores. El fix respeta la convención existente (comentarios, estilos, patrón de agregación). Otros módulos (Informe por Período, PDF) no cambian de contrato: `PeriodoData` solo suma campos nuevos.
