/**
 * Criterio ÚNICO de clasificación de excesos de velocidad.
 *
 * Regla de negocio (fijada 2026-09-11): el tramo de un exceso lo decide el
 * UMBRAL CONFIGURADO en la plataforma GPS, que viaja en el nombre/estado del
 * evento ("Exceso de Velocidad >80 km/h Magnex", "Infraccion 80 Km/h",
 * "Exceso Velocidad 40 Km/h"). La velocidad medida NO define el tramo cuando el
 * nombre ya declara uno.
 *
 * Por qué: las plataformas tienen una regla por umbral y las reglas se solapan.
 * Un vehículo que pasa a 85 km/h dispara la regla de >80 (y, si existe, también
 * la de >40 en esa misma zona). Si el tramo se decidiera por la velocidad
 * medida, el evento de la regla de >40 se contaría TAMBIÉN como infracción de
 * >80: se reporta una falta grave que la configuración del GPS nunca emitió, y
 * si ambas reglas dispararon se cuenta dos veces. Medido sobre un día real:
 * 3 de 22 "graves" de Coltrack (14%) y 39 de 79 del tramo 50-80 (49%) venían de
 * reglas de 20/30/40 km/h; en Geotab, 8 de 14 del tramo 50-80 (57%).
 *
 * Cuando el nombre NO declara umbral, depende de la PLATAFORMA (decidido
 * 2026-09-11 sobre el informe del 10/09):
 *
 *   GEOTAB → el evento NO cuenta en ningún tramo. Geotab tiene la regla propia
 *     de Magnex ("Exceso de Velocidad >80 km/h Magnex") Y las genéricas contra
 *     el límite de la vía ("Exceso de velocidad", "Exceso de velocidad
 *     (nuevo)"), que disparan sobre el mismo recorrido y duplican: el 10/09,
 *     POS648 generó tres eventos del mismo paso a ~101 km/h (las dos genéricas
 *     de Geotab más "Infraccion 80 Km/h" de Coltrack). Contar las genéricas por
 *     velocidad medida subía las faltas graves del día de 33 a 62. Los eventos
 *     se siguen guardando y se ven en el detalle con su velocidad; simplemente
 *     no suman.
 *
 *   COLTRACK / FAGOR (y fuente desconocida) → velocidad medida. Fagor manda
 *     siempre "Alm. Exceso de velocidad en la via", su único nombre para
 *     velocidad: exigirle umbral en el nombre borraría todos sus excesos.
 *
 * Este módulo no depende de Supabase ni de xlsx a propósito: lo consumen tanto
 * el parser de archivos como la capa de lectura de informes.
 */

export interface ClasificacionAlerta {
  infraccion_80_kmh: number;
  excesos_50_80_kmh: number;
  excesos_varios_parametros: number;
  frenadas_bruscas: number;
}

