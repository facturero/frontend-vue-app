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

async function newOrganization(label: string): Promise<{ api: APIRequestContext; token: string; organizationId: string }> {
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
  for (const code of ['finance.electronic_certificate']) {
    await api.post(`${API_URL}/organizations/me/plugins/${code}/activate`);
  }
  return { api, token: body.accessToken, organizationId: body.organizationId };
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
   * FACTURACION-BRECHAS.md, N13. La descarga pública (`GET /files/:id/download`)
   * sigue abierta para imágenes, que la interfaz pinta con <img src> sin token,
   * pero ya no entrega archivos fiscales: responde como si no existieran.
   */
  test('sin sesión no se obtiene un enlace al certificado', async () => {
    const anon = await playwrightRequest.newContext();
    const resp = await anon.get(`${API_URL}/files/${p12FileId}/download`, { maxRedirects: 0 });
    await anon.dispose();
    expect(resp.status()).toBe(404);
  });

  test('ni con sesión de otra organización', async () => {
    const resp = await intruder.api.get(`${API_URL}/files/${p12FileId}/download`, { maxRedirects: 0 });
    expect(resp.status()).toBe(404);
  });
});
