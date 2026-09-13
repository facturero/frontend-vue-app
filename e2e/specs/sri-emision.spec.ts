/**
 * Facturación electrónica de punta a punta contra el SRI de PRUEBAS (celcer).
 *
 * Valida lo que los tests unitarios no pueden: que el comprobante que sale de
 * este stack (billing → RabbitMQ → fiscal-ecuador → document-service → SRI)
 * llega al SRI y el SRI lo entiende; y que la interfaz muestra ese estado y
 * permite reintentar.
 *
 * Crea su propia cuenta y organización (no toca la del admin compartido).
 *
 * Requisitos: el docker-compose levantado (gateway en :8080), el frontend en
 * :5173 apuntando a ese gateway, y salida a internet hacia celcer.sri.gob.ec.
 *
 * Qué esperar del SRI: la organización de prueba tiene un RUC inventado, así
 * que el SRI la devuelve con "No existe un contribuyente registrado con el RUC".
 * Eso ya demuestra lo importante: el SOAP, la firma y el XML se aceptaron lo
 * bastante como para llegar a validar el contribuyente. Cualquier OTRO motivo
 * de rechazo hace fallar el test. Con `SRI_E2E_RUC` (un RUC registrado en el
 * ambiente de pruebas) se exige que el SRI lo reciba.
 */
import { test, expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldByLabel } from '../support/fields';
import { waitForCondition } from '../support/wait-for';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8080';
const REGISTERED_RUC = process.env.SRI_E2E_RUC;
const FISCAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../backend/fiscal-ecuador');
const EC_INVOICE_DOCUMENT_TYPE_CODE = '01';
const RIMPE = 'CONTRIBUYENTE RÉGIMEN RIMPE';

type Json = Record<string, any>;
const asArray = (body: unknown): any[] => (Array.isArray(body) ? body : ((body as Json)?.items ?? (body as Json)?.data ?? []));

interface Setup {
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  ruc: string;
  establishmentId: string;
  emissionPointId: string;
  customerId: string;
  productId: string;
  documentTypeId: string;
  certificateId: string;
}

let setup: Setup;
let api: APIRequestContext;

async function ok(resp: Awaited<ReturnType<APIRequestContext['get']>>, what: string): Promise<Json> {
  if (!resp.ok()) throw new Error(`${what}: ${resp.status()} ${await resp.text()}`);
  return resp.json();
}

/** Algunas altas dependen de eventos (plugins activados, catálogos): se reintentan un rato. */
async function retrying<T>(what: string, attempt: () => Promise<T | null>, timeoutMs = 45_000): Promise<T> {
  let result: T | null = null;
  await waitForCondition(async () => (result = await attempt()) !== null, { timeoutMs, intervalMs: 1500, message: what });
  return result!;
}

function testCertificate(): { p12: Buffer; password: string } {
  const out = execFileSync(process.execPath, ['scripts/make-test-p12.mjs'], { cwd: FISCAL_DIR }).toString();
  const { p12, password } = JSON.parse(out);
  return { p12: Buffer.from(p12, 'base64'), password };
}

async function uploadCertificate(): Promise<string> {
  const { p12, password } = testCertificate();
  const cert = await retrying('subir certificado', async () => {
    const r = await api.post(`${API_URL}/certificates`, {
      multipart: { file: { name: 'prueba-e2e.p12', mimeType: 'application/x-pkcs12', buffer: p12 }, password, alias: 'E2E' },
    });
    return r.ok() ? r.json() : null;
  });
  return cert.id;
}

async function issueInvoice(customerId = setup.customerId): Promise<string> {
  const invoice = await ok(
    await api.post(`${API_URL}/invoices`, {
      data: { customerId, documentTypeId: setup.documentTypeId, currencyCode: 'USD' },
    }),
    'crear factura',
  );
  await ok(
    await api.post(`${API_URL}/invoices/${invoice.id}/lines`, {
      data: { productId: setup.productId, description: 'Producto SRI E2E', quantity: 2, unitPrice: '10.00', discountCents: 0 },
    }),
    'agregar línea',
  );
  await ok(
    await api.post(`${API_URL}/invoices/${invoice.id}/issue`, {
      data: { establishmentId: setup.establishmentId, emissionPointId: setup.emissionPointId },
    }),
    'emitir',
  );
  return invoice.id;
}

