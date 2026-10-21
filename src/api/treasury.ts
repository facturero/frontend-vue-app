import { http } from '@/utils/http';
import type {
  AgingReport,
  CustomerStatement,
  CustomerTerms,
  CustomerTermsInput,
  OpeningBalanceInput,
  OpeningBalanceLoad,
  Receipt,
  ReceiptCreateInput,
  ReceiptFilters,
  ReceiptInput,
  ReceiptPage,
  ReceivableDetail,
  ReceivableFilters,
  ReceivablePage,
} from '@/types/treasury';

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
};
