/**
 * TEST-PLAN.md §1.1 — creación de organización nueva y CONSUMIDOR FINAL.
 * Usa una cuenta nueva por test (no la cuenta admin compartida): completar el
 * perfil de organización en la cuenta admin ya está hecho desde global-setup.ts,
 * así que reutilizarla no reproduce "cuenta nueva con organización nueva".
 *
 * Dos hallazgos no documentados en TEST-PLAN.md que salieron al escribir este test:
 *
 * 1. Los módulos "org.establishments" y "crm.contacts" NO se activan
 *    automáticamente al crear una organización nueva — hay que activarlos
 *    explícitamente (normalmente desde /plugins) antes de poder ver
 *    establecimientos o clientes. La caché de plugins activos del gateway
 *    (api-gateway-node/src/core/plugin-activation-cache.ts) se invalida por
 *    evento RabbitMQ, así que es asíncrono.
 *
 * 2. [CORREGIDO] auth.needsOrgSetup (frontend/src/stores/auth.ts:14-17) — el
 *    que decide si el router redirige todo a /organization/settings —
 *    depende de `user.orgName`. Hasta ahora, `GetMeUseCase` (auth-service) leía
 *    esto de un read-model LOCAL poblado vía RabbitMQ (`organization.org.updated`),
 *    con hasta ~30s de latencia observada: completar el perfil no bastaba, el
 *    router seguía rebotando al usuario hasta que el evento se propagaba.
 *    Arreglado consultando a organization-service directo por HTTP síncrono
 *    (`auth-service/src/infrastructure/http/organization-http-repository.ts`,
 *    mismo patrón que `HttpOrganizationCatalog` en billing-service) — el dato
 *    ahora llega en la misma respuesta del PUT, sin espera. El `waitForCondition`
 *    de abajo se deja con un margen corto solo como red de seguridad, ya no
 *    debería necesitar más de un intento.
 */
import { test, expect, request as playwrightRequest } from '@playwright/test';
import { fieldByLabel } from '../support/fields';
import { waitForCondition } from '../support/wait-for';

const API_URL = 'http://localhost:8080';

async function registerNewAccount(): Promise<{ accessToken: string; refreshToken: string }> {
  const UNIQUE = Date.now();
  const ctx = await playwrightRequest.newContext();
  const resp = await ctx.post(`${API_URL}/auth/register`, {
    data: {
      email: `onboarding-${UNIQUE}@test.com`,
      password: 'Onboarding123!',
      identification: String(UNIQUE).slice(-10),
    },
  });
  if (!resp.ok()) throw new Error(`No se pudo registrar cuenta nueva: ${resp.status()} ${await resp.text()}`);
  const { accessToken, refreshToken } = await resp.json();
  await ctx.dispose();
  return { accessToken, refreshToken };
}

async function activatePlugins(accessToken: string, codes: string[]): Promise<void> {
  const ctx = await playwrightRequest.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
  });
  for (const code of codes) {
    await ctx.post(`${API_URL}/organizations/me/plugins/${code}/activate`);
  }
  await ctx.dispose();
}

/**
 * Espera a que auth-service se entere (vía RabbitMQ) del nombre de la
 * organización — condición previa para que el router dejе de rebotar a
 * /organization/settings (ver punto 2 del comentario de cabecera).
 */
async function waitForAuthServiceToKnowOrgName(accessToken: string): Promise<void> {
  const ctx = await playwrightRequest.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
  });
  await waitForCondition(
    async () => {
      const body = await (await ctx.get(`${API_URL}/auth/me`)).json().catch(() => null);
      return !!body?.orgName;
    },
    { timeoutMs: 10_000, intervalMs: 1_000, message: 'auth-service debería enterarse del nombre de la organización' },
  );
  await ctx.dispose();
}

