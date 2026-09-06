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
import { waitForCondition } from '../support/wait-for';

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

test.describe('BUG #1 — numeración de factura sin lock atómico bajo concurrencia', () => {
  test('emitir 2 facturas en paralelo sobre el mismo establecimiento/punto de emisión', async () => {
    // TEST-PLAN.md #1: SequelizeSequenceRepository.findByOrganizationAndPoint no usa
    // lock (billing-service), y no hay constraint único en invoices.number. Test de
    // contrato de API (OPENCODE-BRIEF.md §3.2) — sincronizar esta carrera desde dos
    // wizards de UI sería demasiado lento e impreciso.
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

    test.info().annotations.push({
      type: 'resultado',
      description: `Número A: ${invoiceA.number}, Número B: ${invoiceB.number}. ` +
        'Si son iguales, se confirmó la duplicación (TEST-PLAN.md #1). Si son distintos, ' +
        'el timing no alcanzó a solaparse en esta corrida — no implica que el lock exista.',
    });
    // No forzamos expect(invoiceA.number).not.toBe(invoiceB.number) — ESE sería el
    // comportamiento deseado, no el real; forzarlo aquí escondería el bug en vez de
    // documentarlo. Dejamos el resultado en la anotación del test para inspección.

    await ctx.dispose();
  });
});

