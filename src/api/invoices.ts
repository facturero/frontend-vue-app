import { http } from '@/utils/http';
import type {
  InvoiceSummary,
  InvoiceDetail,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  AddLineInput,
  IssueInvoiceInput,
  VoidInvoiceInput,
} from '@/types/invoices';

export const invoiceApi = {
  list: (params?: { status?: string; customerId?: string; from?: string; to?: string }) =>
    http.get<InvoiceSummary[]>('/invoices', { params }).then((r) => r.data),

  create: (body: CreateInvoiceInput) =>
    http.post<InvoiceDetail>('/invoices', body).then((r) => r.data),

  getById: (id: string) =>
    http.get<InvoiceDetail>(`/invoices/${id}`).then((r) => r.data),

  update: (id: string, body: UpdateInvoiceInput) =>
    http.patch<InvoiceDetail>(`/invoices/${id}`, body).then((r) => r.data),

  addLine: (invoiceId: string, body: AddLineInput) =>
    http.post<InvoiceDetail>(`/invoices/${invoiceId}/lines`, body).then((r) => r.data),

  removeLine: (invoiceId: string, lineId: string) =>
    http.delete<InvoiceDetail>(`/invoices/${invoiceId}/lines/${lineId}`).then((r) => r.data),

  issue: (invoiceId: string, body: IssueInvoiceInput) =>
    http.post<InvoiceDetail>(`/invoices/${invoiceId}/issue`, body).then((r) => r.data),

  void: (invoiceId: string, body: VoidInvoiceInput) =>
    http.post<InvoiceDetail>(`/invoices/${invoiceId}/void`, body).then((r) => r.data),
};
