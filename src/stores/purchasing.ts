import { defineStore } from 'pinia';
import { ref } from 'vue';
import { purchasingApi } from '@/api/purchasing';
import { extractError } from '@/utils/error';
import type {
  OrderFilters,
  OrderInput,
  PurchaseOrder,
  PurchasingSettings,
  Supplier,
  SupplierInput,
} from '@/types/purchasing';

/** Proveedores y órdenes de compra. Cada acción deja el mensaje del servidor en `error` y vuelve a lanzar, para que la vista decida. */
export const usePurchasingStore = defineStore('purchasing', () => {
  const suppliers = ref<Supplier[]>([]);
  const suppliersTotal = ref(0);
  const orders = ref<PurchaseOrder[]>([]);
  const ordersTotal = ref(0);
  const ordersPage = ref(1);
  const pageSize = ref(25);
  const current = ref<PurchaseOrder | null>(null);
  const settings = ref<PurchasingSettings | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  async function run<T>(flag: typeof loading, work: () => Promise<T>, rethrow: boolean): Promise<T | undefined> {
    flag.value = true;
    error.value = null;
    try {
      return await work();
    } catch (e) {
      error.value = extractError(e);
      if (rethrow) throw e;
      return undefined;
    } finally {
      flag.value = false;
    }
  }

  async function fetchSuppliers(params: { q?: string; status?: string; page?: number } = {}): Promise<void> {
    const page = await run(loading, () => purchasingApi.listSuppliers({ ...params, pageSize: 100 }), false);
    if (page) {
      suppliers.value = page.items;
      suppliersTotal.value = page.total;
    }
  }

  async function saveSupplier(id: string | null, input: SupplierInput): Promise<Supplier> {
    const saved = await run(saving, async () => {
      if (id) {
        const { identificationType: _t, identification: _i, ...editable } = input;
        return purchasingApi.updateSupplier(id, editable);
      }
      return purchasingApi.createSupplier(input);
    }, true);
    return saved!;
  }

  async function setSupplierActive(id: string, active: boolean): Promise<void> {
    await run(saving, () => (active ? purchasingApi.activateSupplier(id) : purchasingApi.deactivateSupplier(id)), true);
  }

  async function fetchOrders(filters: OrderFilters = {}): Promise<void> {
    const page = await run(loading, () => purchasingApi.listOrders({ pageSize: pageSize.value, ...filters }), false);
    if (page) {
      orders.value = page.items;
      ordersTotal.value = page.total;
      ordersPage.value = page.page;
    }
  }

  async function fetchOrder(id: string): Promise<void> {
    current.value = null;
    const order = await run(loading, () => purchasingApi.getOrder(id), false);
    if (order) current.value = order;
  }

  async function saveOrder(id: string | null, input: OrderInput): Promise<PurchaseOrder> {
    const order = await run(saving, () => (id ? purchasingApi.updateOrder(id, input) : purchasingApi.createOrder(input)), true);
    current.value = order!;
    return order!;
  }

  /** Cambia de estado una orden (enviar, aprobar…) y deja la orden resultante como la actual. */
  async function transition(action: 'submit' | 'approve' | 'reopen', id: string): Promise<PurchaseOrder> {
    const call = { submit: purchasingApi.submitOrder, approve: purchasingApi.approveOrder, reopen: purchasingApi.reopenOrder }[action];
    const order = await run(saving, () => call(id), true);
    current.value = order!;
    return order!;
  }

  async function transitionWithReason(action: 'reject' | 'cancel', id: string, reason: string): Promise<PurchaseOrder> {
    const call = action === 'reject' ? purchasingApi.rejectOrder : purchasingApi.cancelOrder;
    const order = await run(saving, () => call(id, reason), true);
    current.value = order!;
    return order!;
  }

  async function fetchSettings(): Promise<void> {
    const s = await run(loading, () => purchasingApi.getSettings(), false);
    if (s) settings.value = s;
  }

  async function saveSettings(changes: { approvalThresholdCents?: number | null; defaultWarehouseId?: string | null }): Promise<void> {
    settings.value = (await run(saving, () => purchasingApi.updateSettings(changes), true))!;
  }

  return {
    suppliers, suppliersTotal, orders, ordersTotal, ordersPage, pageSize, current, settings, loading, saving, error,
    fetchSuppliers, saveSupplier, setSupplierActive, fetchOrders, fetchOrder, saveOrder, transition, transitionWithReason, fetchSettings, saveSettings,
  };
});
