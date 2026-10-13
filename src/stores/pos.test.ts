import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductSummary } from '@/types/products';

const fromPos = vi.fn();
const getById = vi.fn();
const listTaxRates = vi.fn();
vi.mock('@/api/pos', () => ({ posApi: { fromPos: (...a: unknown[]) => fromPos(...a) } }));
vi.mock('@/api/products', () => ({ productApi: { getById: (...a: unknown[]) => getById(...a), listTaxRates: () => listTaxRates() } }));

import { usePosStore } from './pos';
import { useAuthStore } from './auth';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const product = (over: Partial<ProductSummary> = {}): ProductSummary =>
  ({
    id: 'p1', organizationId: 'org-1', sku: 'COLA-500', name: 'Cola 500 ml', type: 'good', categoryId: null, unitId: null,
    status: 'active', price: '1.00', priceCents: 100, currencyCode: 'USD', priceIncludesTax: true, imageFileId: null, ...over,
  }) as ProductSummary;

function sesion(userId = 'u1', orgId = 'org-1') {
  const auth = useAuthStore();
  auth.user = { id: userId, orgId } as never;
}

function nuevaCaja(userId = 'u1', orgId = 'org-1') {
  setActivePinia(createPinia());
  sesion(userId, orgId);
  const pos = usePosStore();
  pos.init();
  return pos;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  fromPos.mockReset();
  getById.mockReset();
  listTaxRates.mockReset();
  listTaxRates.mockResolvedValue([{ id: 'iva12', percentage: '12.00' }, { id: 'iva15', percentage: '15.00' }]);
  getById.mockImplementation(async (id: string) => ({ id, taxes: [{ id: 't', taxRateId: 'iva12', kind: 'vat' }] }));
  fromPos.mockResolvedValue({ id: 'inv-1', number: '001-002-000000041', totalCents: 199 });
});

describe('carrito', () => {
  it('agregar un producto trae sus impuestos del catálogo y calcula el total igual que billing', async () => {
    const pos = nuevaCaja();
    await pos.addProduct(product());
    await pos.addProduct(product());
    expect(pos.lines).toHaveLength(1);
    expect(pos.lines[0]).toMatchObject({ quantity: 2, ratesPercent: [12], priceIncludesTax: true });
    // 2 × $1,00 con IVA 12 % incluido: base 178, IVA 21, total 199.
    expect(pos.totals).toEqual({ baseCents: 178, taxCents: 21, totalCents: 199 });
  });

  it('el producto repetido suma la cantidad y no vuelve a pedir sus impuestos', async () => {
    const pos = nuevaCaja();
    await pos.addProduct(product());
    await pos.addProduct(product());
    expect(getById).toHaveBeenCalledTimes(1);
  });

  it('dos toques seguidos sobre el mismo producto (mientras llegan sus impuestos) no duplican la línea', async () => {
    const pos = nuevaCaja();
    await Promise.all([pos.addProduct(product()), pos.addProduct(product())]);
    expect(pos.lines).toHaveLength(1);
    expect(pos.lines[0].quantity).toBe(2);
  });

  it('un producto sin precio no se puede vender: billing lo rechazaría al cobrar', async () => {
    const pos = nuevaCaja();
    expect(await pos.addProduct(product({ priceCents: 0, price: '0.00' }))).toBe('no_price');
    expect(pos.lines).toHaveLength(0);
  });

  it('si una tarifa de impuesto no se encuentra, no se agrega (el total saldría mal)', async () => {
    getById.mockResolvedValue({ id: 'p1', taxes: [{ id: 't', taxRateId: 'desconocida', kind: 'vat' }] });
    const pos = nuevaCaja();
    expect(await pos.addProduct(product())).toBe('taxes');
    expect(pos.lines).toHaveLength(0);
  });

  it('si falla la consulta del producto, devuelve error y el carrito queda igual', async () => {
    getById.mockRejectedValue(new Error('red'));
    const pos = nuevaCaja();
    expect(await pos.addProduct(product())).toBe('error');
    expect(pos.lines).toHaveLength(0);
  });

  it('cantidad 0 quita la línea; vaciar el carrito suelta el id de venta y el cliente', async () => {
    const pos = nuevaCaja();
    await pos.addProduct(product());
    pos.setCustomer({ id: 'c1', name: 'Ana', identification: '0102030405' });
    expect(pos.posSaleId).toBeTruthy();
    pos.setQuantity('p1', 0);
    expect(pos.lines).toHaveLength(0);
    expect(pos.posSaleId).toBeNull();
    expect(pos.customer).toBeNull();
  });

  it('el descuento no puede superar lo que vale la línea (billing lo rechazaría), ni siquiera al bajar la cantidad', async () => {
    const pos = nuevaCaja();
    await pos.addProduct(product({ priceCents: 1000, price: '10.00' }));
    pos.setQuantity('p1', 2);
    pos.setDiscount('p1', 99999);
    expect(pos.lines[0].discountCents).toBe(2000);
    pos.setQuantity('p1', 1);
    expect(pos.lines[0].discountCents).toBe(1000);
    pos.setDiscount('p1', -5);
    expect(pos.lines[0].discountCents).toBe(0);
  });
});

