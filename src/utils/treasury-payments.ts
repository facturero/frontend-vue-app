import { parseMoneyToCents } from '@/utils/accounting';
import { isLocalDate } from '@/utils/treasury';
import type {
  Payable,
  PayableOpeningBalanceInput,
  PayableStatus,
  Payment,
  PaymentAccountRole,
  PaymentCreateInput,
  PaymentMethod,
  PaymentStatus,
} from '@/types/treasury';

// ── Cuentas por pagar ───────────────────────────────────────────────────────

export const PAYABLE_STATUS_COLOR: Record<PayableStatus, string> = {
  open: 'lightinfo',
  partial: 'lightwarning',
  paid: 'lightsuccess',
  cancelled: 'lightsecondary',
};

/** Días de atraso de una deuda con la fecha de corte del servidor (0 si todavía no vence). */
export function payableDaysOverdue(dueDate: string, asOf: string): number {
  const toDay = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;
  return Math.max(0, toDay(asOf) - toDay(dueDate));
}

/** Una deuda está vencida si sigue viva (abierta o parcial) y su vencimiento ya pasó. Una pagada o anulada no vence. */
export function isPayableOverdue(p: Pick<Payable, 'status' | 'dueDate' | 'balanceCents'>, asOf: string): boolean {
  return (p.status === 'open' || p.status === 'partial') && p.balanceCents > 0 && p.dueDate < asOf;
}

/** Los tramos de la antigüedad de lo que se debe, en el orden en que se leen (de lo urgente a lo más viejo). */
export const PAYABLES_AGING_BUCKETS = [
  { key: 'dueSoonCents', labelKey: 'treasury.payables.aging.dueSoon', color: 'warning' },
  { key: 'currentCents', labelKey: 'treasury.payables.aging.current', color: 'success' },
  { key: 'days1To30Cents', labelKey: 'treasury.payables.aging.d1', color: 'info' },
  { key: 'days31To60Cents', labelKey: 'treasury.payables.aging.d2', color: 'warning' },
  { key: 'days61To90Cents', labelKey: 'treasury.payables.aging.d3', color: 'error' },
  { key: 'daysOver90Cents', labelKey: 'treasury.payables.aging.d4', color: 'error' },
] as const;

// ── Pagos ────────────────────────────────────────────────────────────────────

export const PAYMENT_STATUS_COLOR: Record<PaymentStatus, string> = {
  draft: 'lightwarning',
  approved: 'lightinfo',
  posted: 'lightsuccess',
  voided: 'lightsecondary',
};

/** Efectivo → caja; todo lo demás → bancos. La persona puede cambiarlo (p. ej. un cheque que sale de caja chica). */
export const defaultPaymentAccountRole = (method: PaymentMethod): PaymentAccountRole => (method === 'cash' ? 'cash' : 'bank');

/** En cheque y transferencia la referencia es obligatoria: sin ella el pago no se puede conciliar con el banco. */
export const paymentMethodNeedsReference = (method: PaymentMethod): boolean => method === 'check' || method === 'transfer';

/** ¿Este pago necesita aprobación? Mismo criterio que el servidor: lo mayor entre lo que sale y lo que se aplica llega al umbral. */
export function paymentNeedsApproval(thresholdCents: number | null, payment: Pick<Payment, 'totalCents' | 'appliedCents'>): boolean {
  return thresholdCents !== null && Math.max(payment.totalCents, payment.appliedCents) >= thresholdCents;
}

/**
 * Qué botones ve cada persona en un pago. El servidor vuelve a comprobarlo (y es quien manda): aquí solo se evita ofrecer lo que va a
 * fallar. Separación de funciones: quien creó el pago no lo aprueba, aunque tenga el permiso.
 */
