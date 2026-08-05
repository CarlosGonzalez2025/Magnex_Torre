/**
 * Capa de aprendizaje NO SUPERVISADO y SUPERVISADO sobre el perfil de ralentí por vehículo.
 *
 * Por qué vive aquí y no en `ml/` (pandas/sklearn, entrenamiento offline):
 *
 *   1. La unidad de análisis es el vehículo dentro del ALCANCE FILTRADO. El usuario filtra
 *      por cliente, contrato y tipo, y la segmentación tiene que recalcularse con ese
 *      subconjunto. Un modelo entrenado offline daría siempre el mismo resultado global.
 *   2. El volumen es pequeño (cientos de vehículos, miles de filas vehículo-quincena) y el
 *      componente YA tiene esos datos en memoria: no hay que mover nada por la red.
 *   3. Determinismo: semilla fija y k-means++ ⇒ el mismo alcance produce siempre la misma
 *      segmentación. Sin esto, un informe firmado no sería reproducible.
 *
 * Esto NO sustituye ni se mezcla con la capa `ml/` (riesgo de conductor, entrenada offline):
 * son modelos distintos, sobre entidades distintas, con ciclos de vida distintos.
 *
 * Todo el módulo es puro y determinista para poder probarlo (ver ralentiML.test.ts).
 */

// ── PRNG con semilla: reproducibilidad exacta entre corridas ──────────────────
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Estandarización ──────────────────────────────────────────────────────────

export interface Estandarizacion {
  datos: number[][];
  medias: number[];
  desviaciones: number[];
}

/**
 * z-score por columna. Es obligatorio antes de k-means: sin esto, "horas de ralentí"
 * (orden de 10²) aplastaría a "% de eventos largos" (orden de 10⁻¹) y el clúster se
 * decidiría por una sola variable.
 */
export function estandarizar(matriz: number[][]): Estandarizacion {
  const n = matriz.length;
  const d = n > 0 ? matriz[0].length : 0;
  const medias = new Array(d).fill(0);
  const desviaciones = new Array(d).fill(0);
  for (let j = 0; j < d; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += matriz[i][j];
    medias[j] = s / n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (matriz[i][j] - medias[j]) ** 2;
    // Columna constante → desviación 1 para no dividir por cero (queda toda en 0).
    desviaciones[j] = Math.sqrt(v / n) || 1;
  }
  return {
    datos: matriz.map(fila => fila.map((v, j) => (v - medias[j]) / desviaciones[j])),
    medias,
    desviaciones,
  };
}

const distancia2 = (a: number[], b: number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return s;
};

// ── K-means ──────────────────────────────────────────────────────────────────

export interface ResultadoKMeans {
  asignaciones: number[];    // índice de clúster por observación
  centroides: number[][];
  inercia: number;           // suma de distancias² al centroide asignado
  iteraciones: number;
}

/** Inicialización k-means++: reduce la dependencia del azar frente a la aleatoria pura. */
function inicializarPP(datos: number[][], k: number, rnd: () => number): number[][] {
  const centroides: number[][] = [datos[Math.floor(rnd() * datos.length)].slice()];
  while (centroides.length < k) {
    const d2 = datos.map(p => Math.min(...centroides.map(c => distancia2(p, c))));
    const total = d2.reduce((a, v) => a + v, 0);
    if (total === 0) { centroides.push(datos[Math.floor(rnd() * datos.length)].slice()); continue; }
    let objetivo = rnd() * total;
    let idx = 0;
    for (let i = 0; i < d2.length; i++) { objetivo -= d2[i]; if (objetivo <= 0) { idx = i; break; } }
    centroides.push(datos[idx].slice());
  }
  return centroides;
}

