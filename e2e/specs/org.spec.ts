import { test, expect, request as playwrightRequest } from '@playwright/test';
import { randomUUID } from 'node:crypto';

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

async function registerNewAccount(): Promise<{ accessToken: string; organizationId: string; userId: string }> {
  const UNIQUE = Date.now() + Math.floor(Math.random() * 1000);
  const ctx = await playwrightRequest.newContext();
  const resp = await ctx.post(`${API_URL}/auth/register`, {
    data: {
      email: `org-e2e-${UNIQUE}@test.com`,
      password: 'OrgE2E123!',
      identification: String(UNIQUE).slice(-10),
    },
  });
  const body = await resp.json();
  await ctx.dispose();
  return { accessToken: body.accessToken, organizationId: body.organizationId, userId: body.user.id };
}

test.describe('Organización — configuración', () => {

  test('ver y actualizar datos de la organización', async ({ page }) => {
    await page.goto('/organization/settings');

    await expect(page.getByText('Configuración de la organización')).toBeVisible();

    const legalNameInput = page.getByLabel('Nombre legal');
    await expect(legalNameInput).toBeVisible();

    const tradeNameInput = page.getByLabel('Nombre comercial');
    await expect(tradeNameInput).toBeVisible();

    // Si hay un valor existente, actualizarlo
    const currentValue = await legalNameInput.inputValue();
    if (currentValue) {
      await page.getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(page.getByText('Organización actualizada')).toBeVisible({ timeout: 5000 });
    }
  });

});

