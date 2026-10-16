import { describe, expect, it } from 'vitest';
import type { BalanceSheet, IncomeStatement } from '@/types/accounting';
import { addDays, daysBetween, plainAmount, previousRange, sameDayLastYear, sameRangeLastYear, statementToCsv, variation } from './statements';

const labels = {
  code: 'Código', account: 'Cuenta', amount: 'Importe', compare: 'Comparación', variation: 'Variación', total: 'Total',
  titles: { assets: 'ACTIVO', liabilities: 'PASIVO', equity: 'PATRIMONIO', income: 'INGRESOS', costs: 'COSTOS', expenses: 'GASTOS', grossProfit: 'Utilidad bruta', netResult: 'Resultado neto' },
};
const row = (code: string, name: string, amount: number, compare: number | null = null) => ({ accountId: code, code, name, level: 1, isPostable: true, synthetic: false, amountCents: amount, compareAmountCents: compare });

describe('fechas', () => {
  it('suma días sin zona horaria', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('el mismo día del año anterior; el 29 de febrero pasa al 28', () => {
    expect(sameDayLastYear('2026-10-15')).toBe('2025-10-15');
    expect(sameDayLastYear('2028-02-29')).toBe('2027-02-28');
  });

  it('el rango anterior tiene la misma duración y termina el día antes', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(previousRange('2026-02-01', '2026-02-28')).toEqual({ from: '2026-01-04', to: '2026-01-31' });
    expect(previousRange('2026-01-01', '2026-12-31')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(sameRangeLastYear('2026-01-01', '2026-06-30')).toEqual({ from: '2025-01-01', to: '2025-06-30' });
  });
});

describe('variación', () => {
  it('diferencia y porcentaje sobre el valor absoluto de la base; sin base no hay porcentaje', () => {
    expect(variation(150, 100)).toEqual({ diff: 50, pct: 50 });
    expect(variation(50, 100)).toEqual({ diff: -50, pct: -50 });
    expect(variation(-50, -100)).toEqual({ diff: 50, pct: 50 });
    expect(variation(10, 0)).toEqual({ diff: 10, pct: null });
    expect(variation(10, null)).toBeNull();
  });
});

describe('CSV', () => {
  const bs: BalanceSheet = {
    asOf: '2026-12-31', compareAsOf: null,
    sections: [
      { key: 'assets', rows: [row('1.1', 'Caja, "chica"', 12_345)], totalCents: 12_345, compareTotalCents: null },
      { key: 'liabilities', rows: [], totalCents: 0, compareTotalCents: null },
      { key: 'equity', rows: [row('3', 'Capital', 12_345)], totalCents: 12_345, compareTotalCents: null },
    ],
    totals: { assetsCents: 12_345, liabilitiesAndEquityCents: 12_345, differenceCents: 0, compareAssetsCents: null, compareLiabilitiesAndEquityCents: null, compareDifferenceCents: null },
  };

  it('importes con dos decimales y punto; comillas escapadas', () => {
    expect(plainAmount(12_345)).toBe('123.45');
    const csv = statementToCsv(bs, labels);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Código,Cuenta,Importe');
    expect(lines[1]).toBe('ACTIVO,,');
    expect(lines[2]).toBe('1.1,"Caja, ""chica""",123.45');
    expect(lines[3]).toBe(',Total ACTIVO,123.45');
  });

  it('con comparación añade las columnas y la utilidad bruta y el resultado neto del estado de resultados', () => {
    const is: IncomeStatement = {
      from: '2026-01-01', to: '2026-12-31', compareFrom: '2025-01-01', compareTo: '2025-12-31',
      sections: [
        { key: 'income', rows: [row('4.1.01', 'Ventas', 10_000, 8_000)], totalCents: 10_000, compareTotalCents: 8_000 },
        { key: 'costs', rows: [row('5.1.01', 'Costo', 6_000, 5_000)], totalCents: 6_000, compareTotalCents: 5_000 },
        { key: 'expenses', rows: [], totalCents: 0, compareTotalCents: 0 },
      ],
      grossProfitCents: 4_000, netResultCents: 4_000, compareGrossProfitCents: 3_000, compareNetResultCents: 3_000,
    };
    const lines = statementToCsv(is, labels).split('\r\n');
    expect(lines[0]).toBe('Código,Cuenta,Importe,Comparación,Variación');
    expect(lines[2]).toBe('4.1.01,Ventas,100.00,80.00,20.00');
    expect(lines.find((l) => l.includes('Utilidad bruta'))).toBe(',Utilidad bruta,40.00,30.00,10.00');
    expect(lines.at(-1)).toBe(',Resultado neto,40.00,30.00,10.00');
  });
});
