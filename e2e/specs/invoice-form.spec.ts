/**
 * Formulario de factura (InvoiceFormView), por la interfaz.
 *
 * Fija el comportamiento de la pantalla antes de partirla en componentes
 * (FACTURACION-BRECHAS.md #40): el refactor no puede cambiar nada de lo que
 * comprueba este archivo. Usa una organización propia para no depender de los
 * datos del admin compartido.
 */
import { test, expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fieldByLabel } from '../support/fields';
import { waitForCondition } from '../support/wait-for';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8080';
const FISCAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../backend/fiscal-ecuador');
type Json = Record<string, any>;
const asArray = (b: unknown): any[] => (Array.isArray(b) ? b : ((b as Json)?.items ?? (b as Json)?.data ?? []));

let api: APIRequestContext;
let tokens: { accessToken: string; refreshToken: string };
let customerName = '';
let productName = '';

async function retrying<T>(what: string, attempt: () => Promise<T | null>): Promise<T> {
  let value: T | null = null;
  await waitForCondition(async () => (value = await attempt()) !== null, { timeoutMs: 45_000, intervalMs: 1500, message: what });
  return value!;
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto('/login');
  await page.evaluate(({ a, r }) => {
    localStorage.setItem('accessToken', a);
    localStorage.setItem('refreshToken', r);
    localStorage.setItem('crm:tour:disabled', '1');
  }, { a: tokens.accessToken, r: tokens.refreshToken });
  await page.goto(path);
}

/** Elige una opción de un v-select/v-autocomplete por su etiqueta. */
async function pick(page: Page, field: ReturnType<Page['locator']>, option: string | RegExp, type?: string): Promise<void> {
  await field.click();
  if (type) await field.locator('input').fill(type);
  await page.getByRole('option', { name: option }).first().click();
}

