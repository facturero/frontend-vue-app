import { test, expect } from '@playwright/test';

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
