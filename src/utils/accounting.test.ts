import { describe, expect, it } from 'vitest';
import { centsToInput, isLineComplete, lineTotals, parseMoneyToCents, splitBalance } from './accounting';

describe('parseMoneyToCents', () => {
  it.each([
    ['', 0],
    ['12', 1200],
    ['12.5', 1250],
    ['12,5', 1250],
    ['12.50', 1250],
    ['0,99', 99],
    ['.5', 50],
    ['1234.56', 123456],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['1.234', 123400],
    ['1,234', 123400],
    ['1.234.567', 123456700],
    ['  7 ', 700],
  ])('%j → %j', (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it.each(['abc', '-5', '1.2.3', '12.345,6789', '1,2345', '1e3', '$5'])('rechaza %j', (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });
});

describe('totales de un asiento', () => {
  it('cuadra cuando debe = haber y es mayor que cero', () => {
    expect(lineTotals([{ debitCents: 100, creditCents: 0 }, { debitCents: 0, creditCents: 100 }])).toMatchObject({ balanced: true, difference: 0 });
    expect(lineTotals([{ debitCents: 100, creditCents: 0 }, { debitCents: 0, creditCents: 90 }])).toMatchObject({ balanced: false, difference: 10 });
    expect(lineTotals([])).toMatchObject({ balanced: false });
  });

  it('una línea necesita cuenta y un solo lado', () => {
    expect(isLineComplete({ accountId: 'a', debitCents: 5, creditCents: 0 })).toBe(true);
    expect(isLineComplete({ accountId: 'a', debitCents: 5, creditCents: 5 })).toBe(false);
    expect(isLineComplete({ accountId: 'a', debitCents: 0, creditCents: 0 })).toBe(false);
    expect(isLineComplete({ accountId: '', debitCents: 5, creditCents: 0 })).toBe(false);
  });

  it('centsToInput y splitBalance', () => {
    expect(centsToInput(123450)).toBe('1234.50');
    expect(centsToInput(0)).toBe('');
    expect(splitBalance(500)).toEqual({ debit: 500, credit: 0 });
    expect(splitBalance(-500)).toEqual({ debit: 0, credit: 500 });
  });
});