test.describe.serial('Formulario de factura', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    const unique = `${Date.now()}`;
    const anon = await playwrightRequest.newContext();
    const reg = await (await anon.post(`${API_URL}/auth/register`, {
      data: { email: `form-e2e-${unique}@test.com`, password: 'FormE2E123!', identification: unique.slice(-10) },
    })).json();
    await anon.dispose();
    tokens = { accessToken: reg.accessToken, refreshToken: reg.refreshToken };
    api = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${reg.accessToken}` } });

    await api.put(`${API_URL}/organizations/me`, { data: { legalName: `Formulario E2E ${unique}`, taxId: `179${unique.slice(-7)}001`, countryCode: 'EC' } });
    for (const code of ['org.establishments', 'crm.contacts', 'infra.catalog_products', 'finance.electronic_invoicing']) {
      await api.post(`${API_URL}/organizations/me/plugins/${code}/activate`);
    }
    const establishment = await retrying('Matriz', async () => asArray(await (await api.get(`${API_URL}/establishments`)).json())[0] ?? null);
    await api.patch(`${API_URL}/establishments/${establishment.id}`, { data: { address: 'Quito' } });

    const rucType = await retrying('tipos de identificación', async () =>
      asArray(await (await api.get(`${API_URL}/identification-types`)).json()).find((t: Json) => t.code === 'RUC') ?? null);
    customerName = `Cliente Formulario ${unique.slice(-5)}`;
    await retrying('cliente', async () => {
      const r = await api.post(`${API_URL}/customers`, { data: { businessName: customerName, type: 'company', identificationTypeId: rucType.id, identification: '0992512549001' } });
      return r.ok() ? r.json() : null;
    });
    const iva15 = asArray(await (await api.get(`${API_URL}/countries/EC/tax-rates`)).json()).find((t: Json) => t.code === 'IVA15');
    productName = `Producto Formulario ${unique.slice(-5)}`;
    await retrying('producto', async () => {
      const r = await api.post(`${API_URL}/products`, { data: { name: productName, type: 'good', price: '12.50', currencyCode: 'USD', establishmentIds: [establishment.id], taxRateIds: [iva15.id] } });
      return r.ok() ? r.json() : null;
    });
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  let draftUrl = '';

  test('elegir cliente crea el borrador; añadir y quitar líneas actualiza los totales', async ({ page }) => {
    await open(page, '/invoices/new');
    await expect(page.getByText('Selecciona un cliente para empezar a agregar productos.')).toBeVisible();

    const createDraft = page.waitForResponse((r) => r.url().endsWith('/invoices') && r.request().method() === 'POST');
    await pick(page, fieldByLabel(page, 'Cliente'), new RegExp(customerName), customerName.slice(0, 8));
    const draft = await (await createDraft).json();
    draftUrl = `/invoices/${draft.id}/edit`;

    await expect(page.locator('.v-chip').getByText('Borrador')).toBeVisible();
    await expect(page.getByText('Selecciona un cliente para empezar a agregar productos.')).toHaveCount(0);

    // Elegir el producto trae su precio al campo.
    const inputRow = page.locator('tr.line-input-row');
    await pick(page, inputRow.locator('.v-field').nth(0), new RegExp(productName));
    await expect(inputRow.locator('input').nth(3)).toHaveValue('12.50');
    await inputRow.locator('input').nth(2).fill('2');
    await page.getByTitle('Agregar línea').click();

    const line = page.locator('tbody tr').filter({ hasText: productName }).first();
    await expect(line).toContainText('25.00');
    await expect(page.getByText('$25.00')).toBeVisible(); // subtotal
    await expect(page.getByText('$3.75')).toBeVisible();  // IVA 15%
    await expect(page.getByText('$28.75')).toBeVisible(); // total
    // Tras añadir, la fila de captura queda limpia.
    await expect(inputRow.locator('input').nth(3)).toHaveValue('0.00');

    // Quitar la línea deja los totales a cero y vuelve a pedir líneas.
    await line.getByTitle('Eliminar línea').click();
    await expect(page.locator('tbody tr').filter({ hasText: productName })).toHaveCount(0);
    await expect(page.getByText('Agrega al menos una línea de producto para poder emitir la factura.')).toBeVisible();
  });

  test('el borrador se reabre en modo edición con su cliente y sus líneas', async ({ page }) => {
    const draftId = draftUrl.split('/')[2];
    const product = asArray(await (await api.get(`${API_URL}/products`)).json()).find((p: Json) => p.name === productName);
    await api.post(`${API_URL}/invoices/${draftId}/lines`, { data: { productId: product.id, description: 'Añadida por API', quantity: 1, unitPrice: '12.50', discountCents: 0 } });

    await open(page, draftUrl);
    await expect(page.getByRole('heading', { name: 'Editar factura' })).toBeVisible();
    await expect(page.locator('.v-chip').getByText('Borrador')).toBeVisible();
    await expect(page.getByText('Añadida por API')).toBeVisible();
    await expect(page.getByText('$14.38')).toBeVisible();
  });

  test('sin certificado avisa, y el certificado se sube desde el propio formulario', async ({ page }) => {
    await open(page, draftUrl);
    const hint = page.getByText(/No tienes un certificado electrónico activo/);
    await expect(hint).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /Subir certificado/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('El archivo y la contraseña se guardan cifrados.')).toBeVisible();

    const { p12, password } = JSON.parse(execFileSync(process.execPath, ['scripts/make-test-p12.mjs'], { cwd: FISCAL_DIR }).toString());
    const dir = mkdtempSync(resolve(tmpdir(), 'p12-'));
    const file = resolve(dir, 'firma.p12');
    writeFileSync(file, Buffer.from(p12, 'base64'));

    await dialog.locator('input[type="file"]').setInputFiles(file);
    await fieldByLabel(page, 'Contraseña del certificado').locator('input').fill(password);
    const upload = page.waitForResponse((r) => r.url().endsWith('/certificates') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: /Subir/ }).click();
    expect((await upload).status()).toBe(201);

    await expect(dialog).toHaveCount(0);
    await expect(hint).toHaveCount(0);
  });

  test('emitir exige establecimiento y punto de emisión, y lleva al detalle', async ({ page }) => {
    await open(page, draftUrl);
    const issue = page.getByRole('button', { name: 'Emitir factura' });
    await expect(issue).toBeDisabled();

    await pick(page, fieldByLabel(page, 'Establecimiento'), /^001 — /);
    await expect(issue).toBeDisabled();
    await pick(page, fieldByLabel(page, 'Punto de emisión'), /^001 — /);
    await expect(issue).toBeEnabled();

    await issue.click();
    await expect(page).toHaveURL(new RegExp(`/invoices/${draftUrl.split('/')[2]}$`), { timeout: 20_000 });
    await expect(page.getByText(/001-001-\d{9}/).first()).toBeVisible();
  });

  test('una factura ya emitida no se puede editar', async ({ page }) => {
    await open(page, draftUrl);
    await expect(page.getByText('Esta factura ya no es un borrador, no se puede editar.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Emitir factura' })).toHaveCount(0);
  });
});
