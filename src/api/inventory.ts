import { http } from '@/utils/http';
import type {
  Warehouse,
  CreateWarehouseInput,
  UpdateWarehouseInput,
  StockSummary,
  ProductStock,
  MovementPage,
  AdjustStockInput,
  TransferStockInput,
  TransferResult,
  StockMovement,
  StockListParams,
  MovementListParams,
} from '@/types/inventory';

export const inventoryApi = {
  listWarehouses: () =>
    http.get<Warehouse[]>('/warehouses').then((r) => r.data),

  getWarehouse: (id: string) =>
    http.get<Warehouse>(`/warehouses/${id}`).then((r) => r.data),

  createWarehouse: (body: CreateWarehouseInput) =>
    http.post<Warehouse>('/warehouses', body).then((r) => r.data),

  updateWarehouse: (id: string, body: UpdateWarehouseInput) =>
    http.patch<Warehouse>(`/warehouses/${id}`, body).then((r) => r.data),

  /** Falla con 422 si la bodega tiene existencias. */
  deactivateWarehouse: (id: string) =>
    http.post<void>(`/warehouses/${id}/deactivate`).then((r) => r.data),

  listStock: (params?: StockListParams) =>
    http.get<StockSummary>('/stock', { params }).then((r) => r.data),

  getProductStock: (productId: string) =>
    http.get<ProductStock>(`/stock/products/${productId}`).then((r) => r.data),

  listMovements: (params: MovementListParams) =>
    http.get<MovementPage>('/stock/movements', { params }).then((r) => r.data),

  adjust: (body: AdjustStockInput) =>
    http.post<StockMovement>('/stock/adjustments', body).then((r) => r.data),

  transfer: (body: TransferStockInput) =>
    http.post<TransferResult>('/stock/transfers', body).then((r) => r.data),
};
