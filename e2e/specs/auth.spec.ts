import { test, expect } from '@playwright/test';

const TEST_EMAIL = `e2e-${Date.now()}@test.com`;
const TEST_PASSWORD = 'Test123!';

test.describe('Auth — flujo de registro e inicio de sesión', () => {

  test('registrar una cuenta nueva redirige al perfil', async ({ browser }) => {
    // Sin storageState para que la página no arranque autenticada
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto('/login');

    // Click en "Registrarse" de la columna derecha (desktop)
    await page.getByRole('button', { name: 'Registrarse' }).click();

    await page.getByLabel('Correo electrónico').fill(TEST_EMAIL);
    await page.getByRole('textbox', { name: 'Contraseña', exact: true }).fill(TEST_PASSWORD);
    await page.getByRole('textbox', { name: 'Confirmar contraseña' }).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Registrarse' }).click();

    // Redirige a completar perfil (needsOrg)
    await expect(page).toHaveURL('/profile');
    await expect(page.getByText('Completar perfil')).toBeVisible();
    await ctx.close();
  });

  test('login exitoso redirige al home', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto('/login');

    await page.getByLabel('Correo electrónico').fill('admin@admin.com');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByLabel('Contraseña').fill('Admin123!');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByText('Sesión activa')).toBeVisible();
    await expect(page.getByText('admin@admin.com')).toBeVisible();
    await ctx.close();
  });

  test('login con credenciales inválidas muestra error', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto('/login');

    await page.getByLabel('Correo electrónico').fill('bad@email.com');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByLabel('Contraseña').fill('wrongpass');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await ctx.close();
  });

});
