# 📘 Guía Paso a Paso: Google Sheets + Apps Script

Esta guía te ayudará a configurar Google Sheets + Apps Script para reemplazar la descarga directa del Excel bloqueado.

---

## 🎯 ¿Qué vamos a lograr?

**Sistema Actual (Problemático):**
```
[Sistema Web] → ❌ [Excel Bloqueado (403)]
```

**Sistema Nuevo (Solución):**
```
[Sistema Web] → [Apps Script] → [Descarga Excel] → [Google Sheets] → [JSON] → [Sistema Web] → [Supabase]
```

**Ventajas:**
- ✅ No hay bloqueos (Apps Script puede descargar el Excel)
- ✅ Sin timeouts de Vercel
- ✅ Reemplazo automático de datos (sin acumulación infinita)
- ✅ 100% automatizado
- ✅ Gratis y confiable

---

## 📝 PASO 1: Crear Google Sheet

### 1.1. Crear la hoja

1. Abre tu navegador y ve a: **https://sheets.google.com**
2. Click en el botón **➕ Nuevo** (esquina superior izquierda)
3. Selecciona **Hoja de cálculo de Google en blanco**

### 1.2. Configurar el nombre

1. En la parte superior donde dice "Hoja de cálculo sin título", click para editar
2. Escribe: **`Inspecciones Magnex`**
3. Presiona **Enter** para guardar

### 1.3. Configurar la pestaña

1. Abajo, donde dice "Hoja 1", haz **click derecho**
2. Selecciona **Cambiar nombre**
3. Escribe: **`Datos`**
4. Presiona **Enter**

### 1.4. Crear encabezados

En la **fila 1** (primera fila), escribe estos encabezados en orden:

| Columna | Encabezado |
|---------|------------|
| A | Llave |
| B | Fecha |
| C | Matrícula |
| D | Día |
| E | Hora Inicio |
| F | Lugar Inicio |
| G | Hora Fin |
| H | Conductor |
| I | Fecha y Hora Inspección |
| J | Nº Hallazgos |
| K | Estado |
| L | Contrato |
| M | Tipo de Vehículo |

**💡 Tip:** Puedes copiar y pegar directamente:
```
Llave	Fecha	Matrícula	Día	Hora Inicio	Lugar Inicio	Hora Fin	Conductor	Fecha y Hora Inspección	Nº Hallazgos	Estado	Contrato	Tipo de Vehículo
```

### 1.5. Guardar la URL

1. Copia la URL de tu Google Sheet desde la barra de direcciones
2. Se verá como: `https://docs.google.com/spreadsheets/d/1ABC...XYZ/edit`
3. **Guárdala en un lugar seguro** (la necesitarás después)

✅ **Paso 1 completado!**

---

## 🔧 PASO 2: Configurar Apps Script

### 2.1. Abrir el editor de Apps Script

1. En tu Google Sheet, ve al menú superior
2. Click en **Extensiones** → **Apps Script**
3. Se abrirá una nueva pestaña con el editor de código

### 2.2. Preparar el editor

1. Verás un archivo llamado **`Código.gs`** (o `Code.gs`)
2. **Borra todo** el código que viene por defecto:
   ```javascript
   function myFunction() {
     // código por defecto...
   }
   ```

### 2.3. Copiar el código de Apps Script

1. Abre el archivo: **`/docs/APPS_SCRIPT_CODE.gs`** (está en este proyecto)
2. **Copia TODO el contenido** (Ctrl+A, Ctrl+C)
3. Vuelve al editor de Apps Script
4. **Pega el código** (Ctrl+V)

### 2.4. Configurar la URL del Excel

En el código que acabas de pegar, busca estas líneas (están al inicio):

```javascript
// CONFIGURACIÓN - EDITA ESTAS VARIABLES
const EXCEL_URL = 'https://desarrollo.checkayg.stork.segurosayg.com/export/archivoinspeccionestotal.xlsx';
const SHEET_NAME = 'Datos';
```

**Si la URL del Excel es diferente**, cámbiala aquí.

**Si el nombre de la pestaña es diferente a "Datos"**, cámbialo aquí.

### 2.5. Guardar el proyecto

1. Click en el icono de **💾 disco** (o presiona **Ctrl+S**)
2. Click en **"Proyecto sin título"** (arriba)
3. Escribe: **`API Inspecciones Magnex`**
4. Click en **Aceptar**

✅ **Paso 2 completado!**

---

## 🚀 PASO 3: Deployar como Web App

### 3.1. Iniciar deploy

1. En el editor de Apps Script, arriba a la derecha, click en **Implementar** (botón azul)
2. Selecciona **Nueva implementación**

### 3.2. Configurar el deploy

1. En "Selecciona el tipo", click en el **icono de engranaje** ⚙️
2. Selecciona **Aplicación web**
3. Configura así:

| Campo | Valor |
|-------|-------|
| **Descripción** | `API para inspecciones v1` |
| **Ejecutar como** | **Yo** (tu email) |
| **Quién tiene acceso** | **Cualquier persona** |

4. Click en **Implementar**

### 3.3. Autorizar permisos (PRIMERA VEZ)

**⚠️ IMPORTANTE:** La primera vez te pedirá permisos.

1. Click en **Revisar permisos**
2. Selecciona tu cuenta de Google
3. Verás una advertencia: "Google no verificó esta aplicación"
4. Click en **Avanzado** (abajo)
5. Click en **Ir a [nombre del proyecto] (no seguro)**
6. Click en **Permitir**

### 3.4. Copiar la URL de Apps Script

Después de autorizar, verás:

```
✅ Nueva implementación creada con éxito

URL de aplicación web:
https://script.google.com/macros/s/AKfycbxXXXXXXXXXXXXXXXX/exec
```

