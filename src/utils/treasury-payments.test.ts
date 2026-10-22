import { describe, expect, it } from 'vitest';
import {
  buildPayableOpeningInput,
  buildPaymentInput,
  emptyPayableOpeningRow,
  isPayableOverdue,
  parseApprovalThreshold,
  payableDaysOverdue,
  paymentActions,
  paymentMethodNeedsReference,
  paymentNeedsApproval,
  paymentPreview,
  type PaymentForm,
} from '@/utils/treasury-payments';

const form = (over: Partial<PaymentForm> = {}): PaymentForm => ({
  supplierId: 's-1',
  paymentDate: '2026-10-22',
  method: 'transfer',
  accountRole: null,
  reference: 'TRX-1',
  notes: '',
  cash: '100,00',
  rows: [{ payableId: 'p-1', apply: '100,00' }],
  advances: [],
  ...over,
});

describe('deudas por pagar: vencimiento', () => {
  it('días de atraso con la fecha de corte del servidor, sin pasar por UTC', () => {
    expect(payableDaysOverdue('2026-10-01', '2026-10-21')).toBe(20);
    expect(payableDaysOverdue('2026-10-21', '2026-10-21')).toBe(0);
    expect(payableDaysOverdue('2026-11-01', '2026-10-21')).toBe(0);
    expect(payableDaysOverdue('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('solo está vencida una deuda viva con saldo: una pagada, anulada o sin saldo no vence', () => {
    const base = { dueDate: '2026-10-01', balanceCents: 100 };
    expect(isPayableOverdue({ ...base, status: 'open' }, '2026-10-21')).toBe(true);
    expect(isPayableOverdue({ ...base, status: 'partial' }, '2026-10-21')).toBe(true);
    expect(isPayableOverdue({ ...base, status: 'paid', balanceCents: 0 }, '2026-10-21')).toBe(false);
    expect(isPayableOverdue({ ...base, status: 'cancelled', balanceCents: -50 }, '2026-10-21')).toBe(false);
    expect(isPayableOverdue({ ...base, status: 'open', dueDate: '2026-10-21' }, '2026-10-21')).toBe(false);
  });
});

describe('pago: importes y validación', () => {
  it('los cuatro importes cuadran: salió + anticipos = aplicado + excedente', () => {
    expect(paymentPreview(form())).toEqual({ cash: 10000, applied: 10000, advanceUsed: 0, excess: 0 });
    expect(paymentPreview(form({ cash: '150,00' }))).toMatchObject({ excess: 5000 });
    expect(paymentPreview(form({ cash: '0', advances: [{ advanceId: 'a', use: '40,00' }], rows: [{ payableId: 'p-1', apply: '40,00' }] }))).toEqual({ cash: 0, applied: 4000, advanceUsed: 4000, excess: 0 });
    expect(paymentPreview(form({ cash: '50,00' })).excess).toBe(-5000);
  });

  it('arma lo que se envía: centavos enteros, rol por defecto del medio, referencia recortada', () => {
    const { input, errors } = buildPaymentInput(form({ reference: '  TRX-9  ' }));
    expect(errors).toEqual({});
    expect(input).toMatchObject({ supplierId: 's-1', method: 'transfer', accountRole: 'bank', reference: 'TRX-9', totalCents: 10000, lines: [{ payableId: 'p-1', appliedCents: 10000 }], notes: null });
    expect(buildPaymentInput(form({ method: 'cash', reference: '' })).input!.accountRole).toBe('cash');
    expect(buildPaymentInput(form({ method: 'cash', reference: '', accountRole: 'bank' })).input!.accountRole).toBe('bank');
  });

  it('la cuenta bancaria solo viaja si el dinero sale por bancos', () => {
    expect(buildPaymentInput(form({ bankAccountId: 'b-1' })).input!.bankAccountId).toBe('b-1');
    expect(buildPaymentInput(form({ method: 'cash', reference: '', bankAccountId: 'b-1' })).input!.bankAccountId).toBeNull();
    expect(buildPaymentInput(form({ accountRole: 'cash', bankAccountId: 'b-1' })).input!.bankAccountId).toBeNull();
    expect(buildPaymentInput(form()).input!.bankAccountId).toBeNull();
  });

  it('cheque y transferencia exigen referencia; el efectivo no', () => {
    expect(paymentMethodNeedsReference('check')).toBe(true);
    expect(paymentMethodNeedsReference('transfer')).toBe(true);
    expect(paymentMethodNeedsReference('cash')).toBe(false);
    expect(buildPaymentInput(form({ reference: '' })).errors.reference).toBe('treasury.payments.errors.reference');
    expect(buildPaymentInput(form({ method: 'cash', reference: '' })).errors.reference).toBeUndefined();
  });

  it('avisa de cada fila que no cabe y de lo aplicado de más, con la clave de su campo', () => {
    const limits = { balances: { 'p-1': 5000 }, available: { a: 1000 } };
    expect(buildPaymentInput(form(), limits).errors['rows[0].apply']).toBe('treasury.payments.errors.overBalance');
    expect(buildPaymentInput(form({ cash: '100,00', advances: [{ advanceId: 'a', use: '20,00' }] }), { balances: { 'p-1': 99999 }, available: { a: 1000 } }).errors['advances[0].use']).toBe('treasury.payments.errors.overAdvance');
    expect(buildPaymentInput(form({ cash: '50,00' })).errors.lines).toBe('treasury.payments.errors.applyTooMuch');
    expect(buildPaymentInput(form({ cash: '', rows: [] })).errors.cash).toBe('treasury.payments.errors.nothing');
    expect(buildPaymentInput(form({ supplierId: null })).errors.supplierId).toBe('treasury.payments.errors.supplier');
    expect(buildPaymentInput(form({ paymentDate: '2026-02-31' })).errors.paymentDate).toBe('treasury.payments.errors.date');
    expect(buildPaymentInput(form({ rows: [{ payableId: 'p-1', apply: 'abc' }] })).errors['rows[0].apply']).toBe('treasury.payments.errors.amount');
  });

  it('un pago que solo consume un anticipo es válido sin dinero que salga', () => {
    const { input, errors } = buildPaymentInput(form({ cash: '', advances: [{ advanceId: 'a', use: '100,00' }] }), { available: { a: 10000 } });
    expect(errors).toEqual({});
    expect(input).toMatchObject({ totalCents: 0, advanceUses: [{ advanceId: 'a', usedCents: 10000 }] });
  });
});

describe('umbral de aprobación y acciones', () => {
  it('«necesita aprobación» usa lo mayor entre lo que sale y lo que se aplica (igual que el servidor)', () => {
    expect(paymentNeedsApproval(null, { totalCents: 99999999, appliedCents: 99999999 })).toBe(false);
    expect(paymentNeedsApproval(50000, { totalCents: 49999, appliedCents: 49999 })).toBe(false);
    expect(paymentNeedsApproval(50000, { totalCents: 50000, appliedCents: 50000 })).toBe(true);
    expect(paymentNeedsApproval(50000, { totalCents: 0, appliedCents: 60000 })).toBe(true); // solo consume anticipos
  });

  it('parseApprovalThreshold: vacío = sin umbral, importe válido = centavos, el resto = inválido', () => {
    expect(parseApprovalThreshold('')).toBeNull();
    expect(parseApprovalThreshold('  ')).toBeNull();
    expect(parseApprovalThreshold('500,00')).toBe(50000);
    expect(parseApprovalThreshold('0')).toBeUndefined();
    expect(parseApprovalThreshold('-5')).toBeUndefined();
    expect(parseApprovalThreshold('mucho')).toBeUndefined();
  });

  const can = (...perms: string[]) => (p: string) => perms.includes(p);
  const draft = { status: 'draft' as const, createdBy: 'u-1', totalCents: 60000, appliedCents: 60000 };

  it('quien creó el pago no lo aprueba aunque tenga el permiso; otra persona sí', () => {
    const ctx = { thresholdCents: 50000, userId: 'u-1' };
    expect(paymentActions(draft, { ...ctx, can: can('payment:create', 'payment:approve') }).approve).toBe(false);
    expect(paymentActions(draft, { ...ctx, userId: 'u-2', can: can('payment:approve') }).approve).toBe(true);
    expect(paymentActions(draft, { ...ctx, userId: 'u-2', can: can('payment:create') }).approve).toBe(false); // sin el permiso de aprobar
  });

  it('con umbral alcanzado un borrador NO se contabiliza hasta que lo aprueban; uno aprobado sí', () => {
    const ctx = { thresholdCents: 50000, userId: 'u-1', can: can('payment:create') };
    expect(paymentActions(draft, ctx)).toMatchObject({ post: false, awaitingApproval: true, edit: true });
    expect(paymentActions({ ...draft, status: 'approved' }, ctx)).toMatchObject({ post: true, awaitingApproval: false, edit: true });
  });

  it('quien no conoce el umbral (el Contador) se guía por lo que dice el servidor: `requiresApproval` manda', () => {
    const ctx = { thresholdCents: null, userId: 'u-1', can: can('payment:create') };
    expect(paymentActions({ ...draft, requiresApproval: true }, ctx)).toMatchObject({ post: false, awaitingApproval: true });
    expect(paymentActions({ ...draft, requiresApproval: false }, { ...ctx, thresholdCents: 50000 })).toMatchObject({ post: true, awaitingApproval: false });
  });

  it('sin umbral, o por debajo, el borrador se contabiliza directo', () => {
    expect(paymentActions(draft, { thresholdCents: null, userId: 'u-1', can: can('payment:create') })).toMatchObject({ post: true, approve: false, awaitingApproval: false });
    expect(paymentActions({ ...draft, totalCents: 100, appliedCents: 100 }, { thresholdCents: 50000, userId: 'u-1', can: can('payment:create') }).post).toBe(true);
  });

  it('anular solo con `payment:void` y solo un pago contabilizado; uno contabilizado no se edita', () => {
    const posted = { ...draft, status: 'posted' as const };
    expect(paymentActions(posted, { thresholdCents: null, userId: 'u-9', can: can('payment:create') })).toMatchObject({ void: false, edit: false, post: false });
    expect(paymentActions(posted, { thresholdCents: null, userId: 'u-9', can: can('payment:void') }).void).toBe(true);
    expect(paymentActions({ ...draft, status: 'voided' }, { thresholdCents: null, userId: 'u-9', can: can('payment:void', 'payment:create') })).toMatchObject({ void: false, edit: false, post: false });
  });

  it('sin permiso de crear no hay botones de edición ni de pago', () => {
    expect(paymentActions(draft, { thresholdCents: null, userId: 'u-1', can: can('payment:read') })).toMatchObject({ edit: false, post: false, approve: false });
  });
});

describe('saldos iniciales de deudas', () => {
  const row = (over: Record<string, string | null> = {}) => ({ ...emptyPayableOpeningRow(), supplierId: 's-1', issueDate: '2026-08-01', amount: '50,00', ...over });

  it('arma lo que se envía y deja el vencimiento vacío como null', () => {
    const { input, errors } = buildPayableOpeningInput({ cutoffDate: '2026-09-30', reason: 'Migración', rows: [row({ documentNumber: ' F-1 ' }), row({ dueDate: '2026-09-01', amount: '10,00' })] });
    expect(errors).toEqual({});
    expect(input!.lines).toEqual([
      { supplierId: 's-1', documentNumber: 'F-1', issueDate: '2026-08-01', dueDate: null, amountCents: 5000 },
      { supplierId: 's-1', documentNumber: null, issueDate: '2026-08-01', dueDate: '2026-09-01', amountCents: 1000 },
    ]);
  });

  it('marca cada campo con su clave: proveedor, fechas, importe, motivo y sin líneas', () => {
    const r = buildPayableOpeningInput({ cutoffDate: '', reason: 'x', rows: [row({ supplierId: null, issueDate: '', amount: '0' }), row({ dueDate: '2026-07-01' })] });
    expect(r.input).toBeNull();
    expect(r.errors).toMatchObject({
      cutoffDate: 'treasury.opening.errors.cutoff',
      reason: 'treasury.opening.errors.reason',
      'rows[0].supplierId': 'treasury.payableOpening.errors.supplier',
      'rows[0].issueDate': 'treasury.opening.errors.issueDate',
      'rows[0].amount': 'treasury.opening.errors.amount',
      'rows[1].dueDate': 'treasury.opening.errors.dueBeforeIssue',
    });
    expect(buildPayableOpeningInput({ cutoffDate: '2026-09-30', reason: 'Migración', rows: [] }).errors.rows).toBe('treasury.opening.errors.noRows');
  });
});
