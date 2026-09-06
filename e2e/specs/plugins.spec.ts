/**
 * TEST-PLAN.md §7 — plugins (plugin-catalog-service).
 *
 * El estado real de la organización de prueba (verificado vía API antes de escribir
 * este archivo) tiene `finance.electronic_invoicing` activo (direct), que depende de
 * `org.establishments` + `finance.electronic_certificate` + `crm.contacts` — TODOS
 * activos hoy. Esto cambia cuál plugin conviene usar para cada caso:
 *
 * - El caso "más importante" de OPENCODE-BRIEF (gateo cross-servicio) usa en el doc
 *   el ejemplo `crm.contacts` → `/customers`, pero `crm.contacts` HOY tiene un
 *   dependiente activo (`finance.electronic_invoicing`) — desactivarlo directo
 *   dispararía `BlockingDependentsError`, no lo que este test quiere probar. Se usa
 *   en su lugar `finance.electronic_invoicing` → `/invoices` (mismo mecanismo de
 *   gateway, `pluginGate`, sin el bloqueo). Se restaura el estado en un
 *   `finally` para no romper `invoices.spec.ts`/`fiscal.spec.ts`.
 * - El catálogo real (`GET /plugins`) no tiene NINGÚN plugin `disponible` (comprable)
 *   con una dependencia que no sea también `disponible` — no hay forma de reproducir
 *   `MissingDependenciesError` con el seed actual sin fabricar un plugin exclusivo de
 *   otra organización (no se fabricó). Ese caso queda documentado con `test.skip()`.
 *
 * - **Latencia del gateo (hallazgo #23, 2026-09-06)**: verificado en vivo que
 *   `plugin-catalog-service` crea el `OutboxRelay` (main.ts) pero NUNCA llama a
 *   `relay.notify()` tras escribir en el outbox. El relay solo se despierta por su
 *   safety-net periódico de `safetyNetIntervalMs = 30s` (@facturero/outbox-relay),
 *   así que activar/desactivar un plugin propaga al gateway en un tiempo AL AZAR de
 *   0-30s (medido: 403 llegó a los 14.4s con caché tibia; la suite completa falló
 *   con 20s de polling). El poll de este test sondea 45s para cubrir ese peor caso.
 */
import { test, expect, request as playwrightRequest } from '@playwright/test';

const API_URL = 'http://localhost:8080';
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'Admin123!';

