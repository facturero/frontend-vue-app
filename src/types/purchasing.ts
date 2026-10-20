export type SupplierIdentificationType = 'RUC' | 'CEDULA' | 'PASAPORTE' | 'EXTERIOR';
export type SupplierStatus = 'active' | 'inactive';

export interface Supplier {
  id: string;
  identificationType: SupplierIdentificationType;
  identification: string;
  legalName: string;
  tradeName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentTermDays: number;
  relatedParty: boolean;
  notes: string | null;
  status: SupplierStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierInput {
  identificationType: SupplierIdentificationType;
  identification: string;
  legalName: string;
  tradeName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  paymentTermDays: number;
  relatedParty: boolean;
  notes?: string | null;
}

export type OrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'partially_received'
  | 'received'
  | 'closed'
  | 'cancelled'
  | 'rejected';

export const ORDER_STATUSES: OrderStatus[] = [
  'draft', 'pending_approval', 'approved', 'partially_received', 'received', 'closed', 'cancelled', 'rejected',
];

export interface OrderLine {
  id: string;
  lineNumber: number;
  productId: string;
  sku: string | null;
  description: string;
  /** Texto con hasta 6 decimales: nunca un número (se perderían decimales). */
  quantity: string;
  unitCostCents: number;
  discountCents: number;
  taxRateId: string | null;
  taxPercent: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  receivedQuantity: string;
}

export interface PurchaseOrder {
  id: string;
  number: string | null;
  status: OrderStatus;
  supplierId: string;
  supplier: { identificationType: SupplierIdentificationType; identification: string; legalName: string };
  warehouseId: string;
  establishmentId: string | null;
  currencyCode: string;
  orderDate: string;
  expectedDate: string | null;
  paymentTermDays: number;
  notes: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  lineCount: number;
  /** Solo en el detalle: el listado trae `lineCount`. */
  lines?: OrderLine[];
  createdBy: string;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  /** Aprobada sin aprobador: la política de la organización no exigía aprobación para ese monto. */
  approvedByPolicy: boolean;
  rejectionReason: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface OrderLineInput {
  productId: string;
  description?: string;
  quantity: string;
  unitCostCents: number;
  discountCents?: number;
  /** `undefined`: el IVA del producto; `null`: sin impuesto. */
  taxRateId?: string | null;
}

export interface OrderInput {
  supplierId: string;
  warehouseId: string;
  currencyCode?: string;
  orderDate?: string;
  expectedDate?: string | null;
  paymentTermDays?: number;
  notes?: string | null;
  lines: OrderLineInput[];
}

export interface PurchasingSettings {
  approvalThresholdCents: number | null;
  defaultWarehouseId: string | null;
  /** Tolerancias en puntos básicos (0-5000 = 0 %-50 %). Las fija el administrador por la API, no van en el código. */
  overReceiptToleranceBp: number;
  priceToleranceBp: number;
  qtyToleranceBp: number;
  updatedAt: string;
}

// ── Recepción de mercadería ───────────────────────────────────────────────────

export interface ReceiptLine {
  id: string;
  orderLineId: string;
  productId: string | null;
  /** Hasta 6 decimales, como texto (un número perdería decimales). */
  quantity: string;
  unitCostCents: number;
  currencyCode: string;
}

export interface GoodsReceipt {
  id: string;
  number: string;
  purchaseOrderId: string | null;
  supplierId: string;
  warehouseId: string;
  receiptDate: string;
  supplierDeliveryRef: string | null;
  notes: string | null;
  lineCount: number;
  /** Sin líneas en el listado. */
  lines: ReceiptLine[];
  createdBy: string;
  createdAt: string;
}

export interface ReceiptInput {
  receiptDate: string;
  supplierDeliveryRef?: string | null;
  notes?: string | null;
  lines: Array<{ orderLineId: string; quantity: string }>;
}

export interface ReceiptFilters {
  q?: string;
  purchaseOrderId?: string;
  supplierId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** El POST de recepción devuelve la orden resultante con el número de recepción recién creado. */
export type ReceivedOrder = PurchaseOrder & { receiptId: string; receiptNumber: string };

/** Seguimiento de recepción/facturación por línea (`GET /purchasing/orders/:id/receiving`). */
export interface OrderReceivingLine {
  lineId: string;
  ordered: string;
  received: string;
  pending: string;
  /** Ya facturado contra esta línea (facturas posted + blocked): así se ve el cupo real por facturar. */
  billed: string;
}

export interface OrderReceiving {
  orderId: string;
  orderNumber: string | null;
  status: OrderStatus;
  lines: OrderReceivingLine[];
}

// ── Factura de compra (conciliación a tres vías) ──────────────────────────────

export type BillStatus = 'draft' | 'posted' | 'blocked' | 'voided';

export const BILL_STATUSES: BillStatus[] = ['draft', 'posted', 'blocked', 'voided'];

export type MatchStatus = 'matched' | 'blocked' | 'overridden' | 'not_applicable';

export const MATCH_STATUSES: MatchStatus[] = ['matched', 'blocked', 'overridden', 'not_applicable'];

export interface MatchReason {
  code: string;
  lineId: string | null;
  detail: string;
}

export type BillDocType = '01' | '03' | '41';

export interface BillLine {
  id: string;
  lineNumber: number;
  orderLineId: string | null;
  productId: string | null;
  /** Inventario (el producto lleva stock) o gasto: lo decide el servidor. */
  kind: 'stock' | 'expense';
  description: string;
  quantity: string;
  unitCostCents: number;
  discountCents: number;
  subtotalCents: number;
  taxCode: string | null;
  taxPercentageCode: string | null;
  taxRatePct: string;
  taxCents: number;
  iceCents: number;
  irbpnrCents: number;
  totalCents: number;
  expenseAccountHint: string | null;
  /** Diferencia (centavos) entre lo facturado y el costo de la orden: contabilidad la lleva aparte. */
  priceVarianceCents: number;
}

export interface PurchaseBill {
  id: string;
  internalNumber: string | null;
  supplierId: string;
  supplier: { identificationType?: string; identification: string; legalName: string } | null;
  purchaseOrderId: string | null;
  docType: BillDocType;
  establishment: string;
  emissionPoint: string;
  sequential: string;
  authorizationNumber: string | null;
  issueDate: string;
  dueDate: string;
  currencyCode: string;
  notes: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  supplierTotalCents: number | null;
  status: BillStatus;
  matchStatus: MatchStatus;
  matchReasons: MatchReason[];
  overrideReason: string | null;
  overrideBy: string | null;
  withholdingStatus: 'none' | 'issued';
  voidReason: string | null;
  lineCount: number;
  /** Sin líneas en el listado. */
  lines: BillLine[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface BillLineInput {
  orderLineId?: string | null;
  productId?: string | null;
  description: string;
  /** Hasta 6 decimales, como texto. */
  quantity: string;
  unitCostCents: number;
  discountCents?: number;
  taxCode?: string | null;
  taxPercentageCode?: string | null;
  /** Porcentaje con hasta 2 decimales, como texto. */
  taxRatePct: string;
  /** Si no se manda, el servidor calcula el IVA desde `taxRatePct`. */
  taxCents?: number;
  iceCents?: number;
  irbpnrCents?: number;
  expenseAccountHint?: string | null;
}

export interface BillInput {
  supplierId: string;
  purchaseOrderId?: string | null;
  docType: BillDocType;
  /** `001-001-000000123` se guarda partido en tres campos. */
  establishment: string;
  emissionPoint: string;
  sequential: string;
  authorizationNumber?: string | null;
  issueDate: string;
  dueDate: string;
  currencyCode: string;
  notes?: string | null;
  lines: BillLineInput[];
  supplierTotalCents?: number;
}

export interface BillFilters {
  q?: string;
  supplierId?: string;
  status?: BillStatus;
  matchStatus?: MatchStatus;
  purchaseOrderId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrderFilters {
  q?: string;
  status?: OrderStatus;
  supplierId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
