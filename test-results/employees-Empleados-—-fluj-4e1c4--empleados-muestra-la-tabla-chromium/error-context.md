# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: employees.spec.ts >> Empleados — flujo completo >> listar empleados muestra la tabla
- Location: e2e\specs\employees.spec.ts:5:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  getByText('Empleados')
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Empleados')
    14 × locator resolved to <div data-v-dd7b1159="" class="v-list-item-title">Empleados</div>
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
  3  | test.describe('Empleados — flujo completo', () => {
  4  | 
  5  |   test('listar empleados muestra la tabla', async ({ page }) => {
  6  |     await page.goto('/employees');
  7  | 
> 8  |     await expect(page.getByText('Empleados')).toBeVisible();
     |                                               ^ Error: expect(locator).toBeVisible() failed
  9  |     await expect(page.getByRole('table')).toBeVisible();
  10 |   });
  11 | 
  12 |   test('invitar un empleado lo agrega a la lista', async ({ page }) => {
  13 |     await page.goto('/employees');
  14 | 
  15 |     await page.getByRole('button', { name: 'Invitar' }).click();
  16 | 
  17 |     // Diálogo visible
  18 |     await expect(page.getByText('Invitar empleado')).toBeVisible();
  19 | 
  20 |     const email = `e2e-${Date.now()}@test.com`;
  21 |     await page.getByLabel('Correo electrónico').fill(email);
  22 | 
  23 |     // Seleccionar un rol del v-select
  24 |     const select = page.getByLabel('Roles');
  25 |     await select.click();
  26 |     const options = page.locator('.v-list-item-title');
  27 |     const firstOption = options.first();
  28 |     await expect(firstOption).toBeVisible({ timeout: 5000 });
  29 |     await firstOption.click();
  30 |     // Cerrar el menú
  31 |     await page.keyboard.press('Escape');
  32 | 
  33 |     await page.getByRole('button', { name: 'Enviar invitación' }).click();
  34 | 
  35 |     // Mensaje de éxito
  36 |     await expect(page.getByText('Empleado invitado exitosamente')).toBeVisible({ timeout: 5000 });
  37 | 
  38 |     // Esperar a que se cierre y reaparezca en la lista
  39 |     await expect(page.getByText('Invitar empleado')).not.toBeVisible({ timeout: 5000 });
  40 |     await expect(page.getByText(email)).toBeVisible({ timeout: 5000 });
  41 |   });
  42 | 
  43 | });
  44 | 
```