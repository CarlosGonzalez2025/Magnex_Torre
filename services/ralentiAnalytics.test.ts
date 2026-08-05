/**
 * Suite de la analítica estadística del informe de ralentí.
 *   node --test services/ralentiAnalytics.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  regresionLineal, proyectar, correlacion, detectarAtipicos, descomponerCambio,
  fuerzaCorrelacion, type Punto,
} from './ralentiAnalytics.ts';

test('recta exacta: pendiente e intercepto correctos y R² = 1', () => {
  const pts: Punto[] = [0, 1, 2, 3, 4].map(x => ({ x, y: 3 * x + 5 }));
  const r = regresionLineal(pts)!;
  assert.ok(Math.abs(r.pendiente - 3) < 1e-9);
  assert.ok(Math.abs(r.intercepto - 5) < 1e-9);
  assert.ok(Math.abs(r.r2 - 1) < 1e-9);
  assert.equal(r.n, 5);
  assert.equal(r.gl, 3);
});

test('serie plana: pendiente 0 y NO significativa', () => {
  const pts: Punto[] = [0, 1, 2, 3, 4, 5].map(x => ({ x, y: 42 }));
  const r = regresionLineal(pts)!;
  assert.ok(Math.abs(r.pendiente) < 1e-9);
  assert.equal(r.significativa, false);
});

test('ruido puro no se declara tendencia significativa', () => {
  // Alterna arriba/abajo sin dirección: la pendiente es ~0 frente a su error.
  const pts: Punto[] = [10, 90, 12, 88, 11, 91, 9, 89].map((y, x) => ({ x, y }));
  const r = regresionLineal(pts)!;
  assert.equal(r.significativa, false, 'una serie oscilante no debe reportar tendencia');
  assert.ok(r.r2 < 0.3);
});

test('tendencia real con poco ruido SÍ es significativa', () => {
  const pts: Punto[] = [50, 48, 47, 45, 44, 42, 41, 39].map((y, x) => ({ x, y }));
  const r = regresionLineal(pts)!;
  assert.ok(r.pendiente < 0);
  assert.equal(r.significativa, true);
  assert.ok(r.r2 > 0.95);
});

test('menos de 3 puntos no produce regresión', () => {
  assert.equal(regresionLineal([{ x: 0, y: 1 }, { x: 1, y: 2 }]), null);
});

test('proyección sobre la recta ajustada', () => {
  const pts: Punto[] = [0, 1, 2, 3].map(x => ({ x, y: 2 * x }));
  const r = regresionLineal(pts)!;
  const p = proyectar(r, 4);
  assert.ok(Math.abs(p.valor - 8) < 1e-9);
});

test('correlación: +1, −1 y sin varianza', () => {
  assert.ok(Math.abs(correlacion([1, 2, 3, 4], [2, 4, 6, 8])! - 1) < 1e-9);
  assert.ok(Math.abs(correlacion([1, 2, 3, 4], [8, 6, 4, 2])! + 1) < 1e-9);
  assert.equal(correlacion([1, 1, 1, 1], [1, 2, 3, 4]), null);
});

test('fuerzaCorrelacion clasifica por magnitud, no por signo', () => {
  assert.equal(fuerzaCorrelacion(-0.85), 'fuerte');
  assert.equal(fuerzaCorrelacion(0.1), 'nula');
});

test('atípico se mide contra la recta, no contra la media', () => {
  // Serie con tendencia clara y un salto en el índice 4.
  const ys = [10, 20, 30, 40, 120, 60, 70, 80];
  const at = detectarAtipicos(ys.map((y, x) => ({ x, y })), 1.8);
  assert.ok(at.some(a => a.indice === 4), 'debe marcar el salto');
  assert.ok(!at.some(a => a.indice === 7), 'el último punto sigue la tendencia y no es atípico');
});

test('serie con pura tendencia no genera atípicos', () => {
  const pts: Punto[] = [0, 1, 2, 3, 4, 5].map(x => ({ x, y: 7 * x + 1 }));
  assert.equal(detectarAtipicos(pts).length, 0);
});

test('descomposición: crecimiento solo por flota no imputa cambio de conducta', () => {
  // 100 vehículos → 10 h c/u; luego 200 vehículos → 10 h c/u. El total se dobla
  // pero la intensidad no cambió: todo el efecto debe ser de flota.
  const d = descomponerCambio(1000, 100, 2000, 200)!;
  assert.equal(d.cambioTotal, 1000);
  assert.ok(Math.abs(d.efectoFlota - 1000) < 1e-9);
  assert.ok(Math.abs(d.efectoIntensidad) < 1e-9);
  assert.ok(Math.abs(d.pctFlota - 100) < 1e-9);
});

test('descomposición: misma flota, peor conducta → todo intensidad', () => {
  const d = descomponerCambio(1000, 100, 1500, 100)!;
  assert.ok(Math.abs(d.efectoFlota) < 1e-9);
  assert.ok(Math.abs(d.efectoIntensidad - 500) < 1e-9);
  assert.ok(Math.abs(d.pctIntensidad - 100) < 1e-9);
});

test('descomposición: los dos efectos suman el cambio total', () => {
  const d = descomponerCambio(1000, 100, 1800, 150)!;
  assert.ok(Math.abs(d.efectoFlota + d.efectoIntensidad - d.cambioTotal) < 1e-9);
});

test('descomposición sin vehículos devuelve null', () => {
  assert.equal(descomponerCambio(100, 0, 200, 10), null);
});
