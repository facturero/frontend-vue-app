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

/** Código SRI del comprobante: 01 factura, 04 nota de crédito, 05 nota de débito, 06 guía de remisión, 07 retención. */
export type FiscalDocumentType = '01' | '04' | '05' | '06' | '07';

/** Lo mínimo de una retención o una guía para pintar una fila del listado. */
export type FiscalDocumentSummary =
  | {
    kind: 'withholding';
    subject_name: string;
    subject_identification: string;
    support_number: string;
    support_issue_date: string;
    fiscal_period: string;
    total_withheld_cents: number;
  }
  | {
    kind: 'delivery_guide';
    carrier_name: string;
    plate: string;
    transport_start: string;
    transport_end: string;
    recipients_count: number;
    first_recipient: string | null;
  };

export interface FiscalInvoiceDTO {
  id: string;
  billing_invoice_id: string;
  document_type?: FiscalDocumentType;
  /** `billing` si llegó por un evento de facturación; `fiscal` si se emitió desde fiscal (retención, guía). */
  source?: 'billing' | 'fiscal';
  summary?: FiscalDocumentSummary | null;
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

export interface FiscalInvoicePage {
  items: FiscalInvoiceDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export type WithholdingTax = 'income' | 'vat' | 'isd';

export interface WithholdingCodeSuggestion {
  tax: WithholdingTax;
  code: string;
  description: string;
  ratePercent: number;
}

export interface FiscalCodeCatalog {
  withholdingCodes: WithholdingCodeSuggestion[];
  supportCodes: Array<{ code: string; description: string }>;
  vatPercentageCodes: Array<{ percentageCode: string; rate: number; description: string }>;
}

/** Los importes viajan como texto con hasta dos decimales (`"100.50"`): nunca como flotantes. */
export interface WithholdingInput {
  establishmentId: string;
  emissionPointId: string;
  subject: {
    identificationType: 'RUC' | 'CEDULA' | 'PASAPORTE';
    identification: string;
    businessName: string;
    email?: string | null;
    phone?: string | null;
    relatedParty: boolean;
  };
  fiscalPeriod?: string;
  support: {
    supportCode: string;
    documentCode: string;
    number: string;
    issueDate: string;
    authorizationNumber?: string | null;
    totalWithoutTaxes: string;
    total: string;
    paymentMethodCode: string;
    taxes: Array<{ code: '2' | '3' | '5'; percentageCode: string; rate: number; base: string; amount: string }>;
  };
  withholdings: Array<{ tax: WithholdingTax; retentionCode: string; base: string; ratePercent: number }>;
}

export interface DeliveryGuideInput {
  establishmentId: string;
  emissionPointId: string;
  originAddress?: string | null;
  carrier: {
    identificationType: 'RUC' | 'CEDULA' | 'PASAPORTE' | 'EXTERIOR';
    identification: string;
    businessName: string;
    plate: string;
    rise?: string | null;
  };
  transportStart: string;
  transportEnd: string;
  recipients: Array<{
    identification: string;
    businessName: string;
    address: string;
    reason: string;
    route?: string | null;
    support?: { documentCode: string; number: string; issueDate: string; authorizationNumber?: string | null } | null;
    items: Array<{ internalCode?: string | null; description: string; quantity: number }>;
  }>;
}