/** Espera a que fiscal-ecuador cumpla `done` con la factura (llega por RabbitMQ). */
async function fiscalInvoice(invoiceId: string, done: (f: Json) => boolean, timeoutMs = 90_000): Promise<Json> {
  return retrying(`factura fiscal de ${invoiceId}`, async () => {
    const r = await api.get(`${API_URL}/fiscal-invoices/${invoiceId}`);
    if (!r.ok()) return null;
    const f = await r.json();
    return done(f) ? f : null;
  }, timeoutMs);
}

async function openAs(page: Page, path: string): Promise<void> {
  await page.goto('/login');
  await page.evaluate(({ a, r }) => {
    localStorage.setItem('accessToken', a);
    localStorage.setItem('refreshToken', r);
    localStorage.setItem('crm:tour:disabled', '1');
  }, { a: setup.accessToken, r: setup.refreshToken });
  await page.goto(path);
}

test.describe.serial('Facturación electrónica SRI — punta a punta', () => {
  test.describe.configure({ timeout: 240_000 });
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    const unique = Date.now();
    const email = `sri-e2e-${unique}@test.com`;
    const password = 'SriE2E123!';
    const anon = await playwrightRequest.newContext();
    const registered = await ok(
      await anon.post(`${API_URL}/auth/register`, { data: { email, password, identification: String(unique).slice(-10) } }),
      'registrar cuenta',
    );
    await anon.dispose();

    api = await playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${registered.accessToken}` } });
    const ruc = REGISTERED_RUC ?? `179${String(unique).slice(-7)}001`;

    await ok(await api.put(`${API_URL}/organizations/me`, {
      data: { legalName: `SRI E2E ${unique}`, tradeName: 'SRI E2E', taxId: ruc, countryCode: 'EC' },
    }), 'completar organización');

    for (const code of ['org.establishments', 'crm.contacts', 'infra.catalog_products', 'finance.electronic_invoicing']) {
      const r = await api.post(`${API_URL}/organizations/me/plugins/${code}/activate`);
      if (!r.ok() && r.status() !== 409) throw new Error(`activar ${code}: ${r.status()} ${await r.text()}`);
    }

    const establishment = await retrying('Matriz creada', async () =>
      asArray(await (await api.get(`${API_URL}/establishments`)).json())[0] ?? null);
    await ok(await api.patch(`${API_URL}/establishments/${establishment.id}`, {
      data: { address: 'Av. Amazonas N34-12, Quito' },
    }), 'dirección del establecimiento');
    const point = asArray(await (await api.get(`${API_URL}/establishments/${establishment.id}/billing-points`)).json())
      .find((p: Json) => p.status === 'active');

    // El tipo de identificación del cliente sale del catálogo de customer-service,
    // que tiene ids propios (distintos de tax-service).
    const rucType = await retrying('tipos de identificación', async () =>
      asArray(await (await api.get(`${API_URL}/identification-types`)).json()).find((t: Json) => t.code === 'RUC') ?? null);
    const customer = await retrying('crear cliente', async () => {
      const r = await api.post(`${API_URL}/customers`, {
        data: { businessName: 'Cliente Pruebas SRI', type: 'company', identificationTypeId: rucType.id, identification: '0992512549001', email: 'cliente@test.com' },
      });
      return r.ok() ? r.json() : null;
    });

    const iva15 = asArray(await (await api.get(`${API_URL}/countries/EC/tax-rates`)).json()).find((t: Json) => t.code === 'IVA15');
    const product = await retrying('crear producto', async () => {
      const r = await api.post(`${API_URL}/products`, {
        data: { name: 'Producto SRI E2E', type: 'good', price: '10.00', currencyCode: 'USD', sku: 'SRI-E2E-1', establishmentIds: [establishment.id], taxRateIds: [iva15.id] },
      });
      return r.ok() ? r.json() : null;
    });

    const documentType = asArray(await (await api.get(`${API_URL}/countries/EC/document-types`)).json())
      .find((d: Json) => d.code === EC_INVOICE_DOCUMENT_TYPE_CODE);

    setup = {
      email, password, ruc,
      accessToken: registered.accessToken,
      refreshToken: registered.refreshToken,
      establishmentId: establishment.id,
      emissionPointId: point.id,
      customerId: customer.id,
      productId: product.id,
      documentTypeId: documentType.id,
      certificateId: '',
    };
    setup.certificateId = await uploadCertificate();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test('el certificado de prueba se acepta y queda activo con sus fechas', async () => {
    const cert = await ok(await api.get(`${API_URL}/certificates/${setup.certificateId}`), 'leer certificado');
    expect(cert.status).toBe('active');
    expect(cert.valid_from <= new Date().toISOString().slice(0, 10)).toBe(true);
    expect(cert.valid_until > new Date().toISOString().slice(0, 10)).toBe(true);
  });

  test('el perfil tributario del SRI se guarda desde Ajustes → Organización', async ({ page }) => {
    await openAs(page, '/organization/settings');
    await page.getByRole('button', { name: 'Datos tributarios para el SRI' }).click();

    await fieldByLabel(page, 'Régimen RIMPE').click();
    await page.getByRole('option', { name: 'RIMPE emprendedor' }).click();
    await fieldByLabel(page, 'Agente de retención').locator('input').fill('1');
    await fieldByLabel(page, 'Dirección de la matriz').locator('input').fill('Av. 10 de Agosto y Colón, Quito');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Organización actualizada')).toBeVisible({ timeout: 10_000 });

    const org = await ok(await api.get(`${API_URL}/organizations/me`), 'leer organización');
    expect(org.settings).toMatchObject({
      contribuyenteRimpe: RIMPE,
      agenteRetencion: '1',
      dirMatriz: 'Av. 10 de Agosto y Colón, Quito',
      defaultPaymentMethodCode: '01',
    });
    // Los campos vacíos no se guardan como '' (fiscal los leería como valor).
    expect(org.settings).not.toHaveProperty('contribuyenteEspecial');
  });

  let authorizedFlowInvoiceId = '';

  test('la factura emitida llega al SRI de pruebas y el SRI la entiende', async () => {
    authorizedFlowInvoiceId = await issueInvoice();
    const fiscal = await fiscalInvoice(authorizedFlowInvoiceId, (f) => ['sent', 'authorized', 'rejected'].includes(f.status) || (f.status === 'error' && !f.next_check_at));

    test.info().annotations.push({ type: 'SRI', description: `${fiscal.status}: ${fiscal.last_error ?? 'sin mensaje'}` });

    expect(fiscal.status, `fiscal quedó en error antes de llegar al SRI: ${fiscal.last_error}`).not.toBe('error');
    expect(fiscal.has_signed_xml).toBe(true);
    expect(fiscal.access_key).toMatch(new RegExp(`^\\d{8}01${setup.ruc}1001001000000\\d{3}\\d{8}1\\d$`));

    if (fiscal.status === 'rejected') {
      // El único rechazo aceptable es por el contribuyente de prueba inexistente.
      const messages: Json[] = fiscal.sri_messages;
      expect(messages.length).toBeGreaterThan(0);
      for (const m of messages) {
        expect(`${m.mensaje} ${m.informacionAdicional ?? ''}`).toMatch(/contribuyente registrado con el RUC/i);
      }
      expect(REGISTERED_RUC, 'Con un RUC registrado (SRI_E2E_RUC) el SRI no debería rechazarla en recepción').toBeUndefined();
    }
  });

  test('el XML firmado lleva los datos que exige el SRI', async () => {
    const fiscal = await ok(await api.get(`${API_URL}/fiscal-invoices/${authorizedFlowInvoiceId}`), 'leer factura fiscal');
    const resp = await api.get(`${API_URL}/fiscal-invoices/${fiscal.id}/xml/download`);
    expect(resp.ok()).toBe(true);
    expect(resp.headers()['content-disposition']).toMatch(/attachment; filename="factura-001-001-\d{9}-(firmado|autorizado)\.xml"/);
    const xml = await resp.text();

    const today = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Guayaquil', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
    expect(xml).toContain(`<claveAcceso>${fiscal.access_key}</claveAcceso>`);
    expect(xml).toContain(`<fechaEmision>${today}</fechaEmision>`);
    expect(xml).toContain(`<contribuyenteRimpe>${RIMPE}</contribuyenteRimpe>`);
    expect(xml).toContain('<agenteRetencion>1</agenteRetencion>');
    expect(xml).toContain('<dirMatriz>Av. 10 de Agosto y Colón, Quito</dirMatriz>');
    expect(xml).toContain('<codigoPrincipal>SRI-E2E-1</codigoPrincipal>');
    expect(xml).toContain('<codigoPorcentaje>4</codigoPorcentaje>');
    expect(xml).toContain('<tarifa>15.00</tarifa>');
    expect(xml).toContain('<formaPago>01</formaPago>');
    expect(xml).toMatch(/<ds:SignatureValue>[A-Za-z0-9+/=\s]{100,}<\/ds:SignatureValue>/);
    expect(xml).toMatch(/<\/ds:Signature><\/factura>$/);
  });

  test('el detalle de la factura muestra el estado ante el SRI', async ({ page }) => {
    const fiscal = await ok(await api.get(`${API_URL}/fiscal-invoices/${authorizedFlowInvoiceId}`), 'leer factura fiscal');
    await openAs(page, `/invoices/${authorizedFlowInvoiceId}`);

    const card = page.locator('.v-card').filter({ hasText: 'Estado ante el SRI' });
    await expect(card).toBeVisible({ timeout: 15_000 });
    const label = { sent: 'En autorización', authorized: 'Autorizada', rejected: 'Rechazada' }[fiscal.status as string];
    await expect(card.getByText(label!, { exact: true })).toBeVisible();
    await expect(card.getByText(fiscal.access_key)).toBeVisible();
    await expect(card.getByRole('button', { name: /XML (firmado|autorizado)/ })).toBeVisible();
    // Rechazada o en curso: no hay nada que reintentar.
    await expect(card.getByRole('button', { name: 'Reintentar envío' })).toHaveCount(0);
    if (fiscal.status === 'rejected') {
      await expect(card.getByText(/contribuyente registrado con el RUC/i).first()).toBeVisible();
    }
  });

  /**
   * FACTURACION-BRECHAS.md, N14. El id del tipo de identificación es del catálogo
   * de customer-service y no coincide con el de tax-service: fiscal no lo
   * encontraba y adivinaba por dígitos, así que un pasaporte de 10 dígitos salía
   * como cédula (05). Ahora el código del tipo viaja en la factura.
   */
  test('un pasaporte de 10 dígitos se declara como pasaporte y no como cédula', async () => {
    const passport = asArray(await (await api.get(`${API_URL}/identification-types`)).json()).find((t: Json) => t.code === 'PASAPORTE');
    const customer = await ok(await api.post(`${API_URL}/customers`, {
      data: { businessName: 'Turista Pruebas SRI', type: 'person', identificationTypeId: passport.id, identification: '1712345678', email: 'turista@test.com' },
    }), 'crear cliente con pasaporte');

    const invoiceId = await issueInvoice(customer.id);
    const fiscal = await fiscalInvoice(invoiceId, (f) => f.has_signed_xml);
    const xml = await (await api.get(`${API_URL}/fiscal-invoices/${fiscal.id}/xml/download`)).text();

    expect(xml).toContain('<tipoIdentificacionComprador>06</tipoIdentificacionComprador>');
  });

  /**
   * FACTURACION-BRECHAS.md, N6. Con precio con IVA incluido billing cobraba el
   * IVA dos veces (10 × $11,50 = $130) y fiscal-ecuador bloqueaba la factura.
   * Ahora el total es lo que paga el cliente y la factura llega al SRI.
   */
  test('un producto con precio con IVA incluido factura lo que paga el cliente y llega al SRI', async () => {
    const iva15 = asArray(await (await api.get(`${API_URL}/countries/EC/tax-rates`)).json()).find((t: Json) => t.code === 'IVA15');
    const product = await ok(await api.post(`${API_URL}/products`, {
      data: { name: 'Con IVA incluido', type: 'good', price: '11.50', currencyCode: 'USD', sku: 'SRI-E2E-INC', establishmentIds: [setup.establishmentId], taxRateIds: [iva15.id], priceIncludesTax: true },
    }), 'crear producto con IVA incluido');

    const invoice = await ok(await api.post(`${API_URL}/invoices`, {
      data: { customerId: setup.customerId, documentTypeId: setup.documentTypeId, currencyCode: 'USD' },
    }), 'crear factura');
    const withLine = await ok(await api.post(`${API_URL}/invoices/${invoice.id}/lines`, {
      data: { productId: product.id, description: 'Con IVA incluido', quantity: 10, unitPrice: '11.50', discountCents: 0 },
    }), 'agregar línea');

    expect(withLine.totalCents ?? Math.round(Number(withLine.total) * 100)).toBe(11500);
    expect(withLine.subtotalCents ?? Math.round(Number(withLine.subtotal) * 100)).toBe(10000);
    expect(withLine.lines[0].unitPriceCents).toBe(1000);

    await ok(await api.post(`${API_URL}/invoices/${invoice.id}/issue`, {
      data: { establishmentId: setup.establishmentId, emissionPointId: setup.emissionPointId },
    }), 'emitir');
    const fiscal = await fiscalInvoice(invoice.id, (f) => ['sent', 'authorized', 'rejected'].includes(f.status) || (f.status === 'error' && !f.next_check_at));

    // Antes: error "la base del IVA no coincide ... suele pasar cuando el precio del producto ya incluye IVA".
    expect(fiscal.status, fiscal.last_error).not.toBe('error');
    const xml = await (await api.get(`${API_URL}/fiscal-invoices/${fiscal.id}/xml/download`)).text();
    expect(xml).toContain('<precioUnitario>10.00</precioUnitario>');
    expect(xml).toContain('<totalSinImpuestos>100.00</totalSinImpuestos>');
    expect(xml).toContain('<importeTotal>115.00</importeTotal>');
  });

  /**
   * FACTURACION-BRECHAS.md, #17. Una factura rechazada por el SRI deja un aviso
   * en la campana de quien la emitió, con el motivo y el enlace a la factura.
   */
  test('la factura rechazada por el SRI deja un aviso en la campana de quien la emitió', async () => {
    const providers = await ok(await api.get(`${API_URL}/notifications/providers`), 'catálogo de avisos');
    expect(JSON.stringify(providers)).toContain('fiscal.ec.invoice.attention_required');

    const fiscal = await ok(await api.get(`${API_URL}/fiscal-invoices/${authorizedFlowInvoiceId}`), 'leer factura fiscal');
    test.skip(fiscal.status !== 'rejected', `La factura no quedó rechazada (${fiscal.status}): no hay nada que avisar`);

    const notice = await retrying('aviso en la campana', async () => {
      const list = await (await api.get(`${API_URL}/notifications`)).json();
      return (list.notifications ?? []).find((n: Json) =>
        n.event === 'fiscal.ec.invoice.attention_required' && n.data?.invoiceId === authorizedFlowInvoiceId) ?? null;
    }, 60_000);

    expect(notice.data.number).toBe(fiscal.number);
    expect(notice.data.message).toMatch(/contribuyente registrado con el RUC/i);
  });

  let errorInvoiceId = '';

  test('sin certificado queda en error, sin reintento automático, y se puede reintentar desde la pantalla', async ({ page }) => {
    await ok(await api.delete(`${API_URL}/certificates/${setup.certificateId}`), 'revocar certificado');
    errorInvoiceId = await issueInvoice();
    const fiscal = await fiscalInvoice(errorInvoiceId, (f) => f.status === 'error');
    expect(fiscal.last_error).toMatch(/certificado/i);
    expect(fiscal.next_check_at).toBeNull();

    await openAs(page, `/invoices/${errorInvoiceId}`);
    const card = page.locator('.v-card').filter({ hasText: 'Estado ante el SRI' });
    await expect(card.getByText('Con error', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText(/No se reintentará solo/)).toBeVisible();

    const retry = card.getByRole('button', { name: 'Reintentar envío' });
    await expect(retry).toBeVisible();
    const retried = page.waitForResponse((r) => r.url().endsWith(`/fiscal-invoices/${errorInvoiceId}/retry`));
    await retry.click();
    expect((await retried).status()).toBe(200);

    const after = await ok(await api.get(`${API_URL}/fiscal-invoices/${errorInvoiceId}`), 'leer tras reintento');
    expect(after.status).toBe('error');
    expect(after.retry_count).toBe(0);
  });

  test('anular en billing detiene los envíos al SRI', async ({ page }) => {
    await ok(await api.post(`${API_URL}/invoices/${errorInvoiceId}/void`, { data: { reason: 'Prueba E2E de anulación' } }), 'anular');
    await fiscalInvoice(errorInvoiceId, (f) => !!f.billing_voided_at, 60_000);

    const retry = await api.post(`${API_URL}/fiscal-invoices/${errorInvoiceId}/retry`);
    expect(retry.status()).toBe(400);
    expect((await retry.json()).message).toMatch(/anulada/);

    await openAs(page, `/invoices/${errorInvoiceId}`);
    const card = page.locator('.v-card').filter({ hasText: 'Estado ante el SRI' });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByRole('button', { name: 'Reintentar envío' })).toHaveCount(0);
  });
});
