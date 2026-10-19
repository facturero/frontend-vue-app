import { defineStore } from 'pinia';
import { ref } from 'vue';
import { purchasingApi } from '@/api/purchasing';
import { extractError } from '@/utils/error';
import type {
  BillFilters,
  BillInput,
  GoodsReceipt,
  OrderFilters,
  OrderInput,
  OrderReceiving,
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

/** Proveedores, órdenes, recepciones y facturas de compra. Cada acción deja el mensaje del servidor en `error` y vuelve a lanzar, para que la vista decida. */
export const usePurchasingStore = defineStore('purchasing', () => {
  const suppliers = ref<Supplier[]>([]);
  const suppliersTotal = ref(0);
  const orders = ref<PurchaseOrder[]>([]);
  const ordersTotal = ref(0);
  const ordersPage = ref(1);
  const pageSize = ref(25);
  const current = ref<PurchaseOrder | null>(null);
  const settings = ref<PurchasingSettings | null>(null);
  const receipts = ref<GoodsReceipt[]>([]);
  const receiptsTotal = ref(0);
  const receiptsPage = ref(1);
  const currentReceipt = ref<GoodsReceipt | null>(null);
  const bills = ref<PurchaseBill[]>([]);
  const billsTotal = ref(0);
  const billsPage = ref(1);
  const currentBill = ref<PurchaseBill | null>(null);
  /** Seguimiento de recepción y facturación por línea de una orden (conciliación a tres vías). */
  const receiving = ref<OrderReceiving | null>(null);
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

  async function saveSettings(changes: {
    approvalThresholdCents?: number | null;
    defaultWarehouseId?: string | null;
    overReceiptToleranceBp?: number;
    priceToleranceBp?: number;
    qtyToleranceBp?: number;
  }): Promise<void> {
    settings.value = (await run(saving, () => purchasingApi.updateSettings(changes), true))!;
  }

  // ── Recepción de mercadería ───────────────────────────────────────────────

  /** Registra una recepción contra la orden y deja la orden resultante como la actual. */
  async function receiveOrder(orderId: string, input: ReceiptInput): Promise<ReceivedOrder> {
    const received = await run(saving, () => purchasingApi.receiveOrder(orderId, input), true);
    current.value = received!;
    return received!;
  }

  async function closeOrder(id: string, reason: string): Promise<PurchaseOrder> {
    const order = await run(saving, () => purchasingApi.closeOrder(id, reason), true);
    current.value = order!;
    return order!;
  }

  async function fetchReceiving(orderId: string): Promise<void> {
    receiving.value = null;
    const tracking = await run(loading, () => purchasingApi.getOrderReceiving(orderId), false);
    if (tracking) receiving.value = tracking;
  }

  async function fetchReceipts(filters: ReceiptFilters = {}): Promise<void> {
    const page = await run(loading, () => purchasingApi.listReceipts({ pageSize: pageSize.value, ...filters }), false);
    if (page) {
      receipts.value = page.items;
      receiptsTotal.value = page.total;
      receiptsPage.value = page.page;
    }
  }

  async function fetchReceipt(id: string): Promise<void> {
    currentReceipt.value = null;
    const receipt = await run(loading, () => purchasingApi.getReceipt(id), false);
    if (receipt) currentReceipt.value = receipt;
  }

  // ── Factura de compra (conciliación a tres vías) ────────────────────────────

  async function fetchBills(filters: BillFilters = {}): Promise<void> {
    const page = await run(loading, () => purchasingApi.listBills({ pageSize: pageSize.value, ...filters }), false);
    if (page) {
      bills.value = page.items;
      billsTotal.value = page.total;
      billsPage.value = page.page;
    }
  }

  async function fetchBill(id: string): Promise<void> {
    currentBill.value = null;
    const bill = await run(loading, () => purchasingApi.getBill(id), false);
    if (bill) currentBill.value = bill;
  }

  /** Alta (`id = null`) o edición de borrador; el resultado queda como factura actual. */
  async function saveBill(id: string | null, input: BillInput): Promise<PurchaseBill> {
    const bill = await run(saving, () => (id ? purchasingApi.updateBill(id, input) : purchasingApi.createBill(input)), true);
    currentBill.value = bill!;
    return bill!;
  }

  /** Contabilizar: la conciliación decide si sale `posted` o `blocked`. */
  async function postBill(id: string): Promise<PurchaseBill> {
    const bill = await run(saving, () => purchasingApi.postBill(id), true);
    currentBill.value = bill!;
    return bill!;
  }

  async function overrideBill(id: string, reason: string): Promise<PurchaseBill> {
    const bill = await run(saving, () => purchasingApi.overrideBill(id, reason), true);
    currentBill.value = bill!;
    return bill!;
  }

  async function voidBill(id: string, reason: string): Promise<PurchaseBill> {
    const bill = await run(saving, () => purchasingApi.voidBill(id, reason), true);
    currentBill.value = bill!;
    return bill!;
  }

  async function issueBillWithholding(id: string, withholdingLines: WithholdingLineInput[]): Promise<PurchaseBill> {
    const bill = await run(saving, () => purchasingApi.issueBillWithholding(id, withholdingLines), true);
    currentBill.value = bill!;
    return bill!;
  }

  return {
    suppliers, suppliersTotal, orders, ordersTotal, ordersPage, pageSize, current, settings,
    receipts, receiptsTotal, receiptsPage, currentReceipt,
    bills, billsTotal, billsPage, currentBill, receiving,
    loading, saving, error,
    fetchSuppliers, saveSupplier, setSupplierActive, fetchOrders, fetchOrder, saveOrder, transition, transitionWithReason, fetchSettings, saveSettings,
    receiveOrder, closeOrder, fetchReceiving, fetchReceipts, fetchReceipt,
    fetchBills, fetchBill, saveBill, postBill, overrideBill, voidBill, issueBillWithholding,
  };
});
