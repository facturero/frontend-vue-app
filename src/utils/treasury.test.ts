import { describe, expect, it } from 'vitest';
import type { AgingBucket } from '@/types/treasury';
import {
  agingShares,
  AGING_BUCKETS,
  buildOpeningBalanceInput,
  creditUsage,
  daysOverdue,
  emptyOpeningRow,
  isLocalDate,
  isOverdue,
  openingTotalCents,
  parseCreditDays,
  parseCreditLimit,
  RECEIVABLE_STATUS_COLOR,
  type OpeningForm,
} from './treasury';

describe('fechas de calendario', () => {
  it('isLocalDate acepta solo fechas reales AAAA-MM-DD', () => {
    expect(isLocalDate('2026-10-21')).toBe(true);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('21/10/2026')).toBe(false);
    expect(isLocalDate('')).toBe(false);
  });

  it('daysOverdue cuenta días de calendario con signo, sin que un huso mueva el día', () => {
    expect(daysOverdue('2026-10-01', '2026-10-31')).toBe(30);
    expect(daysOverdue('2026-10-31', '2026-10-01')).toBe(-30);
    expect(daysOverdue('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysOverdue('2026-10-21', '2026-10-21')).toBe(0);
  });
});

describe('vencida', () => {
  it('solo la deuda viva (abierta o parcial) con vencimiento anterior al corte', () => {
    expect(isOverdue({ status: 'open', dueDate: '2026-10-20' }, '2026-10-21')).toBe(true);
    expect(isOverdue({ status: 'partial', dueDate: '2026-10-20' }, '2026-10-21')).toBe(true);
    expect(isOverdue({ status: 'open', dueDate: '2026-10-21' }, '2026-10-21')).toBe(false); // vence hoy: todavía no
    expect(isOverdue({ status: 'open', dueDate: '2026-11-30' }, '2026-10-21')).toBe(false);
  });

  it('una partida pagada, anulada o castigada con vencimiento pasado NO está vencida', () => {
    for (const status of ['paid', 'cancelled', 'written_off'] as const) {
      expect(isOverdue({ status, dueDate: '2020-01-01' }, '2026-10-21'), status).toBe(false);
    }
  });

  it('cada estado tiene un color del tema (nunca un hexadecimal)', () => {
    for (const color of Object.values(RECEIVABLE_STATUS_COLOR)) expect(color).toMatch(/^light[a-z]+$/);
  });
});

describe('antigüedad', () => {
  const totals: AgingBucket = { currentCents: 100, days1To30Cents: 200, days31To60Cents: 400, days61To90Cents: 800, daysOver90Cents: 1500, totalCents: 3000 };

  it('los tramos van de corriente a más de 90 días', () => {
    expect(AGING_BUCKETS.map((b) => b.key)).toEqual(['currentCents', 'days1To30Cents', 'days31To60Cents', 'days61To90Cents', 'daysOver90Cents']);
  });

  it('agingShares reparte el porcentaje de cada tramo', () => {
    expect(agingShares(totals)).toEqual({ currentCents: 3, days1To30Cents: 7, days31To60Cents: 13, days61To90Cents: 27, daysOver90Cents: 50 });
  });

  it('sin deuda no divide por cero', () => {
    const empty: AgingBucket = { currentCents: 0, days1To30Cents: 0, days31To60Cents: 0, days61To90Cents: 0, daysOver90Cents: 0, totalCents: 0 };
    expect(Object.values(agingShares(empty)).every((v) => v === 0)).toBe(true);
  });
});

describe('condiciones de crédito', () => {
  it('parseCreditDays: entero de 0 a 365', () => {
    expect(parseCreditDays('30')).toBe(30);
    expect(parseCreditDays(' 0 ')).toBe(0);
    expect(parseCreditDays('365')).toBe(365);
    expect(parseCreditDays('366')).toBeNull();
    expect(parseCreditDays('-1')).toBeNull();
    expect(parseCreditDays('1.5')).toBeNull();
    expect(parseCreditDays('')).toBeNull();
    expect(parseCreditDays('abc')).toBeNull();
  });

  it('parseCreditLimit: vacío es sin cupo; un importe son centavos; basura es undefined', () => {
    expect(parseCreditLimit('')).toBeNull();
    expect(parseCreditLimit('  ')).toBeNull();
    expect(parseCreditLimit('5000')).toBe(500000);
    expect(parseCreditLimit('1.234,56')).toBe(123456);
    expect(parseCreditLimit('abc')).toBeUndefined();
  });

  it('creditUsage: sin cupo es null; con cupo dice cuánto queda y si se pasó (informativo, no bloquea)', () => {
    expect(creditUsage(5000, null)).toBeNull();
    expect(creditUsage(5000, 20000)).toEqual({ limitCents: 20000, usedCents: 5000, availableCents: 15000, percent: 25, over: false });
    expect(creditUsage(25000, 20000)).toMatchObject({ availableCents: -5000, percent: 100, over: true });
    expect(creditUsage(-300, 20000)).toMatchObject({ usedCents: 0, availableCents: 20000 }); // saldo a favor: no usa cupo
    expect(creditUsage(0, 0)).toMatchObject({ percent: 0, over: false });
  });
});

describe('formulario de saldos iniciales', () => {
  const valid = (): OpeningForm => ({
    cutoffDate: '2026-09-30',
    reason: 'Saldos al arranque',
    rows: [{ customerId: 'c-1', documentNumber: ' ANT-1 ', issueDate: '2026-08-15', dueDate: '', amount: '500,00' }],
  });

  it('arma lo que se envía: importe en centavos, número recortado, vencimiento vacío = null', () => {
    const { input, errors } = buildOpeningBalanceInput(valid());
    expect(errors).toEqual({});
    expect(input).toEqual({
      cutoffDate: '2026-09-30',
      reason: 'Saldos al arranque',
      lines: [{ customerId: 'c-1', documentNumber: 'ANT-1', issueDate: '2026-08-15', dueDate: null, amountCents: 50000 }],
    });
  });

  it('un vencimiento escrito se envía', () => {
    const form = valid();
    form.rows[0]!.dueDate = '2026-09-14';
    expect(buildOpeningBalanceInput(form).input!.lines[0]!.dueDate).toBe('2026-09-14');
  });

  it.each([
    ['fecha de corte inválida', (f: OpeningForm) => (f.cutoffDate = '30/09/2026'), 'cutoffDate'],
    ['fecha de corte vacía', (f: OpeningForm) => (f.cutoffDate = ''), 'cutoffDate'],
    ['motivo muy corto', (f: OpeningForm) => (f.reason = 'x'), 'reason'],
    ['sin líneas', (f: OpeningForm) => (f.rows = []), 'rows'],
    ['línea sin cliente', (f: OpeningForm) => (f.rows[0]!.customerId = null), 'rows[0].customerId'],
    ['emisión inválida', (f: OpeningForm) => (f.rows[0]!.issueDate = '2026-02-30'), 'rows[0].issueDate'],
    ['vencimiento inválido', (f: OpeningForm) => (f.rows[0]!.dueDate = 'mañana'), 'rows[0].dueDate'],
    ['vencimiento anterior a la emisión', (f: OpeningForm) => (f.rows[0]!.dueDate = '2026-08-01'), 'rows[0].dueDate'],
    ['importe vacío', (f: OpeningForm) => (f.rows[0]!.amount = ''), 'rows[0].amount'],
    ['importe cero', (f: OpeningForm) => (f.rows[0]!.amount = '0'), 'rows[0].amount'],
    ['importe con letras', (f: OpeningForm) => (f.rows[0]!.amount = '12abc'), 'rows[0].amount'],
  ])('%s → error en el campo y no se envía nada', (_name, mutate, field) => {
    const form = valid();
    mutate(form);
    const { input, errors } = buildOpeningBalanceInput(form);
    expect(input).toBeNull();
    expect(Object.keys(errors)).toContain(field);
  });

  it('señala la línea que falla (la tercera) y no las demás', () => {
    const form = valid();
    form.rows.push({ ...valid().rows[0]! }, { ...valid().rows[0]!, amount: '' });
    const { errors } = buildOpeningBalanceInput(form);
    expect(Object.keys(errors)).toEqual(['rows[2].amount']);
  });

  it('más de 500 líneas no se envía (el servidor lo rechaza)', () => {
    const form = valid();
    form.rows = Array.from({ length: 501 }, () => ({ ...valid().rows[0]! }));
    expect(buildOpeningBalanceInput(form).errors.rows).toBe('treasury.opening.errors.tooMany');
  });

  it('openingTotalCents suma solo los importes válidos mientras se escribe', () => {
    expect(openingTotalCents([{ amount: '100' }, { amount: '25,50' }, { amount: '' }, { amount: 'x' }, { amount: '-5' }])).toBe(12550);
  });

  it('una fila nueva está vacía', () => {
    expect(emptyOpeningRow()).toEqual({ customerId: null, documentNumber: '', issueDate: '', dueDate: '', amount: '' });
  });
});
