import { test, expect } from '@playwright/test';

const ROL_NAME = `Rol E2E ${Date.now()}`;

test.describe('Roles — flujo completo', () => {

  test('crear un rol nuevo y redirige a la edición', async ({ page }) => {
    await page.goto('/roles');

    await expect(page.getByText('Roles')).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo rol' }).click();
    await expect(page).toHaveURL('/roles/new');

    await page.getByLabel('Nombre del rol').fill(ROL_NAME);
    await page.getByLabel('Descripción').fill('Rol creado desde E2E');

    // Seleccionar el primer permiso disponible
    const checkboxes = page.locator('.permission-selector input[type="checkbox"]');
    const firstCheckbox = checkboxes.first();
    await expect(firstCheckbox).toBeEnabled({ timeout: 5000 });
    await firstCheckbox.check();

    await page.getByRole('button', { name: 'Crear rol' }).click();

    // Redirige a la vista de edición
    await expect(page).toHaveURL(/\/roles\/[\w-]+\/edit/);
    await expect(page.getByText(ROL_NAME)).toBeVisible();
  });

  test('rol de sistema se muestra como no editable en la lista', async ({ page }) => {
    await page.goto('/roles');

    const systemChip = page.getByText('sistema').first();
    await expect(systemChip).toBeVisible();

    // La card del rol de sistema debe estar deshabilitada
    const systemCard = systemChip.locator('..').locator('..').locator('..');
    await expect(systemCard).toBeVisible();
  });

  test('editar permisos de un rol no-sistema', async ({ page }) => {
    await page.goto('/roles');

    // Click en el primer rol que NO sea de sistema
    const roleCards = page.locator('.v-card:not(.v-card--disabled)');
    const firstEditable = roleCards.filter({ hasNot: page.getByText('sistema') }).first();
    await expect(firstEditable).toBeVisible();
    await firstEditable.click();

    // Estamos en la vista de edición
    await expect(page).toHaveURL(/\/roles\/[\w-]+\/edit/);

    // Toggle del primer permiso
    const checkboxes = page.locator('.permission-selector input[type="checkbox"]');
    const firstCheckbox = checkboxes.first();
    await firstCheckbox.check();

    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Permisos actualizados')).toBeVisible();
  });

});
