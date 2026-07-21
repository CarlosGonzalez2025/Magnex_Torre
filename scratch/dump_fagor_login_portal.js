import puppeteer from 'puppeteer-core';
import os from 'os';
import fs from 'fs';

function getChromePath() {
  const platform = os.platform();
  if (platform === 'win32') {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  }
  return 'chrome';
}

async function run() {
  console.log('Iniciando navegador...');
  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    headless: true
  });
  const page = await browser.newPage();
  
  try {
    const url = 'https://www.fagorsmartdata.com/es/login/';
    console.log(`Navegando a Fagor Login Link: ${url} ...`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('Navegación completada.');
    console.log('URL Final:', page.url());
    
    // Obtener todos los enlaces de la página
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(a => {
        return {
          text: a.innerText.trim(),
          href: a.href
        };
      });
    });
    
    console.log('Enlaces encontrados en la página de login:', JSON.stringify(links, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

run();
