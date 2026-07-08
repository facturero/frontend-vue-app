import { test, expect } from '@playwright/test';

test.describe('Empleados — flujo completo', () => {

  test('listar empleados muestra la tabla', async ({ page }) => {
    await page.goto('/employees');

    await expect(page.getByText('Empleados')).toBeVisible();
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
    const select = page.getByLabel('Roles');
    await select.click();
    const options = page.locator('.v-list-item-title');
    const firstOption = options.first();
    await expect(firstOption).toBeVisible({ timeout: 5000 });
    await firstOption.click();
    // Cerrar el menú
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Enviar invitación' }).click();

    // Mensaje de éxito
    await expect(page.getByText('Empleado invitado exitosamente')).toBeVisible({ timeout: 5000 });

    // Esperar a que se cierre y reaparezca en la lista
    await expect(page.getByText('Invitar empleado')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText(email)).toBeVisible({ timeout: 5000 });
  });

});
