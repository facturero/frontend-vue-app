import { describe, expect, it } from 'vitest';
import { isAllowedOnPosHost, isPosHost } from './host-mode';
import { lineTotals, parseMoneyToCents, saleTotals } from './pos-totals';

describe('dominio de la caja', () => {
  it.each([
    ['pos.noahsolution.com', true],
    ['POS.noahsolution.com', true],
    ['crm.noahsolution.com', false],
    ['localhost', false],
    ['posible.example.com', false],
    ['', false],
  ])('%s → %s', (host, esperado) => expect(isPosHost(host)).toBe(esperado));

  it('en pos. solo existen la caja y las pantallas de acceso', () => {
    for (const ruta of ['/pos', '/pos/', '/pos/unavailable', '/login', '/accept-invite', '/restablecer-contrasena', '/profile', '/organization/settings']) expect(isAllowedOnPosHost(ruta), ruta).toBe(true);
    for (const ruta of ['/', '/invoices', '/customers/123', '/settings', '/posx', '/plugins']) expect(isAllowedOnPosHost(ruta), ruta).toBe(false);
  });
});

// Mismos casos que billing-service: lo que se le dice al cliente tiene que ser la factura.
describe('totales de la venta (igual que billing-service)', () => {
  it('precio con IVA incluido: 2 × $1,00 al 12 % → base 178, IVA 21, total 199 (el caso de la prueba de billing)', () => {
    expect(lineTotals({ quantity: 2, unitPriceCents: 100, discountCents: 0, priceIncludesTax: true, ratesPercent: [12] })).toEqual({
      baseCents: 178,
      taxCents: 21,
      totalCents: 199,
    });
  });

  it('precio sin IVA: $10,00 al 15 % → base 1000, IVA 150, total 1150', () => {
    expect(lineTotals({ quantity: 1, unitPriceCents: 1000, discountCents: 0, priceIncludesTax: false, ratesPercent: [15] })).toEqual({
      baseCents: 1000,
      taxCents: 150,
      totalCents: 1150,
    });
  });

  it('el descuento también pierde el IVA incluido antes de restarse', () => {
    // 10,00 con IVA 15 % incluido: neto 870; descuento 1,15 → neto 100; base = 870 - 100.
    expect(lineTotals({ quantity: 1, unitPriceCents: 1000, discountCents: 115, priceIncludesTax: true, ratesPercent: [15] })).toEqual({
      baseCents: 770,
      taxCents: 116,
      totalCents: 886,
    });
  });

  it('producto sin impuestos: el total es la base', () => {
    expect(lineTotals({ quantity: 3, unitPriceCents: 250, discountCents: 0, priceIncludesTax: false, ratesPercent: [] })).toEqual({
      baseCents: 750,
      taxCents: 0,
      totalCents: 750,
    });
  });

  it('cantidades decimales (peso, litros) se redondean como en billing', () => {
    expect(lineTotals({ quantity: 0.5, unitPriceCents: 999, discountCents: 0, priceIncludesTax: false, ratesPercent: [15] })).toEqual({
      baseCents: 500,
      taxCents: 75,
      totalCents: 575,
    });
  });

  it('la venta suma sus líneas', () => {
    const total = saleTotals([
      { quantity: 1, unitPriceCents: 1000, discountCents: 0, priceIncludesTax: false, ratesPercent: [15] },
      { quantity: 2, unitPriceCents: 100, discountCents: 0, priceIncludesTax: true, ratesPercent: [12] },
    ]);
    expect(total).toEqual({ baseCents: 1178, taxCents: 171, totalCents: 1349 });
  });

  it('una venta vacía vale cero', () => {
    expect(saleTotals([])).toEqual({ baseCents: 0, taxCents: 0, totalCents: 0 });
  });
});

describe('importes escritos por el cajero', () => {
  it.each([
    ['12.5', 1250],
    ['12,50', 1250],
    ['0.99', 99],
    [' 5 ', 500],
    ['0', 0],
  ])('%s → %s', (texto, centavos) => expect(parseMoneyToCents(texto)).toBe(centavos));

  it.each(['', 'abc', '-3', '1.234', '1,2,3', '1e3'])('«%s» no es un importe', (texto) => expect(parseMoneyToCents(texto)).toBeNull());
});