export function paymentActions(
  payment: Pick<Payment, 'status' | 'createdBy' | 'totalCents' | 'appliedCents'> & { requiresApproval?: boolean },
  ctx: { can: (permission: string) => boolean; userId: string | null; thresholdCents: number | null },
): { edit: boolean; approve: boolean; post: boolean; void: boolean; awaitingApproval: boolean } {
  const drafter = ctx.can('payment:create');
  // El servidor manda: quien no gestiona el umbral (el Contador) no lo conoce y solo sabe si ESTE pago lo necesita por `requiresApproval`.
  const needs = payment.requiresApproval ?? paymentNeedsApproval(ctx.thresholdCents, payment);
  const open = payment.status === 'draft' || payment.status === 'approved';
  return {
    edit: open && drafter,
    approve: payment.status === 'draft' && needs && ctx.can('payment:approve') && payment.createdBy !== ctx.userId,
    // Se contabiliza un aprobado, o un borrador que no necesita aprobación.
    post: drafter && (payment.status === 'approved' || (payment.status === 'draft' && !needs)),
    void: payment.status === 'posted' && ctx.can('payment:void'),
    awaitingApproval: payment.status === 'draft' && needs,
  };
}

export interface PaymentFormRow {
  payableId: string;
  /** Lo que se aplica a esta factura, como lo escribe la persona. Vacío = no se paga. */
  apply: string;
}

export interface PaymentFormAdvance {
  advanceId: string;
  use: string;
}

export interface PaymentForm {
  supplierId: string | null;
  paymentDate: string;
  method: PaymentMethod;
  /** `null` = el rol por defecto del medio de pago. */
  accountRole: PaymentAccountRole | null;
  /** Cuenta bancaria de tesorería; solo aplica si el dinero sale por bancos. */
  bankAccountId?: string | null;
  reference: string;
  notes: string;
  /** Lo que sale de caja o banco, como lo escribe la persona. */
  cash: string;
  rows: PaymentFormRow[];
  advances: PaymentFormAdvance[];
}

const positiveCents = (text: string): number => {
  const n = parseMoneyToCents(text);
  return n !== null && n > 0 ? n : 0;
};

/**
 * Los cuatro importes de un pago, con la igualdad
 *     salió + anticipos usados = aplicado a facturas + excedente
 * `excess` negativo significa que se aplica más de lo que hay: el formulario lo marca como error.
 */
export function paymentPreview(form: Pick<PaymentForm, 'cash' | 'rows' | 'advances'>): { cash: number; applied: number; advanceUsed: number; excess: number } {
  const cash = positiveCents(form.cash);
  const applied = form.rows.reduce((acc, r) => acc + positiveCents(r.apply), 0);
  const advanceUsed = form.advances.reduce((acc, a) => acc + positiveCents(a.use), 0);
  return { cash, applied, advanceUsed, excess: cash + advanceUsed - applied };
}

/**
 * Valida el formulario de pago y arma lo que se envía. Los errores son claves i18n por campo (`rows[0].apply`). `balances` y `available`
 * (saldo NETO de cada factura y de cada anticipo) permiten avisar antes de enviar; el servidor vuelve a validar todo con las filas
 * bloqueadas, que es la comprobación que vale.
 */
export function buildPaymentInput(
  form: PaymentForm,
  limits: { balances?: Record<string, number>; available?: Record<string, number> } = {},
): { input: PaymentCreateInput | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!form.supplierId) errors.supplierId = 'treasury.payments.errors.supplier';
  if (!isLocalDate(form.paymentDate)) errors.paymentDate = 'treasury.payments.errors.date';
  if (paymentMethodNeedsReference(form.method) && form.reference.trim() === '') errors.reference = 'treasury.payments.errors.reference';
  if (form.cash.trim() !== '' && parseMoneyToCents(form.cash) === null) errors.cash = 'treasury.payments.errors.cash';

  const lines: PaymentCreateInput['lines'] = [];
  form.rows.forEach((row, i) => {
    if (row.apply.trim() === '') return;
    const n = parseMoneyToCents(row.apply);
    if (n === null || n <= 0) return void (errors[`rows[${i}].apply`] = 'treasury.payments.errors.amount');
    const balance = limits.balances?.[row.payableId];
    if (balance !== undefined && n > balance) return void (errors[`rows[${i}].apply`] = 'treasury.payments.errors.overBalance');
    lines.push({ payableId: row.payableId, appliedCents: n });
  });

  const advanceUses: NonNullable<PaymentCreateInput['advanceUses']> = [];
  form.advances.forEach((adv, i) => {
    if (adv.use.trim() === '') return;
    const n = parseMoneyToCents(adv.use);
    if (n === null || n <= 0) return void (errors[`advances[${i}].use`] = 'treasury.payments.errors.amount');
    const available = limits.available?.[adv.advanceId];
    if (available !== undefined && n > available) return void (errors[`advances[${i}].use`] = 'treasury.payments.errors.overAdvance');
    advanceUses.push({ advanceId: adv.advanceId, usedCents: n });
  });

  const preview = paymentPreview(form);
  if (preview.excess < 0) errors.lines = 'treasury.payments.errors.applyTooMuch';
  else if (preview.cash + preview.advanceUsed <= 0) errors.cash = 'treasury.payments.errors.nothing';

  if (Object.keys(errors).length > 0) return { input: null, errors };
  return {
    input: {
      supplierId: form.supplierId!,
      paymentDate: form.paymentDate,
      method: form.method,
      accountRole: form.accountRole ?? defaultPaymentAccountRole(form.method),
      bankAccountId: (form.accountRole ?? defaultPaymentAccountRole(form.method)) === 'bank' ? (form.bankAccountId ?? null) : null,
      reference: form.reference.trim() || null,
      totalCents: preview.cash,
      lines,
      advanceUses,
      notes: form.notes.trim() || null,
    },
    errors,
  };
}

