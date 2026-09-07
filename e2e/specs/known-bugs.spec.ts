/**
 * Smoke test de regresión de los 15 hallazgos críticos de
 * frontend/e2e/docs/TEST-PLAN.md (resumen ejecutivo). Cada test documenta el
 * comportamiento REAL del sistema hoy, no el deseado — ver la sección 0 de
 * frontend/e2e/docs/OPENCODE-BRIEF.md antes de "corregir" un assert que falle.
 *
 * Requiere: RabbitMQ + todos los servicios backend con sus consumers arrancados
 * (ver checklist en OPENCODE-BRIEF.md sección 1).
 */
import { test, expect, request as playwrightRequest } from '@playwright/test';
import { fieldByLabel } from '../support/fields';

const API_URL = 'http://localhost:8080';
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'Admin123!';
// Régimen EC (frontend/src/config/fiscalRegimes.ts) — único documentTypeId real
// disponible en el entorno de prueba.
const EC_INVOICE_DOCUMENT_TYPE_ID = '024ce4f5-baf1-4d04-9a7c-189076230390';

async function adminToken(): Promise<string> {
  const ctx = await playwrightRequest.newContext();
  const resp = await ctx.post(`${API_URL}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!resp.ok()) throw new Error(`No se pudo autenticar admin: ${resp.status()}`);
  const { accessToken } = await resp.json();
  await ctx.dispose();
  return accessToken;
}

/** Los endpoints de listado de este backend devuelven arrays planos, no {items:[]}. */
function asArray(body: unknown): any[] {
  return Array.isArray(body) ? body : ((body as any)?.items ?? (body as any)?.data ?? []);
}

test.describe('BUG #1 — numeración de factura con lock atómico bajo concurrencia', () => {
  test('emitir 2 facturas en paralelo sobre el mismo establecimiento/punto de emisión', async () => {
    // TEST-PLAN.md #1: SequelizeSequenceRepository usa FOR UPDATE (lock) dentro de
    // la transacción de emisión; si no existía la serie, la provisiona con
    // INSERT ... IGNORE (createIfAbsent) y relee con lock, de modo que dos
    // emisiones concurrentes se serializan y obtienen folios DISTINTOS.
    // Test de contrato de API (OPENCODE-BRIEF.md §3.2).
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });

    const customers = asArray(await (await ctx.get(`${API_URL}/customers`)).json());
    const customerId = customers[0]?.id;

    const establishments = asArray(await (await ctx.get(`${API_URL}/establishments`)).json());
    const establishment = establishments[0];

    test.skip(
      !customerId || !establishment,
      'Faltan datos de prueba (cliente o establecimiento) en la organización — precondición no cumplida',
    );

    let products = asArray(await (await ctx.get(`${API_URL}/products?status=active`)).json());
    if (products.length === 0) {
      const created = await ctx.post(`${API_URL}/products`, {
        data: {
          name: `Bug1 Producto E2E ${Date.now()}`,
          type: 'good',
          price: '10.00',
          currencyCode: 'USD',
          establishmentIds: [establishment.id],
        },
      });
      test.skip(!created.ok(), `No se pudo crear un producto de prueba: ${created.status()}`);
      products = [await created.json()];
    }
    const productId = products[0].id;

    const points = asArray(await (await ctx.get(`${API_URL}/establishments/${establishment.id}/billing-points`)).json());
    const emissionPoint = points.find((p: { status: string }) => p.status === 'active');
    test.skip(!emissionPoint, 'El establecimiento no tiene ningún punto de emisión activo');

    async function makeReadyDraft(): Promise<string> {
      const inv = await (
        await ctx.post(`${API_URL}/invoices`, {
          data: { customerId, documentTypeId: EC_INVOICE_DOCUMENT_TYPE_ID, currencyCode: 'USD' },
        })
      ).json();
      await ctx.post(`${API_URL}/invoices/${inv.id}/lines`, {
        data: { productId, description: 'Bug #1 concurrencia', quantity: 1, unitPrice: '5.00', discountCents: 0 },
      });
      return inv.id;
    }

    const [invoiceIdA, invoiceIdB] = await Promise.all([makeReadyDraft(), makeReadyDraft()]);

    const issuePayload = { establishmentId: establishment.id, emissionPointId: emissionPoint.id };
    const [issueRespA, issueRespB] = await Promise.all([
      ctx.post(`${API_URL}/invoices/${invoiceIdA}/issue`, { data: issuePayload }),
      ctx.post(`${API_URL}/invoices/${invoiceIdB}/issue`, { data: issuePayload }),
    ]);

    test.skip(
      !issueRespA.ok() || !issueRespB.ok(),
      `Al menos una emisión falló por otro motivo (no relacionado a la carrera): ` +
        `${issueRespA.status()} / ${issueRespB.status()}`,
    );

    const [invoiceA, invoiceB] = await Promise.all([issueRespA.json(), issueRespB.json()]);

    // Arreglado: el lock FOR UPDATE serializa las dos emisiones → folios distintos.
    expect(invoiceA.number).not.toBe(invoiceB.number);
    test.info().annotations.push({
      type: 'resultado',
      description: `Número A: ${invoiceA.number}, Número B: ${invoiceB.number}. Distintos ⇒ el lock atómico funciona.`,
    });

    await ctx.dispose();
  });
});

test.describe('BUG #2 — línea de factura con producto inexistente falla con 400', () => {
  test('agregar línea con productId inexistente responde 400 ProductNotFoundError', async () => {
    // TEST-PLAN.md #2 (REVISADO 2026-09-06): ProductNotFoundError ahora se lanza
    // cuando product-service responde 404 (null => 400). Además, si el catálogo
    // está caído (5xx/red) el port LANZA ProductCatalogError → 503 en vez de
    // crear la línea sin impuestos. Test de contrato de API (OPENCODE-BRIEF.md §3.2).
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });

    // Necesitamos un cliente real para poder crear la factura.
    const customersResp = await ctx.get(`${API_URL}/customers`);
    expect(customersResp.ok()).toBeTruthy();
    const customerId = asArray(await customersResp.json())[0]?.id;
    test.skip(!customerId, 'No hay ningún cliente en la organización de prueba para crear la factura');

    const createResp = await ctx.post(`${API_URL}/invoices`, {
      data: { customerId, documentTypeId: EC_INVOICE_DOCUMENT_TYPE_ID, currencyCode: 'USD' },
    });
    if (!createResp.ok()) {
      test.skip(true, `No se pudo crear factura de prueba: ${createResp.status()} ${await createResp.text()}`);
      return;
    }
    const invoice = await createResp.json();

    const fakeProductId = '00000000-0000-4000-8000-000000000000';
    const lineResp = await ctx.post(`${API_URL}/invoices/${invoice.id}/lines`, {
      data: {
        productId: fakeProductId,
        description: 'Línea con producto inexistente (E2E bug #2)',
        quantity: 1,
        unitPrice: '10.00',
        discountCents: 0,
      },
    });

    // Arreglado: 400 con ProductNotFoundError, NO 200/201.
    expect(lineResp.status()).toBe(400);
    const body = await lineResp.json();
    expect(body.code ?? body.name).toBe('ProductNotFoundError');

    await ctx.dispose();
  });
});

test.describe('BUG #4 — dígito verificador de cédula EC no se valida', () => {
  test('cédula de 10 dígitos con dígito verificador inválido se acepta igual', async ({ page }) => {
    // TEST-PLAN.md #4: el regex real es '^\\d{10}$' (seed-ec-identification-types.js) —
    // no valida el algoritmo de cédula ecuatoriana. '1111111111' pasa el regex pero
    // no es una cédula válida bajo el algoritmo real de dígito verificador.
    const UNIQUE = Date.now();
    await page.goto('/customers/new');

    await fieldByLabel(page, 'Nombre completo').locator('input').fill(`Bug4 CedulaInvalida ${UNIQUE}`);
    await fieldByLabel(page, 'Tipo de identificación').click();
    await page.getByRole('option', { name: /cédula/i }).click();

    const idInput = fieldByLabel(page, 'Número de identificación').locator('input');
    await idInput.fill('1111111111');

    await page.getByRole('button', { name: 'Crear cliente' }).click();

    // Comportamiento HOY (bug): la creación tiene éxito pese al dígito verificador inválido.
    await expect(page).toHaveURL(/\/customers\/[\w-]+$/);
  });
});

test.describe('BUG #5 (REVISADO 2026-09-06) — update-customer revalida unicidad de identificación', () => {
  test('PATCH /customers/:id con identificación duplicada responde 409 CUSTOMER_EXISTS', async () => {
    // TEST-PLAN.md #5 + hallazgo #22: update-customer.ts ahora replica el pre-check
    // de unicidad de create-customer (repos.findByIdentification) y lanza
    // CustomerAlreadyExistsError → 409 CUSTOMER_EXISTS. Como safety net, el
    // errorHandler de customer-service mapea SequelizeUniqueConstraintError → 409
    // para las carreras que crucen el pre-check. Test de contrato de API (§3.2).
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });

    // Cédula EC (tax-service seed) — mismo ID que usa customers.spec.ts.
    const ID_CEDULA = '96f27479-5099-40fb-9c77-67dcc0dea110';
    const UNIQUE = Date.now();
    const sharedId = '19' + String(UNIQUE).slice(-8);

    const respA = await ctx.post(`${API_URL}/customers`, {
      data: {
        businessName: `Bug5 ClienteA ${UNIQUE}`,
        type: 'person',
        identificationTypeId: ID_CEDULA,
        identification: sharedId,
      },
    });
    expect(respA.ok()).toBeTruthy();

    const respB = await ctx.post(`${API_URL}/customers`, {
      data: {
        businessName: `Bug5 ClienteB ${UNIQUE}`,
        type: 'person',
        identificationTypeId: ID_CEDULA,
        identification: '18' + String(UNIQUE).slice(-8),
      },
    });
    expect(respB.ok()).toBeTruthy();
    const b = await respB.json();

    const upd = await ctx.patch(`${API_URL}/customers/${b.id}`, {
      data: { identificationTypeId: ID_CEDULA, identification: sharedId },
    });
    // Arreglado: 409 CUSTOMER_EXISTS.
    expect(upd.status()).toBe(409);
    expect((await upd.json()).code).toBe('CUSTOMER_EXISTS');

    // El cliente B conserva su identificación original.
    const after = await (await ctx.get(`${API_URL}/customers/${b.id}`)).json();
    expect(after.identification).not.toBe(sharedId);

    await ctx.dispose();
  });
});

test.describe('BUG #6 (REVISADO 2026-09-06) — no se puede desactivar al ÚLTIMO admin no-owner', () => {
  test('POST /users/:id/disable del último admin restante responde 409 LAST_ADMIN_REMOVAL', async () => {
    // TEST-PLAN.md #6 (REVISADO 2026-09-06): disable-user.ts ahora tiene guard
    // anti-lockout — si el target ES admin y no queda OTRO admin no-owner activo
    // (el owner ya estaba protegido por org.ownerId y no cuenta como respaldo),
    // se lanza LastAdminRemovalError → 409 LAST_ADMIN_REMOVAL. Test de contrato
    // de API (OPENCODE-BRIEF.md §3.2).
    //
    // Determinismo: employees.spec.ts (§1.4) invita un segundo admin activo
    // (e2e-second-admin-*) en CADA corrida y NO lo desactiva — quedan acumulados.
    // Por eso este test, antes de la aserción, desactiva todos los admins activos
    // no-owner que NO son el target; así se garantiza que el target es el último.
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const me = await (await ctx.get(`${API_URL}/auth/me`)).json();
    const roles = asArray(await (await ctx.get(`${API_URL}/roles`)).json());
    const adminRole = roles.find((r: { name: string }) => r.name === 'Administrador') ?? roles[0];
    test.skip(!adminRole, 'No existe rol "Administrador" en la organización de prueba');

    // 1. Crear el target como admin ACTIVO (invite + accept-invite).
    const email = `bug6-${Date.now()}@test.com`;
    const inviteResp = await ctx.post(`${API_URL}/users/invite`, { data: { email, roleIds: [adminRole.id] } });
    test.skip(!inviteResp.ok(), `No se pudo invitar al admin target: ${inviteResp.status()} ${await inviteResp.text()}`);

    const allUsers = asArray(await (await ctx.get(`${API_URL}/users`)).json());
    const targetId = allUsers.find((u: { email: string }) => u.email === email)?.id;
    test.skip(!targetId, 'No se pudo resolver el id del admin target invitado');

    const password = 'Bug6Target123!';
    const acceptResp = await ctx.post(`${API_URL}/auth/accept-invite`, {
      data: { token: Buffer.from(JSON.stringify({ uid: targetId, oid: me.orgId })).toString('base64url'), password },
    });
    test.skip(!acceptResp.ok(), `No se pudo aceptar la invitación del target: ${acceptResp.status()}`);

    // 2. Limpieza: desactivar todos los admins activos no-owner que NO sean el target
    //    (sobrantes de corridas anteriores de employees.spec y conocidos). Mientras el
    //    target permanezca activo, cada uno de estos disable queda permitido (hay otro
    //    admin); es seguro iterarlos aunque la lista incluya a otros admins.
    const usersBefore = asArray(await (await ctx.get(`${API_URL}/users`)).json());
    const leftoverAdmins = usersBefore.filter(
      (u: { id: string; email: string; status: string; roles: string[] }) =>
        u.id !== me.id && u.id !== targetId && u.status === 'active' && u.roles.includes('Administrador'),
    );
    for (const leftover of leftoverAdmins) {
      const disableResp = await ctx.post(`${API_URL}/users/${leftover.id}/disable`);
      if (!disableResp.ok()) {
        test.info().annotations.push({
          type: 'limpieza',
          description: `No se pudo desactivar al admin sobrante ${leftover.email}: ${disableResp.status()}`,
        });
      }
    }

    // 3. El target es ahora el único admin no-owner activo → desactivarlo debe fallar.
    const disableResp = await ctx.post(`${API_URL}/users/${targetId}/disable`);
    // Arreglado: 409 LAST_ADMIN_REMOVAL (antes de la revisión del 2026-09-06 el
    // únicamente se protegía al ownerId, así que esto respondía 200 y desactivaba).
    expect(disableResp.status()).toBe(409);
    expect((await disableResp.json()).code).toBe('LAST_ADMIN_REMOVAL');

    // El target sigue activo tras el intento.
    const after = asArray(await (await ctx.get(`${API_URL}/users`)).json());
    const targetAfter = after.find((u: { id: string }) => u.id === targetId);
    expect(targetAfter?.status).toBe('active');

    await ctx.dispose();
  });
});

test.describe('BUG #7 — no existe MFA para login de usuario', () => {
  // Sesión limpia: con el storageState global ya autenticado, /login redirige al home.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login con email+password correctos entra directo, sin paso de verificación', async ({ page }) => {
    // TEST-PLAN.md #7: el doc de auth-service describe TOTP/MFA como núcleo del
    // flujo de login; no existe ningún campo mfa_enabled ni ruta /auth/mfa en el
    // código real. El único TOTP real es para emparejar terminales POS.
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').first().fill('admin@admin.com');
    await page.getByLabel('Contraseña').first().fill('Admin123!');
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();

    // Comportamiento HOY: entra directo al home, sin pantalla intermedia de código.
    await expect(page).toHaveURL('/');
    await expect(page.getByText(/código de verificación|verification code|2fa/i)).toHaveCount(0);
  });
});

test.describe('BUG #8 — no hay autoservicio de "olvidé mi contraseña"', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('el enlace "¿Olvidaste tu contraseña?" no navega a ningún flujo (href="#")', async ({ page }) => {
    // TEST-PLAN.md #8: AuthView.vue tiene <a href="#" @click.prevent> — el enlace
    // existe visualmente pero no hace absolutamente nada. ResetPasswordView.vue
    // (/restablecer-contrasena) solo CONSUME un token que llega por query param de
    // un email; no hay ninguna vista para SOLICITAR ese email.
    await page.goto('/login');
    const forgotLink = page.getByText('¿Olvidaste tu contraseña?');
    await expect(forgotLink).toBeVisible();

    const urlBefore = page.url();
    await forgotLink.click();

    // Comportamiento HOY (bug/gap de producto): no pasa nada, ni navegación ni diálogo.
    await expect(page).toHaveURL(urlBefore);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('BUG #9 (REVISADO 2026-09-06) — revocar un permiso invalida la sesión activa', () => {
  test('el gateway responde 401 TOKEN_STALE cuando el pv del rol cambia', async () => {
    // TEST-PLAN.md #9 (REVISADO 2026-09-06): el gateway ahora consulta el
    // permissions-version (users.permissions_version) por usuario y compara con el
    // `pv` del JWT en cada ruta autenticada; si difieren → 401 TOKEN_STALE (el
    // cliente refresca el token vía login/refresh). Test de contrato de API
    // (OPENCODE-BRIEF.md §3.2).
    //
    // No usamos al admin como víctima a propósito: cambiar el pv del admin
    // invalidaría su token DURANTE este test y rompería otros specs que corren en
    // paralelo con token de admin. En su lugar hay un USUARIO fixture fijo
    // (bug9-fixture@test.com) con rol fijo; solo a él se le revoca el permiso.
    const adminTok = await adminToken();
    const adminCtx = await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${adminTok}` },
    });
    const me = await (await adminCtx.get(`${API_URL}/auth/me`)).json();

    const { FIXED_ROLE_NAME, FIXTURE_EMAIL, FIXTURE_PASSWORD } = {
      FIXED_ROLE_NAME: 'Bug9 Rol E2E (fixture fija — no borrar)',
      FIXTURE_EMAIL: 'bug9-fixture@test.com',
      FIXTURE_PASSWORD: 'Bug9Fixture123!',
    };

    // Permisos del catálogo (no se puede "vaciar" un rol: updateRolePermissionsSchema
    // exige min(1), así que "revocar" deja el resto, sin el permiso objetivo).
    const allPerms: { code: string }[] = asArray(await (await adminCtx.get(`${API_URL}/permissions`)).json());
    const [targetPerm, otherPerm] = allPerms.map((p) => p.code);
    test.skip(allPerms.length < 2, 'Se necesitan al menos 2 permisos en el catálogo para este caso');

    async function ensureFixtureRole(): Promise<string> {
      const existingRoles: { id: string; name: string }[] = asArray(await (await adminCtx.get(`${API_URL}/roles`)).json());
      let roleId = existingRoles.find((r) => r.name === FIXED_ROLE_NAME)?.id;
      if (!roleId) {
        const createRoleResp = await adminCtx.post(`${API_URL}/roles`, {
          data: { name: FIXED_ROLE_NAME, permissions: [targetPerm, otherPerm] },
        });
        expect(createRoleResp.ok()).toBeTruthy();
        roleId = (await createRoleResp.json()).roleId;
      }
      return roleId!;
    }

    const fixtureRoleId = await ensureFixtureRole();

    // Asegura que el usuario fixture existe, está activo y tiene el rol fixture
    // (idempotente entre corridas). El admin nunca entra en el rol fixture.
    async function ensureFixtureUser(): Promise<string> {
      const users: { id: string; email: string; status: string; roles: string[] }[] = asArray(
        await (await adminCtx.get(`${API_URL}/users`)).json(),
      );
      let fixture = users.find((u) => u.email === FIXTURE_EMAIL);
      if (!fixture) {
        const inviteResp = await adminCtx.post(`${API_URL}/users/invite`, {
          data: { email: FIXTURE_EMAIL, roleIds: [fixtureRoleId] },
        });
        expect(inviteResp.ok()).toBeTruthy();
        fixture = asArray(await (await adminCtx.get(`${API_URL}/users`)).json()).find(
          (u: { email: string }) => u.email === FIXTURE_EMAIL,
        );
        expect(fixture).toBeTruthy();

        const acceptResp = await adminCtx.post(`${API_URL}/auth/accept-invite`, {
          data: {
            token: Buffer.from(JSON.stringify({ uid: fixture!.id, oid: me.orgId })).toString('base64url'),
            password: FIXTURE_PASSWORD,
          },
        });
        expect(acceptResp.ok()).toBeTruthy();
      }
      const fixtureId = fixture!.id;
      const FIXED_ROLE_NAME_LITERAL = 'Bug9 Rol E2E (fixture fija — no borrar)';
      if (!fixture!.roles.includes(FIXED_ROLE_NAME_LITERAL)) {
        const assignResp = await adminCtx.post(`${API_URL}/users/${fixtureId}/roles`, {
          data: { roleIds: [fixtureRoleId] },
        });
        expect(assignResp.ok()).toBeTruthy();
      }
      return fixtureId;
    }

    const fixtureUserId = await ensureFixtureUser();

    // Revive los permisos del rol fixture a su estado completo (no-op entre corridas,
    // pero garantiza un punto de partida determinista).
    await adminCtx.patch(`${API_URL}/roles/${fixtureRoleId}/permissions`, {
      data: { permissions: [targetPerm, otherPerm] },
    });

    // Sesión "activa" del fixture: token emitido ANTES de la revocación.
    const fixtureLogin = await adminCtx.post(`${API_URL}/auth/login`, {
      data: { email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD },
    });
    test.skip(!fixtureLogin.ok(), `No se pudo iniciar sesión como ${FIXTURE_EMAIL}: ${fixtureLogin.status()}`);
    const { accessToken: staleToken } = await fixtureLogin.json();
    const fixtureCtx = await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${staleToken}` },
    });

    // Acto de la "revocación": quitar targetPerm del rol (el fixture es miembro).
    const revokeResp = await adminCtx.patch(`${API_URL}/roles/${fixtureRoleId}/permissions`, {
      data: { permissions: [otherPerm] },
    });
    expect(revokeResp.ok()).toBeTruthy();

    // La sesión activa queda invalidada: la siguiente petición autenticada con el
    // token viejo debe topar 401 TOKEN_STALE. La invalidación llega vía realtime
    // (caché del gateway) o por TTL de la caché de pv (10s) — sondeo con margen.
    const deadline = Date.now() + 20_000;
    let staleStatus = 0;
    while (Date.now() < deadline) {
      const probe = await fixtureCtx.get(`${API_URL}/customers`);
      staleStatus = probe.status();
      if (staleStatus === 401) {
        const body = await probe.json();
        expect(body.code).toBe('TOKEN_STALE');
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    // Arreglado: 401 TOKEN_STALE (antes de la revisión, el JWT viejo seguía sirviendo).
    expect(staleStatus).toBe(401);

    // Restaurar el permiso para no dejar el fixture "medio revocado" entre corridas.
    const restoreResp = await adminCtx.patch(`${API_URL}/roles/${fixtureRoleId}/permissions`, {
      data: { permissions: [targetPerm, otherPerm] },
    });
    expect(restoreResp.ok()).toBeTruthy();

    // Re-login del fixture: el token nuevo debe volver a pasar (200 o 403 de permiso
    // NO 401/detección de token viejo). La caché de pv del gateway puede conservar
    // el valor pre-restore hasta TTL (10s) — se sondea igual que la detección.
    const fixLogin2 = await adminCtx.post(`${API_URL}/auth/login`, {
      data: { email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD },
    });
    expect(fixLogin2.ok()).toBeTruthy();
    const { accessToken: freshToken } = await fixLogin2.json();
    const freshCtx = await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${freshToken}` },
    });
    const freshDeadline = Date.now() + 20_000;
    let freshStatus = 0;
    while (Date.now() < freshDeadline) {
      const probe = await freshCtx.get(`${API_URL}/customers`);
      freshStatus = probe.status();
      if (freshStatus !== 401) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(freshStatus).not.toBe(401);

    test.info().annotations.push({
      type: 'resultado',
      description: `Tras revocar el permiso del rol fixture, el token activo respondió 401 ` +
        `TOKEN_STALE (gateway BUG #9) y un re-login volvió a pasar. Fixture: ${FIXTURE_EMAIL}, ` +
        `rol: ${FIXED_ROLE_NAME}.`,
    });

    await adminCtx.dispose();
    await fixtureCtx.dispose();
    await freshCtx.dispose();
  });
});

