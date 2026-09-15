export interface CertificateDTO {
  id: string;
  alias: string;
  valid_from: string;
  valid_until: string;
  status: 'active' | 'expired' | 'revoked';
  created_at: string;
}

export type FiscalInvoiceStatus = 'pending' | 'sent' | 'authorized' | 'rejected' | 'error';

export interface SriMessage {
  identificador?: string;
  mensaje: string;
  tipo?: string;
  informacionAdicional?: string;
}

export interface FiscalInvoiceDTO {
  id: string;
  billing_invoice_id: string;
  number: string;
  access_key: string | null;
  status: FiscalInvoiceStatus;
  authorization_number: string | null;
  authorization_date: string | null;
  last_error: string | null;
  retry_count: number;
  /** Cuándo se reintenta o se vuelve a consultar solo; `null` si nadie lo hará sin intervención. */
  next_check_at: string | null;
  billing_voided_at: string | null;
  sri_messages: SriMessage[];
  has_signed_xml: boolean;
  has_authorized_xml: boolean;
  /** El RIDE (PDF tributario) se puede generar: autorizado + datos disponibles. */
  ride_available: boolean;
  created_at: string;
  updated_at: string;
}
