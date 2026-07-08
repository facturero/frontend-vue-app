# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Auth — flujo de registro e inicio de sesión >> registrar una cuenta nueva redirige al perfil
- Location: e2e\specs\auth.spec.ts:8:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected: "http://localhost:5173/profile"
Received: "http://localhost:5173/login"
Timeout:  5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    14 × unexpected value "http://localhost:5173/login"

```

```yaml
- main:
  - text: Crear cuenta Regístrate para empezar
  - alert:
    - text: La petición no es válida.
    - button "Cerrar"
  - textbox "Correo electrónico": e2e-1783535482877@test.com
  - text: Correo electrónico Cédula / RUC
  - textbox "Cédula / RUC"
  - textbox "Contraseña": Test123!
  - button "Contraseña acción añadida": 󰈉
  - text: Contraseña
  - textbox "Confirmar contraseña": Test123!
  - button "Confirmar contraseña acción añadida": 󰈉
  - text: Confirmar contraseña
  - button "Registrarse"
  - separator
  - button "Iniciar sesión con Google. Se abre en una pestaña nueva.":
    - img
    - text: Iniciar sesión con Google
  - iframe
  - button
  - heading "¿Ya tienes cuenta?" [level=6]
  - paragraph: Vuelve a iniciar sesión con tu cuenta existente.
  - button "Entrar"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const TEST_EMAIL = `e2e-${Date.now()}@test.com`;
  4  | const TEST_PASSWORD = 'Test123!';
  5  | 
  6  | test.describe('Auth — flujo de registro e inicio de sesión', () => {
  7  | 
  8  |   test('registrar una cuenta nueva redirige al perfil', async ({ browser }) => {
  9  |     // Sin storageState para que la página no arranque autenticada
  10 |     const ctx = await browser.newContext({ storageState: undefined });
  11 |     const page = await ctx.newPage();
  12 |     await page.goto('/login');
  13 | 
  14 |     // Click en "Registrarse" de la columna derecha (desktop)
  15 |     await page.getByRole('button', { name: 'Registrarse' }).click();
  16 | 
  17 |     await page.getByLabel('Correo electrónico').fill(TEST_EMAIL);
  18 |     await page.getByRole('textbox', { name: 'Contraseña', exact: true }).fill(TEST_PASSWORD);
  19 |     await page.getByRole('textbox', { name: 'Confirmar contraseña' }).fill(TEST_PASSWORD);
  20 |     await page.getByRole('button', { name: 'Registrarse' }).click();
  21 | 
  22 |     // Redirige a completar perfil (needsOrg)
> 23 |     await expect(page).toHaveURL('/profile');
     |                        ^ Error: expect(page).toHaveURL(expected) failed
  24 |     await expect(page.getByText('Completar perfil')).toBeVisible();
  25 |     await ctx.close();
  26 |   });
  27 | 
  28 |   test('login exitoso redirige al home', async ({ browser }) => {
  29 |     const ctx = await browser.newContext({ storageState: undefined });
  30 |     const page = await ctx.newPage();
  31 |     await page.goto('/login');
  32 | 
  33 |     await page.getByLabel('Correo electrónico').fill('admin@admin.com');
  34 |     await page.getByRole('button', { name: 'Siguiente' }).click();
  35 |     await page.getByLabel('Contraseña').fill('Admin123!');
  36 |     await page.getByRole('button', { name: 'Entrar' }).click();
  37 | 
  38 |     await expect(page).toHaveURL('/');
  39 |     await expect(page.getByText('Sesión activa')).toBeVisible();
  40 |     await expect(page.getByText('admin@admin.com')).toBeVisible();
  41 |     await ctx.close();
  42 |   });
  43 | 
  44 |   test('login con credenciales inválidas muestra error', async ({ browser }) => {
  45 |     const ctx = await browser.newContext({ storageState: undefined });
  46 |     const page = await ctx.newPage();
  47 |     await page.goto('/login');
  48 | 
  49 |     await page.getByLabel('Correo electrónico').fill('bad@email.com');
  50 |     await page.getByRole('button', { name: 'Siguiente' }).click();
  51 |     await page.getByLabel('Contraseña').fill('wrongpass');
  52 |     await page.getByRole('button', { name: 'Entrar' }).click();
  53 | 
  54 |     await expect(page.getByRole('alert')).toBeVisible();
  55 |     await ctx.close();
  56 |   });
  57 | 
  58 | });
  59 | 
```