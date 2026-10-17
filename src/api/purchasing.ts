import { http } from '@/utils/http';
import type {
  OrderFilters,
  OrderInput,
  Page,
  PurchaseOrder,
  PurchasingSettings,
  Supplier,
  SupplierInput,
} from '@/types/purchasing';

export const purchasingApi = {
  getSettings: () => http.get<PurchasingSettings>('/purchasing/settings').then((r) => r.data),
  updateSettings: (body: { approvalThresholdCents?: number | null; defaultWarehouseId?: string | null }) =>
    http.put<PurchasingSettings>('/purchasing/settings', body).then((r) => r.data),

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
};
