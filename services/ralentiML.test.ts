/**
 * Suite de la capa ML del informe de ralentí.
 *   node --test services/ralentiML.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estandarizar, kmeans, siluetaMedia, elegirK, distanciaAlCentroide,
  entrenarLogistica, predecirProbabilidad, evaluar, auc,
} from './ralentiML.ts';

// ── Estandarización ──
test('estandarizar deja media 0 y desviación 1 por columna', () => {
  const m = [[1, 100], [2, 200], [3, 300], [4, 400]];
  const e = estandarizar(m);
  for (let j = 0; j < 2; j++) {
    const col = e.datos.map(f => f[j]);
    const media = col.reduce((a, v) => a + v, 0) / col.length;
    const desv = Math.sqrt(col.reduce((a, v) => a + (v - media) ** 2, 0) / col.length);
    assert.ok(Math.abs(media) < 1e-9, `media col ${j}`);
    assert.ok(Math.abs(desv - 1) < 1e-9, `desviación col ${j}`);
  }
});

test('columna constante no divide por cero', () => {
  const e = estandarizar([[5, 1], [5, 2], [5, 3]]);
  assert.ok(e.datos.every(f => f[0] === 0));
  assert.equal(e.desviaciones[0], 1);
});

// ── K-means ──
test('kmeans separa dos nubes bien distanciadas', () => {
  const datos = [
    [0, 0], [0.1, 0.1], [-0.1, 0.05], [0.05, -0.1],
    [10, 10], [10.1, 9.9], [9.9, 10.1], [10.05, 10],
  ];
  const m = kmeans(datos, 2, { semilla: 7 })!;
  const g0 = new Set(m.asignaciones.slice(0, 4));
  const g1 = new Set(m.asignaciones.slice(4));
  assert.equal(g0.size, 1, 'la primera nube debe quedar en un solo clúster');
  assert.equal(g1.size, 1, 'la segunda nube también');
  assert.notEqual([...g0][0], [...g1][0], 'y deben ser clústeres distintos');
});

test('kmeans es determinista con la misma semilla', () => {
  const datos = Array.from({ length: 40 }, (_, i) => [Math.sin(i) * 5, Math.cos(i * 1.7) * 5]);
  const a = kmeans(datos, 3, { semilla: 123 })!;
  const b = kmeans(datos, 3, { semilla: 123 })!;
  assert.deepEqual(a.asignaciones, b.asignaciones);
  assert.ok(Math.abs(a.inercia - b.inercia) < 1e-12);
});

test('kmeans rechaza k inválido', () => {
  assert.equal(kmeans([[1], [2]], 5), null);
  assert.equal(kmeans([], 2), null);
});

test('más clústeres nunca aumentan la inercia', () => {
  const datos = Array.from({ length: 30 }, (_, i) => [i, (i * 7) % 11]);
  const k2 = kmeans(datos, 2, { semilla: 1 })!;
  const k4 = kmeans(datos, 4, { semilla: 1 })!;
  assert.ok(k4.inercia <= k2.inercia + 1e-9);
});

test('silueta alta para grupos separados, baja para nube uniforme', () => {
  const separados = [[0, 0], [0.1, 0], [0, 0.1], [20, 20], [20.1, 20], [20, 20.1]];
  const ms = kmeans(separados, 2, { semilla: 5 })!;
  assert.ok(siluetaMedia(separados, ms.asignaciones, 2) > 0.8);

  const uniforme = Array.from({ length: 30 }, (_, i) => [i / 30, (i * 13 % 30) / 30]);
  const mu = kmeans(uniforme, 2, { semilla: 5 })!;
  assert.ok(siluetaMedia(uniforme, mu.asignaciones, 2) < 0.6);
});

test('elegirK encuentra la estructura real de 3 grupos', () => {
  const datos: number[][] = [];
  for (const c of [[0, 0], [15, 0], [0, 15]]) {
    for (let i = 0; i < 12; i++) datos.push([c[0] + (i % 3) * 0.2, c[1] + (i % 4) * 0.2]);
  }
  const r = elegirK(datos, 2, 5, 42)!;
  assert.equal(r.k, 3);
  assert.ok(r.silueta > 0.7);
});

test('distanciaAlCentroide marca al intruso', () => {
  const datos = [[0, 0], [0.1, 0], [0, 0.1], [0.05, 0.05], [9, 9]];
  const m = kmeans(datos, 1, { semilla: 3 })!;
  const d = distanciaAlCentroide(datos, m);
  assert.ok(d[4] > Math.max(d[0], d[1], d[2], d[3]) * 3);
});

// ── Regresión logística ──
test('logística aprende una frontera separable', () => {
  const X: number[][] = [], y: number[] = [];
  for (let i = 0; i < 60; i++) {
    const v = i / 60;
    X.push([v]); y.push(v > 0.5 ? 1 : 0);
  }
  const m = entrenarLogistica(X, y, { tasa: 1, iteraciones: 4000, l2: 0 })!;
  assert.ok(predecirProbabilidad(m, [0.9]) > 0.7);
  assert.ok(predecirProbabilidad(m, [0.1]) < 0.3);
});

test('logística devuelve null con entrada vacía o desalineada', () => {
  assert.equal(entrenarLogistica([], []), null);
  assert.equal(entrenarLogistica([[1], [2]], [1]), null);
});

test('probabilidad siempre en [0,1] incluso con valores extremos', () => {
  const m = entrenarLogistica([[0], [1]], [0, 1], { iteraciones: 50 })!;
  for (const x of [-1e6, 0, 1e6]) {
    const p = predecirProbabilidad(m, [x]);
    assert.ok(p >= 0 && p <= 1, `p=${p} fuera de rango`);
  }
});

// ── Métricas ──
test('AUC = 1 con separación perfecta y 0.5 al azar constante', () => {
  assert.equal(auc([0.9, 0.8, 0.2, 0.1], [1, 1, 0, 0]), 1);
  assert.equal(auc([0.5, 0.5, 0.5, 0.5], [1, 1, 0, 0]), 0.5);
});

test('AUC = 0.5 cuando falta una de las clases', () => {
  assert.equal(auc([0.9, 0.8], [1, 1]), 0.5);
});

test('evaluar calcula precisión y sensibilidad correctamente', () => {
  //     p:  0.9  0.8  0.4  0.1
  //     y:   1    0    1    0     con umbral 0.5 → VP=1, FP=1, FN=1, VN=1
  const m = evaluar([0.9, 0.8, 0.4, 0.1], [1, 0, 1, 0]);
  assert.equal(m.n, 4);
  assert.equal(m.positivosReales, 2);
  assert.ok(Math.abs(m.precision - 0.5) < 1e-9);
  assert.ok(Math.abs(m.sensibilidad - 0.5) < 1e-9);
  assert.ok(Math.abs(m.exactitud - 0.5) < 1e-9);
});
