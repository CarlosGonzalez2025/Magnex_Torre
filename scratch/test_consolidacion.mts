/**
 * Verificación de consolidarAlertasVivas() contra la secuencia REAL de PWQ878
 * (14 alertas idénticas cada ~5 min, tomadas de saved_alerts) y contra los
 * casos límite que importan: corte de racha, eventos distintos, idempotencia.
 */
import { consolidarAlertasVivas, VENTANA_CONSOLIDACION_MS } from '../services/alertService.ts';
import { AlertType, AlertSeverity, ApiSource } from '../types.ts';

const mk = (plate: string, ts: string, speed = 90, type = AlertType.SPEED_VIOLATION, idx = 0): any => ({
  id: `COL-${plate}-${idx}-${type}-${ts}`,
  vehicleId: `COL-${plate}-${idx}`,
  plate, type,
  severity: AlertSeverity.CRITICAL,
  timestamp: ts,
  location: 'La Jagua de Ibirico - Cesar',
  latitude: 0, longitude: 0, speed,
  driver: 'Sin Asignar', source: ApiSource.COLTRACK,
  contract: 'DRUMMOND-MANTENIMIENTO EQUIPO MOVIL',
  details: `Velocidad: ${speed} km/h (Límite: 80 km/h)`,
  sent: false,
});

let fallos = 0;
const check = (nombre: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '  OK  ' : '  FALLA'} ${nombre}${extra ? ' — ' + extra : ''}`);
  if (!ok) fallos++;
};

// ── 1. Secuencia real de PWQ878 (timestamps textuales de saved_alerts) ──────
const reales = [
  '2026-08-12T13:11:31.868Z', '2026-08-12T13:16:31.653Z', '2026-08-12T13:21:33.410Z',
  '2026-08-12T13:26:31.757Z', '2026-08-12T13:31:33.363Z', '2026-08-12T13:36:31.662Z',
  '2026-08-12T13:41:33.690Z', '2026-08-12T13:46:31.650Z', '2026-08-12T13:51:35.338Z',
  '2026-08-12T13:56:33.135Z', '2026-08-12T14:01:34.351Z', '2026-08-12T14:06:34.125Z',
  '2026-08-12T14:11:33.920Z', '2026-08-12T14:15:31.610Z',
];
// El índice alterna como en los datos reales (COL-PWQ878-39 / -35).
const lote = reales.map((ts, i) => mk('PWQ878', ts, 90, AlertType.SPEED_VIOLATION, i % 2 ? 39 : 35));

console.log('\n=== 1. Secuencia real PWQ878 (14 reportes en 64 min) ===');
const r1 = consolidarAlertasVivas(lote);
console.log(`  entrada: ${lote.length} alertas -> salida: ${r1.length}`);
r1.forEach(a => console.log(`     ancla=${a.timestamp} occurrences=${a.occurrences} lastSeen=${a.lastSeenAt}`));
// La ventana mide el SILENCIO entre reportes, no cubos fijos de 30 min: como
// PWQ878 reporta cada 5 min sin parar, la racha nunca se corta y queda una sola
// fila que sigue contando. Es el comportamiento buscado ("persiste desde...").
check('colapsa a UNA racha continua', r1.length === 1);
check('conserva los 14 reportes en total', r1.reduce((s, a) => s + (a.occurrences ?? 0), 0) === 14);
check('el ancla es el primer reporte', r1[0].timestamp === reales[0]);
check('el último visto es el reporte más reciente', r1[0].lastSeenAt === reales[reales.length - 1]);
check('inmune al índice inestable de Coltrack', r1.length < lote.length);

// ── 2. Simulación ciclo a ciclo (como corre App.tsx) ────────────────────────
console.log('\n=== 2. Simulación de refrescos de 5 min ===');
let almacenadas: any[] = [];
let persistidas = 0;
for (const ts of reales) {
  const idsPrevios = new Set(almacenadas.map(a => a.id));
  almacenadas = consolidarAlertasVivas([...almacenadas, mk('PWQ878', ts)]);
  persistidas += almacenadas.filter(a => !idsPrevios.has(a.id)).length;
}
console.log(`  filas en el panel: ${almacenadas.length}  |  inserciones en saved_alerts: ${persistidas}`);
check('el panel muestra 1 fila en vez de 14', almacenadas.length === 1);
check('solo se persiste 1 fila (antes 14)', persistidas === 1);
check('la fila viva refleja los 14 reportes', almacenadas[0].occurrences === 14);

// ── 3. Corte de racha: 45 min de silencio = evento nuevo ────────────────────
console.log('\n=== 3. Corte de racha ===');
const r3 = consolidarAlertasVivas([
  mk('AAA111', '2026-08-12T10:00:00.000Z'),
  mk('AAA111', '2026-08-12T10:05:00.000Z'),
  mk('AAA111', '2026-08-12T10:50:00.000Z'), // +45 min
]);
check('45 min de silencio abren evento nuevo', r3.length === 2, `rachas=${r3.length}`);
check('la primera racha acumuló 2 reportes', r3[0].occurrences === 2);

// ── 4. No mezcla placas ni tipos distintos ──────────────────────────────────
console.log('\n=== 4. Separación por placa y tipo ===');
const r4 = consolidarAlertasVivas([
  mk('AAA111', '2026-08-12T10:00:00.000Z'),
  mk('BBB222', '2026-08-12T10:01:00.000Z'),
  mk('AAA111', '2026-08-12T10:02:00.000Z', 90, AlertType.IDLE_EXCESSIVE),
]);
check('placas y tipos distintos no se fusionan', r4.length === 3, `rachas=${r4.length}`);

// ── 5. Idempotencia y peor lectura ─────────────────────────────────────────
console.log('\n=== 5. Idempotencia y magnitud ===');
const base = consolidarAlertasVivas([
  mk('CCC333', '2026-08-12T10:00:00.000Z', 85),
  mk('CCC333', '2026-08-12T10:05:00.000Z', 110),
  mk('CCC333', '2026-08-12T10:10:00.000Z', 90),
]);
const rerun = consolidarAlertasVivas(base);
check('reprocesar no altera el conteo', rerun[0].occurrences === base[0].occurrences && base[0].occurrences === 3);
check('conserva la velocidad máxima de la racha', base[0].speed === 110, `speed=${base[0].speed}`);
check('reprocesar no altera la velocidad', rerun[0].speed === 110);

// ── 6. Ventana configurada ─────────────────────────────────────────────────
console.log('\n=== 6. Ventana ===');
check('la ventana es 30 min y supera el refresco de 5 min',
  VENTANA_CONSOLIDACION_MS === 30 * 60 * 1000 && VENTANA_CONSOLIDACION_MS > 5 * 60 * 1000);

console.log(fallos === 0 ? '\nTODAS LAS COMPROBACIONES PASARON\n' : `\n${fallos} COMPROBACIONES FALLARON\n`);
process.exit(fallos === 0 ? 0 : 1);
