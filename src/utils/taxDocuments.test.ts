import { describe, expect, it } from 'vitest';
import { currentFiscalPeriod, fromCents, isValidRate, toCents, todayIso, vatCents, withheldCents } from './taxDocuments';

describe('importes', () => {
  it('toCents acepta hasta dos decimales y rechaza el resto', () => {
    expect(toCents('100.50')).toBe(10050);
    expect(toCents('0.07')).toBe(7);
    expect(toCents('115')).toBe(11500);
    // el clásico 1.15 * 100 = 114.99999999999999
    expect(toCents('1.15')).toBe(115);
    for (const bad of ['', '1,5', '-1', '1.234', 'abc', '1.']) expect(toCents(bad)).toBeNull();
  });

  it('fromCents da siempre dos decimales', () => {
    expect(fromCents(10050)).toBe('100.50');
    expect(fromCents(5)).toBe('0.05');
  });

  it('retención e IVA: la mitad se redondea hacia arriba, igual que en el servidor', () => {
    expect(withheldCents(10000, 1)).toBe(100);
    expect(withheldCents(1500, 30)).toBe(450);
    expect(withheldCents(10000, 2.75)).toBe(275);
    expect(withheldCents(1005, 10)).toBe(101);
    expect(vatCents(10000, 15)).toBe(1500);
  });

  it('el porcentaje respeta el límite de tres cifras del esquema', () => {
    for (const ok of [0, 1, 2.75, 10, 30, 100]) expect(isValidRate(ok)).toBe(true);
    for (const bad of [-1, 101, 1.234, 10.25, Number.NaN]) expect(isValidRate(bad)).toBe(false);
  });
});

describe('fechas', () => {
  it('hoy y el periodo fiscal salen de la fecha local', () => {
    const d = new Date(2026, 9, 5, 23, 30);
    expect(todayIso(d)).toBe('2026-10-05');
    expect(currentFiscalPeriod(d)).toBe('10/2026');
  });
});
