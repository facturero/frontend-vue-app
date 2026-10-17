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
  updatedAt: string;
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
