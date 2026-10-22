import { parseMoneyToCents } from '@/utils/accounting';
import type {
  AgingBucket,
  OpeningBalanceInput,
  Receipt,
  ReceiptAccountRole,
  ReceiptCreateInput,
  ReceiptMethod,
  ReceiptStatus,
  Receivable,
  ReceivableStatus,
} from '@/types/treasury';
import { MAX_FIRST_AFTER_DAYS, MAX_REPEAT_DAYS, MIN_FIRST_AFTER_DAYS, MIN_REPEAT_DAYS } from '@/types/treasury';

export const RECEIVABLE_STATUS_COLOR: Record<ReceivableStatus, string> = {
  open: 'lightinfo',
  partial: 'lightwarning',
  paid: 'lightsuccess',
  written_off: 'lightsecondary',
  cancelled: 'lightsecondary',
};

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha de calendario real (`2026-02-30` no lo es). Sin pasar por `Date` local: no hay huso que mover el día. */
export function isLocalDate(value: string): boolean {
  if (!LOCAL_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

const dayNumber = (value: string): number => {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Días de atraso de una fecha de vencimiento respecto de la fecha de corte; negativo o cero = todavía no vence. */
export function daysOverdue(dueDate: string, asOf: string): number {
  return dayNumber(asOf) - dayNumber(dueDate);
}

/** Vencida = deuda VIVA (abierta o parcial) con vencimiento anterior a la fecha de corte del servidor. Pagada o anulada no está vencida. */
export function isOverdue(receivable: Pick<Receivable, 'status' | 'dueDate'>, asOf: string): boolean {
  return (receivable.status === 'open' || receivable.status === 'partial') && receivable.dueDate < asOf;
}

/** Tramos de antigüedad, en el orden en que se muestran. */
export const AGING_BUCKETS: { key: keyof Omit<AgingBucket, 'totalCents'>; labelKey: string; color: string }[] = [
  { key: 'currentCents', labelKey: 'treasury.aging.current', color: 'lightsuccess' },
  { key: 'days1To30Cents', labelKey: 'treasury.aging.days1To30', color: 'lightinfo' },
  { key: 'days31To60Cents', labelKey: 'treasury.aging.days31To60', color: 'lightwarning' },
  { key: 'days61To90Cents', labelKey: 'treasury.aging.days61To90', color: 'lightwarning' },
  { key: 'daysOver90Cents', labelKey: 'treasury.aging.daysOver90', color: 'lighterror' },
];

/** Qué parte del total está en cada tramo (0–100, entero). Vacío si no hay deuda, para no dividir por cero. */
export function agingShares(totals: AgingBucket): Record<string, number> {
  const out: Record<string, number> = {};
  for (const bucket of AGING_BUCKETS) out[bucket.key] = totals.totalCents > 0 ? Math.round((totals[bucket.key] / totals.totalCents) * 100) : 0;
  return out;
}

/** Cuánto del cupo de crédito del cliente está en uso. `null` si no tiene cupo: el cupo se guarda y se muestra, no bloquea la facturación. */
export function creditUsage(netCents: number, limitCents: number | null): { limitCents: number; usedCents: number; availableCents: number; percent: number; over: boolean } | null {
  if (limitCents === null) return null;
  const used = Math.max(0, netCents);
  return {
    limitCents,
    usedCents: used,
    availableCents: limitCents - used,
    percent: limitCents > 0 ? Math.min(100, Math.round((used / limitCents) * 100)) : used > 0 ? 100 : 0,
    over: used > limitCents,
  };
}

/** Días de crédito escritos por una persona: entero de 0 a 365, o `null`. */
export function parseCreditDays(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 0 && n <= 365 ? n : null;
}

/** Cupo escrito por una persona: vacío = sin cupo (`null`); si no, un importe válido en centavos. `undefined` = no es un importe. */
export function parseCreditLimit(text: string): number | null | undefined {
  if (text.trim() === '') return null;
  const cents = parseMoneyToCents(text);
  return cents === null ? undefined : cents;
}

export interface OpeningRow {
  customerId: string | null;
  documentNumber: string;
  issueDate: string;
  /** Vacío = el servidor lo calcula con los días de crédito del cliente. */
  dueDate: string;
  amount: string;
}

export interface OpeningForm {
  cutoffDate: string;
  reason: string;
  rows: OpeningRow[];
}

export const emptyOpeningRow = (): OpeningRow => ({ customerId: null, documentNumber: '', issueDate: '', dueDate: '', amount: '' });

/**
 * Valida el formulario de saldos iniciales y arma lo que se envía. Los errores son claves i18n por campo (`rows[0].amount`): la
 * vista los pinta junto al campo. El servidor vuelve a validar todo (y comprueba que el cliente exista): esto solo evita enviar
 * lo que se sabe que fallará.
 */
export function buildOpeningBalanceInput(form: OpeningForm): { input: OpeningBalanceInput | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!isLocalDate(form.cutoffDate)) errors.cutoffDate = 'treasury.opening.errors.cutoff';
  if (form.reason.trim().length < 3) errors.reason = 'treasury.opening.errors.reason';
  if (form.rows.length === 0) errors.rows = 'treasury.opening.errors.noRows';
  if (form.rows.length > 500) errors.rows = 'treasury.opening.errors.tooMany';

  const lines: OpeningBalanceInput['lines'] = [];
  form.rows.forEach((row, i) => {
    if (!row.customerId) errors[`rows[${i}].customerId`] = 'treasury.opening.errors.customer';
    if (!isLocalDate(row.issueDate)) errors[`rows[${i}].issueDate`] = 'treasury.opening.errors.issueDate';
    const hasDue = row.dueDate.trim() !== '';
    if (hasDue && !isLocalDate(row.dueDate)) errors[`rows[${i}].dueDate`] = 'treasury.opening.errors.dueDate';
    else if (hasDue && isLocalDate(row.issueDate) && row.dueDate < row.issueDate) errors[`rows[${i}].dueDate`] = 'treasury.opening.errors.dueBeforeIssue';
    const cents = parseMoneyToCents(row.amount);
    if (cents === null || cents <= 0 || row.amount.trim() === '') errors[`rows[${i}].amount`] = 'treasury.opening.errors.amount';
    if (!errors[`rows[${i}].customerId`] && !errors[`rows[${i}].issueDate`] && !errors[`rows[${i}].dueDate`] && !errors[`rows[${i}].amount`]) {
      lines.push({
        customerId: row.customerId!,
        documentNumber: row.documentNumber.trim() || null,
        issueDate: row.issueDate,
        dueDate: hasDue ? row.dueDate : null,
        amountCents: cents!,
      });
    }
  });

  if (Object.keys(errors).length > 0) return { input: null, errors };
  return { input: { cutoffDate: form.cutoffDate, reason: form.reason.trim(), lines }, errors };
}

/** Total de las líneas con un importe válido (para mostrarlo mientras se escribe). */
export function openingTotalCents(rows: Pick<OpeningRow, 'amount'>[]): number {
  return rows.reduce((acc, row) => {
    const cents = parseMoneyToCents(row.amount);
    return acc + (cents !== null && cents > 0 ? cents : 0);
  }, 0);
}

// ── Cobros ───────────────────────────────────────────────────────────────────

export const RECEIPT_STATUS_COLOR: Record<ReceiptStatus, string> = {
  draft: 'lightwarning',
  posted: 'lightsuccess',
  voided: 'lightsecondary',
};

/** Efectivo → caja; todo lo demás → bancos. La persona puede cambiarlo (p. ej. un cheque que se guarda en caja). */
export function defaultAccountRole(method: ReceiptMethod): ReceiptAccountRole {
  return method === 'cash' ? 'cash' : 'bank';
}

/** En cheque y transferencia la referencia (n.º de cheque u operación) es obligatoria: sin ella el cobro no se puede conciliar con el banco. */
export const methodNeedsReference = (method: ReceiptMethod): boolean => method === 'check' || method === 'transfer';

/** Qué botones ve cada persona en un cobro. El servidor vuelve a comprobarlo: aquí solo se evita ofrecer lo que va a fallar. */
export function receiptActions(receipt: Pick<Receipt, 'status'>, can: (permission: string) => boolean): { edit: boolean; post: boolean; void: boolean } {
  const drafter = can('receipt:create');
  return {
    edit: receipt.status === 'draft' && drafter,
    post: receipt.status === 'draft' && drafter,
    // Anular es un permiso aparte (solo el Administrador): quien cobra no anula lo suyo sin rastro.
    void: receipt.status === 'posted' && can('receipt:void'),
  };
}

/**
 * Reparte un importe entre las deudas, la más antigua primero (por vencimiento), cada una hasta su saldo. Es la sugerencia con la que
 * arranca el formulario: la persona la cambia. Lo que sobra no se asigna (queda como excedente/anticipo). Devuelve centavos por deuda.
 */
export function allocateOldestFirst(
  receivables: Pick<Receivable, 'id' | 'dueDate' | 'issueDate' | 'balanceCents' | 'status'>[],
  cents: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  let left = Math.max(0, cents);
  const live = receivables
    .filter((r) => (r.status === 'open' || r.status === 'partial') && r.balanceCents > 0)
    .sort((a, b) => (a.dueDate === b.dueDate ? (a.issueDate < b.issueDate ? -1 : 1) : a.dueDate < b.dueDate ? -1 : 1));
  for (const r of live) {
    if (left <= 0) break;
    const apply = Math.min(left, r.balanceCents);
    out[r.id] = apply;
    left -= apply;
  }
  return out;
}

export interface ReceiptFormRow {
  receivableId: string;
  /** Lo que se aplica a esta deuda, como lo escribe la persona. Vacío = no se cobra. */
  apply: string;
}

export interface ReceiptFormAdvance {
  advanceId: string;
  /** Lo que se consume de este anticipo, como lo escribe la persona. Vacío = no se usa. */
  use: string;
}

export interface ReceiptForm {
  customerId: string | null;
  receiptDate: string;
  method: ReceiptMethod;
  /** `null` = el rol por defecto del medio de cobro. */
  accountRole: ReceiptAccountRole | null;
  /** Cuenta bancaria de tesorería; solo aplica si el dinero entra por bancos. */
  bankAccountId?: string | null;
  reference: string;
  notes: string;
  /** Lo que entró a caja o banco, como lo escribe la persona. */
  cash: string;
  rows: ReceiptFormRow[];
  advances: ReceiptFormAdvance[];
}

const cents = (text: string): number => {
  const n = parseMoneyToCents(text);
  return n !== null && n > 0 ? n : 0;
};

/**
 * Los cuatro importes de un cobro, con la igualdad
 *     entró + anticipos usados = aplicado + excedente
 * `excess` negativo significa que se está aplicando más de lo que hay: el formulario lo marca como error.
 */
export function receiptPreview(form: Pick<ReceiptForm, 'cash' | 'rows' | 'advances'>): { cash: number; applied: number; advanceUsed: number; excess: number } {
  const cash = cents(form.cash);
  const applied = form.rows.reduce((acc, r) => acc + cents(r.apply), 0);
  const advanceUsed = form.advances.reduce((acc, a) => acc + cents(a.use), 0);
  return { cash, applied, advanceUsed, excess: cash + advanceUsed - applied };
}

/**
 * Valida el formulario de cobro y arma lo que se envía. Los errores son claves i18n por campo (`rows[0].apply`). `balances` y
 * `available` (saldo de cada deuda y de cada anticipo) permiten avisar antes de enviar; el servidor vuelve a validar todo con las filas
 * bloqueadas, que es la comprobación que vale.
 */
export function buildReceiptInput(
  form: ReceiptForm,
  limits: { balances?: Record<string, number>; available?: Record<string, number> } = {},
): { input: ReceiptCreateInput | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!form.customerId) errors.customerId = 'treasury.receipts.errors.customer';
  if (!isLocalDate(form.receiptDate)) errors.receiptDate = 'treasury.receipts.errors.date';
  if (methodNeedsReference(form.method) && form.reference.trim() === '') errors.reference = 'treasury.receipts.errors.reference';
  if (form.cash.trim() !== '' && parseMoneyToCents(form.cash) === null) errors.cash = 'treasury.receipts.errors.cash';

  const lines: ReceiptCreateInput['lines'] = [];
  form.rows.forEach((row, i) => {
    if (row.apply.trim() === '') return;
    const n = parseMoneyToCents(row.apply);
    if (n === null || n <= 0) return void (errors[`rows[${i}].apply`] = 'treasury.receipts.errors.amount');
    const balance = limits.balances?.[row.receivableId];
    if (balance !== undefined && n > balance) return void (errors[`rows[${i}].apply`] = 'treasury.receipts.errors.overBalance');
    lines.push({ receivableId: row.receivableId, appliedCents: n });
  });

  const advanceUses: NonNullable<ReceiptCreateInput['advanceUses']> = [];
  form.advances.forEach((adv, i) => {
    if (adv.use.trim() === '') return;
    const n = parseMoneyToCents(adv.use);
    if (n === null || n <= 0) return void (errors[`advances[${i}].use`] = 'treasury.receipts.errors.amount');
    const available = limits.available?.[adv.advanceId];
    if (available !== undefined && n > available) return void (errors[`advances[${i}].use`] = 'treasury.receipts.errors.overAdvance');
    advanceUses.push({ advanceId: adv.advanceId, usedCents: n });
  });

  const preview = receiptPreview(form);
  if (preview.excess < 0) errors.lines = 'treasury.receipts.errors.applyTooMuch';
  else if (preview.cash + preview.advanceUsed <= 0) errors.cash = 'treasury.receipts.errors.nothing';

  if (Object.keys(errors).length > 0) return { input: null, errors };
  return {
    input: {
      customerId: form.customerId!,
      receiptDate: form.receiptDate,
      method: form.method,
      accountRole: form.accountRole ?? defaultAccountRole(form.method),
      bankAccountId: (form.accountRole ?? defaultAccountRole(form.method)) === 'bank' ? (form.bankAccountId ?? null) : null,
      reference: form.reference.trim() || null,
      totalCents: preview.cash,
      lines,
      advanceUses,
      notes: form.notes.trim() || null,
    },
    errors,
  };
}

// ── Recordatorios y exportación (bloque C) ──

/** Valida la configuración como el servidor (mismos rangos): devuelve la clave de traducción del error de cada campo. */
export function validateReminderSettings(form: { firstAfterDays: string; repeatEveryDays: string }): {
  input: { firstAfterDays: number; repeatEveryDays: number } | null;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const parse = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null);
  const first = parse(form.firstAfterDays);
  const repeat = parse(form.repeatEveryDays);
  if (first === null || first < MIN_FIRST_AFTER_DAYS || first > MAX_FIRST_AFTER_DAYS) errors.firstAfterDays = 'treasury.reminders.errors.firstAfterDays';
  if (repeat === null || repeat < MIN_REPEAT_DAYS || repeat > MAX_REPEAT_DAYS) errors.repeatEveryDays = 'treasury.reminders.errors.repeatEveryDays';
  if (Object.keys(errors).length > 0) return { input: null, errors };
  return { input: { firstAfterDays: first!, repeatEveryDays: repeat! }, errors };
}

/** Idioma de los encabezados del CSV: el de la interfaz, si el servidor lo conoce (si no, español). */
export function reportLang(locale: string): 'es' | 'en' | 'fr' {
  const base = locale.slice(0, 2).toLowerCase();
  return base === 'en' || base === 'fr' ? base : 'es';
}

/** Descarga un archivo que ya llegó del servidor (el BOM ya viene dentro: no se le añade otro). */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
