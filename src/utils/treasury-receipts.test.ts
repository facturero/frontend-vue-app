import { describe, expect, it } from 'vitest';
import {
  allocateOldestFirst,
  buildReceiptInput,
  defaultAccountRole,
  methodNeedsReference,
  receiptActions,
  receiptPreview,
  RECEIPT_STATUS_COLOR,
  type ReceiptForm,
} from './treasury';

describe('cobros: acciones por permiso', () => {
  const can = (...granted: string[]) => (p: string) => granted.includes(p);

  it('un borrador se edita y se contabiliza con receipt:create; no se anula', () => {
    expect(receiptActions({ status: 'draft' }, can('receipt:create'))).toEqual({ edit: true, post: true, void: false });
    expect(receiptActions({ status: 'draft' }, can('receipt:read'))).toEqual({ edit: false, post: false, void: false });
  });

  it('uno contabilizado ya no se edita ni se contabiliza; anular pide receipt:void (quien cobra NO anula)', () => {
    expect(receiptActions({ status: 'posted' }, can('receipt:create'))).toEqual({ edit: false, post: false, void: false });
    expect(receiptActions({ status: 'posted' }, can('receipt:create', 'receipt:void'))).toEqual({ edit: false, post: false, void: true });
  });

  it('uno anulado no ofrece nada', () => {
    expect(receiptActions({ status: 'voided' }, can('receipt:create', 'receipt:void'))).toEqual({ edit: false, post: false, void: false });
  });

  it('el rol del medio y la referencia obligatoria', () => {
    expect(defaultAccountRole('cash')).toBe('cash');
    for (const m of ['transfer', 'check', 'card', 'other'] as const) expect(defaultAccountRole(m)).toBe('bank');
    expect(methodNeedsReference('check')).toBe(true);
    expect(methodNeedsReference('transfer')).toBe(true);
    expect(methodNeedsReference('cash')).toBe(false);
    expect(methodNeedsReference('card')).toBe(false);
  });

  it('cada estado tiene un color del tema (nunca un hexadecimal)', () => {
    for (const color of Object.values(RECEIPT_STATUS_COLOR)) expect(color).toMatch(/^light[a-z]+$/);
  });
});

describe('cobros: reparto por antigüedad', () => {
  const r = (id: string, dueDate: string, balanceCents: number, status: 'open' | 'partial' | 'paid' | 'cancelled' = 'open') => ({ id, dueDate, issueDate: dueDate, balanceCents, status });

  it('cubre primero la más antigua, cada una hasta su saldo, y deja sin asignar lo que sobra', () => {
    const list = [r('nueva', '2026-12-01', 5000), r('vieja', '2026-09-01', 3000), r('media', '2026-10-01', 4000)];
    expect(allocateOldestFirst(list, 6000)).toEqual({ vieja: 3000, media: 3000 });
    expect(allocateOldestFirst(list, 100000)).toEqual({ vieja: 3000, media: 4000, nueva: 5000 });
    expect(allocateOldestFirst(list, 0)).toEqual({});
  });

  it('ignora lo que no es cobrable: pagadas, anuladas y saldos en cero o en contra', () => {
    const list = [r('pagada', '2026-01-01', 0, 'paid'), r('anulada', '2026-01-02', -500, 'cancelled'), r('viva', '2026-02-01', 1000, 'partial')];
    expect(allocateOldestFirst(list, 5000)).toEqual({ viva: 1000 });
  });

  it('con el mismo vencimiento desempata por emisión', () => {
    const list = [
      { id: 'b', dueDate: '2026-10-01', issueDate: '2026-09-15', balanceCents: 100, status: 'open' as const },
      { id: 'a', dueDate: '2026-10-01', issueDate: '2026-09-01', balanceCents: 100, status: 'open' as const },
    ];
    expect(Object.keys(allocateOldestFirst(list, 100))).toEqual(['a']);
  });
});