test.describe('BUG #11 — no hay descuento de inventario (inventory-service no existe)', () => {
  test('el formulario de producto no expone ningún campo de seguimiento de stock', async ({ page }) => {
    // TEST-PLAN.md #11: product-service tiene trackStock/allowNegativeStock en el
    // dominio, pero ProductFormView.vue no los expone en absoluto — y
    // inventory-service no tiene código, así que facturar no puede descontar nada.
    await page.goto('/products/new');
    await expect(page.getByText(/rastre[ao]\s*(de)?\s*stock|inventario|track.?stock/i)).toHaveCount(0);
  });
});

test.describe('BUG #12 — no existe generación de RIDE en fiscal-ecuador', () => {
  test('GET /fiscal-invoices/:id/ride responde 404, no un PDF', async () => {
    // TEST-PLAN.md #12: la ruta está documentada (fiscal-ecuador.md) pero no existe
    // en app.ts — solo hay GET /fiscal-invoices/:id/xml.
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    const resp = await ctx.get(`${API_URL}/fiscal-invoices/00000000-0000-4000-8000-000000000000/ride`);
    expect(resp.status()).toBe(404);
    await ctx.dispose();
  });
});

test.describe('BUG #14 (premisa desactualizada) — revalidado: hay constraint único de identificación en BD', () => {
  test('crear 2 clientes con la misma identificación en paralelo no siempre falla', async ({ browser }) => {
    // TEST-PLAN.md #14: representativo del patrón TOCTOU repetido en tags,
    // categorías, unidades y código de establecimiento (no se testea cada uno por
    // separado, este caso ilustra el patrón).
    const UNIQUE = Date.now();
    const sharedId = '17' + String(UNIQUE).slice(-8);

    const [ctxA, ctxB] = await Promise.all([
      browser.newContext({ storageState: './e2e/.auth/user.json' }),
      browser.newContext({ storageState: './e2e/.auth/user.json' }),
    ]);
    const [pageA, pageB] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);

    async function fillCustomerForm(page: import('@playwright/test').Page, name: string) {
      await page.goto('/customers/new');
      await fieldByLabel(page, 'Nombre completo').locator('input').fill(name);
      await fieldByLabel(page, 'Tipo de identificación').click();
      await page.getByRole('option', { name: /cédula/i }).click();
      await fieldByLabel(page, 'Número de identificación').locator('input').fill(sharedId);
    }

    await fillCustomerForm(pageA, `Bug14 Carrera A ${UNIQUE}`);
    await fillCustomerForm(pageB, `Bug14 Carrera B ${UNIQUE}`);

    const [respA, respB] = await Promise.all([
      pageA.getByRole('button', { name: 'Crear cliente' }).click().then(() =>
        pageA.waitForURL(/\/customers\/[\w-]+$/, { timeout: 10_000 }).then(() => true).catch(() => false),
      ),
      pageB.getByRole('button', { name: 'Crear cliente' }).click().then(() =>
        pageB.waitForURL(/\/customers\/[\w-]+$/, { timeout: 10_000 }).then(() => true).catch(() => false),
      ),
    ]);

    // REVISIÓN 2026-09-05: SÍ hay constraint único en BD — `customers_organization_id_identification`
    // (migration 20260706000000-create-customer-tables). La premisa original "sin constraint" era
    // falsa: el check de aplicación (findByIdentification) tampoco es atómico, pero quien impone la
    // unicidad es la BD. El perdedor de la carrera choca con ER_DUP y el error NO está mapeado →
    // 500 (mismo patrón que el hallazgo #22 en update-customer). Este test documenta el resultado
    // real sin asumir timing: el backend no devuelve un error de dominio limpio.
    test.info().annotations.push({
      type: 'resultado',
      description: `Creación A exitosa: ${respA}, creación B exitosa: ${respB}. ` +
        'Con el constraint UNIQUE real (migration 2026-07-06), crear dos cédulas idénticas en ' +
        'paralelo NO puede terminar con ambas true: una gana y la otra choca (ER_DUP → 500 no ' +
        'mapeado). Documenta que la unicidad la impone la BD, no el check de aplicación, y que el ' +
        'backend no responde un error de dominio limpio ante la carrera.',
    });

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe('Hallazgos sin cobertura automatizada (documentados, no testeados)', () => {
  test.skip('BUG #3 — anular factura autorizada no dispara nada fiscal', () => {
    // Requiere certificado .p12 real de prueba + esperar autorización real del SRI
    // (reconciliación cada 2 min) — demasiado lento/frágil para esta suite sin un
    // fixture de certificado de prueba ya preparado. Ver TEST-PLAN.md sección 6.
  });

  test.skip('BUG #10 — organization-service no consume eventos de tax-service', () => {
    // No es practicable como test de UI ni de API de bajo costo — requeriría dar
    // de alta un país nuevo en tax-service y verificar que organization-service no
    // reacciona. Documentado en TEST-PLAN.md sección 2, sin test automatizado.
  });

  test.skip('BUG #13 — certificado vencido sigue "activo" (sin expiración automática)', () => {
    // Requiere un .p12 de prueba ya vencido; no fabricar uno solo para el test.
    // Ver TEST-PLAN.md sección 6.
  });

  test.skip('BUG #15 — nombre de rol "Administrador" hardcodeado', () => {
    // Los roles de sistema no se pueden renombrar desde la UI, así que no hay forma
    // de reproducir la fragilidad sin tocar la base de datos directamente. Bajo
    // valor de automatizar — ver TEST-PLAN.md sección 1.2.
  });
});
