import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));

export const LABEL = process.env.VISUAL_LABEL ?? 'actual';
export const OUT = resolve(process.env.VISUAL_OUT ?? resolve(here, '../../../.visual', LABEL));
export const ROUTES_FILE = resolve(OUT, 'routes.json');

/** Rutas que no son pantallas de la app con sesión: acceso, invitación, comodín. */
const SKIP = new Set(['/login', '/accept-invite', '/restablecer-contrasena', '/:pathMatch(.*)*']);

/** Todas las rutas del router, leídas del propio archivo: una vista nueva entra sola en las capturas. */
export function routerPaths(): string[] {
  const src = readFileSync(resolve(here, '../../src/router/index.ts'), 'utf8');
  return [...new Set([...src.matchAll(/path: '([^']+)'/g)].map((m) => m[1]!))].filter((p) => !SKIP.has(p));
}

export const hasParams = (p: string) => p.includes(':');

/** `/customers/:id/edit` → /^\/customers\/[^/?#]+\/edit$/ */
export function patternOf(path: string): RegExp {
  const body = path
    .split('/')
    // Un parámetro nunca es «new»: `/treasury/receipts/new` es la pantalla de alta, no el recibo con id «new».
    .map((seg) => (seg.startsWith(':') ? '(?!new(?:[/?#]|$))[^/?#]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('\\/');
  return new RegExp(`^${body}$`);
}

/** Pestañas de un proyecto: cada una es otra pantalla (`?view=`). */
export const PROJECT_VIEWS = ['overview', 'list', 'board', 'calendar', 'timeline', 'dashboard', 'billing'];

/** Nombre de archivo estable para una ruta concreta. */
export function fileName(url: string): string {
  const clean = url.replace(/^\//, '').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'ID');
  return (clean || 'inicio').replace(/[/?=&]+/g, '_').replace(/[^A-Za-z0-9_.-]/g, '');
}

/** Espera a que la pantalla deje de pedir datos, sin colgarse en las que tienen sondeo o sockets. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(700);
}

/** El tema no se guarda en el navegador: se cambia en la instancia de Vuetify tras cada carga. */
export async function setDark(page: Page, dark: boolean): Promise<void> {
  const name = dark ? 'dark' : 'light';
  await page.evaluate((target) => {
    // Vuetify no pone el tema en `$vuetify` de las globalProperties: lo da por provide/inject. Se busca entre lo que provee la app
    // el objeto con `global.name` (un ref), igual en Vuetify 3 y 4.
    const app = (document.querySelector('#app') as (Element & { __vue_app__?: any }) | null)?.__vue_app__;
    const provides = app?._context.provides ?? {};
    const keys = [...Object.getOwnPropertySymbols(provides), ...Object.keys(provides)];
    const theme = keys.map((k) => provides[k]).find((v) => v?.global?.name && 'value' in v.global.name);
    if (!theme) return;
    if (typeof theme.change === 'function') theme.change(target);
    else theme.global.name.value = target;
  }, name);
  await page.waitForTimeout(300);
  // Si no cambió, mejor fallar que guardar una captura «oscura» en claro sin que nadie lo note.
  const applied = await page.locator('.v-application').first().getAttribute('class');
  if (!applied?.includes(`v-theme--${name}`)) throw new Error(`No se pudo poner el tema ${name} (clase: ${applied})`);
}
