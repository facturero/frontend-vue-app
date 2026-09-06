/**
 * TEST-PLAN.md §4 — productos (product-service).
 *
 * `establishmentIds` requerido y "2 tasas del mismo kind" no son alcanzables desde la
 * UI: el botón "Crear producto" en ProductFormView.vue queda deshabilitado sin
 * establecimiento, y el formulario solo expone UN selector de IVA (no hay forma de
 * asignar 2 tasas del mismo kind desde ahí). Ambos casos van vía API directa
 * (OPENCODE-BRIEF.md §Lote 4). Tampoco existe ninguna UI de gestión de categorías
 * (crear/borrar) — solo se seleccionan categorías ya existentes al crear un producto.
 *
 * La promoción automática de imagen principal SÍ es 100% UI-testable
 * (ProductDetailView.vue tiene borrar/marcar-principal completos) y es el único caso
 * de este archivo que pasa por la UI real.
 */
import { test, expect, request as playwrightRequest } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const API_URL = 'http://localhost:8080';
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'Admin123!';
const UNIQUE = Date.now();

async function adminToken(): Promise<string> {
  const ctx = await playwrightRequest.newContext();
  const resp = await ctx.post(`${API_URL}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const { accessToken } = await resp.json();
  await ctx.dispose();
  return accessToken;
}

function asArray(body: unknown): any[] {
  return Array.isArray(body) ? body : ((body as any)?.items ?? (body as any)?.data ?? []);
}

// PNG 1x1 rojo — suficiente para pasar la validación "es una imagen" del uploader
// y del backend; no hace falta un archivo real de fixtures en el repo.
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function writeTempPng(name: string): string {
  const filePath = path.join(os.tmpdir(), name);
  fs.writeFileSync(filePath, ONE_PX_PNG);
  return filePath;
}

test.describe('Productos — validaciones de creación (API)', () => {

  test('crear producto sin establishmentIds → EstablishmentRequiredError', async () => {
    // TEST-PLAN.md §4: EstablishmentRequiredError, validado también en Zod (min(1)).
    // La UI nunca deja intentar este submit (botón disabled sin establecimiento) —
    // este es el único camino real para ejercitar la validación del backend.
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const resp = await ctx.post(`${API_URL}/products`, {
      data: {
        name: `Producto sin establecimiento ${UNIQUE}`,
        type: 'good',
        price: '10.00',
        currencyCode: 'USD',
        establishmentIds: [],
      },
    });

    expect(resp.status()).toBe(422);
    const body = await resp.json();
    expect(JSON.stringify(body)).toMatch(/establecimiento/i);

    await ctx.dispose();
  });

  test('asignar 2 tasas del mismo kind a un producto → MultipleTaxKindError', async () => {
    // TEST-PLAN.md §4: máximo una tasa de impuesto por kind. El formulario solo
    // expone un selector de IVA (single-select) — no hay forma de mandar 2 tasas
    // del mismo kind desde la UI. Vía API: 3 tasas EC son todas kind:'vat'
    // (IVA0/IVA15/NO_OBJETO), cualquier par sirve para disparar el error.
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const taxRates = asArray(await (await ctx.get(`${API_URL}/tax-rates`)).json());
    const vatRates = taxRates.filter((r: { kind: string }) => r.kind === 'vat');
    test.skip(vatRates.length < 2, 'No hay al menos 2 tasas de tipo vat en el seed para probar la colisión de kind');

    const establishment = asArray(await (await ctx.get(`${API_URL}/establishments`)).json())[0];
    test.skip(!establishment, 'No hay establecimientos en la organización de prueba');

    const resp = await ctx.post(`${API_URL}/products`, {
      data: {
        name: `Producto 2 tasas mismo kind ${UNIQUE}`,
        type: 'good',
        price: '10.00',
        currencyCode: 'USD',
        establishmentIds: [establishment.id],
        taxRateIds: [vatRates[0].id, vatRates[1].id],
      },
    });

    expect(resp.status()).toBe(422);
    const body = await resp.json();
    expect(JSON.stringify(body)).toMatch(/vat|kind|impuesto/i);

    await ctx.dispose();
  });

  test('borrar categoría con solo productos inactivos → sí lo permite', async () => {
    // TEST-PLAN.md §4: borrar categoría falla SOLO si tiene productos activos
    // (countProductsByCategory cuenta status:'active'). No existe ninguna UI de
    // gestión de categorías — todo el caso va vía API.
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const establishment = asArray(await (await ctx.get(`${API_URL}/establishments`)).json())[0];
    test.skip(!establishment, 'No hay establecimientos en la organización de prueba');

    const category = await (
      await ctx.post(`${API_URL}/categories`, { data: { name: `Categoría E2E ${UNIQUE}` } })
    ).json();

    const product = await (
      await ctx.post(`${API_URL}/products`, {
        data: {
          name: `Producto categoría E2E ${UNIQUE}`,
          type: 'good',
          price: '5.00',
          currencyCode: 'USD',
          establishmentIds: [establishment.id],
          categoryId: category.id,
        },
      })
    ).json();

    // Con el producto ACTIVO, borrar la categoría debe fallar (CannotDeleteCategoryWithProductsError, 422).
    const deleteWhileActive = await ctx.delete(`${API_URL}/categories/${category.id}`);
    expect(deleteWhileActive.status()).toBe(422);

    // Deshabilitar (no borrar) el producto — countProductsByCategory ya no lo cuenta.
    await ctx.post(`${API_URL}/products/${product.id}/disable`);

    const deleteAfterDisable = await ctx.delete(`${API_URL}/categories/${category.id}`);
    expect(deleteAfterDisable.ok()).toBeTruthy();

    await ctx.dispose();
  });
});

test.describe('Productos — imagen principal (UI real)', () => {

  test('borrar la imagen principal promueve automáticamente la siguiente', async ({ page }) => {
    // TEST-PLAN.md §4: la primera imagen se vuelve principal automáticamente;
    // borrar la principal promueve la siguiente por posición. Único caso de este
    // archivo genuinamente UI-testable (ProductDetailView.vue tiene borrar/marcar
    // principal completos).
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
    const establishment = asArray(await (await ctx.get(`${API_URL}/establishments`)).json())[0];
    test.skip(!establishment, 'No hay establecimientos en la organización de prueba');

    const product = await (
      await ctx.post(`${API_URL}/products`, {
        data: {
          name: `Producto imagen principal ${UNIQUE}`,
          type: 'good',
          price: '8.00',
          currencyCode: 'USD',
          establishmentIds: [establishment.id],
        },
      })
    ).json();
    await ctx.dispose();

    await page.goto(`/products/${product.id}`);
    await expect(page.getByText('Sin imágenes')).toBeVisible({ timeout: 10000 });

    const imgA = writeTempPng(`producto-img-a-${UNIQUE}.png`);
    const imgB = writeTempPng(`producto-img-b-${UNIQUE}.png`);

    // ImageUploader crea el <input type=file> dinámicamente en cada click
    // (openPicker()) — hay que capturar el filechooser nativo, no buscar el input.
    const chooserA = page.waitForEvent('filechooser');
    await page.locator('.image-uploader .drop-zone').click();
    (await chooserA).setFiles(imgA);

    const chooserB = page.waitForEvent('filechooser');
    await page.locator('.add-more-btn').click();
    (await chooserB).setFiles(imgB);

    await page.getByRole('button', { name: 'Subir imágenes' }).click();

    // Tras subir, ProductDetailView refetchea el producto y renderiza sus
    // imágenes reales (con el chip "Principal" en la primera) — no hay un
    // mensaje de éxito persistente que esperar (el estado "done" del
    // ImageUploader se resetea en cuanto cambian existingImages).
    const principalChip = page.locator('.v-chip', { hasText: 'Principal' });
    await expect(principalChip).toHaveCount(1, { timeout: 15000 });

    // La tarjeta de imagen es el div .position-relative que envuelve la v-img,
    // el overlay de hover y (si es principal) el chip — localizamos la que
    // tiene el chip "Principal" adentro.
    const primaryCard = page.locator('.position-relative.rounded-lg.overflow-hidden', {
      has: principalChip,
    });
    await primaryCard.hover();
    page.on('dialog', (dialog) => dialog.accept());
    await primaryCard.getByRole('button', { name: 'Eliminar' }).click();

    // Sigue habiendo exactamente una imagen marcada como principal — la
    // promoción automática de la siguiente por posición ocurrió.
    await expect(principalChip).toHaveCount(1, { timeout: 10000 });
  });
});