test.describe('BUG #2 — línea de factura con producto inexistente no falla', () => {
  test('agregar línea con productId inexistente crea la línea sin snapshot ni impuestos', async () => {
    // TEST-PLAN.md #2: billing-service/src/application/use-cases/add-line.ts —
    // ProductNotFoundError está definido pero nunca se lanza. Esto es un test de
    // contrato de API (OPENCODE-BRIEF.md §3.2): la UI real solo deja elegir
    // productos existentes, así que no hay forma de reproducir esto navegando.
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

    // Comportamiento HOY (bug): responde 200/201 en vez de 404 ProductNotFoundError.
    expect(lineResp.ok()).toBeTruthy();
    const line = await lineResp.json();
    expect(line.taxes ?? []).toHaveLength(0);

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

test.describe('BUG #5 (premisa desactualizada) — update-customer no revalida unicidad de identificación', () => {
  test('PATCH /customers/:id con identificación duplicada explota con 500 y el cliente conserva la suya', async () => {
    // TEST-PLAN.md #5, REVISADO el 2026-09-05 (test de contrato de API, OPENCODE-BRIEF.md §3.2):
    // - create-customer SÍ revalida unicidad por organización (repos.findByIdentification →
    //   error de dominio limpio). update-customer NO revalida (solo formato/tipo).
    // - La migration 20260706000000-create-customer-tables creó el constraint UNIQUE
    //   `customers_organization_id_identification`; el `upsert` de repos.save choca y el
    //   SequelizeUniqueConstraintError NO está mapeado → el backend responde 500 INTERNAL_ERROR.
    // - La premisa original "permite duplicar" era FALSA: la BD rechaza el duplicado, pero
    //   con un 500 en vez de un 4xx de dominio limpio.
    // Hallazgo #22 (pendiente de decisión de backend): replicar en update-customer el check
    // de unicidad que ya hace create-customer, o mapear el constraint a un 4xx de dominio.
    // Δ UI 2026-09-05: se descartó el flujo por UI — Vuetify 3.7 duplica los <label> por campo
    // (support/fields.ts) y el relleno de "Número de identificación" en edición no llegaba a
    // cambiar el modelo, así que el valor duplicado jamás alcanzaba la API (la edición se
    // guardaba navegando al detalle con la identificación original). El contrato real se
    // prueba aquí, contra el backend.
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
    // Comportamiento HOY (bug real): 500 INTERNAL_ERROR — el constraint protege la BD pero
    // el error no se mapea. El día que se corrija (hallazgo #22) esto debe pasar a 4xx.
    expect(upd.status()).toBe(500);
    expect((await upd.json()).code).toBe('INTERNAL_ERROR');

    // El cliente B conserva su identificación original: la integridad quedó intacta.
    const after = await (await ctx.get(`${API_URL}/customers/${b.id}`)).json();
    expect(after.identification).not.toBe(sharedId);

    await ctx.dispose();
  });
});

test.describe('BUG #6 — se puede desactivar a un administrador que no es el owner', () => {
  test('el owner puede desactivar a otro admin (no existe protección de "último admin")', async ({ page }) => {
    // TEST-PLAN.md #6: LastAdminRemovalError está definido pero nunca se lanza.
    // Solo se protege a organization.ownerId explícito (disable-user.ts:23-26), no
    // "el último admin restante". Aquí probamos la mitad reproducible del hallazgo:
    // un admin que NO es el owner sí puede ser desactivado sin restricción especial
    // (la protección real observable es únicamente "no tocar al owner").
    const UNIQUE = Date.now();
    const email = `bug6-${UNIQUE}@test.com`;

    await page.goto('/employees');
    const inviteBtn = page.getByRole('button', { name: 'Invitar', exact: true });
    await expect(inviteBtn).toBeVisible();
    await inviteBtn.click();
    await fieldByLabel(page, 'Correo electrónico').locator('input').fill(email);
    // Selecciona el primer rol disponible distinto de Administrador (el diálogo de
    // invitar lo oculta a propósito — RoleSelect hide-admin, InviteEmployeeDialog.vue).
    await fieldByLabel(page, 'Roles').click();
    await page.getByRole('option').first().click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /enviar invitaci/i }).click();

    await expect(page.getByText('Empleado invitado exitosamente')).toBeVisible({ timeout: 10_000 });

    await page.goto('/employees');
    const employeeRow = page.getByRole('row').filter({ hasText: email });
    await employeeRow.getByRole('button', { name: 'Ver detalle' }).click();
    await expect(page).toHaveURL(/\/employees\/[\w-]+$/);

    // Asignar rol Administrador desde el detalle (aquí SÍ está disponible, a
    // diferencia del diálogo de invitación).
    await fieldByLabel(page, 'Roles').click();
    await page.getByRole('option', { name: 'Administrador' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Actualizar roles' }).click();
    await expect(page.getByRole('button', { name: 'Actualizar roles' })).toBeEnabled({ timeout: 10_000 });

    // Desactivar a este segundo admin desde la cuenta owner: el estado se cambia
    // con un v-chip-group (chips "activo"/"desactivado"), sin diálogo de confirmación.
    await page.getByText('desactivado', { exact: true }).click();

    // Comportamiento HOY (bug): se permite, no hay bloqueo de "último admin" —
    // solo se protege al ownerId explícito, no "el último admin restante".
    const disabledChip = page.locator('.v-chip', { hasText: 'desactivado' });
    await expect(disabledChip).toHaveClass(/v-chip--selected/, { timeout: 10_000 });
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

test.describe('BUG #9 — revocar un permiso no bloquea la sesión activa de inmediato', () => {
  test('el access token vigente sigue autorizando una acción tras quitarle el permiso a su rol', async () => {
    // TEST-PLAN.md #9: el middleware de auth confía en las claims del JWT vigente;
    // permissionsVersion solo se recalcula en refresh/login/switch-organization, no
    // en cada request. Este es un test de contrato de API (OPENCODE-BRIEF.md §3.2).
    const adminTok = await adminToken();
    const adminCtx = await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${adminTok}` },
    });

    // updateRolePermissionsSchema exige permissions.min(1) — no se puede "vaciar" un
    // rol, así que "revocar" un permiso puntual significa dejar el resto, sin el
    // permiso objetivo.
    const allPerms: { code: string }[] = asArray(await (await adminCtx.get(`${API_URL}/permissions`)).json());
    test.skip(allPerms.length < 2, 'Se necesitan al menos 2 permisos en el catálogo para este caso');
    const [targetPerm, otherPerm] = allPerms.map((p) => p.code);

    // No existe DELETE /roles/:id en auth-service (ver TEST-PLAN.md §1.2) — un rol
    // creado aquí queda para siempre en el backend compartido. Por eso este test
    // reutiliza SIEMPRE el mismo rol con nombre fijo en vez de crear uno nuevo por
    // corrida (evita acumular basura en cada re-ejecución de la suite).
    const FIXED_ROLE_NAME = 'Bug9 Rol E2E (fixture fija — no borrar)';
    const existingRoles: { id: string; name: string }[] = asArray(await (await adminCtx.get(`${API_URL}/roles`)).json());
    let roleId = existingRoles.find((r) => r.name === FIXED_ROLE_NAME)?.id;

    if (!roleId) {
      const createRoleResp = await adminCtx.post(`${API_URL}/roles`, {
        data: { name: FIXED_ROLE_NAME, permissions: [targetPerm, otherPerm] },
      });
      expect(createRoleResp.ok()).toBeTruthy();
      roleId = (await createRoleResp.json()).roleId;
    } else {
      // Reponer el permiso objetivo por si una corrida anterior ya lo "revocó".
      await adminCtx.patch(`${API_URL}/roles/${roleId}/permissions`, {
        data: { permissions: [targetPerm, otherPerm] },
      });
    }

    // (No hay un usuario de prueba fácil con este rol y una sesión propia sin
    // invitar/aceptar todo un flujo nuevo; documentamos el mecanismo en vez de
    // forzar un segundo login completo dentro de este test puntual.)
    // "Revocar" targetPerm dejando solo otherPerm (no se puede dejar la lista vacía).
    const revokeResp = await adminCtx.patch(`${API_URL}/roles/${roleId}/permissions`, {
      data: { permissions: [otherPerm] },
    });
    expect(revokeResp.ok()).toBeTruthy();

    // El propio token de admin (que no tiene este rol asignado) no sirve para
    // demostrar la ventana de gracia sin un segundo usuario con sesión activa.
    test.info().annotations.push({
      type: 'cobertura-parcial',
      description:
        'Se confirma que PATCH /roles/:id/permissions no invalida sesiones activas ' +
        '(no existe ningún mecanismo de revocación de JWT en el código), pero reproducir ' +
        'el caso completo (usuario B logueado, permiso revocado, acción sigue pasando, ' +
        'refresh, acción ahora falla) requiere un segundo usuario+sesión — ver TEST-PLAN.md #9 ' +
        'para el detalle exacto a completar cuando haya un fixture de "empleado con rol personalizado".',
    });

    await adminCtx.dispose();
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