/** Minúsculas y sin tildes, para comparar nombres de reglas de forma estable. */
function normalizar(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Umbral (km/h) declarado en el nombre del evento, o null si no declara ninguno.
 *
 * Acepta las grafías de las tres plataformas:
 *   "Exceso de Velocidad >80 km/h Magnex" → 80
 *   "Infraccion 80 Km/h"                  → 80
 *   "Exceso Velocidad 10 Km/h"            → 10
 *   "Speeding 100 kph"                    → 100
 *   "Exceso de velocidad (nuevo)"         → null
 *   "Alm. Exceso de velocidad en la via"  → null
 */
export function umbralConfigurado(estado: unknown): number | null {
  const nombre = normalizar(estado);
  if (!nombre) return null;

  // Forma habitual: el número viene con unidad (km/h, kmh, kph, k/h).
  const conUnidad = nombre.match(/(\d{1,3})\s*(?:km\s*\/?\s*h|kmh|kph|k\/h)\b/);
  if (conUnidad) {
    const valor = parseInt(conUnidad[1], 10);
    if (esUmbralPlausible(valor)) return valor;
  }

  // Forma sin unidad: el número va pegado a la palabra clave ("Infraccion 80").
  // Se exige esa cercanía para no confundirlo con códigos o placas del nombre.
  const sinUnidad = nombre.match(/(?:velocidad|infraccion|speeding|speed|limite)[^\d]{0,12}(\d{1,3})\b/);
  if (sinUnidad) {
    const valor = parseInt(sinUnidad[1], 10);
    if (esUmbralPlausible(valor)) return valor;
  }

  return null;
}

/** Descarta números del nombre que no pueden ser un límite de velocidad. */
function esUmbralPlausible(valor: number): boolean {
  return Number.isFinite(valor) && valor >= 5 && valor <= 200;
}

/** ¿El evento es una frenada brusca? (se evalúa antes que el exceso) */
export function esFrenadaBrusca(estado: unknown): boolean {
  const nombre = normalizar(estado);
  return nombre.includes('frenad') || nombre.includes('brake') || nombre.includes('desaceleracion');
}

/**
 * ¿El evento es un exceso de VELOCIDAD?
 *
 * Se exige una señal explícita de velocidad. Antes bastaba con que el nombre
 * dijera "exceso", lo que colaba eventos que no son de velocidad: "Exceso de
 * RPM" de Coltrack se contaba como exceso de velocidad.
 */
export function esExcesoDeVelocidad(estado: unknown): boolean {
  const nombre = normalizar(estado);
  if (!nombre || esFrenadaBrusca(nombre)) return false;
  if (nombre.includes('rpm')) return false;
  return nombre.includes('velocidad')
    || nombre.includes('infraccion')
    || nombre.includes('speed')
    || nombre.includes('limite de vel');
}

/**
 * Plataformas en las que un exceso SOLO cuenta si el nombre de la regla declara
 * el umbral. Ver la nota de cabecera: en Geotab las reglas genéricas contra el
 * límite de la vía conviven con la regla de umbral de Magnex y duplican el mismo
 * recorrido.
 */
export function exigeUmbralDeclarado(fuente: unknown): boolean {
  return normalizar(fuente) === 'geotab';
}

/**
 * Velocidad de referencia para ubicar el exceso en un tramo: el umbral que
 * declara el nombre y, a falta de él, la velocidad medida.
 *
 * Devuelve null cuando el evento no se puede ubicar en ningún tramo: una regla
 * sin umbral declarado en una plataforma que lo exige (Geotab).
 */
export function velocidadDeReferencia(estado: unknown, velocidad: unknown, fuente: unknown): number | null {
  const umbral = umbralConfigurado(estado);
  if (umbral !== null) return umbral;
  if (exigeUmbralDeclarado(fuente)) return null;
  return Number(velocidad) || 0;
}

/**
 * Clasifica una alerta diaria a partir del NOMBRE del evento (estado) y la
 * VELOCIDAD real. Fuente única de verdad del módulo de Informes Diarios (Excel,
 * PDF y análisis): se calcula al leer, por lo que también corrige datos ya
 * cargados sin re-importar.
 *
 * Regla:
 *  - Frenada si el nombre lo indica (frenada/brake/desaceleración).
 *  - Exceso de velocidad SOLO si el nombre indica velocidad (velocidad /
 *    infracción / speed / límite de velocidad); el tramo lo decide el umbral
 *    configurado que declara el nombre y, si no declara ninguno, la velocidad
 *    medida —salvo en Geotab, donde no cuenta—:
 *    >= 80 → Infracción ≥80 ; 50–80 → Exceso 50-80 ; < 50 → Exceso 10-40.
 *  - Cualquier otro evento (TDR, reconexión, GPS adquirido, exceso de RPM,
 *    cinturón, ralentí…) → no cuenta (todos en 0).
 *
 * `fuente` es la plataforma del evento (columna `gps` de `alertas_diarias_gps`).
 * Es obligatoria justamente para que el compilador obligue a pasarla en cada
 * punto de lectura: sin ella, un evento genérico de Geotab volvería a contarse
 * como falta grave por su velocidad medida.
 */
export function clasificarAlertaDiaria(estado: unknown, velocidad: unknown, fuente: unknown): ClasificacionAlerta {
  const c: ClasificacionAlerta = {
    infraccion_80_kmh: 0, excesos_50_80_kmh: 0, excesos_varios_parametros: 0, frenadas_bruscas: 0,
  };
  if (esFrenadaBrusca(estado)) {
    c.frenadas_bruscas = 1;
    return c;
  }
  if (!esExcesoDeVelocidad(estado)) return c;

  const referencia = velocidadDeReferencia(estado, velocidad, fuente);
  // null = regla sin umbral en una plataforma que lo exige: el evento existe y se
  // guarda, pero no se puede ubicar en un tramo, así que no suma en ninguno.
  if (referencia === null) return c;
  if (referencia >= 80) c.infraccion_80_kmh = 1;
  else if (referencia >= 50) c.excesos_50_80_kmh = 1;
  else c.excesos_varios_parametros = 1;
  return c;
}

/**
 * ¿Vale la pena GUARDAR el evento en el informe diario?
 *
 * Es más amplio que "cuenta en un tramo": los excesos genéricos de Geotab no
 * suman, pero sí se guardan para que sigan viéndose en el detalle con su
 * velocidad. Lo que se descarta son los eventos que no son alerta (TDR
 * Encendido/Apagado, GPS Adquirido, reconexión, ralentí, cinturón…).
 */
export function esEventoReportable(estado: unknown): boolean {
  return esFrenadaBrusca(estado) || esExcesoDeVelocidad(estado);
}

/**
 * Falta grave = exceso de velocidad de >= 80 km/h según la configuración del
 * GPS. Es el criterio que comparten Informes Diarios, Auditoría de Flota, Hoja
 * de Vida, el asistente IA y la capa ML, para que ninguna pantalla reporte un
 * número distinto del mismo día.
 */
export function esExcesoGrave(estado: unknown, velocidad: unknown, fuente: unknown): boolean {
  return clasificarAlertaDiaria(estado, velocidad, fuente).infraccion_80_kmh > 0;
}

/** Exceso moderado = tramo 50-80 km/h. */
export function esExcesoModerado(estado: unknown, velocidad: unknown, fuente: unknown): boolean {
  return clasificarAlertaDiaria(estado, velocidad, fuente).excesos_50_80_kmh > 0;
}