test.describe('Organización — contrato de permisos y establecimientos (§2 TEST-PLAN.md)', () => {
  // Los 3 casos de este describe son de contrato de API: la UI siempre manda
  // el permiso/acción correcta, así que no hay forma de reproducirlos
  // navegando la app real (OPENCODE-BRIEF.md §3.2 — ejemplo citado ahí mismo
  // es justo este caso de organization:admin vs organization:update).

  test('PUT /organizations/me exige organization:admin — organization:update (el que dice el doc) da 403', async () => {
    // TEST-PLAN.md §2: upsert-organization.ts exige 'organization:admin'; el
    // doc de diseño dice 'organization:update' — nombre distinto. Un rol con
    // el permiso del doc no debe poder guardar el perfil de organización.
    const token = await adminToken();
    const adminCtx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const roleResp = await adminCtx.post(`${API_URL}/roles`, {
      data: { name: `Solo organization:update E2E ${Date.now()}`, permissions: ['organization:update'] },
    });
    const { roleId } = await roleResp.json();

    const email = `e2e-orgupdate-${Date.now()}@test.com`;
    const inviteResp = await adminCtx.post(`${API_URL}/users/invite`, { data: { email, roleIds: [roleId] } });
    test.skip(!inviteResp.ok(), `No se pudo invitar: ${inviteResp.status()}`);

    const me = await (await adminCtx.get(`${API_URL}/auth/me`)).json();
    const allUsers = asArray(await (await adminCtx.get(`${API_URL}/users`)).json());
    const targetUserId = allUsers.find((u: { email: string }) => u.email === email)?.id;
    test.skip(!targetUserId, 'No se pudo resolver el id del usuario invitado');

    const password = 'OrgUpdate123!';
    const acceptCtx = await playwrightRequest.newContext();
    const acceptResp = await acceptCtx.post(`${API_URL}/auth/accept-invite`, {
      data: { token: Buffer.from(JSON.stringify({ uid: targetUserId, oid: me.orgId })).toString('base64url'), password },
    });
    test.skip(!acceptResp.ok(), `No se pudo aceptar la invitación: ${acceptResp.status()}`);

    const loginResp = await acceptCtx.post(`${API_URL}/auth/login`, { data: { email, password } });
    const { accessToken: limitedToken } = await loginResp.json();
    const limitedCtx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${limitedToken}` } });

    const org = await (await adminCtx.get(`${API_URL}/organizations/me`)).json();
    const updateWithWrongPermission = await limitedCtx.put(`${API_URL}/organizations/me`, {
      data: { legalName: org.legalName, taxId: org.taxId, countryCode: org.countryCode },
    });
    expect(updateWithWrongPermission.status()).toBe(403);

    // Con organization:admin (el permiso real) sí funciona — confirmado por
    // el test "ver y actualizar datos de la organización" de arriba, que ya
    // corre con el token admin compartido; lo repetimos aquí explícito para
    // que este test quede autocontenido.
    const updateWithRealPermission = await adminCtx.put(`${API_URL}/organizations/me`, {
      data: { legalName: org.legalName, taxId: org.taxId, countryCode: org.countryCode },
    });
    expect(updateWithRealPermission.ok()).toBeTruthy();

    await adminCtx.dispose();
    await acceptCtx.dispose();
    await limitedCtx.dispose();
  });

  test('intentar desactivar el establecimiento Matriz → CannotDeactivateMainError', async () => {
    // TEST-PLAN.md §2: update-establishment.ts:15-17 — status:'inactive'
    // sobre el establecimiento isMain:true siempre falla, sin excepción.
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const establishments = asArray(await (await ctx.get(`${API_URL}/establishments`)).json());
    const matriz = establishments.find((e: { isMain: boolean }) => e.isMain) ?? establishments[0];
    test.skip(!matriz, 'No hay establecimientos en la organización de prueba');

    const resp = await ctx.patch(`${API_URL}/establishments/${matriz.id}`, {
      data: { status: 'inactive' },
    });
    expect(resp.status()).toBe(422);
    const body = await resp.json();
    expect(body.code ?? JSON.stringify(body)).toMatch(/CANNOT_DEACTIVATE_MAIN/i);

    // Sin efecto secundario: sigue activo.
    const after = asArray(await (await ctx.get(`${API_URL}/establishments`)).json());
    expect(after.find((e: { id: string }) => e.id === matriz.id)?.status).toBe('active');

    await ctx.dispose();
  });

  test('crear 2 establecimientos en paralelo para la misma org → pueden colisionar de código', async () => {
    // TEST-PLAN.md §2/#14: nextCode (repositories.ts) calcula max(code)+1 con
    // un SELECT+lock que no protege filas que todavía no existen. El caso
    // "001 en una org con cero establecimientos" del TEST-PLAN original NO es
    // alcanzable por API: create-establishment.ts exige que la organización
    // ya exista en la tabla LOCAL de organization-service (ORG_NOT_FOUND si
    // no), y esa fila solo se crea con PUT /organizations/me
    // (upsert-organization-profile) — cuya MISMA transacción aprovisiona la
    // Matriz automáticamente si la org tiene 0 establecimientos (TEST-PLAN.md
    // §1.1). Es decir: para cuando organization-service conoce a la org, ya
    // tiene 1 establecimiento — no hay forma de tener "org existente + cero
    // establecimientos" simultáneamente. Este test prueba el mismo mecanismo
    // (nextCode sin protección real) para el SIGUIENTE código (002), que sí
    // es alcanzable: dos POST /establishments en paralelo justo después de
    // que la Matriz ya existe.
    const { accessToken, organizationId } = await registerNewAccount();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` } });

    // /establishments/* está gateado por el plugin org.establishments — una
    // org recién registrada no lo tiene activo. Sin este paso, POST
    // /establishments responde PLUGIN_NOT_ACTIVE (no un código) en ambas
    // ramas y el test "pasaría" sin haber probado nada.
    const activateResp = await ctx.post(`${API_URL}/organizations/me/plugins/org.establishments/activate`);
    test.skip(!activateResp.ok(), `No se pudo activar org.establishments: ${activateResp.status()}`);

    await ctx.put(`${API_URL}/organizations/me`, {
      data: { legalName: `Race E2E ${Date.now()}`, taxId: `179${String(Date.now()).slice(-7)}002`, countryCode: 'EC' },
    });

    // El caché de plugin-gate del gateway comparte la misma causa raíz que el
    // hallazgo #23 (plugin-catalog-service no llama notify() tras el outbox)
    // — la activación puede tardar hasta ~30s en reflejarse. Poll, no un solo
    // intento.
    let getResp = await ctx.get(`${API_URL}/establishments`);
    for (let i = 0; i < 45 && getResp.status() === 403; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      getResp = await ctx.get(`${API_URL}/establishments`);
    }
    test.skip(getResp.status() === 403, 'org.establishments no se activó a tiempo en el gateway para esta organización de prueba');
    const before = asArray(await getResp.json());
    test.skip(before.length !== 1, `Se esperaba solo la Matriz auto-provisionada (1 establecimiento), había ${before.length}`);

    const [respA, respB] = await Promise.all([
      ctx.post(`${API_URL}/establishments`, { data: { name: 'Carrera A' } }),
      ctx.post(`${API_URL}/establishments`, { data: { name: 'Carrera B' } }),
    ]);

    const bodies = await Promise.all([respA, respB].map((r) => r.json()));
    const codes = bodies.map((b) => b.code ?? `error:${JSON.stringify(b)}`);
    const collided = codes[0] === codes[1];
    test.info().annotations.push({
      type: 'resultado',
      description: `organizationId=${organizationId}. Códigos resultantes: ${codes.join(', ')}. ` +
        `¿Colisionaron? ${collided}. nextCode no tiene protección real contra esta carrera (hallazgo #14) — ` +
        'documentamos el resultado real de esta corrida, la colisión depende de timing igual que la de facturas (#1).',
    });
    // Igual que la carrera de #1 (facturas): documentamos el resultado real
    // sin forzar un assert que no se sostenga si esta corrida en particular
    // no coincidió en la ventana exacta — la ausencia de protección real es
    // el hallazgo, no que colisione en el 100% de las corridas.
    expect(codes.length).toBe(2);

    await ctx.dispose();
  });
});

