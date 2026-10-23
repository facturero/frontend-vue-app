import { describe, expect, it } from 'vitest';
import { bpsFromPercent, centsFromText, currentPeriod, formatPeriod, isMoneyKey, keyFigure, orderedSummary, manualText, manualValue, percentFromBps, recentPeriods, textFromCents, unwrapBlobError } from './reporting';

describe('periodos', () => {
  it('el periodo actual es AAAA-MM con el mes en dos dígitos', () => {
    expect(currentPeriod(new Date(2026, 0, 15))).toBe('2026-01');
    expect(currentPeriod(new Date(2026, 9, 31))).toBe('2026-10');
  });

  it('los últimos periodos van del más nuevo al más viejo y cruzan el cambio de año', () => {
    expect(recentPeriods(4, new Date(2026, 1, 10))).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
    expect(recentPeriods(1, new Date(2026, 5, 1))).toEqual(['2026-06']);
  });

  it('el mes se escribe en el idioma pedido y no se corre por la zona horaria', () => {
    expect(formatPeriod('2026-10', 'es')).toMatch(/octubre.*2026/i);
    expect(formatPeriod('2026-01', 'en')).toMatch(/January.*2026/);
    expect(formatPeriod('2026-12', 'fr')).toMatch(/décembre.*2026/i);
    expect(formatPeriod('basura', 'es')).toBe('basura');
  });
});

describe('casilleros manuales', () => {
  it('los importes se escriben en dólares y viajan en centavos, con coma o punto', () => {
    expect(centsFromText('12,34')).toBe(1234);
    expect(centsFromText('12.34')).toBe(1234);
    expect(centsFromText('5')).toBe(500);
    expect(centsFromText('0,5')).toBe(50);
    expect(centsFromText('-3,10')).toBe(-310);
    expect(centsFromText(' 1 000 ')).toBe(100_000);
  });

  it('un importe con más de dos decimales o con letras no se acepta (no se redondea en silencio)', () => {
    expect(centsFromText('1,234')).toBeNull();
    expect(centsFromText('abc')).toBeNull();
    expect(centsFromText('')).toBeNull();
    expect(centsFromText('1,')).toBeNull();
  });

  it('el factor se escribe en % y viaja en puntos básicos, de 0 a 100', () => {
    expect(bpsFromPercent('100')).toBe(10_000);
    expect(bpsFromPercent('62,5')).toBe(6_250);
    expect(bpsFromPercent('0')).toBe(0);
    expect(bpsFromPercent('100,01')).toBeNull();
    expect(bpsFromPercent('-5')).toBeNull();
    expect(bpsFromPercent('x')).toBeNull();
  });

  it('cada casillero usa su propia conversión, de ida y de vuelta', () => {
    expect(manualValue('factor_proporcionalidad_bps', '50')).toBe(5_000);
    expect(manualValue('credito_anterior', '8')).toBe(800);
    expect(manualValue('ajustes', '-1,5')).toBe(-150);
    expect(manualText('factor_proporcionalidad_bps', 5_000)).toBe('50');
    expect(manualText('credito_anterior', 800)).toBe('8.00');
    expect(percentFromBps(10_000)).toBe('100');
    expect(textFromCents(-150)).toBe('-1.50');
  });
});

describe('cifras', () => {
  it('es un importe cuando el nombre termina en Cents', () => {
    expect(isMoneyKey('ivaGeneradoCents')).toBe(true);
    expect(isMoneyKey('ventas')).toBe(false);
  });
});

describe('errores de descargas', () => {
  it('un error JSON que llegó como Blob se vuelve a leer para mostrar su mensaje', async () => {
    const err = { response: { data: new Blob([JSON.stringify({ code: 'ATS_SCHEMA_PENDING', message: 'Falta el esquema' })]) } };
    await unwrapBlobError(err);
    expect(err.response.data).toEqual({ code: 'ATS_SCHEMA_PENDING', message: 'Falta el esquema' });
  });

  it('si no es JSON o no hay respuesta, lo deja como estaba', async () => {
    const blob = new Blob(['no es json']);
    const err = { response: { data: blob } };
    await unwrapBlobError(err);
    expect(err.response.data).toBe(blob);
    await expect(unwrapBlobError(new Error('red'))).resolves.toBeInstanceOf(Error);
  });
});

describe('listado de versiones', () => {
  it('cada anexo resume su versión con su cifra principal; si falta, cero', () => {
    expect(keyFigure('f104', { saldoCents: -900, ventas: 4 })).toEqual({ key: 'saldoCents', value: -900 });
    expect(keyFigure('f103', { totalRetenidoCents: 350 })).toEqual({ key: 'totalRetenidoCents', value: 350 });
    expect(keyFigure('ats', { compras: 3 })).toEqual({ key: 'compras', value: 3 });
    expect(keyFigure('ats', {})).toEqual({ key: 'compras', value: 0 });
  });
});

describe('orden de las cifras', () => {
  it('lo que decide va primero y lo desconocido al final, sin importar el orden en que llegue', () => {
    const llegada = { ventas: 4, saldoCents: -900, compras: 1, ivaComprasCents: 3000, ivaGeneradoCents: 2100, nuevaCifra: 7, creditoAplicableCents: 3000 };
    expect(orderedSummary('f104', llegada).map(([k]) => k)).toEqual(['ivaGeneradoCents', 'creditoAplicableCents', 'saldoCents', 'ivaComprasCents', 'ventas', 'compras', 'nuevaCifra']);
    expect(orderedSummary('f103', { conceptos: 1, totalBaseCents: 20000, totalRetenidoCents: 350 }).map(([k]) => k)).toEqual(['totalRetenidoCents', 'totalBaseCents', 'conceptos']);
  });
});
