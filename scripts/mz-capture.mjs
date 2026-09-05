/**
 * Captura de referencia visual de la plantilla Modernize.
 * Herramienta de investigación puntual — no forma parte del build ni del CI.
 *
 *   node scripts/mz-capture.mjs discover   # descubre rutas del menú
 *   node scripts/mz-capture.mjs shoot <ruta> [<ruta>...]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://modernize-vuejs.adminmart.com';
const OUT = 'C:/Users/sansh/cmr-proyect/.mz-ref';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

mkdirSync(OUT, { recursive: true });

const [, , cmd, ...args] = process.argv;

const browser = await chromium.launch({ channel: 'chromium' });
const ctx = await browser.newContext({
  userAgent: UA,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

async function go(url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500); // deja asentar animaciones y gráficos
}

/** La demo trae usuario y contraseña ya rellenados: basta con enviar. */
async function login() {
  await go(`${BASE}/auth/login`);
  const btn = page.getByRole('button', { name: /sign in$/i }).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(4000);
  }
  console.log(`sesion -> ${page.url()}`);
}

if (cmd === 'discover') {
  await login();
  const links = await page.$$eval('a[href]', (as) =>
    [...new Set(as.map((a) => a.getAttribute('href')))]
      .filter((h) => h && h.startsWith('/') && !h.startsWith('//'))
      .sort()
  );
  writeFileSync(`${OUT}/routes.json`, JSON.stringify(links, null, 2));
  console.log(`rutas encontradas: ${links.length}`);
  console.log(links.join('\n'));
} else if (cmd === 'shoot') {
  await login(); // las rutas internas redirigen al login sin sesión
  for (const route of args) {
    const name = route.replace(/^\//, '').replace(/\//g, '_') || 'root';
    try {
      await go(BASE + route);
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
      console.log(`OK   ${route} -> ${name}.png`);
    } catch (e) {
      console.log(`FALLO ${route}: ${e.message.split('\n')[0]}`);
    }
  }
} else {
  console.log('uso: discover | shoot <ruta>...');
}

await browser.close();
