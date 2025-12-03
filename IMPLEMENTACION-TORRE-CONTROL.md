# 🏗️ IMPLEMENTACIÓN TORRE DE CONTROL

## ✅ LO QUE YA ESTÁ IMPLEMENTADO

### 1. **Base de Datos (Supabase)**

#### Archivo: `supabase-additional-tables.sql`

**Tablas creadas:**
- ✅ `route_schedules` - Cronogramas de rutas planificadas
- ✅ `preoperational_inspections` - Inspecciones preoperacionales
- ✅ `vehicle_ignition_events` - Eventos de encendido/apagado
- ✅ `idle_time_records` - Registros de tiempo en ralentí

**Vista creada:**
- ✅ `inspection_summary` - Resumen de inspecciones por contrato y fecha

**Instrucciones:**
1. Abre Supabase SQL Editor
2. Copia TODO el contenido de `supabase-additional-tables.sql`
3. Ejecuta (Run)
4. Verifica que las 4 tablas se crearon

---

### 2. **Endpoint de Inspecciones Preoperacionales**

#### Archivo: `/api/inspections.ts`

**Funcionalidad:**
- ✅ Descarga automáticamente el Excel de: `https://desarrollo.checkayg.stork.segurosayg.com/export/archivoinspeccionestotal.xlsx`
- ✅ Parsea el Excel usando la librería `xlsx`
- ✅ Retorna datos en formato JSON
- ✅ Calcula estadísticas generales
- ✅ Calcula estadísticas por contrato

**Campos extraídos:**
- Llave, Fecha, Matrícula, Día
- Hora inicio, Lugar inicio, Hora fin
- Conductor, Fecha y hora inspección
- Nº Hallazgos, Estado, Contrato, Tipo de vehículo

**Cómo probarlo:**
```bash
# Endpoint: GET /api/inspections
# Retorna:
{
  "success": true,
  "data": [ ...inspecciones... ],
  "stats": {
    "total": 43,
    "ok": 24,
    "sinInspeccion": 10,
    "fueraDeTiempo": 9
  },
  "contractStats": {
    "ENEL ZX": { "total": 43, "ok": 24, ... }
  }
}
```

---

## 🚧 LO QUE FALTA IMPLEMENTAR

### 3. **Servicio de Base de Datos para nuevas tablas**

**Crear:** `services/towerControlService.ts`

**Funciones necesarias:**

```typescript
// Inspecciones
export async function importInspectionsToDatabase(inspections: any[]): Promise<...>
export async function getInspectionsByDate(date: string): Promise<...>
export async function getInspectionsByContract(contract: string): Promise<...>
export async function crossInspectionsWithIgnition(): Promise<...>

// Cronogramas
export async function saveRouteSchedule(schedule: any): Promise<...>
export async function getRouteSchedules(filters: any): Promise<...>
export async function importRouteSchedulesFromCSV(csvData: any[]): Promise<...>

// Ralentí
export async function saveIdleTimeRecord(record: any): Promise<...>
export async function getIdleTimeByVehicle(plate: string): Promise<...>

// Eventos de ignición
export async function saveIgnitionEvent(event: any): Promise<...>
export async function getIgnitionEvents(plate: string, date: string): Promise<...>
```

---

### 4. **Cálculo de Ralentí**

**Actualizar:** `services/alertService.ts`

**Lógica:**
```typescript
// Detectar ralentí cuando:
// - Velocidad = 0
// - Ignición = ON
// - Duración > 5 minutos

export function detectIdleTime(vehicle: Vehicle, lastVehicleState: VehicleState): IdleEvent | null {
  if (vehicle.speed === 0 && isIgnitionOn(vehicle)) {
    // Calcular tiempo desde último estado
    const duration = calculateDuration(lastVehicleState.timestamp, vehicle.lastUpdate);

    if (duration > 5) { // 5 minutos
      return {
        plate: vehicle.plate,
        startTime: lastVehicleState.timestamp,
        duration: duration,
        location: vehicle.location
      };
    }
  }
  return null;
}
```

**Agregar a alertas:**
```typescript
// En detectAlerts():
if (idleTime > 10) { // 10 minutos
  alerts.push(createAlert(
    vehicle,
    AlertType.EXCESSIVE_IDLE,
    AlertSeverity.MEDIUM,
    `Ralentí excesivo: ${idleTime} minutos`
  ));
}
```

---

