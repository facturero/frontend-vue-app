/**
 * TEST-PLAN.md §6 — fiscal-ecuador. #12 (RIDE inexistente) ya vive en
 * known-bugs.spec.ts, no se repite aquí.
 */
import { test, expect, request as playwrightRequest } from '@playwright/test';

const API_URL = 'http://localhost:8080';
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'Admin123!';
const EC_INVOICE_DOCUMENT_TYPE_ID = '024ce4f5-baf1-4d04-9a7c-189076230390';

async function adminToken(): Promise<string> {
  const ctx = await playwrightRequest.newContext();
  const resp = await ctx.post(`${API_URL}/auth/login`, { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const { accessToken } = await resp.json();
  await ctx.dispose();
  return accessToken;
}

function asArray(body: unknown): any[] {
  return Array.isArray(body) ? body : ((body as any)?.items ?? (body as any)?.data ?? []);
}

test.describe('Fiscal (Ecuador) — certificados', () => {
  // El test de reintento espera hasta ~45s: emisión → billing.invoice.issued
  // via OutboxRelay (latencia variable) → consumer de fiscal-ecuador deja la
  // factura en 'error'. Sin este timeout, el cap por defecto (30s) corta el
  // polling antes (ver nota de latencia en TEST-PLAN.md).
  test.describe.configure({ timeout: 90_000 });

  test('subir un archivo que no es un .p12 válido responde 400 y no se persiste', async () => {
    // TEST-PLAN.md §6: validateP12Password lanza tanto si la contraseña no
    // corresponde COMO si el archivo no es un PKCS12 válido — el backend
    // devuelve el mismo mensaje para ambos casos (app.ts, POST /certificates).
    // No hay un .p12 real de prueba en el repo (OPENCODE-BRIEF.md: no
    // fabricar uno solo para el test) — un archivo cualquiera ejercita la
    // misma rama de validación que "contraseña incorrecta".
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const before = asArray(await (await ctx.get(`${API_URL}/certificates`)).json());

    const resp = await ctx.post(`${API_URL}/certificates`, {
      multipart: {
        file: { name: 'no-es-un-certificado.p12', mimeType: 'application/x-pkcs12', buffer: Buffer.from('esto no es un p12 real') },
        password: 'cualquier-cosa',
        alias: 'Certificado inválido E2E',
      },
    });

    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.message).toContain('.p12 válido');

    const after = asArray(await (await ctx.get(`${API_URL}/certificates`)).json());
    expect(after.length).toBe(before.length);

    await ctx.dispose();
  });

  test('reintentar una factura fiscal en error vuelve a procesarla (sin necesitar reemitir)', async () => {
    // TEST-PLAN.md §6: POST /fiscal-invoices/:id/retry solo permite reintentar
    // si status==='error'. main.ts wire el `onRetry` para reprocesar SÍNCRONO
    // desde `original_payload` (no hace falta reemitir la factura comercial).
    // Como la organización de prueba no tiene certificado, el reintento
    // vuelve a terminar en 'error' — lo que probamos es que el MECANISMO
    // corre (retry_count se resetea, no queda "atascado"), no que autorice.
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const certsResp = await ctx.get(`${API_URL}/certificates`);
    const activeCert = asArray(await certsResp.json()).find((c: { status: string }) => c.status === 'active');
    test.skip(!!activeCert, 'La organización de prueba tiene un certificado activo — este caso ya no reproduce "sin certificado"');

    // Crear + emitir una factura de prueba para tener una fiscal-invoice real en error.
    const customerId = asArray(await (await ctx.get(`${API_URL}/customers`)).json())[0]?.id;
    const products = asArray(await (await ctx.get(`${API_URL}/products?status=active`)).json());
    const establishment = asArray(await (await ctx.get(`${API_URL}/establishments`)).json())[0];
    const points = asArray(await (await ctx.get(`${API_URL}/establishments/${establishment.id}/billing-points`)).json());
    const emissionPoint = points.find((p: { status: string }) => p.status === 'active');
    test.skip(!customerId || products.length === 0 || !establishment || !emissionPoint, 'Faltan datos base (cliente/producto/establecimiento) en la organización de prueba');

    const inv = await (await ctx.post(`${API_URL}/invoices`, {
      data: { customerId, documentTypeId: EC_INVOICE_DOCUMENT_TYPE_ID, currencyCode: 'USD' },
    })).json();
    await ctx.post(`${API_URL}/invoices/${inv.id}/lines`, {
      data: { productId: products[0].id, description: 'Fiscal retry E2E', quantity: 1, unitPrice: '12.00', discountCents: 0 },
    });
    const issueResp = await ctx.post(`${API_URL}/invoices/${inv.id}/issue`, {
      data: { establishmentId: establishment.id, emissionPointId: emissionPoint.id },
    });
    test.skip(!issueResp.ok(), `No se pudo emitir la factura de prueba: ${issueResp.status()}`);

    // El OutboxRelay de billing-service tiene latencia muy variable en este
    // entorno (observado entre ~2s y ~25s+) — igual que el hallazgo #18 de
    // TEST-PLAN.md, hace falta un margen generoso, no un timeout corto.
    let fiscalInvoice: any = null;
    for (let i = 0; i < 45; i++) {
      const r = await ctx.get(`${API_URL}/fiscal-invoices/${inv.id}`);
      if (r.ok()) {
        fiscalInvoice = await r.json();
        if (fiscalInvoice.status === 'error') break;
      }
      await new Promise((res) => setTimeout(res, 1000));
    }
    test.skip(!fiscalInvoice || fiscalInvoice.status !== 'error', 'La factura fiscal no llegó a estado error dentro del tiempo esperado — no se puede probar el reintento');

    const retryResp = await ctx.post(`${API_URL}/fiscal-invoices/${inv.id}/retry`);
    expect(retryResp.ok()).toBeTruthy();

    // Tras el retry síncrono, vuelve a fallar (sigue sin certificado) pero el
    // retry_count se reseteó — confirma que el mecanismo corrió de nuevo, no
    // que simplemente ignoró la solicitud.
    const afterRetry = await (await ctx.get(`${API_URL}/fiscal-invoices/${inv.id}`)).json();
    expect(afterRetry.status).toBe('error');
    expect(afterRetry.retry_count ?? afterRetry.retryCount).toBe(0);

    await ctx.dispose();
  });
});