**🔥 MUY IMPORTANTE:**
1. **COPIA** esta URL completa
2. **GUÁRDALA** en un lugar seguro
3. La necesitarás en el siguiente paso

✅ **Paso 3 completado!**

---

## 🧪 PASO 4: Probar la API

### 4.1. Probar en el navegador

1. Abre una **nueva pestaña** en tu navegador
2. Pega tu URL de Apps Script
3. Agrega al final: `?action=test`
4. La URL completa se verá así:
   ```
   https://script.google.com/macros/s/AKfycbxXXXXXX/exec?action=test
   ```
5. Presiona **Enter**

### 4.2. Verificar respuesta

Deberías ver algo como esto:

```json
{
  "success": true,
  "timestamp": "2024-12-04T01:00:00.000Z",
  "data": {
    "message": "API funcionando correctamente",
    "timestamp": "2024-12-04T01:00:00.000Z",
    "sheetName": "Datos",
    "excelUrl": "https://..."
  }
}
```

**✅ Si ves esto, ¡está funcionando!**

**❌ Si ves un error:**
- Verifica que hayas autorizado los permisos
- Asegúrate de que "Quién tiene acceso" sea "Cualquier persona"
- Intenta deployar de nuevo

✅ **Paso 4 completado!**

---

## ⚙️ PASO 5: Conectar al Sistema

### 5.1. Actualizar el código del sistema

1. Abre el archivo: **`/api/inspections.ts`**
2. Busca esta línea (línea 10):
   ```typescript
   const APPS_SCRIPT_URL = 'TU_URL_DE_APPS_SCRIPT_AQUI';
   ```
3. Reemplázala con tu URL de Apps Script:
   ```typescript
   const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxXXXXXX/exec';
   ```
4. **Guarda el archivo** (Ctrl+S)

### 5.2. Commit y push

```bash
git add api/inspections.ts
git commit -m "feat: Configurar Apps Script para inspecciones"
git push
```

✅ **Paso 5 completado!**

---

## 🎉 PASO 6: Probar en el Sistema

### 6.1. Ir a Inspecciones

1. Abre tu aplicación web
2. Ve a la pestaña **Inspecciones**

### 6.2. Descargar datos

1. Selecciona un rango de fechas (ej: última semana)
2. Click en **Descargar Semana**
3. Espera (puede tomar 10-30 segundos la primera vez)

### 6.3. Verificar

Deberías ver:
- ✅ Mensaje: "Semana descargada y guardada en Supabase"
- ✅ Datos en la tabla de inspecciones
- ✅ Resumen actualizado

### 6.4. Verificar Google Sheet

1. Vuelve a tu Google Sheet
2. Deberías ver los datos en la pestaña **Datos**
3. Cada vez que descargues un nuevo rango, los datos **se reemplazarán** automáticamente

✅ **Todo funcionando!**

---

## 🔍 Troubleshooting (Solución de Problemas)

### Problema: "Apps Script no configurado"

**Solución:**
- Verifica que hayas actualizado `APPS_SCRIPT_URL` en `/api/inspections.ts`
- Asegúrate de que la URL no sea `'TU_URL_DE_APPS_SCRIPT_AQUI'`

### Problema: HTTP 403 o "No autorizado"

**Solución:**
1. Ve al editor de Apps Script
2. Click en **Implementar** → **Administrar implementaciones**
3. Click en el **icono de lápiz** ✏️ para editar
4. Cambia "Quién tiene acceso" a **"Cualquier persona"**
5. Click en **Implementar**

### Problema: "No se encontraron registros"

**Solución:**
- Verifica que el rango de fechas tenga datos
- Revisa que la URL del Excel en Apps Script sea correcta
- Ve a Apps Script → **Ver** → **Registros de ejecución** para ver logs

### Problema: Timeout

**Solución:**
- Usa un rango de fechas más pequeño (ej: 3-5 días en lugar de 7)
- El Excel podría ser muy grande para procesarlo de una vez

### Problema: Datos no se reemplazan en Google Sheet

**Solución:**
- Verifica que el nombre de la pestaña sea exactamente **"Datos"**
- Verifica que los encabezados estén en la fila 1
- Revisa los logs en Apps Script para ver errores

---

## 📊 URLs Útiles

### Test (verificar que funciona)
```
https://script.google.com/macros/s/TU_ID/exec?action=test
```

### Replace (descargar Excel y reemplazar Sheet)
```
https://script.google.com/macros/s/TU_ID/exec?action=replace&startDate=2024-11-27&endDate=2024-12-04&limit=3000
```

### Get (solo leer del Sheet, sin descargar Excel)
```
https://script.google.com/macros/s/TU_ID/exec?action=get&startDate=2024-11-27&endDate=2024-12-04
```

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los **logs de ejecución** en Apps Script: **Ver** → **Registros de ejecución**
2. Verifica la **consola del navegador** en el sistema web (F12)
3. Asegúrate de que todos los pasos estén completos

---

## ✅ Checklist Final

- [ ] Google Sheet creado con nombre "Inspecciones Magnex"
- [ ] Pestaña renombrada a "Datos"
- [ ] Encabezados configurados en fila 1
- [ ] Código de Apps Script copiado y pegado
- [ ] URL del Excel configurada (si es necesario)
- [ ] Proyecto guardado como "API Inspecciones Magnex"
- [ ] Deploy completado como Web App
- [ ] Permisos autorizados
- [ ] URL de Apps Script copiada
- [ ] URL actualizada en `/api/inspections.ts`
- [ ] Cambios committeados y pusheados
- [ ] Prueba exitosa desde el sistema web
- [ ] Datos aparecen en Google Sheet
- [ ] Datos aparecen en Supabase

**¡Listo para usar!** 🎉
