import { http } from '@/utils/http';
import type {
  BillFilters,
  BillInput,
  GoodsReceipt,
  OrderFilters,
  OrderInput,
  OrderReceiving,
  Page,
  PurchaseBill,
  PurchaseOrder,
  PurchasingSettings,
  ReceivedOrder,
  ReceiptFilters,
  ReceiptInput,
  Supplier,
  SupplierInput,
  WithholdingLineInput,
} from '@/types/purchasing';

export const purchasingApi = {
  getSettings: () => http.get<PurchasingSettings>('/purchasing/settings').then((r) => r.data),
  /** Ajuste parcial: lo que no se manda queda como estaba. Las tolerancias van en puntos básicos (0-5000). */
  updateSettings: (body: {
    approvalThresholdCents?: number | null;
    defaultWarehouseId?: string | null;
    overReceiptToleranceBp?: number;
    priceToleranceBp?: number;
    qtyToleranceBp?: number;
  }) => http.put<PurchasingSettings>('/purchasing/settings', body).then((r) => r.data),

  listSuppliers: (params: { q?: string; status?: string; page?: number; pageSize?: number } = {}) =>
    http.get<Page<Supplier>>('/purchasing/suppliers', { params }).then((r) => r.data),
  getSupplier: (id: string) => http.get<Supplier>(`/purchasing/suppliers/${id}`).then((r) => r.data),
  createSupplier: (body: SupplierInput) => http.post<Supplier>('/purchasing/suppliers', body).then((r) => r.data),
  /** La identificación no se cambia: el servidor la rechaza. */
  updateSupplier: (id: string, body: Omit<SupplierInput, 'identificationType' | 'identification'>) =>
    http.put<Supplier>(`/purchasing/suppliers/${id}`, body).then((r) => r.data),
  deactivateSupplier: (id: string) => http.post<Supplier>(`/purchasing/suppliers/${id}/deactivate`).then((r) => r.data),
  activateSupplier: (id: string) => http.post<Supplier>(`/purchasing/suppliers/${id}/activate`).then((r) => r.data),

  listOrders: (params: OrderFilters = {}) => http.get<Page<PurchaseOrder>>('/purchasing/orders', { params }).then((r) => r.data),
  getOrder: (id: string) => http.get<PurchaseOrder>(`/purchasing/orders/${id}`).then((r) => r.data),
  createOrder: (body: OrderInput) => http.post<PurchaseOrder>('/purchasing/orders', body).then((r) => r.data),
  updateOrder: (id: string, body: OrderInput) => http.put<PurchaseOrder>(`/purchasing/orders/${id}`, body).then((r) => r.data),
  submitOrder: (id: string) => http.post<PurchaseOrder>(`/purchasing/orders/${id}/submit`).then((r) => r.data),
  approveOrder: (id: string) => http.post<PurchaseOrder>(`/purchasing/orders/${id}/approve`).then((r) => r.data),
  rejectOrder: (id: string, reason: string) => http.post<PurchaseOrder>(`/purchasing/orders/${id}/reject`, { reason }).then((r) => r.data),
  reopenOrder: (id: string) => http.post<PurchaseOrder>(`/purchasing/orders/${id}/reopen`).then((r) => r.data),
  cancelOrder: (id: string, reason: string) => http.post<PurchaseOrder>(`/purchasing/orders/${id}/cancel`, { reason }).then((r) => r.data),

  // ── Recepción de mercadería ──────────────────────────────────────────────────
  /** Devuelve la orden resultante (nuevo estado) junto con el número de la recepción creada. */
  receiveOrder: (orderId: string, body: ReceiptInput) =>
    http.post<ReceivedOrder>(`/purchasing/orders/${orderId}/receipts`, body).then((r) => r.data),
  getOrderReceiving: (orderId: string) => http.get<OrderReceiving>(`/purchasing/orders/${orderId}/receiving`).then((r) => r.data),
  listReceipts: (params: ReceiptFilters = {}) => http.get<Page<GoodsReceipt>>('/purchasing/receipts', { params }).then((r) => r.data),
  getReceipt: (id: string) => http.get<GoodsReceipt>(`/purchasing/receipts/${id}`).then((r) => r.data),
  closeOrder: (id: string, reason: string) => http.post<PurchaseOrder>(`/purchasing/orders/${id}/close`, { reason }).then((r) => r.data),

  // ── Factura de compra (conciliación a tres vías) ─────────────────────────────
  listBills: (params: BillFilters = {}) => http.get<Page<PurchaseBill>>('/purchasing/bills', { params }).then((r) => r.data),
  getBill: (id: string) => http.get<PurchaseBill>(`/purchasing/bills/${id}`).then((r) => r.data),
  createBill: (body: BillInput) => http.post<PurchaseBill>('/purchasing/bills', body).then((r) => r.data),
  /** Solo borradores: el servidor responde 422 si no lo es. */
  updateBill: (id: string, body: BillInput) => http.put<PurchaseBill>(`/purchasing/bills/${id}`, body).then((r) => r.data),
  postBill: (id: string) => http.post<PurchaseBill>(`/purchasing/bills/${id}/post`).then((r) => r.data),
  overrideBill: (id: string, reason: string) => http.post<PurchaseBill>(`/purchasing/bills/${id}/override`, { reason }).then((r) => r.data),
  voidBill: (id: string, reason: string) => http.post<PurchaseBill>(`/purchasing/bills/${id}/void`, { reason }).then((r) => r.data),
  issueBillWithholding: (id: string, withholdingLines: WithholdingLineInput[]) =>
    http.post<PurchaseBill>(`/purchasing/bills/${id}/withholding`, { withholdingLines }).then((r) => r.data),
};