describe('cobros: formulario', () => {
  const form = (over: Partial<ReceiptForm> = {}): ReceiptForm => ({
    customerId: 'c-1',
    receiptDate: '2026-10-21',
    method: 'transfer',
    accountRole: null,
    reference: ' TRX-1 ',
    notes: ' pago ',
    cash: '115,00',
    rows: [{ receivableId: 'r-1', apply: '115,00' }, { receivableId: 'r-2', apply: '' }],
    advances: [],
    ...over,
  });

  it('receiptPreview: entró + anticipos usados = aplicado + excedente', () => {
    expect(receiptPreview(form())).toEqual({ cash: 11500, applied: 11500, advanceUsed: 0, excess: 0 });
    expect(receiptPreview(form({ cash: '150,00' })).excess).toBe(3500);
    expect(receiptPreview(form({ cash: '0', advances: [{ advanceId: 'a-1', use: '40' }], rows: [{ receivableId: 'r-1', apply: '40' }] }))).toEqual({ cash: 0, applied: 4000, advanceUsed: 4000, excess: 0 });
  });

  it('receiptPreview: importes inválidos o vacíos cuentan como cero (no rompen la suma)', () => {
    expect(receiptPreview(form({ cash: 'x', rows: [{ receivableId: 'r-1', apply: '-5' }] }))).toEqual({ cash: 0, applied: 0, advanceUsed: 0, excess: 0 });
  });

  it('arma lo que se envía: centavos, referencia y notas recortadas, el rol por defecto del medio y sin las líneas vacías', () => {
    const { input, errors } = buildReceiptInput(form());
    expect(errors).toEqual({});
    expect(input).toEqual({
      customerId: 'c-1',
      receiptDate: '2026-10-21',
      method: 'transfer',
      accountRole: 'bank',
      bankAccountId: null,
      reference: 'TRX-1',
      totalCents: 11500,
      lines: [{ receivableId: 'r-1', appliedCents: 11500 }],
      advanceUses: [],
      notes: 'pago',
    });
  });

  it('la cuenta bancaria solo viaja si el dinero entra por bancos: por caja se descarta aunque quedara elegida', () => {
    expect(buildReceiptInput(form({ bankAccountId: 'b-1' })).input!.bankAccountId).toBe('b-1');
    expect(buildReceiptInput(form({ method: 'cash', reference: '', bankAccountId: 'b-1' })).input!.bankAccountId).toBeNull();
    expect(buildReceiptInput(form({ accountRole: 'cash', bankAccountId: 'b-1' })).input!.bankAccountId).toBeNull();
  });

  it('el rol elegido manda sobre el del medio', () => {
    expect(buildReceiptInput(form({ accountRole: 'cash' })).input!.accountRole).toBe('cash');
  });

  it('el excedente no es un error: se envía tal cual y el servidor lo deja como anticipo', () => {
    const { input } = buildReceiptInput(form({ cash: '200,00' }));
    expect(input!.totalCents).toBe(20000);
    expect(input!.lines).toEqual([{ receivableId: 'r-1', appliedCents: 11500 }]);
  });

  it('un cobro sin deudas (todo anticipo) es válido', () => {
    expect(buildReceiptInput(form({ rows: [], cash: '80' })).input).toMatchObject({ totalCents: 8000, lines: [] });
  });

  it('consumir un anticipo sin dinero nuevo es válido', () => {
    const { input } = buildReceiptInput(form({ cash: '', method: 'cash', reference: '', rows: [{ receivableId: 'r-1', apply: '40' }], advances: [{ advanceId: 'a-1', use: '40' }] }));
    expect(input).toMatchObject({ totalCents: 0, advanceUses: [{ advanceId: 'a-1', usedCents: 4000 }] });
  });

  it.each([
    ['sin cliente', { customerId: null }, 'customerId'],
    ['fecha inválida', { receiptDate: '21/10/2026' }, 'receiptDate'],
    ['transferencia sin referencia', { reference: '  ' }, 'reference'],
    ['cheque sin referencia', { method: 'check' as const, reference: '' }, 'reference'],
    ['cobrado con letras', { cash: '12abc' }, 'cash'],
    ['nada que cobrar', { cash: '', rows: [] }, 'cash'],
    ['aplicado de más', { cash: '50', rows: [{ receivableId: 'r-1', apply: '115' }] }, 'lines'],
    ['importe de línea con letras', { rows: [{ receivableId: 'r-1', apply: 'abc' }] }, 'rows[0].apply'],
    ['importe de línea cero', { rows: [{ receivableId: 'r-1', apply: '0' }] }, 'rows[0].apply'],
  ])('%s → error en el campo y no se envía nada', (_name, over, field) => {
    const { input, errors } = buildReceiptInput(form(over as Partial<ReceiptForm>));
    expect(input).toBeNull();
    expect(Object.keys(errors)).toContain(field);
  });

  it('avisa antes de enviar si lo aplicado pasa del saldo de la deuda o lo consumido pasa del anticipo', () => {
    const over = buildReceiptInput(form({ cash: '500', rows: [{ receivableId: 'r-1', apply: '200' }] }), { balances: { 'r-1': 11500 } });
    expect(over.errors['rows[0].apply']).toBe('treasury.receipts.errors.overBalance');
    const adv = buildReceiptInput(
      form({ cash: '0', method: 'cash', reference: '', rows: [{ receivableId: 'r-1', apply: '30' }], advances: [{ advanceId: 'a-1', use: '30' }] }),
      { available: { 'a-1': 2000 } },
    );
    expect(adv.errors['advances[0].use']).toBe('treasury.receipts.errors.overAdvance');
    expect(buildReceiptInput(form(), { balances: { 'r-1': 11500 } }).input).not.toBeNull();
  });
});