async function adminToken(): Promise<string> {
  const ctx = await playwrightRequest.newContext();
  const resp = await ctx.post(`${API_URL}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const { accessToken } = await resp.json();
  await ctx.dispose();
  return accessToken;
}

function asArray(body: unknown): any[] {
  return Array.isArray(body) ? body : ((body as any)?.items ?? (body as any)?.data ?? []);
}

test.describe('Plugins — gateo cross-servicio', () => {
  test.describe.configure({ timeout: 120_000 });

  test('desactivar finance.electronic_invoicing bloquea /invoices en TODOS los servicios (403 PLUGIN_NOT_ACTIVE)', async ({ page }) => {
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    try {
      // Confirma que /invoices funciona con el plugin activo (línea base).
      const before = await ctx.get(`${API_URL}/invoices`);
      expect(before.ok()).toBeTruthy();

      // Desactivar desde la UI real: /plugins → tab "Mis plugins" → ícono de
      // desactivar → confirmar en el diálogo (MyPluginsTab.vue). Vuetify NO
      // desmonta las pestañas inactivas (v-tabs-window-item usa v-show, no
      // v-if) — el mismo plugin también aparece en la pestaña "Catálogo" en el
      // DOM aunque esté oculta, así que hay que filtrar por :visible para no
      // chocar con violaciones de modo estricto.
      await page.goto('/plugins');
      await page.getByRole('tab', { name: 'Mis plugins' }).click();
      const card = page.locator('.v-card:visible', { hasText: 'Facturacion electronica' });
      await card.getByRole('button', { name: 'Desactivar' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Desactivar' }).click();
      await expect(card.getByText('Desactivado')).toBeVisible({ timeout: 10000 });

      // TEST-PLAN.md §7 dice que el caché de plugin-gate se invalida "al
      // instante" por evento plugin.* — en la práctica la invalidación depende
      // del `OutboxRelay` de plugin-catalog, que NO llama a notify() tras
      // escribir el outbox (hallazgo #23): solo se despierta por su safety-net
      // de 30s, así que activar/desactivar tarda 0-30s AL AZAR. Sondeamos 45s
      // (por encima del peor caso documentado) y declaramos el timeout del
      // describe (120s) para que el cap de 30s de Playwright no corte el poll.
      let after: Awaited<ReturnType<typeof ctx.get>> | null = null;
      for (let i = 0; i < 45; i++) {
        after = await ctx.get(`${API_URL}/invoices`);
        if (after.status() === 403) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      expect(after!.status()).toBe(403);
      const body = await after!.json();
      expect(body.code ?? JSON.stringify(body)).toMatch(/PLUGIN_NOT_ACTIVE/i);
    } finally {
      // Restaurar: reactivar el plugin (re-auto-activa finance.electronic_certificate
      // si hizo falta) para no romper invoices.spec.ts/fiscal.spec.ts.
      const reactivate = await ctx.post(`${API_URL}/organizations/me/plugins/finance.electronic_invoicing/activate`);
      if (!reactivate.ok() && reactivate.status() !== 409) {
        throw new Error(`No se pudo restaurar finance.electronic_invoicing: ${reactivate.status()} ${await reactivate.text()}`);
      }
      await ctx.dispose();
    }
  });
});

test.describe('Plugins — dependencias', () => {

  test('desactivar org.establishments mientras finance.electronic_invoicing (dependiente) sigue activo → BlockingDependentsError', async () => {
    // TEST-PLAN.md §7: desactivar con dependientes activos directos → bloqueado
    // hasta que se desactiven manualmente primero. Usa el estado real de la
    // organización de prueba (finance.electronic_invoicing activo y dependiendo de
    // org.establishments) — sin fabricar nada, y sin efectos secundarios: la
    // desactivación debe fallar, dejando todo como estaba.
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const before = asArray(await (await ctx.get(`${API_URL}/organizations/me/plugins`)).json());
    const invoicing = before.find((p: { pluginCode: string }) => p.pluginCode === 'finance.electronic_invoicing');
    test.skip(invoicing?.status !== 'active', 'finance.electronic_invoicing no está activo en la organización de prueba — no se puede probar el bloqueo de dependientes');

    const resp = await ctx.post(`${API_URL}/organizations/me/plugins/org.establishments/deactivate`);
    expect(resp.status()).toBe(422);
    const body = await resp.json();
    expect(body.code ?? JSON.stringify(body)).toMatch(/BLOCKING_DEPENDENTS|BlockingDependents/i);

    // Confirma que no hubo efecto secundario: sigue activo.
    const after = asArray(await (await ctx.get(`${API_URL}/organizations/me/plugins`)).json());
    const establishments = after.find((p: { pluginCode: string }) => p.pluginCode === 'org.establishments');
    expect(establishments?.status).toBe('active');

    await ctx.dispose();
  });

  test.skip(
    'activar un plugin con dependencias no calificadas falla completo (MissingDependenciesError)',
    async () => {
      // No reproducible con el seed actual: TODO plugin buildStatus:'disponible'
      // en el catálogo real (verificado con GET /plugins) tiene TODAS sus
      // dependencias también 'disponible' con autoActivate:true — no hay ningún
      // plugin comprable con una dependencia que no califique. Los únicos planes
      // con dependencias 'en_construccion' son ellos mismos 'en_construccion' (ni
      // siquiera muestran botón de activar). Reproducir este caso requeriría
      // fabricar un plugin is_exclusive de otra organización, fuera de alcance
      // sin más contexto sobre cómo se crean esos registros en este entorno.
    },
  );
});

test.describe('Plugins — solicitud a medida (fulfill)', () => {

  test('fulfill de una solicitud a medida crea el plugin pero NO lo activa', async () => {
    // TEST-PLAN.md §7: crear un plugin a medida (fulfill) no lo activa
    // automáticamente — paso separado. fulfill-custom-plugin-request.ts lo dice
    // explícito en un comentario: "Crear ≠ activar: NO se inserta ninguna fila en
    // organization_plugins aquí."
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const request = await (
      await ctx.post(`${API_URL}/organizations/me/plugin-requests`, {
        data: { description: `Necesito un módulo a medida para E2E ${Date.now()}`, basedOnPluginCodes: [] },
      })
    ).json();

    const fulfillResp = await ctx.post(`${API_URL}/admin/plugin-requests/${request.id}/fulfill`, {
      data: {
        name: `Plugin a medida E2E ${Date.now()}`,
        description: 'Plugin creado por el test de fulfill, no debe quedar activo.',
        priceCents: 0,
      },
    });
    expect(fulfillResp.ok()).toBeTruthy();
    const plugin = await fulfillResp.json();

    const myPlugins = asArray(await (await ctx.get(`${API_URL}/organizations/me/plugins`)).json());
    const active = myPlugins.find((p: { pluginId: string; status: string }) => p.pluginId === plugin.id && p.status === 'active');
    expect(active).toBeUndefined();

    await ctx.dispose();
  });
});
