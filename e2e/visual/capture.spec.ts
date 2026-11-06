import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from '@playwright/test';
import { fileName, OUT, ROUTES_FILE, setDark, settle } from './routes';

/**
 * Fotografía cada pantalla de `routes.json` (lo genera discover.spec.ts) en la combinación de tamaño y tema del proyecto de
 * Playwright. Nunca falla por una pantalla: anota en el manifest si dio error de consola, si redirigió o si no cargó, y sigue.
 */
test('capturar pantallas', async ({ page }, info) => {
  test.setTimeout(30 * 60_000);
  if (!existsSync(ROUTES_FILE)) throw new Error(`Falta ${ROUTES_FILE}: corre antes el proyecto «descubrir».`);
  const { urls } = JSON.parse(readFileSync(ROUTES_FILE, 'utf8')) as { urls: string[] };
  const dark = !!info.project.metadata.dark;
  const dir = resolve(OUT, info.project.name);
  mkdirSync(dir, { recursive: true });

  let errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));

  const manifest: Array<{ url: string; file: string; finalUrl: string; errors: string[]; failed?: string }> = [];
  for (const url of urls) {
    errors = [];
    const file = `${fileName(url)}.png`;
    try {
      await page.goto(url);
      await settle(page);
      await setDark(page, dark);
      await page.screenshot({ path: resolve(dir, file), fullPage: true, animations: 'disabled', caret: 'hide' });
      manifest.push({ url, file, finalUrl: new URL(page.url()).pathname + new URL(page.url()).search, errors });
      console.log(`  ${info.project.name} ${manifest.length}/${urls.length} ${url}`);
    } catch (err) {
      manifest.push({ url, file, finalUrl: page.url(), errors, failed: err instanceof Error ? err.message.slice(0, 300) : String(err) });
    }
  }
  writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`${info.project.name}: ${manifest.filter((m) => !m.failed).length}/${urls.length} pantallas`);
});
