# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Auth — flujo de registro e inicio de sesión >> login con credenciales inválidas muestra error
- Location: e2e\specs\auth.spec.ts:44:3

# Error details

```
Error: locator.fill: Error: strict mode violation: getByLabel('Contraseña') resolved to 2 elements:
    1) <input size="1" value="admin" id="input-v-9" type="password" class="v-field__input" aria-labelledby="input-v-9-label"/> aka getByRole('textbox', { name: 'Contraseña' })
    2) <i tabindex="0" role="button" aria-hidden="false" aria-label="Contraseña acción añadida" class="mdi-eye-off mdi v-icon notranslate v-theme--light v-icon--size-default v-icon--clickable"></i> aka getByRole('button', { name: 'Contraseña acción añadida' })

Call log:
  - waiting for getByLabel('Contraseña')

```

# Page snapshot

```yaml
- main [ref=e5]:
  - generic [ref=e8]:
    - generic [ref=e9]:
      - generic [ref=e11]:
        - generic [ref=e12]: Iniciar sesión
        - generic [ref=e13]: Para acceder al panel
      - generic [ref=e14]:
        - generic [ref=e16]:
          - generic [ref=e17]:
            - generic [ref=e18]: bad@email.com
            - button "cambiar" [ref=e19] [cursor=pointer]:
              - generic [ref=e20]: cambiar
          - generic [ref=e23]:
            - textbox "Contraseña" [ref=e25]: admin
            - button "Contraseña acción añadida" [ref=e27] [cursor=pointer]: 󰈉
            - generic:
              - generic:
                - generic: Contraseña
          - button "Entrar" [ref=e28] [cursor=pointer]:
            - generic [ref=e29]: Entrar
          - link "¿Olvidaste tu contraseña?" [ref=e30] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e31]: ¿Olvidaste tu contraseña?
        - separator [ref=e33]
    - generic [ref=e34]:
      - button [ref=e36] [cursor=pointer]:
        - generic [ref=e38]: 󰗊
      - heading "¿Aún no estás registrado?" [level=6] [ref=e39]
      - paragraph [ref=e40]: ¿Perdiste el acceso a OneAuth? No te preocupes. Configura una frase de recuperación y un número de respaldo para recuperar OneAuth fácilmente.
      - button "Registrarse" [ref=e41] [cursor=pointer]:
        - generic [ref=e42]: Registrarse
        - generic [ref=e44]: 󰀔
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
  23 |     await expect(page).toHaveURL('/profile');
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
> 51 |     await page.getByLabel('Contraseña').fill('wrongpass');
     |                                         ^ Error: locator.fill: Error: strict mode violation: getByLabel('Contraseña') resolved to 2 elements:
  52 |     await page.getByRole('button', { name: 'Entrar' }).click();
  53 | 
  54 |     await expect(page.getByRole('alert')).toBeVisible();
  55 |     await ctx.close();
  56 |   });
  57 | 
  58 | });
  59 | 
```