export type InvoiceStatus = 'draft' | 'issued' | 'voided';
export type TaxKind = 'vat' | 'withholding_iva' | 'withholding_rent' | 'special';

export interface InvoiceSummary {
  id: string;
  number: string | null;
  customerName: string;
  customerIdentification: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  currencyCode: string;
  status: InvoiceStatus;
  issueDate: string | null;
  createdAt: string;
}

export interface LineTax {
  id: string;
  taxRateId: string;
  kind: TaxKind;
  rateSnapshot: string;
  baseCents: number;
  amountCents: number;
}

export interface InvoiceLine {
  id: string;
  productId: string;
  productSnapshot: { id: string; name: string; sku: string | null; unit: string | null } | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  subtotalCents: number;
  taxes: LineTax[];
}

export interface InvoiceTaxTotal {
  id: string;
  kind: string;
  rateSnapshot: string;
  baseCents: number;
  amountCents: number;
}

export interface CustomerSnapshot {
  id: string;
  businessName: string;
  identification: string;
  identificationTypeId: string;
  email: string | null;
  phone: string | null;
  type: string;
}

export interface IssuerSnapshot {
  legalName: string;
  tradeName: string | null;
  taxId: string;
  establishmentCode: string;
  emissionPointCode: string;
  address: string | null;
}

export interface InvoiceDetail {
  id: string;
  organizationId: string;
  countryCode: string;
  documentTypeId: string;
  number: string | null;
  establishmentId: string | null;
  emissionPointId: string | null;
  customerId: string;
  customerSnapshot: CustomerSnapshot | null;
  issuerSnapshot: IssuerSnapshot | null;
  issueDate: string | null;
  currencyCode: string;
  subtotalCents: number;
  taxTotalCents: number;
  totalCents: number;
  subtotal: string;
  taxTotal: string;
  total: string;
  status: InvoiceStatus;
  voidedAt: string | null;
  voidedReason: string | null;
  lines: InvoiceLine[];
  taxTotals: InvoiceTaxTotal[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceInput {
  customerId: string;
  documentTypeId: string;
  currencyCode: string;
}

export interface UpdateInvoiceInput {
  customerId?: string;
  documentTypeId?: string;
  currencyCode?: string;
}

export interface AddLineInput {
  productId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  discountCents?: number;
}

export interface IssueInvoiceInput {
  establishmentId: string;
  emissionPointId: string;
}

export interface VoidInvoiceInput {
  reason: string;
}
