import { test, expect } from '@playwright/test';

const TEST_EMAIL = `e2e-${Date.now()}@test.com`;
const TEST_PASSWORD = 'Test123!';
// Cédula única por ejecución: el backend rechaza identificaciones repetidas
const TEST_IDENTIFICATION = '1723456' + String(Date.now()).slice(-3);

test.describe('Auth — flujo de registro e inicio de sesión', () => {

  test('registrar una cuenta nueva redirige al perfil', async ({ browser }) => {
    // Sin storageState para que la página no arranque autenticada
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto('/login');

    // Cambia a modo registro desde el pie del formulario
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();

    await page.getByLabel('Correo electrónico').fill(TEST_EMAIL);
    await page.getByLabel('Cédula / RUC').fill(TEST_IDENTIFICATION);
    await page.getByLabel('Contraseña', { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel('Confirmar contraseña').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Registrarse', exact: true }).click();

    // Al registrarse con identificación, el guard redirige a configurar la organización
    await expect(page).toHaveURL('/organization/settings');
    await expect(page.getByText('Configuración de la organización')).toBeVisible();
    await ctx.close();
  });

  test('login exitoso redirige al home', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto('/login');

    await page.getByLabel('Correo electrónico').fill('admin@admin.com');
    await page.getByLabel('Contraseña', { exact: true }).fill('Admin123!');
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();

    await expect(page).toHaveURL('/');
    // El dashboard rediseñado muestra las tarjetas de métrica y el nombre de la organización
    await expect(page.getByText('Clientes activos')).toBeVisible();
    await expect(page.getByText('Demo Org')).toBeVisible();
    await ctx.close();
  });

  test('login con credenciales inválidas muestra error', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto('/login');

    await page.getByLabel('Correo electrónico').fill('bad@email.com');
    await page.getByLabel('Contraseña', { exact: true }).fill('wrongpass');
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await ctx.close();
  });

});