export function kmeans(
  datos: number[][],
  k: number,
  opciones: { semilla?: number; maxIter?: number } = {}
): ResultadoKMeans | null {
  const { semilla = 42, maxIter = 100 } = opciones;
  if (datos.length === 0 || k < 1 || k > datos.length) return null;

  const rnd = mulberry32(semilla);
  let centroides = inicializarPP(datos, k, rnd);
  let asignaciones = new Array(datos.length).fill(0);
  let iteraciones = 0;

  for (; iteraciones < maxIter; iteraciones++) {
    let cambio = false;
    for (let i = 0; i < datos.length; i++) {
      let mejor = 0, mejorD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = distancia2(datos[i], centroides[c]);
        if (d < mejorD) { mejorD = d; mejor = c; }
      }
      if (asignaciones[i] !== mejor) { asignaciones[i] = mejor; cambio = true; }
    }

    const sumas = Array.from({ length: k }, () => new Array(datos[0].length).fill(0));
    const cuentas = new Array(k).fill(0);
    for (let i = 0; i < datos.length; i++) {
      cuentas[asignaciones[i]]++;
      for (let j = 0; j < datos[i].length; j++) sumas[asignaciones[i]][j] += datos[i][j];
    }
    centroides = centroides.map((c, idx) =>
      cuentas[idx] === 0 ? c : sumas[idx].map(v => v / cuentas[idx]));

    if (!cambio) break;
  }

  const inercia = datos.reduce((a, p, i) => a + distancia2(p, centroides[asignaciones[i]]), 0);
  return { asignaciones, centroides, inercia, iteraciones };
}

/**
 * Silueta media: mide si los grupos están realmente separados. Se usa para elegir k
 * en vez de fijarlo a ojo — con un k mal elegido la segmentación cuenta una historia falsa.
 * Rango [-1, 1]; por debajo de ~0,25 la estructura de grupos no es creíble.
 */
export function siluetaMedia(datos: number[][], asignaciones: number[], k: number): number {
  const n = datos.length;
  if (n <= k || k < 2) return 0;
  const porGrupo: number[][] = Array.from({ length: k }, () => []);
  asignaciones.forEach((c, i) => porGrupo[c].push(i));

  let suma = 0;
  for (let i = 0; i < n; i++) {
    const propio = porGrupo[asignaciones[i]];
    if (propio.length <= 1) continue; // silueta 0 para grupos unitarios
    const a = propio.reduce((acc, j) => j === i ? acc : acc + Math.sqrt(distancia2(datos[i], datos[j])), 0) / (propio.length - 1);
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === asignaciones[i] || porGrupo[c].length === 0) continue;
      const d = porGrupo[c].reduce((acc, j) => acc + Math.sqrt(distancia2(datos[i], datos[j])), 0) / porGrupo[c].length;
      if (d < b) b = d;
    }
    if (b !== Infinity) suma += (b - a) / Math.max(a, b);
  }
  return suma / n;
}

/** Elige k por silueta máxima dentro del rango. Devuelve también el modelo ganador. */
export function elegirK(
  datos: number[][],
  kMin = 2,
  kMax = 5,
  semilla = 42
): { k: number; silueta: number; modelo: ResultadoKMeans } | null {
  let mejor: { k: number; silueta: number; modelo: ResultadoKMeans } | null = null;
  for (let k = kMin; k <= Math.min(kMax, datos.length - 1); k++) {
    const modelo = kmeans(datos, k, { semilla });
    if (!modelo) continue;
    const s = siluetaMedia(datos, modelo.asignaciones, k);
    if (!mejor || s > mejor.silueta) mejor = { k, silueta: s, modelo };
  }
  return mejor;
}

/**
 * Distancia de cada observación a SU centroide, normalizada por la mediana del grupo.
 * Un valor alto = el vehículo no encaja ni en su propio perfil: candidato a revisión.
 */
export function distanciaAlCentroide(datos: number[][], modelo: ResultadoKMeans): number[] {
  return datos.map((p, i) => Math.sqrt(distancia2(p, modelo.centroides[modelo.asignaciones[i]])));
}

// ── Regresión logística ──────────────────────────────────────────────────────

export interface ModeloLogistico {
  pesos: number[];
  sesgo: number;
  iteraciones: number;
  convergio: boolean;
}

