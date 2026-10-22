import { http } from '@/utils/http';
import type {
  AgingReport,
  BankAccountDetail,
  BankAccountInput,
  BankAccountList,
  BankAdjustmentInput,
  BankLine,
  BankLineFilters,
  BankLineView,
  BankMovement,
  BankMovementFilters,
  BankMovementView,
  BankReconciliation,
  BankSuggestion,
  BatchMatchResult,
  CashFlow,
  Paged,
  ReconciliationPreview,
  StatementBody,
  StatementImportResult,
  StatementPreview,
  BankAccount,
  CustomerStatement,
  CustomerTerms,
  CustomerTermsInput,
  OpeningBalanceInput,
  OpeningBalanceLoad,
  PayableDetail,
  PayableFilters,
  PayableOpeningBalanceInput,
  PayableOpeningBalanceLoad,
  PayablePage,
  PayablesAgingReport,
  Payment,
  PaymentCreateInput,
  PaymentFilters,
  PaymentInput,
  PaymentPage,
  PaymentSettings,
  Receipt,
  ReceiptCreateInput,
  ReceiptFilters,
  ReceiptInput,
  ReceiptPage,
  ReceivableDetail,
  ReceivableFilters,
  ReceivablePage,
  ReminderPreview,
  ReminderRun,
  ReminderSettings,
  ReminderSettingsInput,
  SupplierStatement,
} from '@/types/treasury';

/** Un CSV llega como archivo (`blob`): el servidor lo arma y deja constancia de la exportación en la bitácora. */
const csv = (url: string, params: Record<string, unknown>) => http.get<Blob>(url, { params, responseType: 'blob' }).then((r) => r.data);

