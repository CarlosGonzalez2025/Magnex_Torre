/**
 * Analítica estadística de la serie de quincenas del informe de ralentí.
 *
 * Se extrajo del componente por la misma razón que `ralentiMetrics.ts`: poder probarla
 * aislada (ver ralentiAnalytics.test.ts) y que las fórmulas no vivan mezcladas con JSX.
 *
 * Criterio general: NUNCA afirmar una tendencia que el dato no sostiene. Con 8–9 puntos
 * una pendiente puede ser puro ruido, así que toda regresión reporta su R², su error
 * estándar y un contraste de significancia; el consumidor decide si la muestra.
 */

export interface Punto { x: number; y: number }

export interface Regresion {
  pendiente: number;        // cambio de y por cada período
  intercepto: number;
  r2: number;               // [0..1] proporción de varianza explicada
  errorEstandar: number;    // error estándar de la pendiente
  tStat: number;            // pendiente / errorEstandar
  gl: number;               // grados de libertad (n − 2)
  significativa: boolean;   // |t| supera el valor crítico al 95%
  n: number;
}

/**
 * Valores críticos de t de dos colas al 95% por grados de libertad.
 * Se tabulan en vez de aproximar: con n pequeño (6–12 quincenas) la diferencia entre
 * usar 1,96 y el valor real es grande y llevaría a declarar tendencias inexistentes.
 */
const T_CRITICO_95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
  8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145,
  15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
};
const tCritico = (gl: number): number =>
  gl <= 0 ? Infinity : (T_CRITICO_95[gl] ?? (gl > 20 ? 1.96 : 2.086));

/** Mínimos cuadrados ordinarios sobre y = a + b·x. */
export function regresionLineal(puntos: Punto[]): Regresion | null {
  const pts = puntos.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n < 3) return null; // con 2 puntos la recta es exacta y no dice nada

  const mediaX = pts.reduce((a, p) => a + p.x, 0) / n;
  const mediaY = pts.reduce((a, p) => a + p.y, 0) / n;

  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) {
    const dx = p.x - mediaX, dy = p.y - mediaY;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  if (sxx === 0) return null;

  const pendiente = sxy / sxx;
  const intercepto = mediaY - pendiente * mediaX;

  // Suma de cuadrados de los residuos
  let sce = 0;
  for (const p of pts) {
    const residuo = p.y - (intercepto + pendiente * p.x);
    sce += residuo * residuo;
  }

  const gl = n - 2;
  const varianzaResidual = gl > 0 ? sce / gl : 0;
  const errorEstandar = sxx > 0 && gl > 0 ? Math.sqrt(varianzaResidual / sxx) : 0;
  const tStat = errorEstandar > 0 ? pendiente / errorEstandar : 0;

  return {
    pendiente,
    intercepto,
    r2: syy > 0 ? Math.max(0, 1 - sce / syy) : 0,
    errorEstandar,
    tStat,
    gl,
    significativa: Math.abs(tStat) > tCritico(gl),
    n,
  };
}

/** Valor proyectado por la recta en x, con banda de ±1 error estándar de la pendiente. */
export function proyectar(reg: Regresion, x: number): { valor: number; banda: number } {
  return {
    valor: reg.intercepto + reg.pendiente * x,
    banda: Math.abs(reg.errorEstandar * x),
  };
}

/** Coeficiente de correlación de Pearson. */
export function correlacion(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.slice(0, n).reduce((a, v) => a + v, 0) / n;
  const my = ys.slice(0, n).reduce((a, v) => a + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Interpretación verbal de |r|, para no dejar el número solo en la UI. */
export function fuerzaCorrelacion(r: number): 'nula' | 'débil' | 'moderada' | 'fuerte' {
  const a = Math.abs(r);
  if (a < 0.3) return 'nula';
  if (a < 0.5) return 'débil';
  if (a < 0.7) return 'moderada';
  return 'fuerte';
}

export interface Atipico { indice: number; valor: number; esperado: number; z: number }

/**
 * Períodos que se salen del patrón: se mide el residuo contra la recta ajustada
 * (no contra la media) para no marcar como atípico lo que es simple tendencia.
 */
export function detectarAtipicos(puntos: Punto[], umbralZ = 2): Atipico[] {
  const reg = regresionLineal(puntos);
  if (!reg) return [];
  const residuos = puntos.map(p => p.y - (reg.intercepto + reg.pendiente * p.x));
  const media = residuos.reduce((a, v) => a + v, 0) / residuos.length;
  const desv = Math.sqrt(residuos.reduce((a, v) => a + (v - media) ** 2, 0) / residuos.length);
  if (desv === 0) return [];
  const out: Atipico[] = [];
  residuos.forEach((res, i) => {
    const z = (res - media) / desv;
    if (Math.abs(z) >= umbralZ) {
      out.push({ indice: i, valor: puntos[i].y, esperado: reg.intercepto + reg.pendiente * puntos[i].x, z });
    }
  });
  return out;
}

export interface Descomposicion {
  totalBase: number;
  totalActual: number;
  cambioTotal: number;
  efectoFlota: number;       // parte explicada por variar el nº de vehículos
  efectoIntensidad: number;  // parte explicada por variar el consumo por vehículo
  pctFlota: number;          // [0..100] peso del efecto flota sobre |cambioTotal|
  pctIntensidad: number;
}

/**
 * Separa cuánto de un cambio agregado viene de que la flota creció y cuánto de que
 * cada vehículo se comporta distinto. Es indispensable en esta serie: la incorporación
 * de Geotab sumó ~250 vehículos de golpe, y sin esta descomposición cualquier subida
 * agregada se leería como un empeoramiento de conducta que no ocurrió.
 *
 * Δtotal = (Nₐ − N_b)·I_b   +   Nₐ·(Iₐ − I_b)
 *          └── efecto flota ──┘  └── efecto intensidad ──┘
 * donde I = total / vehículos (intensidad por vehículo).
 */
export function descomponerCambio(
  totalBase: number, vehiculosBase: number,
  totalActual: number, vehiculosActual: number
): Descomposicion | null {
  if (vehiculosBase <= 0 || vehiculosActual <= 0) return null;
  const iBase = totalBase / vehiculosBase;
  const iActual = totalActual / vehiculosActual;
  const efectoFlota = (vehiculosActual - vehiculosBase) * iBase;
  const efectoIntensidad = vehiculosActual * (iActual - iBase);
  const cambioTotal = totalActual - totalBase;
  const magnitud = Math.abs(efectoFlota) + Math.abs(efectoIntensidad);
  return {
    totalBase, totalActual, cambioTotal, efectoFlota, efectoIntensidad,
    pctFlota: magnitud > 0 ? (Math.abs(efectoFlota) / magnitud) * 100 : 0,
    pctIntensidad: magnitud > 0 ? (Math.abs(efectoIntensidad) / magnitud) * 100 : 0,
  };
}
