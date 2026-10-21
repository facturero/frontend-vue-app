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
  Receivable,
  ReceivableFilters,
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

  return { receivables, total, page, pageSize, asOf, aging, statement, terms, loading, saving, error, fetchReceivables, fetchAging, fetchCustomer, saveTerms, loadOpeningBalances };
});
