/**
 * Suite mínima de regresión para la agregación de ralentí normalizada.
 * Ejecutar (Node 22.6+ con type-stripping, o Node 23.6+/24 nativo):
 *   node --test services/ralentiMetrics.test.ts
 *
 * Blinda el bug de docs/DIAGNOSTICO_RALENTI_Q1_JUNIO_2026.md: las filas con encendido=0
 * pero ralentí>0 NO deben inflar el % Ralentí, y la identidad Motor = Conducción + Ralentí
 * debe cumplirse sobre el universo con motor>0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMotorMetrics,
  identityDeviation,
  IDENTIDAD_TOLERANCIA,
  type RalentiPeriodoRow,
} from './ralentiMetrics.ts';

test('identidad Motor = Conducción + Ralentí se cumple (caso sano)', () => {
  const rows: RalentiPeriodoRow[] = [
    { vehiculo_id: 'a', horas_motor_encendido: 100, horas_motor_ralenti: 40, kms_recorridos: 600 },
    { vehiculo_id: 'b', horas_motor_encendido: 50, horas_motor_ralenti: 10, kms_recorridos: 300 },
  ];
  const m = computeMotorMetrics(rows);
  assert.equal(m.totalHorasEncendido, 150);
  assert.equal(m.totalHorasRalenti, 50);
  assert.equal(m.horasConduccion, 100); // 150 − 50
  assert.ok(Math.abs(m.pctRalenti - (50 / 150) * 100) < 1e-9);
  assert.ok(identityDeviation(m) < IDENTIDAD_TOLERANCIA);
  assert.equal(m.datoInconsistente, false);
});

test('las filas huérfanas (encendido=0, ralentí>0) NO inflan el % Ralentí', () => {
  // Reproduce el bug de Abr Q1: 1 vehículo sano + 1 huérfano con mucho ralentí.
  const rows: RalentiPeriodoRow[] = [
    { vehiculo_id: 'a', horas_motor_encendido: 100, horas_motor_ralenti: 40, kms_recorridos: 600 },
    { vehiculo_id: 'orphan', horas_motor_encendido: 0, horas_motor_ralenti: 80, kms_recorridos: 0 },
  ];
  const m = computeMotorMetrics(rows);
  // El denominador solo cuenta el vehículo con motor; el ralentí huérfano queda fuera del %.
  assert.equal(m.totalHorasEncendido, 100);
  assert.equal(m.totalHorasRalenti, 40);
  assert.equal(m.ralentiHuerfano, 80);
  assert.ok(Math.abs(m.pctRalenti - 40) < 1e-9, `pctRalenti=${m.pctRalenti} debía ser 40`);
  // Antes del fix, el % habría sido (40+80)/100 = 120% (imposible).
  assert.ok(m.pctRalenti <= 100);
  // Cobertura 1/2 = 50% < 98% → dato inconsistente.
  assert.equal(m.vehiculosConMotor, 1);
  assert.equal(m.vehiculosActivos, 2);
  assert.equal(m.datoInconsistente, true);
});

test('bandera de cobertura: <98% marca dato inconsistente', () => {
  const rows: RalentiPeriodoRow[] = [];
  for (let i = 0; i < 98; i++) rows.push({ vehiculo_id: `m${i}`, horas_motor_encendido: 10, horas_motor_ralenti: 2 });
  for (let i = 0; i < 3; i++) rows.push({ vehiculo_id: `o${i}`, horas_motor_encendido: 0, horas_motor_ralenti: 5 });
  const m = computeMotorMetrics(rows); // 98/101 = 97.03%
  assert.ok(m.coberturaMotorPct < 98);
  assert.equal(m.datoInconsistente, true);
});

test('violación física ralentí > encendido se cuenta y marca inconsistente', () => {
  const rows: RalentiPeriodoRow[] = [
    { vehiculo_id: 'a', horas_motor_encendido: 100, horas_motor_ralenti: 40 },
    { vehiculo_id: 'bad', horas_motor_encendido: 10, horas_motor_ralenti: 25 }, // ralentí>encendido
  ];
  const m = computeMotorMetrics(rows);
  assert.equal(m.filasRalentiMayorEnc, 1);
  assert.equal(m.datoInconsistente, true);
});

test('métricas de eficiencia: velocidad media y km/h ralentí', () => {
  const rows: RalentiPeriodoRow[] = [
    { vehiculo_id: 'a', horas_motor_encendido: 100, horas_motor_ralenti: 20, kms_recorridos: 800 },
  ];
  const m = computeMotorMetrics(rows);
  assert.equal(m.horasConduccion, 80);
  assert.ok(Math.abs(m.velocidadMedia - 800 / 80) < 1e-9); // 10 km/h
  assert.ok(Math.abs(m.kmPorHoraRalenti - 800 / 20) < 1e-9); // 40 km/h ralentí
  assert.ok(Math.abs(m.kmPorVehiculoActivo - 800) < 1e-9);
});

test('período vacío / sin motor no rompe (guards de división por cero)', () => {
  const m = computeMotorMetrics([{ vehiculo_id: 'x', horas_motor_encendido: 0, horas_motor_ralenti: 0 }]);
  assert.equal(m.pctRalenti, 0);
  assert.equal(m.horasConduccion, 0);
  assert.equal(m.velocidadMedia, 0);
  assert.equal(m.kmPorHoraRalenti, 0);
  assert.equal(identityDeviation(m), 0);
});

test('acepta strings numéricos (defensivo ante datos de Supabase)', () => {
  const rows: RalentiPeriodoRow[] = [
    { vehiculo_id: 'a', horas_motor_encendido: '100', horas_motor_ralenti: '40', kms_recorridos: '600' },
  ];
  const m = computeMotorMetrics(rows);
  assert.equal(m.totalHorasEncendido, 100);
  assert.equal(m.totalHorasRalenti, 40);
});

test('un vehículo que no salió no cuenta contra la cobertura de motor', () => {
  // Caso real de Q2 de agosto de 2026 en Coltrack, a escala: de 43 filas sin horas de
  // motor, 38 eran vehículos quietos (todo en cero) y solo 5 tenían ralentí sin motor.
  // Antes, las 38 hundían la cobertura al 85% y marcaban la quincena como inconsistente.
  const rows: RalentiPeriodoRow[] = [
    { vehiculo_id: 'opera', horas_motor_encendido: 100, horas_motor_ralenti: 40, kms_recorridos: 600 },
    // Vehículo que no salió: todo en cero. No es un hueco de datos.
    { vehiculo_id: 'quieto1', horas_motor_encendido: 0, horas_motor_ralenti: 0, kms_recorridos: 0 },
    { vehiculo_id: 'quieto2', horas_motor_encendido: 0, horas_motor_ralenti: 0, kms_recorridos: 0 },
  ];
  const m = computeMotorMetrics(rows);
  assert.equal(m.vehiculosActivos, 3);       // el censo del período no cambia
  assert.equal(m.vehiculosSinActividad, 2);
  assert.equal(m.coberturaMotorPct, 100);    // 1 de 1 que sí operó
  assert.equal(m.datoInconsistente, false);
});

test('un vehículo con ralentí pero sin horas de motor SÍ rompe la cobertura', () => {
  // La contrapartida: esto sí es un dato que falta, y la bandera tiene que encenderse.
  const rows: RalentiPeriodoRow[] = [
    { vehiculo_id: 'opera', horas_motor_encendido: 100, horas_motor_ralenti: 40, kms_recorridos: 600 },
    { vehiculo_id: 'quieto', horas_motor_encendido: 0, horas_motor_ralenti: 0, kms_recorridos: 0 },
    { vehiculo_id: 'roto', horas_motor_encendido: 0, horas_motor_ralenti: 3.81, ralentis_excesivos: 30 },
  ];
  const m = computeMotorMetrics(rows);
  assert.equal(m.vehiculosSinActividad, 1);  // solo el quieto
  assert.equal(m.coberturaMotorPct, 50);     // 1 con motor de 2 que operaron
  assert.equal(m.datoInconsistente, true);
  assert.equal(m.ralentiHuerfano, 3.81);     // sus horas siguen reportándose aparte
});

test('un vehículo con eventos o galones pero todo lo demás en cero NO es "sin actividad"', () => {
  // Que solo llegara el semanal de excesos no convierte al vehículo en quieto.
  const rows: RalentiPeriodoRow[] = [
    { vehiculo_id: 'a', horas_motor_encendido: 100, horas_motor_ralenti: 20 },
    { vehiculo_id: 'soloGalones', horas_motor_encendido: 0, horas_motor_ralenti: 0, consumo_combustible: 0.14 },
    { vehiculo_id: 'soloEventos', horas_motor_encendido: 0, horas_motor_ralenti: 0, ralentis_excesivos: 4 },
  ];
  const m = computeMotorMetrics(rows);
  assert.equal(m.vehiculosSinActividad, 0);
  assert.ok(m.coberturaMotorPct < 40); // 1 de 3 operaron con motor conocido
  assert.equal(m.datoInconsistente, true);
});
