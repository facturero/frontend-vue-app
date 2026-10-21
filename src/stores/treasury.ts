import { defineStore } from 'pinia';
import { ref } from 'vue';
import { treasuryApi } from '@/api/treasury';
import { extractError } from '@/utils/error';
import type {
  AgingReport,
  CustomerStatement,
  CustomerTerms,
  CustomerTermsInput,
  OpeningBalanceInput,
  OpeningBalanceLoad,
  Receipt,
  ReceiptCreateInput,
  ReceiptFilters,
  ReceiptInput,
  Receivable,
  ReceivableFilters,
  ReminderPreview,
  ReminderRun,
  ReminderSettings,
  ReminderSettingsInput,
} from '@/types/treasury';

/** Cartera, antigüedad, estado de cuenta y condiciones de crédito. Cada acción deja el mensaje del servidor en `error` y vuelve a lanzar, para que la vista decida. */
export const useTreasuryStore = defineStore('treasury', () => {
  const receivables = ref<Receivable[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(25);
  /** Fecha de corte del servidor: la que decide qué está vencido (no el reloj de quien mira). */
  const asOf = ref<string | null>(null);
  const aging = ref<AgingReport | null>(null);
  const statement = ref<CustomerStatement | null>(null);
  const terms = ref<CustomerTerms | null>(null);
  const receipts = ref<Receipt[]>([]);
  const receiptsTotal = ref(0);
  const receiptsPage = ref(1);
  const currentReceipt = ref<Receipt | null>(null);
  const reminderSettings = ref<ReminderSettings | null>(null);
  const reminderPreview = ref<ReminderPreview | null>(null);
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

  async function fetchReceivables(filters: ReceivableFilters = {}): Promise<void> {
    const result = await run(loading, () => treasuryApi.listReceivables({ page: page.value, pageSize: pageSize.value, ...filters }), false);
    if (!result) return;
    receivables.value = result.items;
    total.value = result.total;
    page.value = result.page;
    asOf.value = result.asOf;
  }

  async function fetchAging(): Promise<void> {
    const result = await run(loading, () => treasuryApi.getAging(), false);
    if (result) aging.value = result;
  }

  /** El estado de cuenta y las condiciones se piden juntos: la pantalla los muestra a la vez. */
  async function fetchCustomer(customerId: string): Promise<void> {
    statement.value = null;
    terms.value = null;
    const result = await run(loading, () => Promise.all([treasuryApi.getStatement(customerId), treasuryApi.getTerms(customerId)]), false);
    if (!result) return;
    statement.value = result[0];
    terms.value = result[1];
  }

  async function saveTerms(customerId: string, input: CustomerTermsInput): Promise<CustomerTerms> {
    const saved = await run(saving, () => treasuryApi.setTerms(customerId, input), true);
    terms.value = saved!;
    return saved!;
  }

  async function loadOpeningBalances(input: OpeningBalanceInput): Promise<OpeningBalanceLoad> {
    return (await run(saving, () => treasuryApi.loadOpeningBalances(input), true))!;
  }

  // ── Cobros ──
  async function fetchReceipts(filters: ReceiptFilters = {}): Promise<void> {
    const result = await run(loading, () => treasuryApi.listReceipts({ page: receiptsPage.value, pageSize: pageSize.value, ...filters }), false);
    if (!result) return;
    receipts.value = result.items;
    receiptsTotal.value = result.total;
    receiptsPage.value = result.page;
  }

  async function fetchReceipt(id: string): Promise<void> {
    currentReceipt.value = null;
    const receipt = await run(loading, () => treasuryApi.getReceipt(id), false);
    if (receipt) currentReceipt.value = receipt;
  }

  /** Crea (sin id) o edita un borrador, y lo deja como el cobro actual. */
  async function saveReceipt(id: string | null, input: ReceiptCreateInput | (ReceiptInput & { expectedVersion?: number })): Promise<Receipt> {
    const receipt = await run(saving, () => (id ? treasuryApi.updateReceipt(id, input as ReceiptInput) : treasuryApi.createReceipt(input as ReceiptCreateInput)), true);
    currentReceipt.value = receipt!;
    return receipt!;
  }

  async function postReceipt(id: string): Promise<Receipt> {
    const receipt = await run(saving, () => treasuryApi.postReceipt(id), true);
    currentReceipt.value = receipt!;
    return receipt!;
  }

  async function voidReceipt(id: string, reason: string): Promise<Receipt> {
    const receipt = await run(saving, () => treasuryApi.voidReceipt(id, reason), true);
    currentReceipt.value = receipt!;
    return receipt!;
  }

  // ── Exportar y recordatorios ──
  /** Devuelve el archivo CSV; la vista lo descarga. El servidor deja el evento en la bitácora. */
  async function exportReceivables(filters: ReceivableFilters, lang: string): Promise<Blob | undefined> {
    return run(loading, () => treasuryApi.exportReceivables(filters, lang), false);
  }
  async function exportAging(lang: string): Promise<Blob | undefined> {
    return run(loading, () => treasuryApi.exportAging(lang), false);
  }
  async function exportStatement(customerId: string, lang: string): Promise<Blob | undefined> {
    return run(loading, () => treasuryApi.exportStatement(customerId, lang), false);
  }

  async function fetchReminders(): Promise<void> {
    const result = await run(loading, () => Promise.all([treasuryApi.getReminderSettings(), treasuryApi.getReminderPreview()]), false);
    if (!result) return;
    reminderSettings.value = result[0];
    reminderPreview.value = result[1];
  }
  async function saveReminderSettings(input: ReminderSettingsInput): Promise<ReminderSettings> {
    const saved = await run(saving, () => treasuryApi.setReminderSettings(input), true);
    reminderSettings.value = saved!;
    return saved!;
  }
  /** Envía los recordatorios de hoy y vuelve a pedir la vista previa (lo avisado ya no vuelve a aparecer). */
  async function runReminders(): Promise<ReminderRun> {
    const result = await run(saving, () => treasuryApi.runReminders(), true);
    reminderPreview.value = (await run(loading, () => treasuryApi.getReminderPreview(), false)) ?? reminderPreview.value;
    return result!;
  }

  return { reminderSettings, reminderPreview, exportReceivables, exportAging, exportStatement, fetchReminders, saveReminderSettings, runReminders, receipts, receiptsTotal, receiptsPage, currentReceipt, fetchReceipts, fetchReceipt, saveReceipt, postReceipt, voidReceipt, receivables, total, page, pageSize, asOf, aging, statement, terms, loading, saving, error, fetchReceivables, fetchAging, fetchCustomer, saveTerms, loadOpeningBalances };
});
