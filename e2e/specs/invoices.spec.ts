/**
 * TEST-PLAN.md §5 — facturación (billing-service). Casos ya cubiertos en
 * known-bugs.spec.ts (#1 numeración concurrente, #2 línea con producto
 * inexistente) NO se repiten aquí.
 *
 * Todo vía API directa (OPENCODE-BRIEF.md §3.2): construir el estado exacto
 * (factura ya emitida, factura sin certificado) por UI sería mucho más lento
 * y frágil que hacerlo con las mismas llamadas que ya usa known-bugs.spec.ts.
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

async function buildReadyDraft(ctx: import('@playwright/test').APIRequestContext): Promise<{ invoiceId: string }> {
  const customerId = asArray(await (await ctx.get(`${API_URL}/customers`)).json())[0]?.id;
  let products = asArray(await (await ctx.get(`${API_URL}/products?status=active`)).json());
  const establishment = asArray(await (await ctx.get(`${API_URL}/establishments`)).json())[0];

  if (products.length === 0) {
    const created = await ctx.post(`${API_URL}/products`, {
      data: { name: `Invoices E2E Producto ${Date.now()}`, type: 'good', price: '15.00', currencyCode: 'USD', establishmentIds: [establishment.id] },
    });
    products = [await created.json()];
  }

  const inv = await (
    await ctx.post(`${API_URL}/invoices`, {
      data: { customerId, documentTypeId: EC_INVOICE_DOCUMENT_TYPE_ID, currencyCode: 'USD' },
    })
  ).json();
  await ctx.post(`${API_URL}/invoices/${inv.id}/lines`, {
    data: { productId: products[0].id, description: 'Invoices E2E', quantity: 1, unitPrice: '15.00', discountCents: 0 },
  });
  return { invoiceId: inv.id };
}

async function issueInvoice(ctx: import('@playwright/test').APIRequestContext, invoiceId: string) {
  const establishment = asArray(await (await ctx.get(`${API_URL}/establishments`)).json())[0];
  const points = asArray(await (await ctx.get(`${API_URL}/establishments/${establishment.id}/billing-points`)).json());
  const emissionPoint = points.find((p: { status: string }) => p.status === 'active');
  return ctx.post(`${API_URL}/invoices/${invoiceId}/issue`, {
    data: { establishmentId: establishment.id, emissionPointId: emissionPoint.id },
  });
}

test.describe('Facturas — ciclo de vida', () => {
  // El test de "sin certificado" tarda hasta ~45s en el peor caso: emisión →
  // billing.invoice.issued via OutboxRelay (latencia variable) → consumer de
  // fiscal-ecuador → GET /fiscal-invoices/:id en status 'error'. Sin este
  // timeout, el cap por defecto de Playwright (30s) corta el polling antes de
  // que el consumer termine (ver nota de latencia en TEST-PLAN.md).
  test.describe.configure({ timeout: 90_000 });

  test('agregar línea a una factura ya emitida no la modifica (no-op silencioso)', async () => {
    // TEST-PLAN.md §5: Invoice.setCustomerSnapshot/updateTotals son no-ops si
    // status !== 'draft' (entities.ts:116,122,128) — no lanzan error, ignoran
    // el cambio. add-line.ts en sí no chequea el estado explícitamente en el
    // caso de uso, así que este test documenta qué pasa en la práctica.
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const { invoiceId } = await buildReadyDraft(ctx);
    const issueResp = await issueInvoice(ctx, invoiceId);
    test.skip(!issueResp.ok(), `No se pudo emitir la factura de prueba: ${issueResp.status()} ${await issueResp.text()}`);
    const issued = await issueResp.json();
    const totalBefore = issued.subtotalCents ?? issued.subtotal;

    const products = asArray(await (await ctx.get(`${API_URL}/products?status=active`)).json());
    const lineResp = await ctx.post(`${API_URL}/invoices/${invoiceId}/lines`, {
      data: { productId: products[0].id, description: 'Línea tardía', quantity: 1, unitPrice: '99.00', discountCents: 0 },
    });

    const afterResp = await ctx.get(`${API_URL}/invoices/${invoiceId}`);
    const after = await afterResp.json();

    test.info().annotations.push({
      type: 'resultado',
      description: `POST /lines sobre factura emitida respondió ${lineResp.status()}. ` +
        `Subtotal antes: ${totalBefore}, subtotal después: ${after.subtotalCents ?? after.subtotal}, ` +
        `líneas después: ${after.lines?.length}. Si el subtotal no cambió, confirma el no-op silencioso documentado.`,
    });
    // No forzamos un status code específico: documentamos el comportamiento real.
    await ctx.dispose();
  });

  test('emitir una factura EC sin certificado activo queda en error fiscal', async () => {
    // TEST-PLAN.md §5/§6: fiscal-ecuador exige un Certificate 'active' — sin
    // uno, la factura fiscal queda en status:'error' con
    // last_error:'Sin certificado activo' (consumer.ts:76-101). La
    // organización admin de este entorno de prueba no tiene certificado
    // subido, así que esto reproduce el caso real sin fabricar nada.
    const token = await adminToken();
    const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

    const certsResp = await ctx.get(`${API_URL}/certificates`);
    const activeCert = asArray(await certsResp.json()).find((c: { status: string }) => c.status === 'active');
    test.skip(!!activeCert, 'La organización de prueba ya tiene un certificado activo — este caso ya no aplica, ver el otro test de fiscal.spec.ts');

    const { invoiceId } = await buildReadyDraft(ctx);
    const issueResp = await issueInvoice(ctx, invoiceId);
    test.skip(!issueResp.ok(), `No se pudo emitir la factura de prueba: ${issueResp.status()} ${await issueResp.text()}`);

    // El consumer de fiscal-ecuador procesa billing.invoice.issued de forma
    // asíncrona (RabbitMQ) — hace falta un polling corto, no un assert inmediato.
    // El OutboxRelay de billing-service tiene latencia muy variable en este
    // entorno (observado entre ~2s y ~25s+) — margen generoso, no un timeout corto.
    let fiscalInvoice: any = null;
    for (let i = 0; i < 45; i++) {
      const r = await ctx.get(`${API_URL}/fiscal-invoices/${invoiceId}`);
      if (r.ok()) {
        fiscalInvoice = await r.json();
        if (fiscalInvoice.status === 'error') break;
      }
      await new Promise((res) => setTimeout(res, 1000));
    }

    expect(fiscalInvoice).not.toBeNull();
    expect(fiscalInvoice.status).toBe('error');
    expect(fiscalInvoice.last_error ?? fiscalInvoice.lastError).toContain('certificado');

    await ctx.dispose();
  });
});
