import { parseMoneyToCents } from '@/utils/accounting';
import type { AgingBucket, OpeningBalanceInput, Receivable, ReceivableStatus } from '@/types/treasury';

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
