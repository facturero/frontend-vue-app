import { http } from '@/utils/http';
import type {
  Account,
  AccountInput,
  AccountingSettings,
  ActiveStatus,
  BalanceSheet,
  CostCenter,
  EntryFilters,
  EntryInput,
  FiscalYear,
  IncomeStatement,
  JournalEntry,
  Ledger,
  Period,
  PendingPosting,
  PendingStatus,
  PostingSettingsInput,
  PostingSettingsResponse,
  SettingsResponse,
  SetupInput,
  TrialBalance,
} from '@/types/accounting';

/**
 * Contabilidad general. Todo cuelga de `/accounting/…` por el gateway, que exige el módulo `finance.general_ledger` y los permisos
 * `account:*`, `journal:*`, `period:manage` y `ledger:read`.
 */
export const accountingApi = {
  getSettings: () => http.get<SettingsResponse>('/accounting/settings').then((r) => r.data),

  setup: (body: SetupInput) =>
    http.post<{ settings: AccountingSettings; accountCount: number; fiscalYear: FiscalYear }>('/accounting/setup', body).then((r) => r.data),

  listAccounts: () => http.get<Account[]>('/accounting/accounts').then((r) => r.data),
  createAccount: (body: AccountInput) => http.post<Account>('/accounting/accounts', body).then((r) => r.data),
  updateAccount: (id: string, body: { name?: string; status?: ActiveStatus; systemRole?: string | null }) =>
    http.patch<Account>(`/accounting/accounts/${id}`, body).then((r) => r.data),

  listCostCenters: () => http.get<CostCenter[]>('/accounting/cost-centers').then((r) => r.data),
  createCostCenter: (body: { code: string; name: string }) => http.post<CostCenter>('/accounting/cost-centers', body).then((r) => r.data),
  updateCostCenter: (id: string, body: { name?: string; status?: ActiveStatus }) =>
    http.patch<CostCenter>(`/accounting/cost-centers/${id}`, body).then((r) => r.data),

  listFiscalYears: () => http.get<FiscalYear[]>('/accounting/fiscal-years').then((r) => r.data),
  createFiscalYear: (year: number) => http.post<FiscalYear>('/accounting/fiscal-years', { year }).then((r) => r.data),
  closePeriod: (id: string) => http.post<Period>(`/accounting/periods/${id}/close`).then((r) => r.data),
  reopenPeriod: (id: string) => http.post<Period>(`/accounting/periods/${id}/reopen`).then((r) => r.data),

  listEntries: (f: EntryFilters) =>
    http
      .get<{ items: JournalEntry[]; total: number; page: number; pageSize: number }>('/accounting/journal-entries', {
        params: { status: f.status, kind: f.kind, from: f.from, to: f.to, q: f.q || undefined, accountId: f.accountId, page: f.page, pageSize: f.pageSize },
      })
      .then((r) => r.data),
  getEntry: (id: string) => http.get<JournalEntry>(`/accounting/journal-entries/${id}`).then((r) => r.data),
  createEntry: (body: EntryInput & { post: boolean }) => http.post<JournalEntry>('/accounting/journal-entries', body).then((r) => r.data),
  updateEntry: (id: string, body: EntryInput) => http.put<JournalEntry>(`/accounting/journal-entries/${id}`, body).then((r) => r.data),
  deleteEntry: (id: string) => http.delete(`/accounting/journal-entries/${id}`).then(() => undefined),
  postEntry: (id: string) => http.post<JournalEntry>(`/accounting/journal-entries/${id}/post`).then((r) => r.data),
  reverseEntry: (id: string, body: { reason: string; entryDate?: string }) =>
    http.post<{ original: JournalEntry; reversal: JournalEntry }>(`/accounting/journal-entries/${id}/reverse`, body).then((r) => r.data),

  postingSettings: () => http.get<PostingSettingsResponse>('/accounting/posting-settings').then((r) => r.data),
  updatePostingSettings: (body: PostingSettingsInput) => http.put<AccountingSettings>('/accounting/posting-settings', body).then((r) => r.data),
  listPending: (params: { status?: PendingStatus; page: number; pageSize: number }) =>
    http.get<{ items: PendingPosting[]; total: number }>('/accounting/pending-postings', { params }).then((r) => r.data),
  retryPending: (ids?: string[]) =>
    http.post<{ posted: number; stillPending: number; discarded: number }>('/accounting/pending-postings/retry', ids ? { ids } : {}).then((r) => r.data),
  discardPending: (id: string, reason: string) => http.post<PendingPosting>(`/accounting/pending-postings/${id}/discard`, { reason }).then((r) => r.data),

  trialBalance: (params: { from: string; to: string; costCenterId?: string; includeZero?: boolean; maxLevel?: number }) =>
    http.get<TrialBalance>('/accounting/reports/trial-balance', { params }).then((r) => r.data),
  balanceSheet: (params: { asOf: string; compareAsOf?: string; costCenterId?: string; includeZero?: boolean; maxLevel?: number }) =>
    http.get<BalanceSheet>('/accounting/reports/balance-sheet', { params }).then((r) => r.data),
  incomeStatement: (params: { from: string; to: string; compareFrom?: string; compareTo?: string; costCenterId?: string; includeZero?: boolean; maxLevel?: number }) =>
    http.get<IncomeStatement>('/accounting/reports/income-statement', { params }).then((r) => r.data),
  ledger: (params: { accountId: string; from: string; to: string; page: number; pageSize: number }) =>
    http.get<Ledger>('/accounting/reports/ledger', { params }).then((r) => r.data),
};