test.describe('Onboarding — cuenta nueva con organización nueva', () => {
  // La cadena perfil → organization.org.updated → customer-service (CONSUMIDOR
  // FINAL + Matriz) cruza RabbitMQ con latencia variable (medida en local:
  // ~29s en el peor caso). Los waitForCondition de abajo presupuestan 60s;
  // sin este timeout el cap por defecto (30s) los corta antes de que puedan
  // cumplirse (ver nota operativa de latencia en TEST-PLAN.md §0).
  test.describe.configure({ timeout: 120_000 });

  // Sesión propia, no la del storageState global (admin ya tiene org completa).
  test.use({ storageState: { cookies: [], origins: [] } });

  test('completar perfil de organización crea Matriz y CONSUMIDOR FINAL', async ({ page }) => {
    const { accessToken, refreshToken } = await registerNewAccount();

    await page.goto('/login');
    await page.evaluate(
      ({ a, r }) => {
        localStorage.setItem('accessToken', a);
        localStorage.setItem('refreshToken', r);
      },
      { a: accessToken, r: refreshToken },
    );

    // register-with-password crea una organización "mínima" (solo id, sin país
    // ni taxId) — el router redirige automáticamente a organization-settings
    // mientras auth.needsOrgSetup sea true (router/index.ts:230-232).
    await page.goto('/');
    await expect(page).toHaveURL(/\/organization\/settings$/);

    const UNIQUE = Date.now();
    await fieldByLabel(page, 'Nombre legal (razón social)').locator('input').fill(`Onboarding E2E ${UNIQUE}`);
    await fieldByLabel(page, 'RUC / identificación tributaria').locator('input').fill(`179${String(UNIQUE).slice(-7)}001`);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Organización actualizada')).toBeVisible({ timeout: 10_000 });

    await activatePlugins(accessToken, ['org.establishments', 'crm.contacts']);
    await waitForAuthServiceToKnowOrgName(accessToken);

    await waitForCondition(
      async () => {
        await page.goto('/organization/establishments');
        // getByText('Matriz') matchea 2 elementos ("Matriz" y "Puntos de
        // emisión — Matriz") y dispara una violación de strict mode, que el
        // .catch() de abajo confundía con "todavía no visible". Se acota al
        // título del establecimiento en la lista, igual que en el otro test.
        return await expect(page.locator('.v-list-item-title', { hasText: 'Matriz' })).toBeVisible({ timeout: 10_000 }).then(() => true).catch(() => false);
      },
      { timeoutMs: 60_000, intervalMs: 5_000, message: 'Matriz debería verse tras activar org.establishments' },
    );

    // CONSUMIDOR FINAL depende además de organization.org.updated → RabbitMQ →
    // customer-service (otro salto asíncrono más, independiente del de arriba).
    await waitForCondition(
      async () => {
        await page.goto('/customers');
        return await expect(page.getByText('CONSUMIDOR FINAL')).toBeVisible({ timeout: 10_000 }).then(() => true).catch(() => false);
      },
      { timeoutMs: 60_000, intervalMs: 5_000, message: 'CONSUMIDOR FINAL debería aparecer tras completar el perfil de organización' },
    );
  });

  test('completar el perfil una segunda vez no duplica Matriz ni CONSUMIDOR FINAL', async ({ page }) => {
    const { accessToken, refreshToken } = await registerNewAccount();

    await page.goto('/login');
    await page.evaluate(
      ({ a, r }) => {
        localStorage.setItem('accessToken', a);
        localStorage.setItem('refreshToken', r);
      },
      { a: accessToken, r: refreshToken },
    );

    await page.goto('/');
    await expect(page).toHaveURL(/\/organization\/settings$/);

    const UNIQUE = Date.now();
    await fieldByLabel(page, 'Nombre legal (razón social)').locator('input').fill(`Onboarding E2E B ${UNIQUE}`);
    await fieldByLabel(page, 'RUC / identificación tributaria').locator('input').fill(`179${String(UNIQUE).slice(-7)}001`);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Organización actualizada')).toBeVisible({ timeout: 10_000 });

    await activatePlugins(accessToken, ['org.establishments', 'crm.contacts']);
    await waitForAuthServiceToKnowOrgName(accessToken);

    await waitForCondition(
      async () => {
        await page.goto('/customers');
        return await expect(page.getByText('CONSUMIDOR FINAL')).toBeVisible({ timeout: 10_000 }).then(() => true).catch(() => false);
      },
      { timeoutMs: 60_000, intervalMs: 5_000, message: 'CONSUMIDOR FINAL debería aparecer tras completar el perfil de organización' },
    );

    // Editar el perfil una segunda vez (cambiar solo el nombre comercial).
    await page.goto('/organization/settings');
    await fieldByLabel(page, 'Nombre comercial').locator('input').fill(`Onboarding E2E B (editado) ${UNIQUE}`);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Organización actualizada')).toBeVisible({ timeout: 10_000 });

    await page.goto('/organization/establishments');
    await expect(page.locator('.v-list-item-title', { hasText: 'Matriz' })).toHaveCount(1);

    await page.goto('/customers');
    await expect(page.getByText('CONSUMIDOR FINAL')).toHaveCount(1);
  });
});
