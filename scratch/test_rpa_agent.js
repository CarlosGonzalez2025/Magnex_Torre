import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { validateAlertWithRPA } from '../services/rpaValidationService.js';

// Cargar .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  console.log(`[Test RPA] Cargando variables desde: ${envPath}`);
  dotenv.config({ path: envPath });
} else {
  console.warn('[Test RPA] No se encontró el archivo .env.local. Usando variables de entorno actuales.');
}

// Analizar argumentos de consola
const args = process.argv.slice(2);
const platformArg = args.find(a => a.startsWith('--platform='))?.split('=')[1] || 'coltrack';
const plateArg = args.find(a => a.startsWith('--plate='))?.split('=')[1] || 'LHR713';
const timestampArg = args.find(a => a.startsWith('--time='))?.split('=')[1] || new Date().toISOString();

console.log('\n═══════════════════════════════════════════════════════════');
console.log('       EJECUTANDO PRUEBA DE AGENTE RPA DE TELEMETRÍA       ');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  🛰️  Plataforma:  ${platformArg.toUpperCase()}`);
console.log(`  🚗  Vehículo:    ${plateArg}`);
console.log(`  🕐  Hora Alerta: ${timestampArg}`);
console.log(`  🌐  Navegador:   ${process.env.RPA_BROWSER_WS_ENDPOINT || 'local'}`);
console.log('═══════════════════════════════════════════════════════════\n');

async function run() {
  try {
    const result = await validateAlertWithRPA(plateArg, timestampArg, platformArg);
    
    console.log('\n═══════════════════════ RESULTADOS ═══════════════════════');
    console.log(`  ✅ ¿Alerta Real?: ${result.isValid ? 'SÍ (Confirmada)' : 'NO (Falso Positivo Descartado)'}`);
    console.log(`  📝 Motivo:        ${result.reason}`);
    console.log(`  ⚡ Vel. Máxima:   ${result.maxSpeedRecorded} km/h`);
    console.log('═══════════════════════════════════════════════════════════\n');

    if (result.screenshotBuffer && result.screenshotBuffer.length > 0) {
      const outPath = path.resolve(__dirname, 'screenshot_prueba.png');
      fs.writeFileSync(outPath, result.screenshotBuffer);
      console.log(`📸 Captura de pantalla guardada con éxito en: ${outPath}\n`);
    } else {
      console.log('⚠️  No se generó captura de pantalla (modo simulación o error).\n');
    }
  } catch (error) {
    console.error('❌ Error en ejecución de la prueba:', error);
  }
}

run();
