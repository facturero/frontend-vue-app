import { http } from '@/utils/http';
import type {
  CertificateDTO,
  DeliveryGuideInput,
  FiscalCodeCatalog,
  FiscalDocumentType,
  FiscalInvoiceDTO,
  FiscalInvoicePage,
  WithholdingInput,
} from '@/types/fiscal';

export const fiscalApi = {
  getCertificates: () =>
    http.get<CertificateDTO[]>('/certificates').then((r) => r.data),

  uploadCertificate: (file: File, password: string, alias?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('password', password);
    if (alias) formData.append('alias', alias);
    // El cliente http fija `Content-Type: application/json` por defecto, y con esa cabecera axios convierte el
    // FormData en JSON ({"file":{}}: el archivo se pierde). Pedir multipart explícito lo manda como formulario.
    return http
      .post<CertificateDTO>('/certificates', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },

  revokeCertificate: (id: string) =>
    http.delete<{ message: string }>(`/certificates/${id}`).then((r) => r.data),

  /** `null` si la factura todavía no tiene comprobante fiscal (o no es de Ecuador). */
  getFiscalInvoice: (billingInvoiceId: string) =>
    http
      .get<FiscalInvoiceDTO>(`/fiscal-invoices/${billingInvoiceId}`)
      .then((r) => r.data)
      .catch(() => null),

  retryFiscalInvoice: (billingInvoiceId: string) =>
    http
      .post<{ message: string; invoice: FiscalInvoiceDTO | null }>(`/fiscal-invoices/${billingInvoiceId}/retry`)
      .then((r) => r.data),

  /** Comprobantes de la organización, filtrables por tipo (`07` retenciones, `06` guías) y origen. */
  listFiscalDocuments: (params: { documentType: FiscalDocumentType; source?: 'billing' | 'fiscal'; status?: string; page?: number; pageSize?: number }) =>
    http
      .get<FiscalInvoicePage>('/fiscal-invoices', {
        params: { document_type: params.documentType, source: params.source, status: params.status, page: params.page, pageSize: params.pageSize },
      })
      .then((r) => r.data),

  /** Catálogos de apoyo del formulario de retención: códigos de retención, de sustento y de IVA. */
  getCodeCatalog: () => http.get<FiscalCodeCatalog>('/fiscal/withholding-codes').then((r) => r.data),

  createWithholding: (body: WithholdingInput) => http.post<FiscalInvoiceDTO>('/fiscal/withholdings', body).then((r) => r.data),

  createDeliveryGuide: (body: DeliveryGuideInput) => http.post<FiscalInvoiceDTO>('/fiscal/delivery-guides', body).then((r) => r.data),

  /** El XML autorizado por el SRI si existe; si no, el firmado. */
  downloadXml: async (fiscalInvoiceId: string): Promise<{ blob: Blob; filename: string }> => {
    const r = await http.get(`/fiscal-invoices/${fiscalInvoiceId}/xml/download`, { responseType: 'blob' });
    const disposition = String(r.headers['content-disposition'] ?? '');
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'factura.xml';
    return { blob: r.data as Blob, filename };
  },

  /** El RIDE (PDF tributario) de un comprobante autorizado. */
  downloadRide: async (fiscalInvoiceId: string): Promise<{ blob: Blob; filename: string }> => {
    const r = await http.get(`/fiscal-invoices/${fiscalInvoiceId}/ride`, { responseType: 'blob' });
    const disposition = String(r.headers['content-disposition'] ?? '');
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'ride.pdf';
    return { blob: r.data as Blob, filename };
  },
};