const sigmoide = (z: number): number => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

/**
 * Descenso de gradiente por lotes con regularización L2.
 *
 * L2 no es opcional aquí: con features correlacionadas (horas de ralentí y nº de eventos
 * lo están) los pesos divergen y el modelo memoriza en vez de generalizar.
 */
export function entrenarLogistica(
  X: number[][],
  y: number[],
  opciones: { tasa?: number; iteraciones?: number; l2?: number; tolerancia?: number } = {}
): ModeloLogistico | null {
  const { tasa = 0.1, iteraciones = 2000, l2 = 0.01, tolerancia = 1e-7 } = opciones;
  const n = X.length;
  if (n === 0 || y.length !== n) return null;
  const d = X[0].length;

  let pesos = new Array(d).fill(0);
  let sesgo = 0;
  let perdidaPrevia = Infinity;
  let it = 0;
  let convergio = false;

  for (; it < iteraciones; it++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;
    let perdida = 0;

    for (let i = 0; i < n; i++) {
      let z = sesgo;
      for (let j = 0; j < d; j++) z += pesos[j] * X[i][j];
      const p = sigmoide(z);
      const err = p - y[i];
      for (let j = 0; j < d; j++) gradW[j] += err * X[i][j];
      gradB += err;
      perdida -= y[i] * Math.log(Math.max(p, 1e-12)) + (1 - y[i]) * Math.log(Math.max(1 - p, 1e-12));
    }

    perdida = perdida / n + (l2 / 2) * pesos.reduce((a, w) => a + w * w, 0);
    for (let j = 0; j < d; j++) pesos[j] -= tasa * (gradW[j] / n + l2 * pesos[j]);
    sesgo -= tasa * (gradB / n);

    if (Math.abs(perdidaPrevia - perdida) < tolerancia) { convergio = true; it++; break; }
    perdidaPrevia = perdida;
  }

  return { pesos, sesgo, iteraciones: it, convergio };
}

export function predecirProbabilidad(modelo: ModeloLogistico, x: number[]): number {
  let z = modelo.sesgo;
  for (let j = 0; j < x.length; j++) z += modelo.pesos[j] * x[j];
  return sigmoide(z);
}

export interface MetricasClasificacion {
  n: number;
  positivosReales: number;
  exactitud: number;
  precision: number;
  sensibilidad: number;  // recall
  f1: number;
  auc: number;
}

/** Área bajo la curva ROC por el estadístico de Mann-Whitney (sin ordenar umbrales). */
export function auc(probabilidades: number[], etiquetas: number[]): number {
  const pos = probabilidades.filter((_, i) => etiquetas[i] === 1);
  const neg = probabilidades.filter((_, i) => etiquetas[i] === 0);
  if (pos.length === 0 || neg.length === 0) return 0.5;
  let concordantes = 0;
  for (const p of pos) for (const q of neg) concordantes += p > q ? 1 : p === q ? 0.5 : 0;
  return concordantes / (pos.length * neg.length);
}

export function evaluar(probabilidades: number[], etiquetas: number[], umbral = 0.5): MetricasClasificacion {
  let vp = 0, fp = 0, vn = 0, fn = 0;
  probabilidades.forEach((p, i) => {
    const pred = p >= umbral ? 1 : 0;
    if (pred === 1 && etiquetas[i] === 1) vp++;
    else if (pred === 1) fp++;
    else if (etiquetas[i] === 1) fn++;
    else vn++;
  });
  const precision = vp + fp > 0 ? vp / (vp + fp) : 0;
  const sensibilidad = vp + fn > 0 ? vp / (vp + fn) : 0;
  return {
    n: etiquetas.length,
    positivosReales: vp + fn,
    exactitud: etiquetas.length > 0 ? (vp + vn) / etiquetas.length : 0,
    precision,
    sensibilidad,
    f1: precision + sensibilidad > 0 ? (2 * precision * sensibilidad) / (precision + sensibilidad) : 0,
    auc: auc(probabilidades, etiquetas),
  };
}