/** Umbral de aprobación: vacío = sin aprobación; si no, un importe mayor que cero. Devuelve centavos, `null` (sin umbral) o `undefined` (inválido). */
export function parseApprovalThreshold(text: string): number | null | undefined {
  if (text.trim() === '') return null;
  const cents = parseMoneyToCents(text);
  return cents !== null && cents > 0 ? cents : undefined;
}

// ── Saldos iniciales de deudas ──────────────────────────────────────────────

export interface PayableOpeningRow {
  supplierId: string | null;
  documentNumber: string;
  issueDate: string;
  /** Vacío = vence el día de la emisión. */
  dueDate: string;
  amount: string;
}

export interface PayableOpeningForm {
  cutoffDate: string;
  reason: string;
  rows: PayableOpeningRow[];
}

export const emptyPayableOpeningRow = (): PayableOpeningRow => ({ supplierId: null, documentNumber: '', issueDate: '', dueDate: '', amount: '' });

/** Valida el formulario de saldos iniciales de deudas y arma lo que se envía (errores = claves i18n por campo). El servidor vuelve a validar. */
export function buildPayableOpeningInput(form: PayableOpeningForm): { input: PayableOpeningBalanceInput | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!isLocalDate(form.cutoffDate)) errors.cutoffDate = 'treasury.opening.errors.cutoff';
  if (form.reason.trim().length < 3) errors.reason = 'treasury.opening.errors.reason';
  if (form.rows.length === 0) errors.rows = 'treasury.opening.errors.noRows';
  if (form.rows.length > 500) errors.rows = 'treasury.opening.errors.tooMany';

  const lines: PayableOpeningBalanceInput['lines'] = [];
  form.rows.forEach((row, i) => {
    if (!row.supplierId) errors[`rows[${i}].supplierId`] = 'treasury.payableOpening.errors.supplier';
    if (!isLocalDate(row.issueDate)) errors[`rows[${i}].issueDate`] = 'treasury.opening.errors.issueDate';
    const hasDue = row.dueDate.trim() !== '';
    if (hasDue && !isLocalDate(row.dueDate)) errors[`rows[${i}].dueDate`] = 'treasury.opening.errors.dueDate';
    else if (hasDue && isLocalDate(row.issueDate) && row.dueDate < row.issueDate) errors[`rows[${i}].dueDate`] = 'treasury.opening.errors.dueBeforeIssue';
    const cents = parseMoneyToCents(row.amount);
    if (cents === null || cents <= 0 || row.amount.trim() === '') errors[`rows[${i}].amount`] = 'treasury.opening.errors.amount';
    if (!errors[`rows[${i}].supplierId`] && !errors[`rows[${i}].issueDate`] && !errors[`rows[${i}].dueDate`] && !errors[`rows[${i}].amount`]) {
      lines.push({ supplierId: row.supplierId!, documentNumber: row.documentNumber.trim() || null, issueDate: row.issueDate, dueDate: hasDue ? row.dueDate : null, amountCents: cents! });
    }
  });

  if (Object.keys(errors).length > 0) return { input: null, errors };
  return { input: { cutoffDate: form.cutoffDate, reason: form.reason.trim(), lines }, errors };
}
