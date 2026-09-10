import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { inventoryApi } from '@/api/inventory';
import { extractError } from '@/utils/error';
import type {
  Warehouse,
  CreateWarehouseInput,
  UpdateWarehouseInput,
  StockPosition,
  StaleWarning,
  ProductStock,
  StockMovement,
  AdjustStockInput,
  TransferStockInput,
  StockListParams,
  MovementListParams,
} from '@/types/inventory';

export const useInventoryStore = defineStore('inventory', () => {
  const warehouses = ref<Warehouse[]>([]);
  const positions = ref<StockPosition[]>([]);
  const staleWarning = ref<StaleWarning | null>(null);
  const total = ref(0);
  const productStock = ref<ProductStock | null>(null);
  const movements = ref<StockMovement[]>([]);
  const movementsTotal = ref(0);

  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  /** El modelo aguanta N bodegas, pero al onboarding se aprovisiona UNA sola.
   *  Con una sola bodega el concepto se oculta: la pantalla no debe obligar a
   *  elegir entre una única opción. */
  const activeWarehouses = computed(() => warehouses.value.filter((w) => w.status === 'active'));
  const isSingleWarehouse = computed(() => activeWarehouses.value.length <= 1);
  const defaultWarehouse = computed(
    () => activeWarehouses.value.find((w) => w.isDefault) ?? activeWarehouses.value[0] ?? null,
  );

  async function fetchWarehouses(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      warehouses.value = await inventoryApi.listWarehouses();
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createWarehouse(input: CreateWarehouseInput): Promise<Warehouse> {
    saving.value = true;
    error.value = null;
    try {
      const created = await inventoryApi.createWarehouse(input);
      await fetchWarehouses();
      return created;
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function updateWarehouse(id: string, input: UpdateWarehouseInput): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await inventoryApi.updateWarehouse(id, input);
      await fetchWarehouses();
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function deactivateWarehouse(id: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await inventoryApi.deactivateWarehouse(id);
      await fetchWarehouses();
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function fetchStock(params?: StockListParams): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const page = await inventoryApi.listStock(params);
      positions.value = page.data;
      total.value = page.total;
      // Se refresca en cada consulta a propósito: el aviso desaparece solo en
      // cuanto alguien carga el conteo físico, sin botón de "ya lo vi".
      staleWarning.value = page.staleWarning;
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchProductStock(productId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      productStock.value = await inventoryApi.getProductStock(productId);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMovements(params: MovementListParams): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const page = await inventoryApi.listMovements(params);
      movements.value = page.data;
      movementsTotal.value = page.total;
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function adjust(input: AdjustStockInput): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await inventoryApi.adjust(input);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function transfer(input: TransferStockInput): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await inventoryApi.transfer(input);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  return {
    warehouses,
    positions,
    staleWarning,
    total,
    productStock,
    movements,
    movementsTotal,
    loading,
    saving,
    error,
    activeWarehouses,
    isSingleWarehouse,
    defaultWarehouse,
    fetchWarehouses,
    createWarehouse,
    updateWarehouse,
    deactivateWarehouse,
    fetchStock,
    fetchProductStock,
    fetchMovements,
    adjust,
    transfer,
  };
});
