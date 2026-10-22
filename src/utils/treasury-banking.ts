import { parseMoneyToCents } from '@/utils/accounting';
import { isLocalDate } from '@/utils/treasury';
import type {
  AdjustmentKind,
  BankAccountInput,
  BankAccountType,
  BankLine,
  BankLineStatus,
  BankMovement,
  CashFlowBucket,
  ImportProfile,
  ReconciliationResult,
} from '@/types/treasury';

// ── Importes con signo ──────────────────────────────────────────────────────

/** Como `parseMoneyToCents` pero admite un signo `-` al principio (el saldo de un banco puede ser negativo: sobregiro). `null` si no es un importe. */
export function parseSignedMoney(input: string): number | null {
  const text = input.trim();
  if (text === '') return null;
  const negative = text.startsWith('-');
  const digits = negative ? text.slice(1).trim() : text;
  // Un «-» solo no es un importe (parseMoneyToCents('') da 0, que aquí sería inventar un cero).
  if (digits === '') return null;
  const cents = parseMoneyToCents(digits);
  if (cents === null) return null;
  return negative && cents !== 0 ? -cents : cents;
}

// ── Perfil de importación ───────────────────────────────────────────────────

export const defaultImportProfile = (): ImportProfile => ({
  delimiter: ',',
  skipRows: 1,
  dateColumn: 1,
  dateFormat: 'DD/MM/YYYY',
  descriptionColumn: 2,
  referenceColumn: null,
  amountMode: 'signed',
  amountColumn: 3,
  debitColumn: null,
  creditColumn: null,
  invertSign: false,
  decimalSeparator: '.',
  balanceColumn: null,
});

/**
 * Errores de un perfil, con la clave i18n de cada campo. Es lo MISMO que exige el servidor: se avisa aquí para no esperar a la vista previa.
 * Las columnas son números desde 1.
 */
export function profileErrors(profile: ImportProfile): Record<string, string> {
  const errors: Record<string, string> = {};
  const column = (value: number | null, field: string, required: boolean) => {
    if (value === null || value === undefined) {
      if (required) errors[field] = 'treasury.banking.errors.column';
      return;
    }
    if (!Number.isInteger(value) || value < 1 || value > 50) errors[field] = 'treasury.banking.errors.column';
  };
  if (!Number.isInteger(profile.skipRows) || profile.skipRows < 0 || profile.skipRows > 50) errors.skipRows = 'treasury.banking.errors.skipRows';
  column(profile.dateColumn, 'dateColumn', true);
  column(profile.descriptionColumn, 'descriptionColumn', true);
  column(profile.referenceColumn, 'referenceColumn', false);
  column(profile.balanceColumn, 'balanceColumn', false);
  if (profile.amountMode === 'signed') {
    column(profile.amountColumn, 'amountColumn', true);
  } else {
    column(profile.debitColumn, 'debitColumn', true);
    column(profile.creditColumn, 'creditColumn', true);
    if (profile.debitColumn !== null && profile.debitColumn === profile.creditColumn) errors.creditColumn = 'treasury.banking.errors.sameColumn';
  }
  return errors;
}

/** Deja el perfil listo para enviar: lo que no aplica al modo de importe elegido se manda como `null`. */
export function normalizeProfile(profile: ImportProfile): ImportProfile {
  return profile.amountMode === 'signed'
    ? { ...profile, debitColumn: null, creditColumn: null }
    : { ...profile, amountColumn: null, invertSign: false };
}

// ── Cuenta bancaria ─────────────────────────────────────────────────────────

export interface BankAccountForm {
  name: string;
  bankName: string;
  accountType: BankAccountType;
  accountLast4: string;
  /** El saldo de apertura, como lo escribe la persona (admite «-»). */
  opening: string;
  openingDate: string;
  profile: ImportProfile | null;
}

export const emptyBankAccountForm = (today: string): BankAccountForm => ({
  name: '',
  bankName: '',
  accountType: 'checking',
  accountLast4: '',
  opening: '0',
  openingDate: today,
  profile: null,
});

