/** Tesorería: cartera (cuentas por cobrar). Los importes son centavos enteros; las fechas, `AAAA-MM-DD` sin hora (nunca pasan por UTC). */

export type ReceivableStatus = 'open' | 'partial' | 'paid' | 'written_off' | 'cancelled';
export type ReceivableSourceType = 'invoice' | 'credit_note' | 'initial_balance';

export const RECEIVABLE_STATUSES: ReceivableStatus[] = ['open', 'partial', 'paid', 'written_off', 'cancelled'];

export interface Receivable {
  id: string;
  customerId: string;
  customerName: string;
  customerIdentification: string | null;
  sourceType: ReceivableSourceType;
  sourceId: string;
  documentNumber: string | null;
  issueDate: string;
  dueDate: string;
  currencyCode: string;
  originalCents: number;
  /** Lo aplicado (notas de crédito; en el bloque de cobros, también recibos). El servidor lo suma al leer. */
  appliedCents: number;
  /** El saldo lo calcula el servidor: negativo en una partida anulada con una nota de crédito encima. */
  balanceCents: number;
  status: ReceivableStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreditApplication {
  id: string;
  receivableId: string;
  sourceType: 'credit_note' | 'receipt';
  sourceId: string;
  documentNumber: string | null;
  appliedCents: number;
  appliedAt: string;
  createdAt: string;
  /** Un cobro anulado deja su aplicación en la historia con la fecha de anulación; no cuenta en el saldo. */
  reversedAt: string | null;
}

export interface ReceivableDetail extends Receivable {
  applications: CreditApplication[];
}

export interface CustomerAdvance {
  id: string;
  customerId: string;
  customerName: string;
  origin: 'credit_note' | 'receipt';
  originId: string;
  relatedInvoiceId: string | null;
  documentNumber: string | null;
  currencyCode: string;
  originalCents: number;
  appliedCents: number;
  balanceCents: number;
  createdAt: string;
}

export interface ReceivablePage {
  items: Receivable[];
  total: number;
  page: number;
  pageSize: number;
  /** Fecha de corte con la que el servidor decidió qué está vencido. */
  asOf: string;
}

export interface ReceivableFilters {
  q?: string;
  customerId?: string;
  status?: ReceivableStatus[];
  overdueOnly?: boolean;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AgingBucket {
  currentCents: number;
  days1To30Cents: number;
  days31To60Cents: number;
  days61To90Cents: number;
  daysOver90Cents: number;
  totalCents: number;
}

export interface AgingCustomer extends AgingBucket {
  customerId: string;
  customerName: string;
}

export interface AgingReport {
  asOf: string;
  totals: AgingBucket;
  customers: AgingCustomer[];
}

export interface CustomerStatement {
  customerId: string;
  asOf: string;
  receivableCents: number;
  /** Saldo a favor de NOTAS DE CRÉDITO: vive en cuentas por cobrar y resta de la deuda en `netCents`. */
  advanceCents: number;
  /** Anticipos de COBROS sin consumir: un pasivo aparte («anticipos de clientes»), NO entra en `netCents`. */
  customerAdvanceCents: number;
  /** Deuda menos el saldo a favor de notas de crédito: el número que tiene que cuadrar con `receivables` del libro mayor. */
  netCents: number;
  receivables: Receivable[];
  applications: CreditApplication[];
  advances: CustomerAdvance[];
}

/** El servidor devuelve `null` si el cliente todavía no tiene condiciones (0 días y sin cupo). */
export interface CustomerTerms {
  customerId: string;
  customerName: string;
  creditDays: number;
  creditLimitCents: number | null;
  updatedBy: string;
  updatedAt: string;
}

export interface CustomerTermsInput {
  creditDays: number;
  creditLimitCents: number | null;
  customerName?: string | null;
}

export interface OpeningBalanceLineInput {
  customerId: string;
  documentNumber?: string | null;
  issueDate: string;
  dueDate?: string | null;
  amountCents: number;
}

export interface OpeningBalanceInput {
  cutoffDate: string;
  reason: string;
  lines: OpeningBalanceLineInput[];
}

export interface OpeningBalanceLoad {
  id: string;
  cutoffDate: string;
  totalCents: number;
  loadedBy: string;
  reason: string;
  createdAt: string;
}

// ── Cobros (recibos) ─────────────────────────────────────────────────────────

export type ReceiptStatus = 'draft' | 'posted' | 'voided';
export type ReceiptMethod = 'cash' | 'transfer' | 'check' | 'card' | 'other';
/** Rol contable que recibe el dinero: caja o bancos. */
export type ReceiptAccountRole = 'cash' | 'bank';

export const RECEIPT_STATUSES: ReceiptStatus[] = ['draft', 'posted', 'voided'];
export const RECEIPT_METHODS: ReceiptMethod[] = ['cash', 'transfer', 'check', 'card', 'other'];

export interface ReceiptLine {
  receivableId: string;
  appliedCents: number;
}

export interface ReceiptAdvanceUse {
  advanceId: string;
  usedCents: number;
}

export interface Receipt {
  id: string;
  /** `RC-AAAA-NNNNNN`; `null` mientras es borrador (el número se asigna al contabilizar). */
  number: string | null;
  status: ReceiptStatus;
  customerId: string;
  customerName: string;
  customerIdentification: string | null;
  receiptDate: string;
  method: ReceiptMethod;
  accountRole: ReceiptAccountRole;
  reference: string | null;
  currencyCode: string;
  /** Lo que entró de verdad a caja o banco. */
  totalCents: number;
  advanceUsedCents: number;
  appliedCents: number;
  /** Excedente: queda como anticipo del cliente. */
  advanceCents: number;
  lineCount: number;
  lines: ReceiptLine[];
  advanceUses: ReceiptAdvanceUse[];
  notes: string | null;
  voidReason: string | null;
  createdBy: string;
  postedBy: string | null;
  voidedBy: string | null;
  postedAt: string | null;
  voidedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptPage {
  items: Receipt[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReceiptFilters {
  q?: string;
  customerId?: string;
  status?: ReceiptStatus[];
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ReceiptInput {
  receiptDate: string;
  method: ReceiptMethod;
  accountRole?: ReceiptAccountRole | null;
  reference?: string | null;
  totalCents: number;
  lines: ReceiptLine[];
  advanceUses?: ReceiptAdvanceUse[];
  notes?: string | null;
}

export interface ReceiptCreateInput extends ReceiptInput {
  customerId: string;
}
