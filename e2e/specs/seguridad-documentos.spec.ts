/**
 * Los certificados de firma (.p12) viven en document-service. Estos tests
 * comprueban, a través del gateway, que una organización no puede leer el
 * certificado de otra.
 *
 * Hallazgo que los originó (2026-09-13): el gateway reenviaba `X-Internal-Secret`
 * desde fuera y su valor de desarrollo está en el repo, así que cualquier
 * usuario autenticado leía el .p12 de otra empresa por la ruta interna.
 */
import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8080';
const DEV_INTERNAL_SECRET = 'dev-internal-secret-change-me';
const FISCAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../backend/fiscal-ecuador');

async function newOrganization(label: string): Promise<{ api: APIRequestContext; token: string; refreshToken: string; organizationId: string }> {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const anon = await playwrightRequest.newContext();
  const resp = await anon.post(`${API_URL}/auth/register`, {
    data: { email: `docs-${label}-${unique}@test.com`, password: 'DocsE2E123!', identification: unique.slice(-10) },
  });
  if (!resp.ok()) throw new Error(`registro ${label}: ${resp.status()} ${await resp.text()}`);
  const body = await resp.json();
  await anon.dispose();

  const api = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${body.accessToken}` } });
  await api.put(`${API_URL}/organizations/me`, {
    data: { legalName: `Docs ${label} ${unique}`, taxId: `179${unique.slice(-7)}001`, countryCode: 'EC' },
  });
  for (const code of ['finance.electronic_certificate', 'crm.contacts']) {
    await api.post(`${API_URL}/organizations/me/plugins/${code}/activate`);
  }
  return { api, token: body.accessToken, refreshToken: body.refreshToken, organizationId: body.organizationId };
}

test.describe('Certificados en document-service — aislamiento entre organizaciones', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ storageState: { cookies: [], origins: [] } });

  let owner: Awaited<ReturnType<typeof newOrganization>>;
  let intruder: Awaited<ReturnType<typeof newOrganization>>;
  let p12FileId = '';

  test.beforeAll(async () => {
    owner = await newOrganization('duena');
    intruder = await newOrganization('intrusa');

    const { p12, password } = JSON.parse(
      execFileSync(process.execPath, ['scripts/make-test-p12.mjs'], { cwd: FISCAL_DIR }).toString(),
    );
    let uploaded = false;
    for (let i = 0; i < 20 && !uploaded; i++) {
      const r = await owner.api.post(`${API_URL}/certificates`, {
        multipart: { file: { name: 'secreto.p12', mimeType: 'application/x-pkcs12', buffer: Buffer.from(p12, 'base64') }, password },
      });
      uploaded = r.ok();
      if (!uploaded) await new Promise((s) => setTimeout(s, 1500));
    }
    expect(uploaded, 'no se pudo subir el certificado de la organización dueña').toBe(true);

    const files = await (await owner.api.get(`${API_URL}/files`, {
      params: { resourceType: 'fiscal_certificate', resourceId: owner.organizationId },
    })).json();
    p12FileId = (files.files ?? files.items ?? files)[0]?.id;
    expect(p12FileId).toBeTruthy();
  });

  test.afterAll(async () => {
    await owner?.api.dispose();
    await intruder?.api.dispose();
  });

  test('otra organización no puede leer el .p12 por la ruta interna aunque mande el secreto', async () => {
    const resp = await intruder.api.get(`${API_URL}/files/${p12FileId}/content`, {
      headers: { 'X-Internal-Secret': DEV_INTERNAL_SECRET },
    });
    expect(resp.status()).toBe(401);
  });

  test('desde fuera no se pueden crear archivos internos mandando el secreto', async () => {
    const resp = await intruder.api.post(`${API_URL}/files/internal`, {
      headers: { 'X-Internal-Secret': DEV_INTERNAL_SECRET },
      multipart: {
        resourceType: 'fiscal_certificate', resourceId: owner.organizationId, category: 'certificado',
        originalName: 'falso.p12', mimeType: 'application/x-pkcs12', uploadedBy: 'intruso',
        file: { name: 'falso.p12', mimeType: 'application/x-pkcs12', buffer: Buffer.from('x') },
      },
    });
    expect(resp.status()).toBe(401);
  });

  /**
   * FACTURACION-BRECHAS.md, N13. La descarga ya no es pública: exige sesión y que
   * el archivo sea de la organización. Los archivos fiscales, además, no salen
   * nunca por aquí.
   */
  test('sin sesión no se obtiene un enlace al certificado', async () => {
    const anon = await playwrightRequest.newContext();
    const resp = await anon.get(`${API_URL}/files/${p12FileId}/download`, { maxRedirects: 0 });
    await anon.dispose();
    expect(resp.status()).toBe(401);
  });

  test('ni con sesión de otra organización', async () => {
    const resp = await intruder.api.get(`${API_URL}/files/${p12FileId}/download`, { maxRedirects: 0 });
    expect(resp.status()).toBe(404);
  });
});

/** Una imagen de cliente PNG de 1×1, como la subiría la interfaz. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('Imágenes y documentos — solo los ve su organización (N13)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  test.use({ storageState: { cookies: [], origins: [] } });

  let owner: Awaited<ReturnType<typeof newOrganization>>;
  let intruder: Awaited<ReturnType<typeof newOrganization>>;
  let customerId = '';
  let imageFileId = '';

  test.beforeAll(async () => {
    owner = await newOrganization('imagen-duena');
    intruder = await newOrganization('imagen-intrusa');

    const rucType = await retryUntil(async () =>
      ((await (await owner.api.get(`${API_URL}/identification-types`)).json()) as any[]).find((t) => t.code === 'RUC') ?? null);
    const customer = await retryUntil(async () => {
      const r = await owner.api.post(`${API_URL}/customers`, {
        data: { businessName: 'Cliente con logo', type: 'company', identificationTypeId: rucType.id, identification: '0992512549001' },
      });
      return r.ok() ? r.json() : null;
    });
    customerId = customer.id;

    // El mismo flujo que ImageUploader: pedir enlace de subida, subir a MinIO y confirmar.
    const presigned = await (await owner.api.post(`${API_URL}/files/presigned`, {
      data: { resourceType: 'customer', resourceId: customerId, category: 'logo', originalName: 'logo.png', mimeType: 'image/png', size: PIXEL_PNG.length },
    })).json();
    const put = await fetch(presigned.presignedUrl, { method: 'PUT', body: PIXEL_PNG, headers: { 'Content-Type': 'image/png' } });
    expect(put.ok, `subida a MinIO: ${put.status}`).toBe(true);
    const confirmed = await owner.api.patch(`${API_URL}/files/${presigned.fileId}/confirm`, { data: { checksum: 'e2e' } });
    expect(confirmed.ok()).toBe(true);
    imageFileId = presigned.fileId;

    const updated = await owner.api.patch(`${API_URL}/customers/${customerId}`, { data: { imageFileId } });
    expect(updated.ok(), await updated.text()).toBe(true);
  });

  test.afterAll(async () => {
    await owner?.api.dispose();
    await intruder?.api.dispose();
  });

  test('sin sesión no se descarga', async () => {
    const anon = await playwrightRequest.newContext();
    expect((await anon.get(`${API_URL}/files/${imageFileId}/download`, { maxRedirects: 0 })).status()).toBe(401);
    expect((await anon.get(`${API_URL}/files/${imageFileId}/url`)).status()).toBe(401);
    await anon.dispose();
  });

  test('otra organización no la ve, ni por id ni listando', async () => {
    expect((await intruder.api.get(`${API_URL}/files/${imageFileId}/url`)).status()).toBe(404);
    expect((await intruder.api.get(`${API_URL}/files/${imageFileId}/download`, { maxRedirects: 0 })).status()).toBe(404);
    expect((await intruder.api.get(`${API_URL}/files/${imageFileId}`)).status()).toBe(404);
    const list = await (await intruder.api.get(`${API_URL}/files`, { params: { resourceType: 'customer', resourceId: customerId } })).json();
    expect(list.total).toBe(0);
    expect((await intruder.api.delete(`${API_URL}/files/${imageFileId}`)).status()).toBe(404);
  });

  test('su organización obtiene un enlace que entrega la imagen', async () => {
    const resp = await owner.api.get(`${API_URL}/files/${imageFileId}/url`);
    expect(resp.status()).toBe(200);
    const { url } = await resp.json();
    const image = await fetch(url);
    expect(image.ok).toBe(true);
    expect(Buffer.from(await image.arrayBuffer()).equals(PIXEL_PNG)).toBe(true);
  });

  test('en la pantalla del cliente la imagen se ve, pedida con la sesión', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(({ a, r }) => {
      localStorage.setItem('accessToken', a);
      localStorage.setItem('refreshToken', r);
      localStorage.setItem('crm:tour:disabled', '1');
    }, { a: owner.token, r: owner.refreshToken });
    await page.goto(`/customers/${customerId}`);

    const avatar = page.locator('.v-avatar img').first();
    await expect(avatar).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => avatar.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    // Ya no apunta a la ruta del API sin token, sino al enlace firmado del almacenamiento.
    expect(await avatar.getAttribute('src')).not.toContain('/files/');
  });
});

async function retryUntil<T>(attempt: () => Promise<T | null>, timeoutMs = 45_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await attempt();
    if (value !== null) return value;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('no se cumplió a tiempo');
}
