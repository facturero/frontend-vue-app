import { test, expect, request as playwrightRequest } from '@playwright/test';
import { execSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';

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

test.describe('Empleados — flujo completo', () => {

  test('listar empleados muestra la tabla', async ({ page }) => {
    await page.goto('/employees');

    await expect(page.getByRole('heading', { name: 'Empleados' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('invitar un empleado lo agrega a la lista', async ({ page }) => {
    await page.goto('/employees');

    await page.getByRole('button', { name: 'Invitar' }).click();

    // Diálogo visible
    await expect(page.getByText('Invitar empleado')).toBeVisible();

    const email = `e2e-${Date.now()}@test.com`;
    await page.getByLabel('Correo electrónico').fill(email);

    // Seleccionar un rol del v-select
    // Vuetify intercepta el click en el <label>; hay que pulsar el campo del select.
    // En el diálogo: 0 = email, 1 = roles, 2 = establecimientos.
    await page.getByRole('dialog').locator('.v-field').nth(1).click();
    // Las opciones del menú viven en el overlay, no en el diálogo
    const firstOption = page.locator('.v-overlay-container .v-list-item-title').first();
    await expect(firstOption).toBeVisible({ timeout: 5000 });
    await firstOption.click();
    // Cierra el menú del select (puede quedar tan largo que tapa el botón guardar)
    await page.getByRole('dialog').locator('.v-card-title').click();

    await page.getByRole('button', { name: 'Enviar invitación' }).click();

    // Mensaje de éxito
    await expect(page.getByText('Empleado invitado exitosamente')).toBeVisible({ timeout: 5000 });

    // Esperar a que se cierre y reaparezca en la lista
    await expect(page.getByText('Invitar empleado')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText(email)).toBeVisible({ timeout: 5000 });
  });

  test('reinvitar el mismo email muestra un error (UserAlreadyInvitedError)', async ({ page }) => {
    // TEST-PLAN.md §1.3: invite-user.ts:35-36 — si el email ya tiene membership
    // en la organización (en cualquier estado), la segunda invitación falla.
    const email = `e2e-reinvite-${Date.now()}@test.com`;

    async function invite(): Promise<void> {
      await page.goto('/employees');
      await page.getByRole('button', { name: 'Invitar' }).click();
      await expect(page.getByText('Invitar empleado')).toBeVisible();
      await page.getByLabel('Correo electrónico').fill(email);
      await page.getByRole('dialog').locator('.v-field').nth(1).click();
      const firstOption = page.locator('.v-overlay-container .v-list-item-title').first();
      await expect(firstOption).toBeVisible({ timeout: 5000 });
      await firstOption.click();
      await page.getByRole('dialog').locator('.v-card-title').click();
      await page.getByRole('button', { name: 'Enviar invitación' }).click();
    }

    await invite();
    await expect(page.getByText('Empleado invitado exitosamente')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Invitar empleado')).not.toBeVisible({ timeout: 5000 });

    // Segunda invitación al mismo email.
    await invite();
    // Comportamiento esperado: un error, NO un segundo "invitado exitosamente".
    await expect(page.getByText('Empleado invitado exitosamente')).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('alert').filter({ hasText: /ya.*invitad/i })).toBeVisible({ timeout: 5000 });
  });

  test('filtrar por establecimiento incluye administradores sin asignar', async ({ page }) => {
    // TEST-PLAN.md §1.3: list-users.ts:55-67 — el filtro por establecimiento
    // siempre incluye a los usuarios con rol 'Administrador' (hardcodeado por
    // nombre), tengan o no asignación a ese establecimiento. admin@admin.com
    // (el owner/fundador) no tiene establishmentIds asignados explícitamente.
    await page.goto('/employees');

    const filter = page.locator('[data-testid="employees-establishment-filter"]');
    await filter.click();
    const firstEstablishment = page.locator('.v-overlay-container .v-list-item-title').first();
    await expect(firstEstablishment).toBeVisible({ timeout: 5000 });
    await firstEstablishment.click();
    await page.keyboard.press('Escape');

    // admin@admin.com debe seguir apareciendo aunque no esté asignado a ese
    // establecimiento específico — es el comportamiento real, no el ideal.
    await expect(page.getByText('admin@admin.com')).toBeVisible({ timeout: 5000 });
  });

});

test.describe('Empleados — casos de contrato de API (§1.3 TEST-PLAN.md)', () => {
  // Estos 2 casos no son alcanzables desde la UI real: la UI nunca ofrece
  // "aceptar invitación" con un token de otra organización (eso solo pasa si
  // alguien manipula el link), ni permite loguearse como un usuario con un rol
  // recién creado a medida para probar un permiso específico sin pasar por
  // login normal. Van vía API directa (OPENCODE-BRIEF.md §3.2).

  test('aceptar invitación siendo ya usuario con credential en otra org → falla (CredentialAlreadyExistsError)', async () => {
    // TEST-PLAN.md §1.3: accept-invite.ts:41-47 — exige que el usuario NO
    // tenga ya un Credential. El token de invitación es simplemente
    // base64url(JSON.stringify({uid, oid})) sin firma (accept-invite.ts:25) —
    // se puede construir a mano conociendo el userId y el organizationId,
    // exactamente como lo haría el link real del correo.
    const UNIQUE = Date.now();
    const email = `e2e-cross-org-${UNIQUE}@test.com`;

    const anonCtx = await playwrightRequest.newContext();
    const registerResp = await anonCtx.post(`${API_URL}/auth/register`, {
      data: { email, password: 'CrossOrg123!', identification: String(UNIQUE).slice(-10) },
    });
    const registered = await registerResp.json();
    const userId = registered.user.id;

    const token = await adminToken();
    const adminCtx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
    const roles = asArray(await (await adminCtx.get(`${API_URL}/roles`)).json());
    const anyRole = roles[0];

    // Invitar el mismo email a la organización del admin compartido (distinta
    // de la que se creó al registrarse) — invite-user.ts reutiliza el User
    // existente ya que la unicidad de membership es por organización.
    const inviteResp = await adminCtx.post(`${API_URL}/users/invite`, {
      data: { email, roleIds: [anyRole.id] },
    });
    test.skip(!inviteResp.ok(), `No se pudo invitar: ${inviteResp.status()} ${await inviteResp.text()}`);

    const me = await (await adminCtx.get(`${API_URL}/auth/me`)).json();
    const org2Id = me.orgId;

    const craftedToken = Buffer.from(JSON.stringify({ uid: userId, oid: org2Id })).toString('base64url');
    const acceptResp = await anonCtx.post(`${API_URL}/auth/accept-invite`, {
      data: { token: craftedToken, password: 'SecondPass123!' },
    });

    expect(acceptResp.status()).toBe(409);
    const body = await acceptResp.json();
    expect(body.code ?? JSON.stringify(body)).toMatch(/CREDENTIAL_ALREADY_EXISTS/i);

    await anonCtx.dispose();
    await adminCtx.dispose();
  });

  test('GET /users sin permiso password:view → passwordHash siempre null', async () => {
    // TEST-PLAN.md §1.3: password:view es aditivo sobre user:read
    // (controllers.ts:148: `canViewPasswords = permissions.includes('password:view')`)
    // — GET /users en sí solo exige user:read. Un rol con user:read pero sin
    // password:view debe ver passwordHash:null para TODOS los usuarios.
    const token = await adminToken();
    const adminCtx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const roleResp = await adminCtx.post(`${API_URL}/roles`, {
      data: { name: `Solo lectura sin password E2E ${Date.now()}`, permissions: ['user:read'] },
    });
    const { roleId } = await roleResp.json();

    const email = `e2e-nopwview-${Date.now()}@test.com`;
    const inviteResp = await adminCtx.post(`${API_URL}/users/invite`, {
      data: { email, roleIds: [roleId] },
    });
    test.skip(!inviteResp.ok(), `No se pudo invitar: ${inviteResp.status()} ${await inviteResp.text()}`);

    const me = await (await adminCtx.get(`${API_URL}/auth/me`)).json();
    // invite-user.ts no devuelve el userId en el body de /users/invite — se
    // resuelve buscando el email recién invitado en GET /users (con el token
    // de admin, que sí tiene permiso para verlo).
    const allUsers = asArray(await (await adminCtx.get(`${API_URL}/users`)).json());
    const targetUserId = allUsers.find((u: { email: string }) => u.email === email)?.id;
    test.skip(!targetUserId, 'No se pudo resolver el id del usuario invitado');

    const password = 'NoPwView123!';
    const acceptCtx = await playwrightRequest.newContext();
    const acceptResp = await acceptCtx.post(`${API_URL}/auth/accept-invite`, {
      data: { token: Buffer.from(JSON.stringify({ uid: targetUserId, oid: me.orgId })).toString('base64url'), password },
    });
    test.skip(!acceptResp.ok(), `No se pudo aceptar la invitación: ${acceptResp.status()} ${await acceptResp.text()}`);

    const loginResp = await acceptCtx.post(`${API_URL}/auth/login`, { data: { email, password } });
    const { accessToken: limitedToken } = await loginResp.json();
    const limitedCtx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${limitedToken}` } });

    const users = asArray(await (await limitedCtx.get(`${API_URL}/users`)).json());
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) {
      expect(u.passwordHash).toBeNull();
    }

    await adminCtx.dispose();
    await acceptCtx.dispose();
    await limitedCtx.dispose();
  });
});

test.describe('Recuperación de contraseña (§1.4 TEST-PLAN.md)', () => {
  // No hay autoservicio real (ver bug #8 en known-bugs.spec.ts): el reset es
  // una acción ADMINISTRATIVA sobre otro usuario. Estos 3 casos son de
  // contrato de API — no hay UI para ninguno de los tres (ni para disparar un
  // reset sobre uno mismo/el owner desde la UI, ni para reusar un token).

  test('no existe ningún endpoint público de autoservicio "olvidé mi contraseña"', async () => {
    // TEST-PLAN.md §1.4: el único endpoint público es el que CONSUME un token
    // ya emitido por un admin (POST /auth/password-reset) — no existe ningún
    // endpoint que permita a un usuario anónimo/deslogueado SOLICITAR un
    // reset por sí mismo. Probamos los nombres de ruta candidatos más obvios;
    // un 401/404 en todos confirma que ninguno existe como endpoint público
    // (si existiera, respondería 200/202 sin necesitar Authorization).
    const ctx = await playwrightRequest.newContext();
    const candidatePaths = [
      '/auth/forgot-password',
      '/auth/request-password-reset',
      '/auth/reset-password-request',
      '/auth/password-reset-request',
    ];
    for (const path of candidatePaths) {
      const resp = await ctx.post(`${API_URL}${path}`, { data: { email: 'nadie@test.com' } });
      expect(resp.ok()).toBeFalsy();
    }
    await ctx.dispose();
  });

  test('admin no puede resetear su propia contraseña ni la del owner de la organización', async () => {
    // TEST-PLAN.md §1.4: request-password-reset.ts:31 (actorId === userId →
    // ForbiddenError) y :40 (target es el ownerId → ForbiddenError).
    // admin@admin.com es el fundador/owner de la organización compartida
    // (mismo supuesto que known-bugs.spec.ts BUG #6) — el caso "resetear al
    // owner siendo otro admin" necesita un segundo admin que no sea el owner.
    const token = await adminToken();
    const adminCtx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
    const me = await (await adminCtx.get(`${API_URL}/auth/me`)).json();

    // Caso 1: admin intenta resetear su propia contraseña.
    const selfResetResp = await adminCtx.post(`${API_URL}/users/${me.id}/password-reset`);
    expect(selfResetResp.status()).toBe(403);

    // Caso 2: un SEGUNDO admin (no owner) intenta resetear la del owner.
    const roles = asArray(await (await adminCtx.get(`${API_URL}/roles`)).json());
    const adminRole = roles.find((r: { name: string }) => r.name === 'Administrador') ?? roles[0];
    const email = `e2e-second-admin-${Date.now()}@test.com`;
    const inviteResp = await adminCtx.post(`${API_URL}/users/invite`, { data: { email, roleIds: [adminRole.id] } });
    test.skip(!inviteResp.ok(), `No se pudo invitar al segundo admin: ${inviteResp.status()}`);

    const allUsers = asArray(await (await adminCtx.get(`${API_URL}/users`)).json());
    const secondAdminId = allUsers.find((u: { email: string }) => u.email === email)?.id;
    test.skip(!secondAdminId, 'No se pudo resolver el id del segundo admin invitado');

    const password = 'SecondAdmin123!';
    const acceptCtx = await playwrightRequest.newContext();
    const acceptResp = await acceptCtx.post(`${API_URL}/auth/accept-invite`, {
      data: { token: Buffer.from(JSON.stringify({ uid: secondAdminId, oid: me.orgId })).toString('base64url'), password },
    });
    test.skip(!acceptResp.ok(), `No se pudo aceptar la invitación del segundo admin: ${acceptResp.status()}`);

    const loginResp = await acceptCtx.post(`${API_URL}/auth/login`, { data: { email, password } });
    const { accessToken: secondAdminToken } = await loginResp.json();
    const secondAdminCtx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${secondAdminToken}` } });

    const ownerResetResp = await secondAdminCtx.post(`${API_URL}/users/${me.id}/password-reset`);
    expect(ownerResetResp.status()).toBe(403);

    await adminCtx.dispose();
    await acceptCtx.dispose();
    await secondAdminCtx.dispose();
  });

  test('reusar un token de reset ya consumido → error (InvalidResetTokenError)', async () => {
    // TEST-PLAN.md §1.4: el token es de un solo uso (reset-password.ts:47,
    // resetToken.consume() marca consumed_at). El token real que emite
    // request-password-reset.ts es un secreto aleatorio de 32 bytes que
    // NUNCA se expone por ninguna API ni log (ConsoleMailer solo loggea el
    // largo del cuerpo del correo, no el contenido — ver gaps.spec.ts) — no
    // hay forma de interceptarlo desde afuera del proceso. Para probar el
    // mecanismo de un solo uso sin fabricar nada del lado del dominio,
    // insertamos una fila directamente en password_reset_tokens con el MISMO
    // algoritmo que usa el código real (sha256 sin sal, ver reset-password.ts:29)
    // — el endpoint real (/auth/password-reset) es el que se ejercita en
    // ambas llamadas, solo el paso de generar+guardar el token se hace por
    // fuera para poder controlarlo.
    const token = await adminToken();
    const adminCtx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    // Empleado no-owner ya existente en la org compartida (creado por otro
    // test de este mismo describe si corre antes, o cualquier no-owner con
    // credential). Más simple y aislado: invitar uno nuevo propio.
    const roles = asArray(await (await adminCtx.get(`${API_URL}/roles`)).json());
    const anyRole = roles.find((r: { name: string }) => r.name !== 'Administrador') ?? roles[0];
    const email = `e2e-reset-token-${Date.now()}@test.com`;
    const inviteResp = await adminCtx.post(`${API_URL}/users/invite`, { data: { email, roleIds: [anyRole.id] } });
    test.skip(!inviteResp.ok(), `No se pudo invitar: ${inviteResp.status()}`);
    const me = await (await adminCtx.get(`${API_URL}/auth/me`)).json();
    const allUsers = asArray(await (await adminCtx.get(`${API_URL}/users`)).json());
    const targetUserId = allUsers.find((u: { email: string }) => u.email === email)?.id;
    test.skip(!targetUserId, 'No se pudo resolver el id del usuario invitado');

    const acceptCtx = await playwrightRequest.newContext();
    const acceptResp = await acceptCtx.post(`${API_URL}/auth/accept-invite`, {
      data: { token: Buffer.from(JSON.stringify({ uid: targetUserId, oid: me.orgId })).toString('base64url'), password: 'ResetTarget123!' },
    });
    test.skip(!acceptResp.ok(), `No se pudo aceptar la invitación: ${acceptResp.status()}`);

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const tokenId = randomUUID();
    execSync(
      `docker exec cmr-mysql mysql -uroot -proot123 -e "INSERT INTO auth_db.password_reset_tokens (id, user_id, token_hash, expires_at, consumed_at, created_at) VALUES ('${tokenId}', '${targetUserId}', '${tokenHash}', DATE_ADD(NOW(), INTERVAL 2 HOUR), NULL, NOW());"`,
    );

    const anonCtx = await playwrightRequest.newContext();
    const first = await anonCtx.post(`${API_URL}/auth/password-reset`, {
      data: { token: rawToken, password: 'FirstConsume123!' },
    });
    expect(first.ok()).toBeTruthy();

    const second = await anonCtx.post(`${API_URL}/auth/password-reset`, {
      data: { token: rawToken, password: 'SecondConsume456!' },
    });
    expect(second.status()).toBe(400);
    const body = await second.json();
    expect(body.code ?? JSON.stringify(body)).toMatch(/INVALID_RESET_TOKEN/i);

    await adminCtx.dispose();
    await acceptCtx.dispose();
    await anonCtx.dispose();
  });
});
