# Reporte de Validación de Base de Datos - Conductores y Vehículos

Este reporte detalla el cruce y consistencia de los datos entre las fuentes de datos (Google Sheets, Coltrack, Fagor) y la base de datos Supabase ('conductores' y 'vehiculos').

## Resumen Ejecutivo

| Métrica | Supabase | Google Sheets | Coincidentes | Faltantes en Supabase |
| --- | --- | --- | --- | --- |
| **Conductores** | 8557 | 1625 | 1625 | **0** |
| **Vehículos** | 957 | 937 | 937 | **0** |

---

## 1. Conductores de Google Sheets Faltantes en Supabase
Total: **0**

*(Estos conductores están registrados en el Google Sheet de control principal pero no existen en la tabla 'conductores' de Supabase por Cédula ni por Nombre)*
*No hay conductores faltantes.*



---

## 2. Vehículos de Google Sheets Faltantes en Supabase
Total: **0**

*(Vehículos en el Google Sheet principal que no están registrados en la tabla 'vehiculos' de Supabase)*
*No hay vehículos faltantes.*



---

## 3. Conductores de Coltrack CSV No Encontrados en Supabase
Total: **8** (de 634 registros en Coltrack)

*(Conductores que tienen registros de telemetría en Coltrack pero cuyos nombres normalizados no se encuentran en la tabla 'conductores' de Supabase)*
- **TECNICO COLTRACK OSWALDO LEGUIZAMON** | Kms: `133.209` | Puntaje: `100` | ¿Está en Google Sheets?: **NO**
- **Tecnico Coltrack Jeison Cardozo** | Kms: `35.026` | Puntaje: `100` | ¿Está en Google Sheets?: **NO**
- **Taller La Amistad La Jagua de Ibirico** | Kms: `0` | Puntaje: `100` | ¿Está en Google Sheets?: **NO**
- **T�cnico Edgar Mart�nez** | Kms: `2,894.64` | Puntaje: `100` | ¿Está en Google Sheets?: **NO**
- **SUPER COCHES** | Kms: `4.779` | Puntaje: `100` | ¿Está en Google Sheets?: **NO**
- **Jose David Barb�n Romero** | Kms: `0.015` | Puntaje: `100` | ¿Está en Google Sheets?: **NO**
- **No** | Kms: `800.185` | Puntaje: `100` | ¿Está en Google Sheets?: **NO**
- **Pruebas T�cnico Fabian Calderon** | Kms: `961.799` | Puntaje: `100` | ¿Está en Google Sheets?: **NO**


---

## 4. Conductores de Fagor Excel No Encontrados en Supabase
Total: **801** (de 2064 en el maestro de Fagor)

