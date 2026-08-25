export interface CertificateDTO {
  id: string;
  alias: string;
  valid_from: string;
  valid_until: string;
  status: 'active' | 'expired' | 'revoked';
  created_at: string;
}

export interface FiscalInvoiceDTO {
  id: string;
  billing_invoice_id: string;
  number: string;
  access_key: string;
  status: 'pending' | 'sent' | 'authorized' | 'rejected' | 'error';
  authorization_number: string | null;
  authorization_date: string | null;
  last_error: string | null;
}