### 5. **Componente de Inspecciones Preoperacionales**

**Crear:** `components/Inspections.tsx`

**UI necesaria:**
```typescript
interface InspectionsProps {
  selectedContract?: string; // Para filtrar por contrato
}

export const Inspections: React.FC<InspectionsProps> = ({ selectedContract }) => {
  // 1. Botón "Actualizar Inspecciones" → Llama a /api/inspections
  // 2. Tabla resumen como en la imagen:
  //    - Fecha, Contrato
  //    - OK: X vehículos (XX%)
  //    - Sin inspección: X (XX%)
  //    - Fuera de tiempo: X (XX%)
  // 3. Tabla detallada de vehículos
  // 4. Filtro por contrato
  // 5. Filtro por fecha
  // 6. Indicador visual de cumplimiento
  // 7. CRUCE CON IGNICIÓN:
  //    - Si vehículo encendió hoy pero no tiene inspección → Marcar en rojo
};
```

---

### 6. **Componente de Cronogramas de Rutas**

**Crear:** `components/RouteSchedules.tsx`

**Funcionalidades:**
```typescript
export const RouteSchedules: React.FC = () => {
  // 1. Botón "Descargar Plantilla CSV"
  //    → Genera CSV con columnas:
  //    Placa, Contrato, Conductor, Nombre Ruta, Fecha, Hora Inicio, Hora Fin, Origen, Destino

  // 2. Botón "Cargar CSV"
  //    → Input file → parsear CSV → guardar en Supabase

  // 3. Tabla de cronogramas cargados
  //    → Filtros por fecha, contrato, placa

  // 4. COMPARACIÓN CON REAL:
  //    → Hora planificada vs hora real (de eventos de ignición)
  //    → Semáforo: Verde (a tiempo), Amarillo (±15 min), Rojo (>15 min)
};
```

---

### 7. **Módulo de Ralentí en Analytics**

**Actualizar:** `components/Analytics.tsx`

**Agregar sección:**
```typescript
// Tarjeta KPI de ralentí
<div className="...">
  <p>Total Horas Ralentí</p>
  <p className="text-3xl">{totalIdleHours}h</p>
</div>

// Tabla: Top vehículos con más ralentí
<table>
  <thead>
    <tr>
      <th>Placa</th>
      <th>Horas Ralentí</th>
      <th>% del tiempo</th>
    </tr>
  </thead>
  ...
</table>
```

---

## 📝 PLANTILLA CSV PARA CRONOGRAMAS

**Nombre:** `plantilla_cronogramas.csv`

```csv
Placa,Contrato,Conductor,Nombre Ruta,Fecha,Hora Inicio,Hora Fin,Origen,Destino,Distancia KM
LHR713,CAMPO TECA,Juan Perez,Ruta Norte,2025-12-04,06:00,18:00,Bogotá,Medellín,415
ABC123,ENEL ZX,Maria Lopez,Ruta Sur,2025-12-04,07:30,16:30,Cali,Popayán,135
```

---

## 🔄 FLUJO DE INSPECCIONES PREOPERACIONALES

```
1. Sistema llama a /api/inspections
   ↓
2. Descarga Excel de Checkayg
   ↓
3. Parsea y extrae datos
   ↓
4. Guarda en tabla preoperational_inspections
   ↓
5. Busca eventos de ignición del día (vehicle_ignition_events)
   ↓
6. CRUCE:
   Si vehículo encendió hoy:
     - ¿Tiene inspección? → OK ✅
     - ¿No tiene inspección? → ALERTA ❌
     - ¿Inspección después de encender? → Fuera de tiempo ⚠️
   ↓
7. Dashboard muestra:
   - Tabla resumen por contrato (como en imagen)
   - Detalle por vehículo
   - Alertas de incumplimiento
```

---

## 🎯 PRÓXIMOS PASOS

### Paso 1: Ejecutar SQL en Supabase
```bash
# Abrir: supabase-additional-tables.sql
# Copiar TODO
# Ejecutar en Supabase SQL Editor
```

### Paso 2: Probar endpoint de inspecciones
```bash
# En navegador o Postman:
GET https://tu-dominio.vercel.app/api/inspections
```

### Paso 3: Crear servicio de BD
```bash
# Crear: services/towerControlService.ts
# Implementar funciones CRUD para las 4 nuevas tablas
```

