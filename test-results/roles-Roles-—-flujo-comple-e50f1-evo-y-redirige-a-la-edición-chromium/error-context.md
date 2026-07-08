# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: roles.spec.ts >> Roles — flujo completo >> crear un rol nuevo y redirige a la edición
- Location: e2e\specs\roles.spec.ts:7:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  getByText('Roles')
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Roles')
    13 × locator resolved to <div data-v-dd7b1159="" class="v-list-item-title">Roles</div>
       - unexpected value "hidden"

```

```yaml
- navigation:
  - list:
    - listitem: CRM Panel de adm.
    - separator
    - listitem: Inicio
    - listitem: Empleados
    - listitem: Roles
    - link "Organización":
      - /url: /organization/settings
    - link "Mi perfil":
      - /url: /profile
    - listitem: Clientes pronto
    - listitem: Facturas pronto
    - listitem: Productos pronto
  - separator
  - text: Colapsar
- main:
  - button "Placa":
    - status "Placa"
  - button
  - button
  - button
  - button "A"
  - heading "Configuración de la organización" [level=2]
  - paragraph: Datos básicos de tu organización. Estos datos se usarán en facturas y notificaciones.
  - text: Nombre legal
  - textbox "Nombre legal":
    - /placeholder: Ej. Mi Empresa S.A.S.
  - text: Nombre comercial
  - textbox "Nombre comercial":
    - /placeholder: Ej. MiEmpresa
  - button "Guardar cambios" [disabled]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const ROL_NAME = `Rol E2E ${Date.now()}`;
  4  | 
  5  | test.describe('Roles — flujo completo', () => {
  6  | 
  7  |   test('crear un rol nuevo y redirige a la edición', async ({ page }) => {
  8  |     await page.goto('/roles');
  9  | 
> 10 |     await expect(page.getByText('Roles')).toBeVisible();
     |                                           ^ Error: expect(locator).toBeVisible() failed
  11 | 
  12 |     await page.getByRole('button', { name: 'Nuevo rol' }).click();
  13 |     await expect(page).toHaveURL('/roles/new');
  14 | 
  15 |     await page.getByLabel('Nombre del rol').fill(ROL_NAME);
  16 |     await page.getByLabel('Descripción').fill('Rol creado desde E2E');
  17 | 
  18 |     // Seleccionar el primer permiso disponible
  19 |     const checkboxes = page.locator('.permission-selector input[type="checkbox"]');
  20 |     const firstCheckbox = checkboxes.first();
  21 |     await expect(firstCheckbox).toBeEnabled({ timeout: 5000 });
  22 |     await firstCheckbox.check();
  23 | 
  24 |     await page.getByRole('button', { name: 'Crear rol' }).click();
  25 | 
  26 |     // Redirige a la vista de edición
  27 |     await expect(page).toHaveURL(/\/roles\/[\w-]+\/edit/);
  28 |     await expect(page.getByText(ROL_NAME)).toBeVisible();
  29 |   });
  30 | 
  31 |   test('rol de sistema se muestra como no editable en la lista', async ({ page }) => {
  32 |     await page.goto('/roles');
  33 | 
  34 |     const systemChip = page.getByText('sistema').first();
  35 |     await expect(systemChip).toBeVisible();
  36 | 
  37 |     // La card del rol de sistema debe estar deshabilitada
  38 |     const systemCard = systemChip.locator('..').locator('..').locator('..');
  39 |     await expect(systemCard).toBeVisible();
  40 |   });
  41 | 
  42 |   test('editar permisos de un rol no-sistema', async ({ page }) => {
  43 |     await page.goto('/roles');
  44 | 
  45 |     // Click en el primer rol que NO sea de sistema
  46 |     const roleCards = page.locator('.v-card:not(.v-card--disabled)');
  47 |     const firstEditable = roleCards.filter({ hasNot: page.getByText('sistema') }).first();
  48 |     await expect(firstEditable).toBeVisible();
  49 |     await firstEditable.click();
  50 | 
  51 |     // Estamos en la vista de edición
  52 |     await expect(page).toHaveURL(/\/roles\/[\w-]+\/edit/);
  53 | 
  54 |     // Toggle del primer permiso
  55 |     const checkboxes = page.locator('.permission-selector input[type="checkbox"]');
  56 |     const firstCheckbox = checkboxes.first();
  57 |     await firstCheckbox.check();
  58 | 
  59 |     await page.getByRole('button', { name: 'Guardar cambios' }).click();
  60 |     await expect(page.getByText('Permisos actualizados')).toBeVisible();
  61 |   });
  62 | 
  63 | });
  64 | 
```