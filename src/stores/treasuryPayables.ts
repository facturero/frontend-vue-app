import { defineStore } from 'pinia';
import { ref } from 'vue';
import { treasuryApi } from '@/api/treasury';
import { extractError } from '@/utils/error';
import type {
  Payable,
  PayableFilters,
  PayableOpeningBalanceInput,
  PayableOpeningBalanceLoad,
  PayablesAgingReport,
  Payment,
  PaymentCreateInput,
  PaymentFilters,
  PaymentInput,
  PaymentSettings,
  SupplierStatement,
} from '@/types/treasury';

/**
 * Cuentas por pagar y pagos a proveedores. Mismo criterio que el store de cartera: cada acción deja el mensaje del servidor en `error`
 * y, si es una escritura, vuelve a lanzar para que la vista decida qué mostrar.
 */
export const useTreasuryPayablesStore = defineStore('treasuryPayables', () => {
  const payables = ref<Payable[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(25);
  /** Fecha de corte del servidor: la que decide qué está vencido (no el reloj de quien mira). */
  const asOf = ref<string | null>(null);
  const aging = ref<PayablesAgingReport | null>(null);
  const statement = ref<SupplierStatement | null>(null);
  const payments = ref<Payment[]>([]);
  const paymentsTotal = ref(0);
  const paymentsPage = ref(1);
  const currentPayment = ref<Payment | null>(null);
  const settings = ref<PaymentSettings | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  async function run<T>(flag: typeof loading, work: () => Promise<T>, rethrow: boolean): Promise<T | undefined> {
    flag.value = true;
    error.value = null;
    try {
      return await work();
    } catch (err) {
      error.value = extractError(err);
      if (rethrow) throw err;
      return undefined;
    } finally {
      flag.value = false;
    }
  }

  async function fetchPayables(filters: PayableFilters = {}): Promise<void> {
    const result = await run(loading, () => treasuryApi.listPayables({ page: page.value, pageSize: pageSize.value, ...filters }), false);
    if (!result) return;
    payables.value = result.items;
    total.value = result.total;
    page.value = result.page;
    asOf.value = result.asOf;
  }

  async function fetchAging(): Promise<void> {
    const result = await run(loading, () => treasuryApi.getPayablesAging(), false);
    if (result) aging.value = result;
  }

  async function fetchSupplier(supplierId: string): Promise<void> {
    statement.value = null;
    const result = await run(loading, () => treasuryApi.getSupplierStatement(supplierId), false);
    if (result) statement.value = result;
  }

  async function loadOpeningBalances(input: PayableOpeningBalanceInput): Promise<PayableOpeningBalanceLoad> {
    return (await run(saving, () => treasuryApi.loadPayableOpeningBalances(input), true))!;
  }

  // ── Pagos ──
  async function fetchPayments(filters: PaymentFilters = {}): Promise<void> {
    const result = await run(loading, () => treasuryApi.listPayments({ page: paymentsPage.value, pageSize: pageSize.value, ...filters }), false);
    if (!result) return;
    payments.value = result.items;
    paymentsTotal.value = result.total;
    paymentsPage.value = result.page;
  }

  async function fetchPayment(id: string): Promise<void> {
    currentPayment.value = null;
    const payment = await run(loading, () => treasuryApi.getPayment(id), false);
    if (payment) currentPayment.value = payment;
  }

  /** Crea (sin id) o edita un borrador, y lo deja como el pago actual. */
  async function savePayment(id: string | null, input: PaymentCreateInput | (PaymentInput & { expectedVersion?: number })): Promise<Payment> {
    const payment = await run(saving, () => (id ? treasuryApi.updatePayment(id, input as PaymentInput) : treasuryApi.createPayment(input as PaymentCreateInput)), true);
    currentPayment.value = payment!;
    return payment!;
  }

  async function approvePayment(id: string): Promise<Payment> {
    const payment = await run(saving, () => treasuryApi.approvePayment(id), true);
    currentPayment.value = payment!;
    return payment!;
  }

  async function postPayment(id: string): Promise<Payment> {
    const payment = await run(saving, () => treasuryApi.postPayment(id), true);
    currentPayment.value = payment!;
    return payment!;
  }

  async function voidPayment(id: string, reason: string): Promise<Payment> {
    const payment = await run(saving, () => treasuryApi.voidPayment(id, reason), true);
    currentPayment.value = payment!;
    return payment!;
  }

  /** El umbral de aprobación solo lo puede leer quien lo gestiona (`payment:approve`): para los demás queda en `null` (sin aprobación visible). */
  async function fetchSettings(): Promise<void> {
    const result = await run(loading, () => treasuryApi.getPaymentSettings(), false);
    if (result) settings.value = result;
  }

  async function saveSettings(approvalThresholdCents: number | null): Promise<PaymentSettings> {
    const saved = await run(saving, () => treasuryApi.setPaymentSettings(approvalThresholdCents), true);
    settings.value = saved!;
    return saved!;
  }

  // ── Exportar ──
  async function exportPayables(filters: PayableFilters, lang: string): Promise<Blob | undefined> {
    return run(loading, () => treasuryApi.exportPayables(filters, lang), false);
  }
  async function exportAging(lang: string): Promise<Blob | undefined> {
    return run(loading, () => treasuryApi.exportPayablesAging(lang), false);
  }
  async function exportStatement(supplierId: string, lang: string): Promise<Blob | undefined> {
    return run(loading, () => treasuryApi.exportSupplierStatement(supplierId, lang), false);
  }

  return {
    payables, total, page, pageSize, asOf, aging, statement, payments, paymentsTotal, paymentsPage, currentPayment, settings, loading, saving, error,
    fetchPayables, fetchAging, fetchSupplier, loadOpeningBalances,
    fetchPayments, fetchPayment, savePayment, approvePayment, postPayment, voidPayment, fetchSettings, saveSettings,
    exportPayables, exportAging, exportStatement,
  };
});
