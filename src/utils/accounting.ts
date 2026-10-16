import type { Account, EntryLine } from '@/types/accounting';

/**
 * Convierte lo que escribe una persona («1.234,56», «1,234.56», «1234.56», «12», «») en centavos enteros, o `null` si no es un
 * importe válido. Reglas, en este orden:
 *  - con punto Y coma, el ÚLTIMO es el decimal y el otro separa miles;
 *  - con un solo tipo de separador repetido («1.234.567»), son miles;
 *  - con uno solo: si lo siguen 1 o 2 cifras es el decimal («12,5», «12.50»); si lo siguen exactamente 3 («1.234») son miles,
 *    porque un importe no tiene tres decimales.
 */
export function parseMoneyToCents(input: string): number | null {
  const text = input.trim().replace(/\s/g, '');
  if (text === '') return 0;
  if (!/^(?=.*\d)[\d.,]+$/.test(text)) return null;

  const dots = (text.match(/\./g) ?? []).length;
  const commas = (text.match(/,/g) ?? []).length;
  let decimalSep: '.' | ',' | null = null;
  if (dots > 0 && commas > 0) {
    decimalSep = text.lastIndexOf('.') > text.lastIndexOf(',') ? '.' : ',';
  } else if (dots + commas === 1) {
    const sep = dots === 1 ? '.' : ',';
    const after = text.slice(text.indexOf(sep) + 1);
    if (after.length <= 2) decimalSep = sep;
    else if (after.length !== 3) return null;
  } else if (dots + commas > 1) {
    // Varios del mismo tipo: miles. Cada grupo después del primero lleva exactamente tres cifras.
    if (!/^\d{1,3}([.,]\d{3})+$/.test(text)) return null;
  }

  let integer = text;
  let decimals = '';
  if (decimalSep) {
    const at = text.lastIndexOf(decimalSep);
    integer = text.slice(0, at);
    decimals = text.slice(at + 1);
    if (decimals.length > 2) return null;
  }
  integer = integer.replace(/[.,]/g, '');
  if (integer === '') integer = '0';
  const cents = Number(integer) * 100 + Number((decimals + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Centavos → texto editable con dos decimales y punto (123450 → «1234.50»). Vacío si es cero, para no llenar la tabla de ceros. */
export function centsToInput(cents: number): string {
  if (!cents) return '';
  return (cents / 100).toFixed(2);
}

export function formatMoney(cents: number, locale: string, currency = 'USD'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

export interface LineTotals {
  debit: number;
  credit: number;
  difference: number;
  balanced: boolean;
}

export function lineTotals(lines: Pick<EntryLine, 'debitCents' | 'creditCents'>[]): LineTotals {
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    debit += l.debitCents;
    credit += l.creditCents;
  }
  return { debit, credit, difference: debit - credit, balanced: debit === credit && debit > 0 };
}

/** Una línea vale si tiene cuenta y un importe en un solo lado. */
export function isLineComplete(l: Pick<EntryLine, 'accountId' | 'debitCents' | 'creditCents'>): boolean {
  return !!l.accountId && (l.debitCents > 0) !== (l.creditCents > 0);
}

/** Cuentas que aceptan movimientos, en orden de código, para el selector de las líneas. */
export function postableAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => a.isPostable && a.status === 'active');
}

/** Color de la etiqueta del tipo de cuenta (tokens `light*`, ver docs/UI-UX.md). */
export function accountTypeColor(type: string): string {
  switch (type) {
    case 'asset':
      return 'lightprimary';
    case 'liability':
      return 'lightwarning';
    case 'equity':
      return 'lightsecondary';
    case 'income':
      return 'lightsuccess';
    default:
      return 'lighterror';
  }
}

/** Saldo neto (debe - haber) como columna «Deudor» o «Acreedor» para las tablas de saldos. */
export function splitBalance(netCents: number): { debit: number; credit: number } {
  return netCents >= 0 ? { debit: netCents, credit: 0 } : { debit: 0, credit: -netCents };
}
