# Configuración Google Sheets + Apps Script para Inspecciones

## Paso 1: Crear Google Sheet

1. Ve a https://sheets.google.com
2. Crea una nueva hoja llamada: **"Inspecciones Magnex"**
3. Renombra la primera pestaña a: **"Datos"**
4. En la fila 1, crea estos encabezados (columnas A-M):

```
A: Llave
B: Fecha
C: Matrícula
D: Día
E: Hora Inicio
F: Lugar Inicio
G: Hora Fin
H: Conductor
I: Fecha y Hora Inspección
J: Nº Hallazgos
K: Estado
L: Contrato
M: Tipo de Vehículo
```

5. Guarda la URL del Google Sheet (la necesitarás después)

## Paso 2: Abrir Apps Script

1. En el Google Sheet, ve al menú: **Extensiones → Apps Script**
2. Se abrirá el editor de Apps Script
3. Borra todo el código que viene por defecto
4. Copia y pega el código que está en `APPS_SCRIPT_CODE.gs`

## Paso 3: Configurar Variables

En el código de Apps Script, busca estas líneas y configúralas:

```javascript
// CONFIGURACIÓN - EDITA ESTAS URLs
const EXCEL_URL = 'https://desarrollo.checkayg.stork.segurosayg.com/export/archivoinspeccionestotal.xlsx';
const SHEET_NAME = 'Datos'; // Nombre de la pestaña en Google Sheets
```

**Importante:** Si la URL del Excel requiere autenticación, necesitarás configurar tokens o credenciales.

## Paso 4: Guardar y Nombrar el Proyecto

1. Click en el icono de **disco/guardar** (o Ctrl+S)
2. Click en "Proyecto sin título" arriba
3. Nómbralo: **"API Inspecciones Magnex"**
4. Guarda nuevamente

## Paso 5: Deployar como Web App

1. Click en el botón **Implementar** (arriba derecha)
2. Selecciona **Nueva implementación**
3. En "Tipo", selecciona **Aplicación web**
4. Configura así:
   - **Descripción:** "API para inspecciones v1"
   - **Ejecutar como:** "Yo (tu email)"
   - **Quién tiene acceso:** "Cualquier persona"
5. Click en **Implementar**
6. **IMPORTANTE:** Copia la **URL de la aplicación web** que te da
   - Se verá como: `https://script.google.com/macros/s/XXXXXXX/exec`
   - **Guárdala bien, la necesitarás para el sistema**

## Paso 6: Autorizar Permisos

1. La primera vez que deploys, Google te pedirá permisos
2. Click en **Revisar permisos**
3. Selecciona tu cuenta de Google
4. Click en **Avanzado** (abajo)
5. Click en **Ir a [nombre del proyecto] (no seguro)**
6. Click en **Permitir**

## Paso 7: Probar la API

Prueba en tu navegador (reemplaza con tu URL):

```
https://script.google.com/macros/s/XXXXXXX/exec?action=test
```

Deberías ver un JSON como:
```json
{
  "success": true,
  "message": "API funcionando correctamente",
  "timestamp": "2024-12-04T00:00:00.000Z"
}
```

## Paso 8: Configurar en el Sistema

Copia la URL de Apps Script y actualízala en el archivo:
`/home/user/Magnex_Torre/api/inspections.ts`

Busca la línea:
```typescript
const APPS_SCRIPT_URL = 'TU_URL_AQUI';
```

Y reemplázala con tu URL.

## URLs de Ejemplo

### Test
```
https://script.google.com/macros/s/XXXXXXX/exec?action=test
```

### Reemplazar datos (descarga Excel y reemplaza Sheet)
```
https://script.google.com/macros/s/XXXXXXX/exec?action=replace&startDate=2024-11-27&endDate=2024-12-04&limit=3000
```

### Solo obtener datos del Sheet
```
https://script.google.com/macros/s/XXXXXXX/exec?action=get&startDate=2024-11-27&endDate=2024-12-04
```

## Troubleshooting

### Error: "No se puede acceder"
- Verifica que "Quién tiene acceso" esté en "Cualquier persona"
- Redeploya la aplicación

### Error: "Permisos denegados"
- Vuelve a autorizar los permisos
- Asegúrate de ejecutar como "Yo"

### No descarga el Excel
- Verifica que la URL del Excel sea correcta
- Si requiere autenticación, configura headers en el código

### Datos no aparecen
- Verifica que los encabezados del Sheet coincidan exactamente
- Revisa los logs en Apps Script: Ver → Registros de ejecución
