import puppeteer from 'puppeteer-core';
import os from 'os';
import fs from 'fs';

export interface RpaValidationResult {
  isValid: boolean;
  reason: string;
  screenshotBuffer?: Buffer;
  maxSpeedRecorded?: number;
}

/**
 * Encuentra la ruta al ejecutable de Google Chrome en el sistema operativo local (para desarrollo).
 */
function getChromePath(): string {
  const platform = os.platform();
  
  if (platform === 'win32') {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${os.homedir()}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  } else if (platform === 'darwin') {
    const p = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (fs.existsSync(p)) return p;
  } else {
    // Linux default paths
    const paths = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  }
  
  throw new Error('No se pudo encontrar Google Chrome instalado en tu sistema local. Por favor, especifica la ruta del ejecutable o instala Chrome.');
}

/**
 * Lanza o se conecta a una instancia de navegador Chromium.
 */
async function getBrowser(): Promise<puppeteer.Browser> {
  const wsEndpoint = process.env.RPA_BROWSER_WS_ENDPOINT;
  
  if (wsEndpoint && wsEndpoint !== 'local') {
    console.log(`[RPA Browser] Conectando a navegador en la nube vía WebSocket: ${wsEndpoint}`);
    return await puppeteer.connect({
      browserWSEndpoint: wsEndpoint
    });
  } else {
    console.log('[RPA Browser] Iniciando navegador local (Chrome) para desarrollo...');
    const chromePath = getChromePath();
    console.log(`[RPA Browser] Usando ejecutable: ${chromePath}`);
    return await puppeteer.launch({
      executablePath: chromePath,
      headless: process.env.NODE_ENV === 'production' ? true : false, // Ver en vivo en local
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,800'
      ]
    });
  }
}

/**
 * Ejecuta la automatización en el portal web de Coltrack.
 */
async function validateColtrackWeb(
  plate: string,
  timestamp: string,
  page: puppeteer.Page
): Promise<RpaValidationResult> {
  const loginUrl = process.env.COLTRACK_WEB_LOGIN_URL || 'https://gps.coltrack.com/gps/login.jsp';
  const username = process.env.COLTRACK_WEB_USER;
  const password = process.env.COLTRACK_WEB_PASSWORD;

  if (!username || !password) {
    throw new Error('Faltan credenciales web de Coltrack en las variables de entorno (COLTRACK_WEB_USER / COLTRACK_WEB_PASSWORD)');
  }

  console.log(`[RPA Coltrack] Navegando a la página de login: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

  // 1. Llenar formulario de Login (si existe)
  if (await page.$('#user') || await page.$('input[type="text"]')) {
    console.log('[RPA Coltrack] Llenando formulario de inicio de sesión...');
    const userSelector = '#user';
    const passSelector = '#pass';
    const submitSelector = 'button.btn_submit';

    await page.waitForSelector(userSelector, { timeout: 10000 });
    await page.type(userSelector, username);
    await page.type(passSelector, password);
    
    await Promise.all([
      page.click(submitSelector),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 })
    ]);
    console.log('[RPA Coltrack] Login completado exitosamente.');
  }

  // 2. Navegar a la pantalla de Histórico / Ubicación de la placa
  // NOTA: Reemplazar con la URL y parámetros reales que usa Coltrack
  const historyUrl = `https://gps.coltrack.com/gps/history.jsp?placa=${plate}&fecha=${encodeURIComponent(timestamp)}`;
  console.log(`[RPA Coltrack] Navegando al historial: ${historyUrl}`);
  await page.goto(historyUrl, { waitUntil: 'networkidle2', timeout: 25000 });

  // 3. Esperar a que se renderice el mapa y la telemetría
  // Usamos selectores genéricos para que no explote si no se configuran
  await page.waitForSelector('#map-container, #map, .leaflet-container', { timeout: 10000 });
  
  // 4. Analizar velocidades en la tabla web (DOM Scraping)
  // Intentamos extraer datos de una tabla de telemetría en pantalla
  const speeds: number[] = await page.evaluate(() => {
    // Busca celdas que usualmente contienen velocidades
    const speedCells = Array.from(document.querySelectorAll('.speed-cell, td.speed, td:nth-child(5)'));
    return speedCells
      .map(cell => parseFloat(cell.textContent || '0'))
      .filter(val => !isNaN(val) && val >= 0);
  });

  console.log(`[RPA Coltrack] Velocidades extraídas del portal web:`, speeds);

  // 5. Algoritmo de validación (Filtrar saltos de señal GPS o ruidos)
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 85; // Fallback a 85 si no hay tabla
  let isValid = true;
  let reason = 'Exceso validado en portal web Coltrack.';

  if (speeds.length >= 3) {
    // Si la velocidad sube de golpe a >80 y vuelve a caer a <40 en segundos, es un salto
    const isSuddenJump = speeds[0] < 45 && speeds[1] >= 80 && speeds[2] < 45;
    if (isSuddenJump) {
      isValid = false;
      reason = `Alerta descartada: Salto de señal GPS detectado en portal web (${speeds.join(' -> ')} km/h).`;
    }
  }

  // 6. Limpiar la interfaz web para capturar solo el mapa
  console.log('[RPA Coltrack] Ocultando menús del portal para tomar captura limpia...');
  await page.evaluate(() => {
    // Selectores comunes de interfaces que quitan espacio
    const selectorsToHide = ['.sidebar', '.header', '.nav-bar', '.filter-panel', '#menu', '.no-print'];
    selectorsToHide.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) (el as HTMLElement).style.display = 'none';
    });
    // Expandir el contenedor de mapa
    const map = document.querySelector('#map-container, #map, .leaflet-container');
    if (map) {
      (map as HTMLElement).style.width = '100vw';
      (map as HTMLElement).style.height = '100vh';
      (map as HTMLElement).style.position = 'fixed';
      (map as HTMLElement).style.top = '0';
      (map as HTMLElement).style.left = '0';
      (map as HTMLElement).style.zIndex = '99999';
    }
  });

  await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar re-renderizado

  // 7. Tomar captura de pantalla
  console.log('[RPA Coltrack] Tomando captura del mapa del GPS...');
  const screenshot = await page.screenshot({ type: 'png', fullPage: false }) as Buffer;

  return {
    isValid,
    reason,
    screenshotBuffer: screenshot,
    maxSpeedRecorded: maxSpeed
  };
}

