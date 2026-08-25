import { http } from '@/utils/http';
import type { CertificateDTO, FiscalInvoiceDTO } from '@/types/fiscal';

export const fiscalApi = {
  getCertificates: () =>
    http.get<CertificateDTO[]>('/certificates').then((r) => r.data),

  uploadCertificate: (file: File, password: string, alias?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('password', password);
    if (alias) formData.append('alias', alias);
    return http.post<CertificateDTO>('/certificates', formData).then((r) => r.data);
  },

  revokeCertificate: (id: string) =>
    http.delete<{ message: string }>(`/certificates/${id}`).then((r) => r.data),

  getFiscalInvoice: (billingInvoiceId: string) =>
    http
      .get<FiscalInvoiceDTO>(`/fiscal-invoices/${billingInvoiceId}`)
      .then((r) => r.data)
      .catch(() => null),

  retryFiscalInvoice: (billingInvoiceId: string) =>
    http.post<{ message: string }>(`/fiscal-invoices/${billingInvoiceId}/retry`).then((r) => r.data),
};
