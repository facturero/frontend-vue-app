/** Contratos de inventory-service. Las cantidades viajan como string decimal
 *  (DECIMAL 18,4 en la base) y NO como number: convertirlas a float aquí sería
 *  reintroducir justo el error de precisión que el backend evita con Decimal. */

export type MovementType =
  | 'purchase_in'
  | 'sale_out'
  | 'transfer_out'
  | 'transfer_in'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'opening_balance';

/** Qué significa el movimiento para la contabilidad. El libro mayor todavía no
 *  existe; se muestra en el kardex para que el dato sea auditable desde ya. */
export type AccountingNature =
  | 'inventory_in'
  | 'inventory_gain'
  | 'cogs'
  | 'expense'
  | 'shrinkage'
  | 'internal_transfer';

/** Motivo tipificado del ajuste. De él y del signo sale la naturaleza contable,
 *  así que esto es un desplegable cerrado, nunca texto libre. */
export type AdjustmentReasonCode =
  | 'physical_count'
  | 'damage'
  | 'expiration'
  | 'theft'
  | 'internal_use'
  | 'correction';

export interface Warehouse {
  id: string;
  organizationId: string;
  establishmentId: string | null;
  code: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface CreateWarehouseInput {
  code: string;
  name: string;
  address?: string | null;
  establishmentId?: string | null;
  isDefault?: boolean;
}

export interface UpdateWarehouseInput {
  name?: string;
  address?: string | null;
  establishmentId?: string | null;
  isDefault?: boolean;
}

export interface StockPosition {
  id: string;
  organizationId: string;
  productId: string;
  warehouseId: string;
  warehouseCode: string;
  quantityOnHand: string;
  quantityReserved: string;
  quantityAvailable: string;
  averageCost: string;
  averageCostCents: number;
  currencyCode: string;
  updatedAt: string;
}

/** El módulo estuvo desactivado y nadie ha hecho el conteo físico posterior.
 *  Mientras esto llegue, las cifras de stock NO son confiables. */
export interface StaleWarning {
  startedAt: string;
  endedAt: string;
  skippedMovements: number;
}

export interface StockSummary {
  data: StockPosition[];
  page: number;
  pageSize: number;
  total: number;
  staleWarning: StaleWarning | null;
}

export interface ProductStock {
  productId: string;
  totalOnHand: string;
  totalReserved: string;
  totalAvailable: string;
  positions: StockPosition[];
}

export interface StockMovement {
  id: string;
  productId: string;
  warehouseId: string;
  type: MovementType;
  quantity: string;
  unitCost: string | null;
  unitCostCents: number | null;
  totalCost: string | null;
  totalCostCents: number | null;
  currencyCode: string;
  referenceType: string | null;
  referenceId: string | null;
  accountingNature: AccountingNature;
  reasonCode: AdjustmentReasonCode | null;
  lotId: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface MovementPage {
  data: StockMovement[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AdjustStockInput {
  productId: string;
  warehouseId: string;
  /** String decimal CON signo: positivo entra, negativo sale. */
  quantity: string;
  /** Solo para entradas con costo real de fuera. Un sobrante de conteo se omite
   *  y entra al promedio vigente de la posición. */
  unitCost?: string;
  currencyCode?: string;
  reasonCode: AdjustmentReasonCode;
  reason?: string;
}

export interface TransferStockInput {
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: string;
  notes?: string;
}

export interface TransferResult {
  outMovement: StockMovement;
  inMovement: StockMovement;
}

export interface StockListParams {
  productId?: string;
  warehouseId?: string;
  stockState?: 'with_stock' | 'without_stock';
  page?: number;
  pageSize?: number;
}

export interface MovementListParams {
  /** Obligatorio: el kardex siempre es de un producto concreto. */
  productId: string;
  warehouseId?: string;
  type?: MovementType;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