*(Conductores en el maestro de Fagor que no se encuentran en Supabase por Cédula ni por Nombre)*
- **(CAÑO SUR) LUIS AUDELIO LOSADA BENITEZ** | Cédula/DNI: `12210812` | iButton: `012E61B41E000065` | ¿Está en Google Sheets?: **NO**
- **(ENEL)** | Cédula/DNI: `` | iButton: `01CCF7F81E0000FB` | ¿Está en Google Sheets?: **NO**
- **(ENEL) FABIAN GARCIA LOPEZ** | Cédula/DNI: `1121941662` | iButton: `0170D9F31D0000AB` | ¿Está en Google Sheets?: **NO**
- **(Enel) Jairo Antonio Ortiz Castañeda** | Cédula/DNI: `1.076.652.264` | iButton: `0170EFF91E00004C` | ¿Está en Google Sheets?: **NO**
- **(Enel) Jawer Breyner Castellanos Forero** | Cédula/DNI: `1003559463` | iButton: `016269F91E00002E` | ¿Está en Google Sheets?: **NO**
- **(ENEL) LLAVE PERDIDA** | Cédula/DNI: `` | iButton: `01CA96FB1E00001D` | ¿Está en Google Sheets?: **NO**
- **(ENEL) LLAVE DAÑADA** | Cédula/DNI: `` | iButton: `016AC0F41D000036` | ¿Está en Google Sheets?: **NO**
- **(ENEL) LLAVE perdida** | Cédula/DNI: `1093911252` | iButton: `01BB23B61E000052` | ¿Está en Google Sheets?: **NO**
- **(ENEL) llave perdida** | Cédula/DNI: `1103106054` | iButton: `01C3F9B41E00008F` | ¿Está en Google Sheets?: **NO**
- **(ENEL) MARIO ALBERTO REY** | Cédula/DNI: `1074130899` | iButton: `01D851B61E000026` | ¿Está en Google Sheets?: **NO**
- **(ENEL) Oswaldo Eliecer Hidalgo Beltrán** | Cédula/DNI: `1003522798` | iButton: `01132FB61E00008E` | ¿Está en Google Sheets?: **NO**
- **(ENEL) WILLIAM MAURICIO SALAZAR RAMÍREZ** | Cédula/DNI: `` | iButton: `012465B31E000033` | ¿Está en Google Sheets?: **NO**
- **(Extraviada) Antonio Valderrama Triana** | Cédula/DNI: `93.363.676` | iButton: `01EA3B8D1F00007E` | ¿Está en Google Sheets?: **NO**
- **(QUIFA) SERGIO MARTIN GONZÁLES RANGEL** | Cédula/DNI: `91263764` | iButton: `016FC8B41E0000E7` | ¿Está en Google Sheets?: **NO**
- **(Rubiales) ARLEY ANDRES VALDERRAMA SERRANO** | Cédula/DNI: `1075217754` | iButton: `0180BCB41E000098` | ¿Está en Google Sheets?: **NO**
- **0** | Cédula/DNI: `` | iButton: `0` | ¿Está en Google Sheets?: **NO**
- **01007A0001000046** | Cédula/DNI: `` | iButton: `01007A0001000046` | ¿Está en Google Sheets?: **NO**
- **0100899E1F0000E4** | Cédula/DNI: `` | iButton: `0100899E1F0000E4` | ¿Está en Google Sheets?: **NO**
- **0101AA000100002F** | Cédula/DNI: `` | iButton: `0101AA000100002F` | ¿Está en Google Sheets?: **NO**
- **0101B3741F0000B8** | Cédula/DNI: `` | iButton: `0101B3741F0000B8` | ¿Está en Google Sheets?: **NO**
- **0101F8F91E0000CE** | Cédula/DNI: `` | iButton: `0101F8F91E0000CE` | ¿Está en Google Sheets?: **NO**
- **010201888888880B** | Cédula/DNI: `` | iButton: `010201888888880B` | ¿Está en Google Sheets?: **NO**
- **0102A0F51D00FFFF** | Cédula/DNI: `` | iButton: `0102A0F51D00FFFF` | ¿Está en Google Sheets?: **NO**
- **0103DE0001000033** | Cédula/DNI: `` | iButton: `0103DE0001000033` | ¿Está en Google Sheets?: **NO**
- **0104AA00010000C4** | Cédula/DNI: `` | iButton: `0104AA00010000C4` | ¿Está en Google Sheets?: **NO**
- **0106179F1F0000CC** | Cédula/DNI: `` | iButton: `0106179F1F0000CC` | ¿Está en Google Sheets?: **NO**
- **0106A7731F0000D8** | Cédula/DNI: `` | iButton: `0106A7731F0000D8` | ¿Está en Google Sheets?: **NO**
- **0106FBB51E00F700** | Cédula/DNI: `` | iButton: `0106FBB51E00F700` | ¿Está en Google Sheets?: **NO**
- **0107A9F91E000024 Jhonnthan Carrillo** | Cédula/DNI: `` | iButton: `0107A9F91E000024` | ¿Está en Google Sheets?: **NO**
- **0107BEE71400004E** | Cédula/DNI: `` | iButton: `0107BEE71400004E` | ¿Está en Google Sheets?: **NO**

*y 771 más...*

---

## 5. Diagnóstico del Conductor 1005181554 (Mardory Pineda Jiménez)
- **Cédula**: `1005181554`
- **Estado en Google Sheets**: ACTIVO | Proyecto: `ECOPETROL CAMPOS MADUROS`
- **Estado en Supabase**: ACTIVO (ID: `2bab521f-ae19-4856-ab9e-bd9cf592df0a`)
- **Fecha de Creación en Supabase**: `2026-05-29T05:10:14.582Z` (Posterior al período de reporte: `29/04/2026` a `28/05/2026`)
- **iButton en Supabase**: `""` (Vacío, no tiene asignado)
- **En Coltrack CSV**: Aparece como `Mardory Pineda Jimnez` (con error de codificación en el apellido, sin la 'e' de Jiménez).
- **Km en Coltrack CSV**: Recorrió **798.353 km** con puntaje **97.981**.
- **Causa de falta de Km en el Reporte Mensual**:
  1. **Fecha de Creación**: Fue creada en Supabase el 29 de mayo, un día después del fin del período de reporte (28 de mayo).
  2. **Inconsistencia de Nombres**: Su nombre en Coltrack es `Mardory Pineda Jimnez`, mientras que en Supabase es `Mardory Pineda Jiménez`. Al normalizar, `MARDORY PINEDA JIMNEZ` no coincide con `MARDORY PINEDA JIMENEZ`.
  3. **Falta de iButton / Mapeo Roto**: Al no coincidir por nombre, el script busca el iButton/Cédula mapeados en `Conductores_Coltrack.csv`. Sin embargo, el script tiene un bug de columnas y asocia la cédula con la calificación y el iButton con la empresa. Como ella tampoco tiene iButton en Supabase, falla el cruce.
  4. **Falta de procesamiento**: Además, el archivo de kilómetros de conductores de Coltrack usa separador punto y coma (`;`), pero el script lo parsea con tubería (`|`), lo que causa que **no se procese ningún conductor de Coltrack**.