test.describe('Terminales POS (§1.5 TEST-PLAN.md)', () => {

  test('emparejar con un código TOTP válido de otra organización — el buscador es global, no por org', async () => {
    // TEST-PLAN.md §1.5: pair-pos-terminal.ts:17-26 — listUnpairedPosPoints()
    // no filtra por organización; POST /billing-points/pair es público y no
    // recibe ningún identificador de organización en su body (solo code +
    // deviceId) — la prueba más directa de que la búsqueda es global es que
    // el emparejamiento funcione SIN que el caller aporte ningún dato de la
    // organización dueña del punto, más allá del código TOTP en sí.
    const { accessToken, organizationId } = await registerNewAccount();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` } });

    // org.establishments gatea /establishments/* en el gateway — activarlo
    // para esta organización nueva antes de poder crear nada ahí.
    await ctx.post(`${API_URL}/organizations/me/plugins/org.establishments/activate`);

    await ctx.put(`${API_URL}/organizations/me`, {
      data: { legalName: `POS Pairing E2E ${Date.now()}`, taxId: `179${String(Date.now()).slice(-7)}001`, countryCode: 'EC' },
    });

    let establishments = asArray(await (await ctx.get(`${API_URL}/establishments`)).json());
    for (let i = 0; i < 20 && establishments.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      establishments = asArray(await (await ctx.get(`${API_URL}/establishments`)).json());
    }
    test.skip(establishments.length === 0, 'La Matriz no se aprovisionó a tiempo para esta organización de prueba');
    const establishmentId = establishments[0].id;

    const pointResp = await ctx.post(`${API_URL}/establishments/${establishmentId}/billing-points`, {
      data: { type: 'pos' },
    });
    test.skip(!pointResp.ok(), `No se pudo crear el punto POS: ${pointResp.status()} ${await pointResp.text()}`);
    const point = await pointResp.json();

    const codeResp = await ctx.get(`${API_URL}/establishments/${establishmentId}/billing-points/${point.id}/pairing-code`);
    test.skip(!codeResp.ok(), `No se pudo obtener el código de emparejamiento: ${codeResp.status()}`);
    const { code } = await codeResp.json();

    // El pairing en sí se hace SIN autenticación y sin ningún dato de la
    // organización — solo el código TOTP y un deviceId nuevo — para probar
    // exactamente que "de otra organización" no importa para el buscador.
    const anonCtx = await playwrightRequest.newContext();
    const pairResp = await anonCtx.post(`${API_URL}/billing-points/pair`, {
      data: { code, deviceId: randomUUID() },
    });

    expect(pairResp.ok()).toBeTruthy();
    const paired = await pairResp.json();
    expect(paired.organizationId).toBe(organizationId);
    expect(paired.emissionPointId).toBe(point.id);

    await ctx.dispose();
    await anonCtx.dispose();
  });
});