### Paso 4: Crear componentes
```bash
# Crear: components/Inspections.tsx
# Crear: components/RouteSchedules.tsx
# Actualizar: components/Analytics.tsx (agregar ralentí)
```

### Paso 5: Integrar en App.tsx
```typescript
// Agregar pestañas:
- "Inspecciones" → <Inspections />
- "Cronogramas" → <RouteSchedules />
```

---

## 📊 CÁLCULO DE RALENTÍ

### Lógica de detección:

```typescript
// Almacenar estado anterior del vehículo
interface VehicleState {
  plate: string;
  speed: number;
  ignition: boolean;
  timestamp: string;
}

// Al recibir nuevo dato:
if (currentSpeed === 0 && currentIgnition === true) {
  if (previousSpeed === 0 && previousIgnition === true) {
    // Vehículo sigue en ralentí
    const duration = currentTime - previousTime;
    accumulatedIdleTime += duration;

    if (accumulatedIdleTime > 10 * 60 * 1000) { // 10 minutos
      // Crear alerta de ralentí excesivo
      createIdleAlert(vehicle, accumulatedIdleTime);
    }
  } else {
    // Inicio de ralentí
    idleStartTime = currentTime;
  }
} else {
  // Fin de ralentí
  if (accumulatedIdleTime > 0) {
    // Guardar registro de ralentí en BD
    saveIdleTimeRecord({
      plate,
      startTime: idleStartTime,
      endTime: currentTime,
      duration: accumulatedIdleTime
    });
  }
  accumulatedIdleTime = 0;
}
```

---

## 🎨 UI DE INSPECCIONES (Replicar imagen)

```tsx
// Tabla resumen (como en tu Excel)
<div className="bg-white rounded-xl p-6">
  <div className="grid grid-cols-2 gap-4 mb-4">
    <div>
      <label>Fecha:</label>
      <input type="date" value="03/12/2025" />
    </div>
    <div>
      <label>Contrato:</label>
      <select><option>ENEL ZX</option></select>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Estado</th>
        <th>Nº Vehículos</th>
        <th>%</th>
      </tr>
    </thead>
    <tbody>
      <tr className="bg-green-50">
        <td>OK</td>
        <td>24</td>
        <td>55.8%</td>
      </tr>
      <tr className="bg-yellow-50">
        <td>Sin inspección reportada</td>
        <td>10</td>
        <td>23.3%</td>
      </tr>
      <tr className="bg-orange-50">
        <td>Inspección fuera de tiempo</td>
        <td>9</td>
        <td>20.9%</td>
      </tr>
    </tbody>
  </table>

  <div className="mt-4">
    <strong>Total: 43</strong>
  </div>
</div>

// Tabla detallada (segunda parte de la imagen)
<table className="mt-6">
  <thead>
    <tr>
      <th>Llave</th>
      <th>Fecha</th>
      <th>Matrícula</th>
      <th>Día</th>
      <th>Hora inicio</th>
      <th>Lugar inicio</th>
      <th>Conductor</th>
      <th>Fecha y hora inspección</th>
      <th>Nº Hallazgos</th>
      <th>Estado</th>
      <th>Contrato</th>
      <th>Tipo de vehículo</th>
    </tr>
  </thead>
  <tbody>
    {inspections.map(inspection => (
      <tr key={inspection.id} className={getRowColor(inspection.estado)}>
        <td>{inspection.llave}</td>
        <td>{inspection.fecha}</td>
        <td>{inspection.matricula}</td>
        ...
      </tr>
    ))}
  </tbody>
</table>
```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

- [x] SQL para nuevas tablas
- [x] Endpoint /api/inspections
- [x] Instalación de librería xlsx
- [ ] Servicio towerControlService.ts
- [ ] Componente Inspections.tsx
- [ ] Componente RouteSchedules.tsx
- [ ] Actualizar Analytics.tsx con ralentí
- [ ] Lógica de cálculo de ralentí
- [ ] Integración en App.tsx
- [ ] Plantilla CSV de cronogramas
- [ ] Testing completo

---

## 🎯 RESULTADO ESPERADO

Al finalizar tendrás:
1. ✅ Dashboard de inspecciones (como en tu imagen)
2. ✅ Carga de cronogramas desde CSV
3. ✅ Detección y alertas de ralentí excesivo
4. ✅ Cruce automático de inspecciones con encendidos
5. ✅ Estadísticas por contrato
6. ✅ Exportación de datos
7. ✅ Trazabilidad completa