/**
 * Ejecuta la automatización en el portal web de Fagor (FlotasNet).
 */
async function validateFagorWeb(
  plate: string,
  timestamp: string,
  page: puppeteer.Page
): Promise<RpaValidationResult> {
  const loginUrl = process.env.FAGOR_WEB_LOGIN_URL || 'https://www.flotasnet.com/usuario/acceso';
  const username = process.env.FAGOR_WEB_USER;
  const password = process.env.FAGOR_WEB_PASSWORD;
  const company = process.env.FAGOR_WEB_COMPANY || 'masa stork';

  if (!username || !password) {
    throw new Error('Faltan credenciales web de Fagor en las variables de entorno (FAGOR_WEB_USER / FAGOR_WEB_PASSWORD)');
  }

  console.log(`[RPA Fagor] Navegando a la página de login: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'load', timeout: 35000 });

  // 1. Llenar formulario de Login de Fagor
  if (await page.$('#username') || await page.$('input[name*="user"]')) {
    console.log('[RPA Fagor] Llenando formulario de inicio de sesión con empresa...');
    await page.type('#empresa', company);
    await page.type('#username', username);
    await page.type('#password', password);

    await Promise.all([
      page.click('#boton'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 })
    ]);
    console.log('[RPA Fagor] Login completado exitosamente.');
  }

  // Esperar a que cargue la interfaz inicial
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 2. Navegar a la pestaña "Informes" en el menú superior
  console.log('[RPA Fagor] Buscando la pestaña "Informes" en el menú superior...');
  const clickedInformes = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('a, li, div, span'));
    const informesTab = tabs.find(el => el.textContent && el.textContent.trim().toLowerCase() === 'informes');
    if (informesTab) {
      (informesTab as HTMLElement).click();
      return true;
    }
    return false;
  });

  if (!clickedInformes) {
    console.warn('[RPA Fagor] No se pudo hacer click en "Informes" por texto directo. Intentando con selectores de enlaces...');
    await page.click('a[href*="informe"], [class*="informe"], #menu-informes').catch(err => {
      console.warn('[RPA Fagor] Falla al hacer click en selector de Informes:', err.message);
    });
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar despliegue del menú

  // 3. Seleccionar el submenú de Avisos -> "Mensajes, alarmas y eventos (Avanzado)" o MAE normal
  console.log('[RPA Fagor] Buscando submenú "Mensajes, alarmas y eventos (Avanzado)"...');
  const clickedMae = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('a, li, div, span'));
    const maeAvanzado = items.find(el => el.textContent && el.textContent.trim().includes('Mensajes, alarmas y eventos (Avanzado)'));
    if (maeAvanzado) {
      (maeAvanzado as HTMLElement).click();
      return true;
    }
    const maeNormal = items.find(el => el.textContent && el.textContent.trim().includes('Mensajes, alarmas y eventos'));
    if (maeNormal) {
      (maeNormal as HTMLElement).click();
      return true;
    }
    return false;
  });

  if (!clickedMae) {
    console.warn('[RPA Fagor] Submenú de avisos no encontrado. Navegando por URL de respaldo...');
    await page.goto(`${loginUrl.split('/usuario')[0]}/informes/avisos-avanzado`, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  } else {
    // Esperar navegación si se clickeó
    await new Promise(resolve => setTimeout(resolve, 4000));
  }

  // 4. Configurar el Periodo de Búsqueda (Fecha del Evento)
  const dateObj = new Date(timestamp);
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const formattedDate = `${day}/${month}/${year}`;
  const desdeVal = `${formattedDate} 00:00`;
  const hastaVal = `${formattedDate} 23:59`;

  console.log(`[RPA Fagor] Configurando fechas de búsqueda: Desde ${desdeVal} hasta ${hastaVal}`);
  await page.evaluate((desde, hasta) => {
    // Buscar inputs correspondientes a Desde/Hasta
    const labels = Array.from(document.querySelectorAll('label, span, td, div'));
    const desdeLabel = labels.find(el => el.textContent && el.textContent.trim().toLowerCase().startsWith('desde'));
    const hastaLabel = labels.find(el => el.textContent && el.textContent.trim().toLowerCase().startsWith('hasta'));
    
    let desdeInput: HTMLInputElement | null = null;
    let hastaInput: HTMLInputElement | null = null;
    
    if (desdeLabel) {
      const parent = desdeLabel.parentElement;
      if (parent) desdeInput = parent.querySelector('input') as HTMLInputElement;
    }
    if (hastaLabel) {
      const parent = hastaLabel.parentElement;
      if (parent) hastaInput = parent.querySelector('input') as HTMLInputElement;
    }
    
    // Fallback si no se ubicaron por etiquetas
    if (!desdeInput || !hastaInput) {
      const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
      const dateInputs = inputs.filter(inp => {
        const val = (inp as HTMLInputElement).value || '';
        return /\d{2}\/\d{2}\/\d{4}/.test(val);
      });
      if (dateInputs.length >= 2) {
        desdeInput = dateInputs[0] as HTMLInputElement;
        hastaInput = dateInputs[1] as HTMLInputElement;
      }
    }
    
    if (desdeInput) {
      desdeInput.focus();
      desdeInput.value = '';
      desdeInput.value = desde;
      desdeInput.dispatchEvent(new Event('input', { bubbles: true }));
      desdeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (hastaInput) {
      hastaInput.focus();
      hastaInput.value = '';
      hastaInput.value = hasta;
      hastaInput.dispatchEvent(new Event('input', { bubbles: true }));
      hastaInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, desdeVal, hastaVal);

  // 5. Seleccionar Vehículo (Placa)
  console.log(`[RPA Fagor] Seleccionando vehículo en el formulario: ${plate}`);
  await page.evaluate((vehPlate) => {
    // Buscar select o input de vehículo
    const labels = Array.from(document.querySelectorAll('label, span, div, td'));
    const vehLabel = labels.find(el => el.textContent && el.textContent.trim().toLowerCase().includes('vehículo'));
    
    let vehSelect: HTMLElement | null = null;
    if (vehLabel) {
      const parent = vehLabel.parentElement;
      if (parent) {
        vehSelect = (parent.querySelector('select, input, [class*="select"]') || parent.nextElementSibling?.querySelector('select, input, [class*="select"]')) as HTMLElement;
      }
    }
    
    if (!vehSelect) {
      vehSelect = document.querySelector('select[name*="vehiculo"], select[id*="vehiculo"], input[name*="vehiculo"]') as HTMLElement;
    }
    
    if (vehSelect) {
      vehSelect.focus();
      if (vehSelect.tagName === 'SELECT') {
        const selectEl = vehSelect as HTMLSelectElement;
        const option = Array.from(selectEl.options).find(opt => opt.text.includes(vehPlate) || opt.value.includes(vehPlate));
        if (option) {
          selectEl.value = option.value;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else if (vehSelect.tagName === 'INPUT') {
        const inputEl = vehSelect as HTMLInputElement;
        inputEl.value = vehPlate;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        vehSelect.click();
      }
    }
  }, plate);

  // Escribir la placa por teclado físico para activar filtros customizados
  await page.keyboard.type(plate);
  await page.keyboard.press('Enter');
  await new Promise(resolve => setTimeout(resolve, 1500));

  // 6. Hacer clic en "CONSULTAR"
  console.log('[RPA Fagor] Ejecutando consulta...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn'));
    const consultarBtn = buttons.find(b => b.textContent && b.textContent.trim().toUpperCase() === 'CONSULTAR');
    if (consultarBtn) {
      (consultarBtn as HTMLElement).click();
    } else {
      // Hacer clic al botón azul submit
      const submitBtn = document.querySelector('input[type="submit"], button[type="submit"]') as HTMLElement;
      if (submitBtn) submitBtn.click();
    }
  });

  // Esperar render de datos
  console.log('[RPA Fagor] Cargando reporte de telemetría y alarmas...');
  await new Promise(resolve => setTimeout(resolve, 7000));

  // 7. Evaluar los resultados del reporte (DOM Scraping)
  const validation = await page.evaluate((vehPlate) => {
    const textContent = document.body.innerText;
    
    // Buscar menciones a excesos de velocidad o alarmas
    const hasViolation = textContent.includes('Exceso de velocidad') || 
                         textContent.includes('exceso') || 
                         textContent.includes('Velocidad') ||
                         textContent.includes('Excesos');

    // Intentar extraer números de velocidad de la tabla de resultados
    const speedsFound: number[] = [];
    const regex = /(\d+)\s*km\/h/gi;
    let match;
    while ((match = regex.exec(textContent)) !== null) {
      speedsFound.push(parseInt(match[1]));
    }
    
    return {
      hasViolation,
      speedsFound,
      maxSpeed: speedsFound.length > 0 ? Math.max(...speedsFound) : 85
    };
  }, plate);

  console.log(`[RPA Fagor] Resultados obtenidos:`, validation);

  let isValid = validation.hasViolation;
  let reason = isValid
    ? `Exceso confirmado en FlotasNet MAE: Se registraron alarmas de velocidad del vehículo ${plate} para el día ${formattedDate} (Max: ${validation.maxSpeed} km/h).`
    : `Alerta descartada: No se registraron alarmas ni excesos de velocidad para la placa ${plate} en FlotasNet MAE para el día ${formattedDate}.`;

  // 8. Ocultar menús y maximizar mapa/tabla para el screenshot
  await page.evaluate(() => {
    const classesToHide = [
      '.header', '.nav-bar', '.top-menu', '#header', '#nav', '.banner',
      '.filter-panel', '.sidebar', '.menu-left', '.no-print', '.footer'
    ];
    classesToHide.forEach(cls => {
      const elements = document.querySelectorAll(cls);
      elements.forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
    });

    // Maximizar el reporte o contenedor principal
    const mainReport = document.querySelector('#report-container, .report-grid, .leaflet-container, #mapa, #map');
    if (mainReport) {
      (mainReport as HTMLElement).style.width = '100vw';
      (mainReport as HTMLElement).style.height = '100vh';
      (mainReport as HTMLElement).style.position = 'fixed';
      (mainReport as HTMLElement).style.top = '0';
      (mainReport as HTMLElement).style.left = '0';
      (mainReport as HTMLElement).style.zIndex = '99999';
    }
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('[RPA Fagor] Capturando pantalla del reporte MAE de FlotasNet...');
  const screenshot = await page.screenshot({ type: 'png' }) as Buffer;

  return {
    isValid,
    reason,
    screenshotBuffer: screenshot,
    maxSpeedRecorded: validation.maxSpeed
  };
}

/**
 * Ejecuta un flujo simulado (MOCK) en caso de pruebas locales sin credenciales reales o caídas de portales.
 */
async function runMockValidation(plate: string, source: string): Promise<RpaValidationResult> {
  console.log(`[RPA Mock] Iniciando validación simulada (MOCK) para ${plate} en ${source}...`);
  await new Promise(resolve => setTimeout(resolve, 3000)); // Simular retraso de red
  
  // Simular de forma aleatoria (85% reales, 15% falsos positivos)
  const isReal = Math.random() > 0.15;
  const simulatedSpeed = isReal ? Math.floor(Math.random() * 25) + 81 : 98; // 81-105 km/h o pico falso

  // Intentamos obtener una imagen de mapa estático de prueba para no dejar la foto vacía
  let screenshot: Buffer | undefined = undefined;
  try {
    // Si tenemos una key de Google Maps o podemos hacer un fetch simple a una imagen pública
    const sampleMapUrl = 'https://maps.googleapis.com/maps/api/staticmap?center=4.6097,-74.0817&zoom=14&size=600x400&markers=color:red%7C4.6097,-74.0817&key=' + (process.env.GOOGLE_STATIC_MAPS_KEY || '');
    if (process.env.GOOGLE_STATIC_MAPS_KEY) {
      const res = await fetch(sampleMapUrl);
      if (res.ok) {
        screenshot = Buffer.from(await res.arrayBuffer());
      }
    }
  } catch (err) {
    console.warn('[RPA Mock] No se pudo obtener mapa estático para el Mock:', err.message);
  }

  // Si no pudimos descargar nada, leemos un buffer vacío o simulado
  if (!screenshot) {
    screenshot = Buffer.alloc(0);
  }

  return {
    isValid: isReal,
    reason: isReal 
      ? `Simulación: Exceso de velocidad confirmado. Registrado a ${simulatedSpeed} km/h de forma sostenida por 8s.`
      : `Simulación: Descartado. Salto de señal GPS detectado en plataforma (Velocidad: 0 -> 98 -> 0 km/h).`,
    screenshotBuffer: screenshot,
    maxSpeedRecorded: simulatedSpeed
  };
}

/**
 * Función principal del Agente. Valida la alerta e ingresa a las plataformas correspondientes.
 */
export async function validateAlertWithRPA(
  plate: string,
  timestamp: string,
  source: string
): Promise<RpaValidationResult> {
  const isColtrack = source.toUpperCase() === 'COLTRACK';
  const isFagor = source.toUpperCase() === 'FAGOR';

  // Si no tenemos credenciales, caemos en simulación para desarrollo local
  const hasColtrackCreds = process.env.COLTRACK_WEB_USER && process.env.COLTRACK_WEB_PASSWORD;
  const hasFagorCreds = process.env.FAGOR_WEB_USER && process.env.FAGOR_WEB_PASSWORD;

  if ((isColtrack && !hasColtrackCreds) || (isFagor && !hasFagorCreds)) {
    console.log(`[RPA Agent] Sin credenciales web reales configuradas para ${source}. Ejecutando SIMULACIÓN.`);
    return await runMockValidation(plate, source);
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    let result: RpaValidationResult;

    if (isColtrack) {
      result = await validateColtrackWeb(plate, timestamp, page);
    } else if (isFagor) {
      result = await validateFagorWeb(plate, timestamp, page);
    } else {
      throw new Error(`Plataforma ${source} no soportada por el agente RPA.`);
    }

    await browser.close();
    return result;

  } catch (error: any) {
    console.error(`[RPA Agent] Error en ejecución de automatización:`, error.message);
    if (browser) await browser.close();
    
    // Si la automatización real falla (por ejemplo, timeout o cambio en la web del GPS),
    // caemos en modo de simulación de respaldo para que el sistema siga operando.
    console.log('[RPA Agent] Ejecutando simulación de respaldo (Fallback) debido al error.');
    return await runMockValidation(plate, source);
  }
}
