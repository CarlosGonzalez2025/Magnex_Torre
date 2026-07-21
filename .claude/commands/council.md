# /council — LLM Council

Consulta simultáneamente a **ChatGPT** y **Gemini** sobre el tema indicado, luego sintetiza las tres perspectivas (ChatGPT + Gemini + Claude) en una respuesta integral con atribución clara.

## Instrucciones de ejecución

Cuando el usuario invoque `/council <pregunta>`, sigue estos pasos:

### Paso 1 — Ejecutar consulta paralela

Corre el script con la pregunta del usuario como argumento:

```bash
node .claude/scripts/query_council.cjs "$ARGUMENTS"
```

El script devuelve un JSON con esta estructura:
```json
{
  "prompt": "la pregunta",
  "openai": { "response": "...", "model": "gpt-4o-mini" },
  "gemini": { "response": "...", "model": "gemini-1.5-flash" }
}
```

Si una clave API no está configurada, el campo correspondiente tendrá `{ "error": "..." }` en lugar de `response`.

### Paso 2 — Verificar resultados

- Si **ambas** APIs fallaron por falta de claves: informa al usuario que debe configurar `.council.env` (ver plantilla `.council.env.template` en la raíz del proyecto) y detente aquí.
- Si **una** API falló: procede indicando que el consejo está incompleto y con cuál modelo no se pudo consultar.
- Si **ambas** respondieron: procede con la síntesis completa.

### Paso 3 — Sintetizar las tres perspectivas

Analiza las respuestas recibidas junto con tu propio análisis como Claude. Presenta el resultado con esta estructura:

---

## Consulta al Consejo: *[tema resumido]*

### Perspectiva de ChatGPT *(modelo: [modelo usado])*
[Resumen fiel de los puntos más relevantes de ChatGPT, sin parafrasear en exceso]

### Perspectiva de Gemini *(modelo: [modelo usado])*
[Resumen fiel de los puntos más relevantes de Gemini, sin parafrasear en exceso]

### Mi análisis (Claude)
[Tu perspectiva propia sobre el tema, complementando o cuestionando lo anterior]

### Síntesis del Consejo
**Puntos de consenso:** [qué coincidieron los modelos]
**Perspectivas únicas:** [qué aportó cada uno de forma diferenciada]
**Recomendación integrada:** [conclusión accionable combinando las tres voces]

---

## Configuración requerida

El skill necesita claves API para funcionar. Si el usuario no las ha configurado aún, indícale:

1. Copia `.council.env.template` → `.council.env` en la raíz del proyecto
2. Agrega tus claves:
   - `OPENAI_API_KEY`: obtener en platform.openai.com/api-keys
   - `GEMINI_API_KEY`: obtener en aistudio.google.com/app/apikey
3. El archivo `.council.env` ya está en `.gitignore` — nunca se sube al repositorio

## Notas de comportamiento

- Cada invocación hace **2 llamadas API** (una a OpenAI, una a Google) — tienen costo según tu plan
- El timeout por llamada es de 30 segundos
- Los modelos por defecto son `gpt-4o-mini` (económico) y `gemini-1.5-flash` (rápido)
- Para usar modelos más potentes, agrega `OPENAI_MODEL=gpt-4o` o `GEMINI_MODEL=gemini-1.5-pro` en `.council.env`
