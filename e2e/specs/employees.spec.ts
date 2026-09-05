import { test, expect } from '@playwright/test';

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

});