describe('cobrar', () => {
  async function cajaConVenta() {
    const pos = nuevaCaja();
    pos.selectPoint('est-1', 'ep-1');
    await pos.addProduct(product());
    await pos.addProduct(product());
    return pos;
  }

  it('sin punto de emisión elegido no se puede cobrar', async () => {
    const pos = nuevaCaja();
    await pos.addProduct(product());
    expect(pos.canCharge).toBe(false);
    await expect(pos.submit()).rejects.toThrow();
    expect(fromPos).not.toHaveBeenCalled();
  });

  it('manda a billing la venta completa y vacía el carrito', async () => {
    const pos = await cajaConVenta();
    pos.setCustomer({ id: 'c1', name: 'Ana', identification: '0102030405' });
    pos.setPaymentMethod('19');
    const idVenta = pos.posSaleId;

    const resultado = await pos.submit();

    expect(fromPos).toHaveBeenCalledTimes(1);
    expect(fromPos.mock.calls[0][0]).toEqual({
      terminalId: expect.stringMatching(/^web-[0-9a-f]{8}$/),
      posSaleId: idVenta,
      establishmentId: 'est-1',
      emissionPointId: 'ep-1',
      customerId: 'c1',
      paymentMethodCode: '19',
      posTotalCents: 199,
      lines: [{ productId: 'p1', description: 'Cola 500 ml', quantity: 2, unitPrice: '1.00', discountCents: 0 }],
    });
    expect(resultado).toMatchObject({ number: '001-002-000000041', totalCents: 199, expectedCents: 199, paymentMethodCode: '19' });
    expect(pos.lines).toHaveLength(0);
    expect(pos.lastSale?.number).toBe('001-002-000000041');
  });

  it('sin cliente manda customerId null (billing factura a CONSUMIDOR FINAL)', async () => {
    const pos = await cajaConVenta();
    await pos.submit();
    expect(fromPos.mock.calls[0][0].customerId).toBeNull();
  });

  it('en efectivo calcula el vuelto sobre el total de la FACTURA; en otro medio no hay vuelto', async () => {
    const pos = await cajaConVenta();
    const efectivo = await pos.submit(500);
    expect(efectivo).toMatchObject({ receivedCents: 500, changeCents: 301 });

    await pos.addProduct(product());
    pos.setPaymentMethod('16');
    const tarjeta = await pos.submit(500);
    expect(tarjeta).toMatchObject({ receivedCents: null, changeCents: 0 });
  });

  it('si el servidor factura distinto de lo que calculó la caja, el resultado lo muestra (para avisar)', async () => {
    fromPos.mockResolvedValue({ id: 'inv-1', number: '001-002-000000041', totalCents: 210 });
    const pos = await cajaConVenta();
    const resultado = await pos.submit();
    expect(resultado.expectedCents).toBe(199);
    expect(resultado.totalCents).toBe(210);
  });

  it('si falla, el carrito y el id de venta se conservan: reintentar es seguro y no duplica la factura', async () => {
    const pos = await cajaConVenta();
    const idVenta = pos.posSaleId;
    fromPos.mockRejectedValueOnce({ response: { data: { message: 'Sin conexión con billing' } } });

    await expect(pos.submit()).rejects.toBeTruthy();
    expect(pos.error).toBe('Sin conexión con billing');
    expect(pos.lines).toHaveLength(1);
    expect(pos.posSaleId).toBe(idVenta);

    await pos.submit();
    expect(fromPos).toHaveBeenCalledTimes(2);
    expect(fromPos.mock.calls[1][0].posSaleId).toBe(fromPos.mock.calls[0][0].posSaleId);
  });

  it('distingue una caída de conexión de un rechazo del servidor (para decirlo con claridad al cajero)', async () => {
    const pos = await cajaConVenta();
    fromPos.mockRejectedValueOnce(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
    await expect(pos.submit()).rejects.toBeTruthy();
    expect(pos.errorIsNetwork).toBe(true);

    fromPos.mockRejectedValueOnce({ response: { status: 400, data: { message: 'Precio inválido' } } });
    await expect(pos.submit()).rejects.toBeTruthy();
    expect(pos.errorIsNetwork).toBe(false);
    expect(pos.error).toBe('Precio inválido');
  });

  it('cada venta nueva tiene su propio id (si no, billing devolvería la factura anterior)', async () => {
    const pos = await cajaConVenta();
    await pos.submit();
    await pos.addProduct(product());
    await pos.submit();
    expect(fromPos.mock.calls[1][0].posSaleId).not.toBe(fromPos.mock.calls[0][0].posSaleId);
  });

  it('un doble clic en «Facturar» no manda dos peticiones', async () => {
    let terminar!: (v: unknown) => void;
    fromPos.mockReturnValue(new Promise((ok) => (terminar = ok)));
    const pos = await cajaConVenta();
    const primera = pos.submit();
    await expect(pos.submit()).rejects.toThrow();
    terminar({ id: 'inv-1', number: 'x', totalCents: 199 });
    await primera;
    expect(fromPos).toHaveBeenCalledTimes(1);
  });
});

describe('borrador en el navegador', () => {
  it('recargar la página a mitad de una venta no pierde el carrito, el cliente ni el id de la venta', async () => {
    const pos = nuevaCaja();
    pos.selectPoint('est-1', 'ep-1');
    await pos.addProduct(product());
    pos.setCustomer({ id: 'c1', name: 'Ana', identification: null });
    pos.setPaymentMethod('20');
    const idVenta = pos.posSaleId;

    const recargada = nuevaCaja(); // mismo navegador y misma persona: otro Pinia, el mismo localStorage
    expect(recargada.lines).toHaveLength(1);
    expect(recargada.customer?.id).toBe('c1');
    expect(recargada.paymentMethodCode).toBe('20');
    expect(recargada.posSaleId).toBe(idVenta);
    expect(recargada.point).toEqual({ establishmentId: 'est-1', emissionPointId: 'ep-1' });
  });

  it('otra persona (u otra organización) en el mismo equipo no ve el carrito ni el punto de la anterior', async () => {
    const pos = nuevaCaja('u1', 'org-1');
    pos.selectPoint('est-1', 'ep-1');
    await pos.addProduct(product());

    expect(nuevaCaja('u2', 'org-1').lines).toHaveLength(0);
    expect(nuevaCaja('u1', 'org-2').lines).toHaveLength(0);
    expect(nuevaCaja('u2', 'org-1').point).toBeNull();
  });

  it('el identificador del equipo se crea una vez y se conserva', () => {
    const a = nuevaCaja().terminalId;
    const b = nuevaCaja().terminalId;
    expect(a).toMatch(/^web-/);
    expect(b).toBe(a);
  });

  it('una venta ya facturada no deja borrador', async () => {
    const pos = nuevaCaja();
    pos.selectPoint('est-1', 'ep-1');
    await pos.addProduct(product());
    await pos.submit();
    expect(nuevaCaja().lines).toHaveLength(0);
  });
});
