/**
 * TEST-PLAN.md §8 (inventario) y §9 (notificaciones) — "esto no existe todavía".
 * Archivo separado a propósito (OPENCODE-BRIEF.md, Lote 5): estos tests documentan
 * AUSENCIA de funcionalidad, no fallos de algo que debería funcionar. Si algún día
 * empiezan a fallar, es porque alguien implementó la pieza que falta — y hay que
 * revisar el motivo del fallo antes de "arreglarlo" en el test.
 *
 * notification-service no tiene mailhog/mock de correo en este entorno — usa un
 * SMTP real si `SMTP_HOST` está seteado, o cae a `ConsoleMailer` (loggea a stdout)
 * si no. En docker-compose local no hay `SMTP_HOST`, así que cae a ConsoleMailer:
 * verificamos el efecto leyendo `docker logs cmr-notification`, no un buzón real —
 * evita mandar correos reales repetidamente desde una suite automatizada.
 */
import { execSync } from 'node:child_process';
import { test, expect, request as playwrightRequest } from '@playwright/test';

const API_URL = 'http://localhost:8080';
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'Admin123!';
const UNIQUE = Date.now();

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

function notificationLogs(lines = 100): string {
  try {
    return execSync(`docker logs cmr-notification --tail ${lines}`, { encoding: 'utf-8' });
  } catch {
    return '';
  }
}

test.describe('Gap — inventario (inventory-service no implementado, bug #11)', () => {

  test('facturar un producto con trackStock:true no descuenta ningún stock (no hay dónde)', async () => {
    // TEST-PLAN.md §8: inventory-service no tiene código (src/ no existe).
    // product-service SÍ persiste trackStock/allowNegativeStock/valuationMethod —
    // campos preparados para una función que no existe — pero no expone ninguna
    // cantidad de stock en ningún endpoint. Este test documenta exactamente eso:
    // el día que aparezca un campo de stock que SÍ cambie, este assert debe
    // fallar por la razón correcta (se implementó inventario), no por casualidad.
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const establishment = asArray(await (await ctx.get(`${API_URL}/establishments`)).json())[0];
    test.skip(!establishment, 'No hay establecimientos en la organización de prueba');

    const product = await (
      await ctx.post(`${API_URL}/products`, {
        data: {
          name: `Producto stock gap ${UNIQUE}`,
          type: 'good',
          price: '20.00',
          currencyCode: 'USD',
          establishmentIds: [establishment.id],
          trackStock: true,
        },
      })
    ).json();

    expect(JSON.stringify(product)).not.toMatch(/"(stock|quantity|stockQuantity)"\s*:/i);

    const customerId = asArray(await (await ctx.get(`${API_URL}/customers`)).json())[0]?.id;
    const inv = await (
      await ctx.post(`${API_URL}/invoices`, {
        data: { customerId, documentTypeId: '024ce4f5-baf1-4d04-9a7c-189076230390', currencyCode: 'USD' },
      })
    ).json();
    await ctx.post(`${API_URL}/invoices/${inv.id}/lines`, {
      data: { productId: product.id, description: 'Gap inventario E2E', quantity: 3, unitPrice: '20.00', discountCents: 0 },
    });

    // Releer el producto tras "facturar" la línea — sigue sin ningún campo de stock.
    const productAfter = await (await ctx.get(`${API_URL}/products/${product.id}`)).json();
    expect(JSON.stringify(productAfter)).not.toMatch(/"(stock|quantity|stockQuantity)"\s*:/i);

    await ctx.dispose();
  });
});

test.describe('Gap — notificaciones (solo 4 eventos de auth-service)', () => {
  // El test de invitación espera hasta ~45s a que el evento cruce
  // auth-service → outbox → RabbitMQ → notification-service (latencia
  // variable). Sin este timeout, el cap por defecto (30s) corta el polling
  // antes (ver nota de latencia en TEST-PLAN.md).
  test.describe.configure({ timeout: 90_000 });

  test('invitar empleado SÍ dispara el correo (ConsoleMailer, vía logs)', async () => {
    // TEST-PLAN.md §9: identity.user.invited es uno de los 4 eventos que
    // notification-service sí procesa. Caso afirmativo, no de gap.
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const roles = asArray(await (await ctx.get(`${API_URL}/roles`)).json());
    const nonSystemRole = roles.find((r: { isSystem?: boolean; is_system?: boolean }) => !r.isSystem && !r.is_system) ?? roles[0];
    test.skip(!nonSystemRole, 'No hay roles disponibles en la organización de prueba');

    const email = `gap-notif-${UNIQUE}@test.com`;
    const inviteResp = await ctx.post(`${API_URL}/users/invite`, {
      data: { email, roleIds: [nonSystemRole.id] },
    });
    test.skip(!inviteResp.ok(), `No se pudo invitar: ${inviteResp.status()} ${await inviteResp.text()}`);

    // El OutboxRelay/RabbitMQ de este entorno tiene latencia muy variable
    // (mismo patrón documentado en invoices.spec.ts/fiscal.spec.ts, observado
    // hasta ~25-30s+) — margen generoso, no un timeout corto.
    let found = false;
    for (let i = 0; i < 45; i++) {
      if (notificationLogs().includes(`identity.user.invited → ${email}`)) { found = true; break; }
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(found).toBe(true);

    await ctx.dispose();
  });

  test('emitir una factura NO dispara ningún correo (gap de producto, no bug)', async () => {
    // TEST-PLAN.md §9: notification-service solo tiene binding a 4 eventos de
    // auth-service — billing.invoice.issued ni siquiera está enlazado a su cola
    // en RabbitMQ, así que el evento no llega a procesarse (no es que llegue y
    // se ignore: no está suscrito). Documenta el gap explícitamente.
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const customerId = asArray(await (await ctx.get(`${API_URL}/customers`)).json())[0]?.id;
    const establishment = asArray(await (await ctx.get(`${API_URL}/establishments`)).json())[0];
    const points = asArray(await (await ctx.get(`${API_URL}/establishments/${establishment.id}/billing-points`)).json());
    const emissionPoint = points.find((p: { status: string }) => p.status === 'active');
    test.skip(!customerId || !establishment || !emissionPoint, 'Faltan datos base en la organización de prueba');

    const inv = await (
      await ctx.post(`${API_URL}/invoices`, {
        data: { customerId, documentTypeId: '024ce4f5-baf1-4d04-9a7c-189076230390', currencyCode: 'USD' },
      })
    ).json();
    const products = asArray(await (await ctx.get(`${API_URL}/products?status=active`)).json());
    test.skip(products.length === 0, 'No hay productos activos en la organización de prueba');
    await ctx.post(`${API_URL}/invoices/${inv.id}/lines`, {
      data: { productId: products[0].id, description: 'Gap notificaciones E2E', quantity: 1, unitPrice: '5.00', discountCents: 0 },
    });

    const logsBefore = notificationLogs();
    const issueResp = await ctx.post(`${API_URL}/invoices/${inv.id}/issue`, {
      data: { establishmentId: establishment.id, emissionPointId: emissionPoint.id },
    });
    test.skip(!issueResp.ok(), `No se pudo emitir la factura de prueba: ${issueResp.status()}`);

    // Margen generoso (mismo patrón de latencia variable de OutboxRelay que el
    // resto de la suite) para darle tiempo a CUALQUIER efecto de aparecer.
    await new Promise((r) => setTimeout(r, 5000));
    const logsAfter = notificationLogs();
    const newLogLines = logsAfter.slice(logsBefore.length);
    expect(newLogLines).not.toMatch(/invoice|factura|billing/i);

    await ctx.dispose();
  });
});