export const treasuryApi = {
  /** `status` viaja como lista separada por comas (`?status=open,partial`): es lo que entiende el servidor. */
  listReceivables: (filters: ReceivableFilters = {}) => {
    const { status, ...rest } = filters;
    const params = { ...rest, ...(status?.length ? { status: status.join(',') } : {}) };
    return http.get<ReceivablePage>('/treasury/receivables', { params }).then((r) => r.data);
  },
  getReceivable: (id: string) => http.get<ReceivableDetail>(`/treasury/receivables/${id}`).then((r) => r.data),
  getAging: (asOf?: string) => http.get<AgingReport>('/treasury/receivables/aging', { params: asOf ? { asOf } : {} }).then((r) => r.data),
  getStatement: (customerId: string) => http.get<CustomerStatement>(`/treasury/customers/${customerId}/statement`).then((r) => r.data),

  getTerms: (customerId: string) => http.get<CustomerTerms | null>(`/treasury/customers/${customerId}/terms`).then((r) => r.data),
  setTerms: (customerId: string, body: CustomerTermsInput) =>
    http.put<CustomerTerms>(`/treasury/customers/${customerId}/terms`, body).then((r) => r.data),

  loadOpeningBalances: (body: OpeningBalanceInput) => http.post<OpeningBalanceLoad>('/treasury/opening-balances', body).then((r) => r.data),

  // ── Cobros ──
  listReceipts: (filters: ReceiptFilters = {}) => {
    const { status, ...rest } = filters;
    const params = { ...rest, ...(status?.length ? { status: status.join(',') } : {}) };
    return http.get<ReceiptPage>('/treasury/receipts', { params }).then((r) => r.data);
  },
  getReceipt: (id: string) => http.get<Receipt>(`/treasury/receipts/${id}`).then((r) => r.data),
  createReceipt: (body: ReceiptCreateInput) => http.post<Receipt>('/treasury/receipts', body).then((r) => r.data),
  /** Solo un borrador se edita. `expectedVersion` evita pisar lo que otra persona cambió. */
  updateReceipt: (id: string, body: ReceiptInput & { expectedVersion?: number }) => http.put<Receipt>(`/treasury/receipts/${id}`, body).then((r) => r.data),
  postReceipt: (id: string) => http.post<Receipt>(`/treasury/receipts/${id}/post`).then((r) => r.data),
  voidReceipt: (id: string, reason: string) => http.post<Receipt>(`/treasury/receipts/${id}/void`, { reason }).then((r) => r.data),

  // ── Exportar (CSV) ──
  exportReceivables: (filters: ReceivableFilters = {}, lang = 'es') => {
    const { status, page: _page, pageSize: _pageSize, ...rest } = filters;
    return csv('/treasury/receivables/export', { ...rest, ...(status?.length ? { status: status.join(',') } : {}), lang });
  },
  exportAging: (lang = 'es', asOf?: string) => csv('/treasury/receivables/aging/export', { lang, ...(asOf ? { asOf } : {}) }),
  exportStatement: (customerId: string, lang = 'es', asOf?: string) => csv(`/treasury/customers/${customerId}/statement/export`, { lang, ...(asOf ? { asOf } : {}) }),

  // ── Recordatorios de cobro ──
  getReminderSettings: () => http.get<ReminderSettings>('/treasury/reminders/settings').then((r) => r.data),
  setReminderSettings: (body: ReminderSettingsInput) => http.put<ReminderSettings>('/treasury/reminders/settings', body).then((r) => r.data),
  getReminderPreview: () => http.get<ReminderPreview>('/treasury/reminders/preview').then((r) => r.data),
  runReminders: () => http.post<ReminderRun>('/treasury/reminders/run').then((r) => r.data),

  // ── Cuentas por pagar y pagos ──
  listPayables: (filters: PayableFilters = {}) => {
    const { status, ...rest } = filters;
    return http.get<PayablePage>('/treasury/payables', { params: { ...rest, ...(status?.length ? { status: status.join(',') } : {}) } }).then((r) => r.data);
  },
  getPayable: (id: string) => http.get<PayableDetail>(`/treasury/payables/${id}`).then((r) => r.data),
  getPayablesAging: (asOf?: string) => http.get<PayablesAgingReport>('/treasury/payables/aging', { params: asOf ? { asOf } : {} }).then((r) => r.data),
  getSupplierStatement: (supplierId: string) => http.get<SupplierStatement>(`/treasury/suppliers/${supplierId}/statement`).then((r) => r.data),
  loadPayableOpeningBalances: (body: PayableOpeningBalanceInput) => http.post<PayableOpeningBalanceLoad>('/treasury/payable-opening-balances', body).then((r) => r.data),

  exportPayables: (filters: PayableFilters = {}, lang = 'es') => {
    const { status, page: _page, pageSize: _pageSize, ...rest } = filters;
    return csv('/treasury/payables/export', { ...rest, ...(status?.length ? { status: status.join(',') } : {}), lang });
  },
  exportPayablesAging: (lang = 'es', asOf?: string) => csv('/treasury/payables/aging/export', { lang, ...(asOf ? { asOf } : {}) }),
  exportSupplierStatement: (supplierId: string, lang = 'es', asOf?: string) => csv(`/treasury/suppliers/${supplierId}/statement/export`, { lang, ...(asOf ? { asOf } : {}) }),

  listPayments: (filters: PaymentFilters = {}) => {
    const { status, ...rest } = filters;
    return http.get<PaymentPage>('/treasury/payments', { params: { ...rest, ...(status?.length ? { status: status.join(',') } : {}) } }).then((r) => r.data);
  },
  getPayment: (id: string) => http.get<Payment>(`/treasury/payments/${id}`).then((r) => r.data),
  createPayment: (body: PaymentCreateInput) => http.post<Payment>('/treasury/payments', body).then((r) => r.data),
  /** Solo un borrador (o un pago aprobado, que pierde la aprobación) se edita. `expectedVersion` evita pisar lo que otra persona cambió. */
  updatePayment: (id: string, body: PaymentInput & { expectedVersion?: number }) => http.put<Payment>(`/treasury/payments/${id}`, body).then((r) => r.data),
  approvePayment: (id: string) => http.post<Payment>(`/treasury/payments/${id}/approve`).then((r) => r.data),
  postPayment: (id: string) => http.post<Payment>(`/treasury/payments/${id}/post`).then((r) => r.data),
  voidPayment: (id: string, reason: string) => http.post<Payment>(`/treasury/payments/${id}/void`, { reason }).then((r) => r.data),
  getPaymentSettings: () => http.get<PaymentSettings>('/treasury/payments/settings').then((r) => r.data),
  setPaymentSettings: (approvalThresholdCents: number | null) => http.put<PaymentSettings>('/treasury/payments/settings', { approvalThresholdCents }).then((r) => r.data),

  // ── Bancos, extractos y conciliación ──
  listBankAccounts: (activeOnly = false) => http.get<BankAccountList>('/treasury/bank-accounts', { params: activeOnly ? { activeOnly: true } : {} }).then((r) => r.data),
  getBankAccount: (id: string) => http.get<BankAccountDetail>(`/treasury/bank-accounts/${id}`).then((r) => r.data),
  createBankAccount: (body: BankAccountInput) => http.post<BankAccount>('/treasury/bank-accounts', body).then((r) => r.data),
  updateBankAccount: (id: string, body: Partial<BankAccountInput> & { isActive?: boolean; expectedVersion?: number }) =>
    http.put<BankAccount>(`/treasury/bank-accounts/${id}`, body).then((r) => r.data),
  previewStatement: (id: string, body: StatementBody) => http.post<StatementPreview>(`/treasury/bank-accounts/${id}/statements/preview`, body).then((r) => r.data),
  importStatement: (id: string, body: StatementBody) => http.post<StatementImportResult>(`/treasury/bank-accounts/${id}/statements`, body).then((r) => r.data),
  listBankLines: (id: string, filters: BankLineFilters = {}) => {
    const { status, ...rest } = filters;
    const params = { ...rest, ...(status?.length ? { status: status.join(',') } : {}) };
    return http.get<Paged<BankLineView>>(`/treasury/bank-accounts/${id}/lines`, { params }).then((r) => r.data);
  },
  listBankSuggestions: (id: string) => http.get<{ suggestions: BankSuggestion[] }>(`/treasury/bank-accounts/${id}/suggestions`).then((r) => r.data.suggestions),
  listBankMovements: (filters: BankMovementFilters = {}) => {
    const { status, ...rest } = filters;
    const params = { ...rest, ...(status?.length ? { status: status.join(',') } : {}) };
    return http.get<Paged<BankMovementView>>('/treasury/bank-movements', { params }).then((r) => r.data);
  },
  assignMovementAccount: (movementId: string, bankAccountId: string) => http.post<BankMovement>(`/treasury/bank-movements/${movementId}/account`, { bankAccountId }).then((r) => r.data),
  matchLine: (lineId: string, movementIds: string[]) => http.post<BankLineView>(`/treasury/bank-lines/${lineId}/match`, { movementIds, method: 'manual' }).then((r) => r.data),
  matchMany: (pairs: { lineId: string; movementIds: string[] }[]) => http.post<BatchMatchResult>('/treasury/bank-lines/match', { pairs, method: 'suggested' }).then((r) => r.data),
  unmatchLine: (lineId: string) => http.post<BankLine>(`/treasury/bank-lines/${lineId}/unmatch`).then((r) => r.data),
  markLineExternal: (lineId: string, reason: string) => http.post<BankLine>(`/treasury/bank-lines/${lineId}/external`, { reason }).then((r) => r.data),
  unmarkLineExternal: (lineId: string) => http.post<BankLine>(`/treasury/bank-lines/${lineId}/unexternal`).then((r) => r.data),
  postBankAdjustment: (body: BankAdjustmentInput) => http.post<BankMovement>('/treasury/bank-adjustments', body).then((r) => r.data),
  voidBankAdjustment: (id: string, reason: string) => http.post<BankMovement>(`/treasury/bank-adjustments/${id}/void`, { reason }).then((r) => r.data),
  previewReconciliation: (id: string, cutoffDate: string, statementBalanceCents?: number) =>
    http.get<ReconciliationPreview>(`/treasury/bank-accounts/${id}/reconciliation`, { params: { cutoffDate, ...(statementBalanceCents !== undefined ? { statementBalanceCents } : {}) } }).then((r) => r.data),
  listReconciliations: (id: string) => http.get<{ items: BankReconciliation[] }>(`/treasury/bank-accounts/${id}/reconciliations`).then((r) => r.data.items),
  closeReconciliation: (id: string, body: { cutoffDate: string; statementBalanceCents: number; notes?: string | null }) =>
    http.post<BankReconciliation>(`/treasury/bank-accounts/${id}/reconciliations`, body).then((r) => r.data),
  reopenReconciliation: (reconciliationId: string, reason: string) => http.post<BankReconciliation>(`/treasury/bank-reconciliations/${reconciliationId}/reopen`, { reason }).then((r) => r.data),
  getCashFlow: (weeks?: number) => http.get<CashFlow>('/treasury/cash-flow', { params: weeks ? { weeks } : {} }).then((r) => r.data),
  exportCashFlow: (weeks: number | undefined, lang: string) => csv('/treasury/cash-flow/export', { ...(weeks ? { weeks } : {}), lang }),
};
