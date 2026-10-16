/** Contabilidad general (accounting-service). Importes SIEMPRE en centavos enteros de la moneda base; fechas contables `YYYY-MM-DD`. */

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'cost' | 'expense';
export type ActiveStatus = 'active' | 'inactive';

export interface AccountingSettings {
  organizationId: string;
  chartTemplate: string;
  baseCurrency: string;
  fiscalYearStartMonth: number;
  initializedAt: string;
  timezone: string;
  autoPosting: boolean;
  autoPostingFrom: string | null;
  paymentMethodRoles: Record<string, CollectionRole> | null;
}

export type CollectionRole = 'cash' | 'bank' | 'receivables';

export interface PostingSettingsResponse {
  settings: AccountingSettings;
  pendingCount: number;
  defaultPaymentMethodRoles: Record<string, CollectionRole>;
}

export interface PostingSettingsInput {
  autoPosting?: boolean;
  autoPostingFrom?: string | null;
  paymentMethodRoles?: Record<string, CollectionRole> | null;
}

export type PendingStatus = 'pending' | 'posted' | 'discarded';

export interface PendingPosting {
  id: string;
  eventType: string;
  sourceType: string;
  sourceId: string;
  reasonCode: string;
  reasonMessage: string;
  status: PendingStatus;
  attempts: number;
  entryId: string | null;
  entryDate: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** Los roles de sistema: la cuenta que usan las reglas de contabilización automática. */
export const SYSTEM_ROLES = [
  'receivables', 'sales_revenue', 'sales_returns', 'other_income', 'vat_payable', 'cash', 'bank', 'inventory', 'cogs', 'inventory_gain',
  'inventory_shrinkage', 'other_expense', 'retained_earnings', 'payables', 'customer_advances', 'supplier_advances', 'vat_credit',
  'vat_withheld_receivable', 'income_tax_withheld_receivable', 'vat_withholding_payable', 'income_tax_withholding_payable',
  'services_revenue', 'current_result',
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export interface SettingsResponse {
  configured: boolean;
  settings: AccountingSettings | null;
}

export interface SetupInput {
  chartTemplate: 'ec-supercias' | 'empty';
  fiscalYear?: number;
  baseCurrency?: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  level: number;
  isPostable: boolean;
  status: ActiveStatus;
  systemRole: string | null;
}

export interface AccountInput {
  code: string;
  name: string;
  type?: AccountType;
  parentId?: string | null;
  systemRole?: string | null;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  status: ActiveStatus;
}

export interface Period {
  id: string;
  fiscalYearId: string;
  number: number;
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
  closedAt: string | null;
}

export interface FiscalYear {
  id: string;
  year: number;
  startDate: string;
  endDate: string;
  periods: Period[];
}

export type EntryStatus = 'draft' | 'posted';

export interface EntryLine {
  id?: string;
  lineNo?: number;
  accountId: string;
  debitCents: number;
  creditCents: number;
  description: string | null;
  costCenterId: string | null;
}

export interface JournalEntry {
  id: string;
  number: string | null;
  entryDate: string;
  periodId: string | null;
  description: string;
  reference: string | null;
  status: EntryStatus;
  kind: 'manual' | 'automatic' | 'reversal' | 'opening';
  sourceType: string | null;
  sourceId: string | null;
  currencyCode: string;
  totalDebitCents: number;
  totalCreditCents: number;
  reversesEntryId: string | null;
  reversedByEntryId: string | null;
  reversalReason: string | null;
  postedAt: string | null;
  /** Solo en el detalle. */
  lines?: EntryLine[];
}

export interface EntryInput {
  entryDate: string;
  description: string;
  reference: string | null;
  lines: { accountId: string; debitCents: number; creditCents: number; description: string | null; costCenterId: string | null }[];
}

export interface EntryFilters {
  status?: EntryStatus;
  kind?: string;
  from?: string;
  to?: string;
  q?: string;
  accountId?: string;
  page: number;
  pageSize: number;
}

export interface TrialBalanceRow {
  accountId: string | null;
  code: string;
  name: string;
  type: string;
  level: number;
  isPostable: boolean;
  synthetic: boolean;
  openingCents: number;
  debitCents: number;
  creditCents: number;
  closingCents: number;
}

export interface TrialBalance {
  from: string;
  to: string;
  rows: TrialBalanceRow[];
  totals: { debitCents: number; creditCents: number; openingCents: number; closingCents: number };
}

export interface LedgerLine {
  entryId: string;
  entryNumber: string | null;
  entryDate: string;
  description: string;
  lineDescription: string | null;
  reference: string | null;
  debitCents: number;
  creditCents: number;
  runningCents: number;
}

export interface Ledger {
  accountId: string;
  openingCents: number;
  lines: LedgerLine[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StatementRow {
  accountId: string | null;
  code: string;
  name: string;
  level: number;
  isPostable: boolean;
  /** Fila calculada (resultado del ejercicio, resultados anteriores sin cerrar). */
  synthetic: boolean;
  amountCents: number;
  compareAmountCents: number | null;
}

export type StatementSectionKey = 'assets' | 'liabilities' | 'equity' | 'income' | 'costs' | 'expenses';

export interface StatementSection {
  key: StatementSectionKey;
  rows: StatementRow[];
  totalCents: number;
  compareTotalCents: number | null;
}

export interface BalanceSheet {
  asOf: string;
  compareAsOf: string | null;
  sections: StatementSection[];
  totals: {
    assetsCents: number;
    liabilitiesAndEquityCents: number;
    differenceCents: number;
    compareAssetsCents: number | null;
    compareLiabilitiesAndEquityCents: number | null;
    compareDifferenceCents: number | null;
  };
}

export interface IncomeStatement {
  from: string;
  to: string;
  compareFrom: string | null;
  compareTo: string | null;
  sections: StatementSection[];
  grossProfitCents: number;
  netResultCents: number;
  compareGrossProfitCents: number | null;
  compareNetResultCents: number | null;
}