export function buildBankAccountInput(form: BankAccountForm): { input: BankAccountInput | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (form.name.trim() === '') errors.name = 'treasury.banking.errors.name';
  if (form.bankName.trim() === '') errors.bankName = 'treasury.banking.errors.bankName';
  if (form.accountLast4.trim() !== '' && !/^[A-Za-z0-9]{1,4}$/.test(form.accountLast4.trim())) errors.accountLast4 = 'treasury.banking.errors.last4';
  const opening = form.opening.trim() === '' ? 0 : parseSignedMoney(form.opening);
  if (opening === null) errors.opening = 'treasury.banking.errors.opening';
  if (!isLocalDate(form.openingDate)) errors.openingDate = 'treasury.banking.errors.openingDate';
  if (form.profile) {
    for (const [field, key] of Object.entries(profileErrors(form.profile))) errors[`profile.${field}`] = key;
  }
  if (Object.keys(errors).length > 0) return { input: null, errors };
  return {
    input: {
      name: form.name.trim(),
      bankName: form.bankName.trim(),
      accountType: form.accountType,
      accountLast4: form.accountLast4.trim() || null,
      openingBalanceCents: opening!,
      openingDate: form.openingDate,
      importProfile: form.profile ? normalizeProfile(form.profile) : null,
    },
    errors,
  };
}

// ── Renglones y movimientos ─────────────────────────────────────────────────

export const LINE_STATUS_COLOR: Record<BankLineStatus, string> = {
  unmatched: 'lightwarning',
  matched: 'lightsuccess',
  external: 'lightinfo',
};

export const ADJUSTMENT_KIND_ICON: Record<AdjustmentKind, string> = {
  bank_fee: 'mdi-bank-minus',
  interest: 'mdi-bank-plus',
  other_in: 'mdi-arrow-down-bold-circle-outline',
  other_out: 'mdi-arrow-up-bold-circle-outline',
};

/** Lo que sale del banco (comisión, otro egreso) o lo que entra (interés, otro ingreso): el signo del renglón decide qué tipos se ofrecen. */
export const adjustmentKindsFor = (amountCents: number): AdjustmentKind[] => (amountCents < 0 ? ['bank_fee', 'other_out'] : ['interest', 'other_in']);
export const defaultAdjustmentKind = (amountCents: number): AdjustmentKind => adjustmentKindsFor(amountCents)[0]!;

/** Los movimientos que pueden emparejarse con un renglón: del mismo signo (una entrada no se empareja con una salida). */
export const movementsMatchableTo = (line: Pick<BankLine, 'amountCents'>, movements: readonly BankMovement[]): BankMovement[] =>
  movements.filter((m) => Math.sign(m.amountCents) === Math.sign(line.amountCents));

/** Cuánto suman los movimientos elegidos frente al renglón: se empareja solo cuando suman EXACTO (el servidor lo exige igual). */
export function selectionSummary(line: Pick<BankLine, 'amountCents'>, selected: readonly Pick<BankMovement, 'amountCents'>[]): { sumCents: number; remainingCents: number; exact: boolean } {
  const sumCents = selected.reduce((acc, m) => acc + m.amountCents, 0);
  return { sumCents, remainingCents: line.amountCents - sumCents, exact: selected.length > 0 && sumCents === line.amountCents };
}

/** Por qué todavía no se puede cerrar una conciliación (vacío = se puede). Son las claves i18n de cada motivo. */
export function reconciliationBlockers(result: ReconciliationResult | null): string[] {
  if (!result) return ['treasury.banking.reconcile.blockers.noBalance'];
  const out: string[] = [];
  if (result.unresolvedLines > 0) out.push('treasury.banking.reconcile.blockers.unresolved');
  if (result.differenceCents !== 0) out.push('treasury.banking.reconcile.blockers.difference');
  return out;
}

// ── Flujo de caja ────────────────────────────────────────────────────────────

/** Etiqueta de una columna: `overdue` y `later` tienen la suya; las semanas llevan su número. */
export function cashFlowBucketLabel(bucket: Pick<CashFlowBucket, 'key'>): { key: string; n?: number } {
  if (bucket.key === 'overdue') return { key: 'treasury.cashFlow.overdue' };
  if (bucket.key === 'later') return { key: 'treasury.cashFlow.later' };
  return { key: 'treasury.cashFlow.week', n: Number(bucket.key.slice(1)) };
}

/** Un saldo proyectado negativo es lo que importa de este reporte: se pinta de error; el resto, neutro. */
export const cashFlowClosingColor = (cents: number): string => (cents < 0 ? 'error' : 'default');
