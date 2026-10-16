import type { BalanceSheet, IncomeStatement, StatementSection } from '@/types/accounting';

/** `YYYY-MM-DD` ± días, sin pasar por la zona horaria del navegador. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

/** Misma fecha un año antes. El 29 de febrero pasa al 28 (el año anterior no es bisiesto). */
export function sameDayLastYear(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y! - 1, (m ?? 1) - 1, d ?? 1));
  if (target.getUTCMonth() !== ((m ?? 1) - 1)) return new Date(Date.UTC(y! - 1, (m ?? 1) - 1, 28)).toISOString().slice(0, 10);
  return target.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const ms = (date: string): number => {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** El rango inmediatamente anterior y de la misma duración (p. ej. el mes anterior, el trimestre anterior). */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const length = daysBetween(from, to) + 1;
  return { from: addDays(from, -length), to: addDays(from, -1) };
}

/** El mismo rango un año antes. */
export function sameRangeLastYear(from: string, to: string): { from: string; to: string } {
  return { from: sameDayLastYear(from), to: sameDayLastYear(to) };
}

/** Variación entre el importe y su comparación; el porcentaje es `null` si no hay base (comparación en cero). */
export function variation(amount: number, compare: number | null): { diff: number; pct: number | null } | null {
  if (compare === null) return null;
  const diff = amount - compare;
  return { diff, pct: compare === 0 ? null : (diff / Math.abs(compare)) * 100 };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Importe en unidades con dos decimales y punto, sin símbolo ni separador de miles: lo que una hoja de cálculo lee como número. */
export function plainAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface CsvLabels {
  code: string;
  account: string;
  amount: string;
  compare: string;
  variation: string;
  titles: Record<string, string>;
  total: string;
}

function sectionLines(section: StatementSection, labels: CsvLabels, withCompare: boolean): (string | number)[][] {
  const lines: (string | number)[][] = [[labels.titles[section.key] ?? section.key, '', '', ...(withCompare ? ['', ''] : [])]];
  for (const r of section.rows) {
    const line: (string | number)[] = [r.code, r.name, plainAmount(r.amountCents)];
    if (withCompare) {
      const v = variation(r.amountCents, r.compareAmountCents);
      line.push(r.compareAmountCents === null ? '' : plainAmount(r.compareAmountCents), v ? plainAmount(v.diff) : '');
    }
    lines.push(line);
  }
  const total: (string | number)[] = ['', `${labels.total} ${labels.titles[section.key] ?? section.key}`, plainAmount(section.totalCents)];
  if (withCompare) {
    const v = variation(section.totalCents, section.compareTotalCents);
    total.push(section.compareTotalCents === null ? '' : plainAmount(section.compareTotalCents), v ? plainAmount(v.diff) : '');
  }
  lines.push(total);
  return lines;
}

/** CSV (con coma, comillas dobles y BOM al descargarlo) de un balance general o de un estado de resultados. */
export function statementToCsv(statement: BalanceSheet | IncomeStatement, labels: CsvLabels): string {
  const withCompare = ('compareAsOf' in statement ? statement.compareAsOf : statement.compareFrom) !== null;
  const header = [labels.code, labels.account, labels.amount, ...(withCompare ? [labels.compare, labels.variation] : [])];
  const rows: (string | number)[][] = [header];
  for (const section of statement.sections) {
    rows.push(...sectionLines(section, labels, withCompare));
    if ('grossProfitCents' in statement && section.key === 'costs') {
      const v = variation(statement.grossProfitCents, statement.compareGrossProfitCents);
      rows.push(['', labels.titles.grossProfit ?? 'grossProfit', plainAmount(statement.grossProfitCents), ...(withCompare ? [statement.compareGrossProfitCents === null ? '' : plainAmount(statement.compareGrossProfitCents), v ? plainAmount(v.diff) : ''] : [])]);
    }
  }
  if ('netResultCents' in statement) {
    const v = variation(statement.netResultCents, statement.compareNetResultCents);
    rows.push(['', labels.titles.netResult ?? 'netResult', plainAmount(statement.netResultCents), ...(withCompare ? [statement.compareNetResultCents === null ? '' : plainAmount(statement.compareNetResultCents), v ? plainAmount(v.diff) : ''] : [])]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** Descarga un texto como archivo; el BOM hace que Excel lea bien las tildes. */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
