import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { hasParams, OUT, patternOf, PROJECT_VIEWS, ROUTES_FILE, routerPaths, settle } from './routes';

/**
 * Resuelve las rutas con parámetro (`/customers/:id`) a una URL real, una sola vez para las cuatro combinaciones de captura:
 *
 * 1. Recorre las pantallas sin parámetro y junta sus enlaces (`<a href>`).
 * 2. Para lo que siga sin resolver, abre la lista «madre» (la ruta sin el parámetro) y hace clic en la primera fila, tarjeta o
 *    elemento de lista; si la URL resultante encaja, sirve.
 *
 * Lo que no se resuelva (no hay datos de ese tipo en la base local) queda en `unresolved` y no se fotografía.
 */
test('descubrir rutas', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  const all = routerPaths();
  const fixed = all.filter((p) => !hasParams(p));
  const pending = all.filter(hasParams);
  const resolved = new Map<string, string>();
  const tryHref = (href: string) => {
    const path = href.split(/[?#]/)[0]!;
    for (const p of pending) if (!resolved.has(p) && patternOf(p).test(path)) resolved.set(p, path);
  };

  for (const path of fixed) {
    console.log(`  enlaces de ${path}`);
    await page.goto(path).catch(() => undefined);
    await settle(page);
    const hrefs = await page.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute('href') ?? ''));
    hrefs.forEach(tryHref);
  }

  for (const p of pending.filter((x) => !resolved.has(x))) {
    // La madre: lo que hay antes del primer parámetro (`/treasury/receipts/:id/edit` → `/treasury/receipts`).
    const parent = p.split('/:')[0]!;
    if (!parent || !fixed.includes(parent)) continue;
    // Cómo abre cada lista su detalle: la fila entera, o el botón «ver» (ojo) o «editar» (lápiz) de la primera fila.
    const candidates = [
      'tbody tr:has(td) .mdi-eye, tbody tr:has(td) .mdi-eye-outline',
      'tbody tr:has(td) .mdi-pencil, tbody tr:has(td) .mdi-pencil-outline',
      'tbody tr:has(td)',
      '.v-card[href], a.v-card, .v-list-item[href]',
    ];
    for (const selector of candidates) {
      if (resolved.has(p)) break;
      await page.goto(parent).catch(() => undefined);
      await settle(page);
      const target = page.locator(selector).first();
      if (!(await target.count())) continue;
      await target.click({ timeout: 3000 }).catch(() => undefined);
      await page.waitForTimeout(1200);
      tryHref(new URL(page.url()).pathname);
    }
    console.log(`  ${resolved.has(p) ? 'ok ' : '-- '} ${p}${resolved.has(p) ? ` → ${resolved.get(p)}` : ''}`);
    // Desde un detalle se llega a su edición: `/customers/<id>` → `/customers/<id>/edit`.
    for (const q of pending) {
      if (resolved.has(q) || !q.endsWith('/edit')) continue;
      const base = resolved.get(q.replace(/\/edit$/, ''));
      if (base && patternOf(q).test(`${base}/edit`)) resolved.set(q, `${base}/edit`);
    }
  }

  const urls = [...fixed, ...pending.filter((p) => resolved.has(p)).map((p) => resolved.get(p)!)];
  // Cada pestaña de un proyecto es su propia pantalla.
  const project = resolved.get('/projects/:id');
  if (project) urls.push(...PROJECT_VIEWS.filter((v) => v !== 'overview').map((v) => `${project}?view=${v}`));

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    ROUTES_FILE,
    JSON.stringify({ urls, unresolved: pending.filter((p) => !resolved.has(p)), discoveredAt: new Date().toISOString() }, null, 2),
  );
  console.log(`rutas: ${urls.length} · sin resolver: ${pending.filter((p) => !resolved.has(p)).join(', ') || 'ninguna'}`);
});
