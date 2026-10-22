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

// ── Recordatorios de cobro (bloque C) ──

/** Los recordatorios son un correo al CLIENTE de la organización: nacen apagados y solo el Administrador los enciende. */
export interface ReminderSettings {
  enabled: boolean;
  /** Días de atraso desde los que se avisa por primera vez (1 a 90). */
  firstAfterDays: number;
  /** Cada cuántos días se repite el aviso de una misma partida (7 a 60: un recordatorio por semana como máximo). */
  repeatEveryDays: number;
  lastRunOn: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface ReminderSettingsInput {
  enabled: boolean;
  firstAfterDays: number;
  repeatEveryDays: number;
}

export interface ReminderPreviewItem {
  receivableId: string;
  documentNumber: string | null;
  dueDate: string;
  daysOverdue: number;
  balanceCents: number;
}

export interface ReminderPreviewCustomer {
  customerId: string;
  customerName: string;
  currencyCode: string;
  hasEmail: boolean;
  /** Pista para reconocer el correo (`ma***@dominio`); el correo completo no viaja. */
  emailHint: string | null;
  totalCents: number;
  receivableCount: number;
  items: ReminderPreviewItem[];
  extraItems: number;
}

export interface ReminderPreview {
  asOf: string;
  enabled: boolean;
  receivableCount: number;
  withoutEmailCount: number;
  customers: ReminderPreviewCustomer[];
}

export interface ReminderRun {
  runDate: string;
  customersReminded: number;
  receivablesReminded: number;
  customersWithoutEmail: number;
  customersAlreadyReminded: number;
}

export const MIN_REPEAT_DAYS = 7;
export const MAX_REPEAT_DAYS = 60;
export const MIN_FIRST_AFTER_DAYS = 1;
export const MAX_FIRST_AFTER_DAYS = 90;

// ── Cuentas por pagar y pagos a proveedores (bloque D) ──

export type PayableStatus = 'open' | 'partial' | 'paid' | 'cancelled';
export const PAYABLE_STATUSES: PayableStatus[] = ['open', 'partial', 'paid', 'cancelled'];
export type PayableSourceType = 'purchase_bill' | 'initial_balance';

export interface Payable {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierIdentification: string | null;
  sourceType: PayableSourceType;
  sourceId: string;
  /** Número de la factura del PROVEEDOR. */
  documentNumber: string | null;
  /** Número interno de la factura de compra (FC-AAAA-NNNNNN). */
  internalNumber: string | null;
  issueDate: string;
  dueDate: string;
  currencyCode: string;
  originalCents: number;
  /** Pagos y retenciones vigentes. */
  appliedCents: number;
  /** Lo que se debe, neto de pagos y retenciones. Negativo en una factura anulada que ya tenía pagos. */
  balanceCents: number;
  status: PayableStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PayableApplication {
  id: string;
  payableId: string;
  sourceType: 'payment' | 'withholding';
  sourceId: string;
  documentNumber: string | null;
  appliedCents: number;
  appliedAt: string;
  reversedAt: string | null;
}

export interface PayableDetail extends Payable {
  applications: PayableApplication[];
}

export interface SupplierAdvance {
  id: string;
  supplierId: string;
  originId: string;
  documentNumber: string | null;
  currencyCode: string;
  originalCents: number;
  appliedCents: number;
  balanceCents: number;
  createdAt: string;
}

export interface PayablePage {
  items: Payable[];
  total: number;
  page: number;
  pageSize: number;
  asOf: string;
}

export interface PayableFilters {
  q?: string;
  supplierId?: string;
  status?: PayableStatus[];
  overdueOnly?: boolean;
  /** Solo lo que vence en los próximos 7 días. */
  dueSoon?: boolean;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface PayablesAgingBucket {
  dueSoonCents: number;
  currentCents: number;
  days1To30Cents: number;
  days31To60Cents: number;
  days61To90Cents: number;
  daysOver90Cents: number;
  totalCents: number;
}

export interface PayablesAgingSupplier extends PayablesAgingBucket {
  supplierId: string;
  supplierName: string;
}

export interface PayablesAgingReport {
  asOf: string;
  totals: PayablesAgingBucket;
  suppliers: PayablesAgingSupplier[];
}

export interface SupplierStatement {
  supplierId: string;
  asOf: string;
  /** Lo que se le debe: deuda − pagos − retenciones. */
  payableCents: number;
  /** Anticipos a proveedores sin consumir. NO entran en `netCents`: viven en «anticipos a proveedores». */
  advanceCents: number;
  netCents: number;
  payables: Payable[];
  applications: PayableApplication[];
  advances: SupplierAdvance[];
}

export type PaymentStatus = 'draft' | 'approved' | 'posted' | 'voided';
export type PaymentMethod = 'cash' | 'transfer' | 'check' | 'other';
export type PaymentAccountRole = 'cash' | 'bank';
export const PAYMENT_STATUSES: PaymentStatus[] = ['draft', 'approved', 'posted', 'voided'];
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'transfer', 'check', 'other'];

export interface PaymentLine {
  payableId: string;
  appliedCents: number;
}

export interface PaymentAdvanceUse {
  advanceId: string;
  usedCents: number;
}

export interface Payment {
  id: string;
  /** `PG-AAAA-NNNNNN`; `null` mientras es borrador. */
  number: string | null;
  status: PaymentStatus;
  supplierId: string;
  supplierName: string;
  supplierIdentification: string | null;
  paymentDate: string;
  method: PaymentMethod;
  accountRole: PaymentAccountRole;
  reference: string | null;
  currencyCode: string;
  /** Lo que salió de caja o banco. */
  totalCents: number;
  advanceUsedCents: number;
  appliedCents: number;
  /** Excedente: queda como anticipo a proveedores. */
  advanceCents: number;
  lineCount: number;
  lines: PaymentLine[];
  advanceUses: PaymentAdvanceUse[];
  notes: string | null;
  voidReason: string | null;
  createdBy: string;
  approvedBy: string | null;
  postedBy: string | null;
  voidedBy: string | null;
  approvedAt: string | null;
  postedAt: string | null;
  voidedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Un borrador que llega al umbral de aprobación y todavía no lo aprobó otra persona. Lo dice el servidor: quien no gestiona el umbral no puede calcularlo. */
  requiresApproval?: boolean;
}

export interface PaymentInput {
  paymentDate: string;
  method: PaymentMethod;
  accountRole?: PaymentAccountRole | null;
  reference?: string | null;
  totalCents: number;
  lines: PaymentLine[];
  advanceUses?: PaymentAdvanceUse[];
  notes?: string | null;
}

export interface PaymentCreateInput extends PaymentInput {
  supplierId: string;
}

export interface PaymentFilters {
  q?: string;
  supplierId?: string;
  status?: PaymentStatus[];
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface PaymentPage {
  items: Payment[];
  total: number;
  page: number;
  pageSize: number;
}

/** Desde qué importe un pago exige que OTRA persona lo apruebe. `null` = sin aprobación (nace así). */
export interface PaymentSettings {
  approvalThresholdCents: number | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface PayableOpeningBalanceInput {
  cutoffDate: string;
  reason: string;
  lines: { supplierId: string; documentNumber?: string | null; issueDate: string; dueDate?: string | null; amountCents: number }[];
}

export interface PayableOpeningBalanceLoad {
  id: string;
  cutoffDate: string;
  loadedBy: string;
  reason: string;
  totalCents: number;
  createdAt: string;
}
