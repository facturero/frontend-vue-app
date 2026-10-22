import { describe, expect, it } from 'vitest';
import {
  adjustmentKindsFor,
  buildBankAccountInput,
  cashFlowBucketLabel,
  cashFlowClosingColor,
  defaultAdjustmentKind,
  defaultImportProfile,
  emptyBankAccountForm,
  movementsMatchableTo,
  normalizeProfile,
  parseSignedMoney,
  profileErrors,
  reconciliationBlockers,
  selectionSummary,
} from '@/utils/treasury-banking';
import type { BankMovement, ReconciliationResult } from '@/types/treasury';

const mov = (amountCents: number): BankMovement => ({
  id: String(amountCents),
  bankAccountId: 'a',
  sourceType: 'receipt',
  sourceId: 's',
  movementDate: '2026-10-05',
  amountCents,
  reference: null,
  description: 'x',
  kind: null,
  status: 'active',
  createdBy: null,
  version: 1,
  createdAt: '',
});

describe('importes con signo', () => {
  it('admite el «-» del sobregiro y los formatos de importe de siempre', () => {
    expect(parseSignedMoney('1.234,56')).toBe(123456);
    expect(parseSignedMoney('-1.234,56')).toBe(-123456);
    expect(parseSignedMoney('-0,50')).toBe(-50);
    expect(parseSignedMoney('  -12 ')).toBe(-1200);
  });
  it('un «-» solo, vacío o texto no es un importe (y «-0» no es un cero negativo)', () => {
    expect(parseSignedMoney('-')).toBeNull();
    expect(parseSignedMoney('')).toBeNull();
    expect(parseSignedMoney('abc')).toBeNull();
    expect(Object.is(parseSignedMoney('-0'), 0)).toBe(true);
  });
});

describe('perfil de importación', () => {
  it('el perfil por defecto es válido', () => {
    expect(profileErrors(defaultImportProfile())).toEqual({});
  });
  it('cada campo malo dice su clave: columna fuera de rango, filas a saltar, débito y crédito en la misma columna', () => {
    expect(profileErrors({ ...defaultImportProfile(), dateColumn: 0, skipRows: 51 })).toEqual({ dateColumn: 'treasury.banking.errors.column', skipRows: 'treasury.banking.errors.skipRows' });
    const dc = { ...defaultImportProfile(), amountMode: 'debit_credit' as const, amountColumn: null };
    expect(profileErrors(dc)).toMatchObject({ debitColumn: 'treasury.banking.errors.column', creditColumn: 'treasury.banking.errors.column' });
    expect(profileErrors({ ...dc, debitColumn: 4, creditColumn: 4 })).toEqual({ creditColumn: 'treasury.banking.errors.sameColumn' });
    expect(profileErrors({ ...dc, debitColumn: 4, creditColumn: 5 })).toEqual({});
  });
  it('lo que no aplica al modo de importe se manda como null', () => {
    const signed = normalizeProfile({ ...defaultImportProfile(), debitColumn: 4, creditColumn: 5 });
    expect(signed).toMatchObject({ debitColumn: null, creditColumn: null, amountColumn: 3 });
    const dc = normalizeProfile({ ...defaultImportProfile(), amountMode: 'debit_credit', debitColumn: 4, creditColumn: 5, invertSign: true });
    expect(dc).toMatchObject({ amountColumn: null, invertSign: false, debitColumn: 4, creditColumn: 5 });
  });
});

describe('cuenta bancaria', () => {
  const form = () => ({ ...emptyBankAccountForm('2026-10-01'), name: ' Pichincha ', bankName: 'Banco Pichincha', accountLast4: '1234', opening: '1.000,00' });

  it('arma lo que se envía: centavos, nombre recortado, perfil normalizado', () => {
    const { input, errors } = buildBankAccountInput({ ...form(), profile: defaultImportProfile() });
    expect(errors).toEqual({});
    expect(input).toMatchObject({ name: 'Pichincha', bankName: 'Banco Pichincha', accountType: 'checking', accountLast4: '1234', openingBalanceCents: 100000, openingDate: '2026-10-01' });
    expect(input!.importProfile).toMatchObject({ amountColumn: 3, debitColumn: null });
  });
  it('un sobregiro de apertura es válido; vacío cuenta como cero', () => {
    expect(buildBankAccountInput({ ...form(), opening: '-250,00' }).input!.openingBalanceCents).toBe(-25000);
    expect(buildBankAccountInput({ ...form(), opening: '' }).input!.openingBalanceCents).toBe(0);
  });
  it('avisa de cada campo con su clave, incluidos los del perfil; el número completo no cabe', () => {
    const { input, errors } = buildBankAccountInput({ ...form(), name: ' ', bankName: '', accountLast4: '2200123456789', opening: 'mucho', openingDate: '2026-02-31', profile: { ...defaultImportProfile(), dateColumn: 0 } });
    expect(input).toBeNull();
    expect(errors).toEqual({
      name: 'treasury.banking.errors.name',
      bankName: 'treasury.banking.errors.bankName',
      accountLast4: 'treasury.banking.errors.last4',
      opening: 'treasury.banking.errors.opening',
      openingDate: 'treasury.banking.errors.openingDate',
      'profile.dateColumn': 'treasury.banking.errors.column',
    });
  });
});

describe('emparejar', () => {
  it('lo que sale del banco se ofrece como comisión u otro egreso; lo que entra, como interés u otro ingreso', () => {
    expect(adjustmentKindsFor(-250)).toEqual(['bank_fee', 'other_out']);
    expect(adjustmentKindsFor(120)).toEqual(['interest', 'other_in']);
    expect(defaultAdjustmentKind(-250)).toBe('bank_fee');
    expect(defaultAdjustmentKind(120)).toBe('interest');
  });
  it('a un renglón solo se le ofrecen movimientos del mismo signo', () => {
    const all = [mov(5000), mov(-3000), mov(700)];
    expect(movementsMatchableTo({ amountCents: 5000 }, all).map((m) => m.amountCents)).toEqual([5000, 700]);
    expect(movementsMatchableTo({ amountCents: -100 }, all).map((m) => m.amountCents)).toEqual([-3000]);
  });
  it('la selección es exacta solo cuando suma el importe del renglón', () => {
    expect(selectionSummary({ amountCents: 5000 }, [mov(2000), mov(3000)])).toEqual({ sumCents: 5000, remainingCents: 0, exact: true });
    expect(selectionSummary({ amountCents: 5000 }, [mov(2000)])).toEqual({ sumCents: 2000, remainingCents: 3000, exact: false });
    expect(selectionSummary({ amountCents: 5000 }, []).exact).toBe(false);
  });
});

describe('cerrar una conciliación', () => {
  const result = (over: Partial<ReconciliationResult> = {}): ReconciliationResult => ({ registerBalanceCents: 0, pendingCents: 0, pendingCount: 0, unresolvedLines: 0, unresolvedCents: 0, differenceCents: 0, canClose: true, ...over });
  it('sin saldo del extracto no hay nada que cerrar', () => {
    expect(reconciliationBlockers(null)).toEqual(['treasury.banking.reconcile.blockers.noBalance']);
  });
  it('dice por qué no: renglones sin resolver y/o diferencia', () => {
    expect(reconciliationBlockers(result())).toEqual([]);
    expect(reconciliationBlockers(result({ unresolvedLines: 2 }))).toEqual(['treasury.banking.reconcile.blockers.unresolved']);
    expect(reconciliationBlockers(result({ differenceCents: -100, unresolvedLines: 1 }))).toEqual(['treasury.banking.reconcile.blockers.unresolved', 'treasury.banking.reconcile.blockers.difference']);
  });
});

describe('flujo de caja', () => {
  it('etiquetas de las columnas y el color del saldo negativo', () => {
    expect(cashFlowBucketLabel({ key: 'overdue' })).toEqual({ key: 'treasury.cashFlow.overdue' });
    expect(cashFlowBucketLabel({ key: 'later' })).toEqual({ key: 'treasury.cashFlow.later' });
    expect(cashFlowBucketLabel({ key: 'w12' })).toEqual({ key: 'treasury.cashFlow.week', n: 12 });
    expect(cashFlowClosingColor(-1)).toBe('error');
    expect(cashFlowClosingColor(0)).toBe('default');
  });
});
