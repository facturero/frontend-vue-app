import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { accountingApi } from '@/api/accounting';
import { extractError } from '@/utils/error';
import type {
  Account,
  BalanceSheet,
  IncomeStatement,
  AccountInput,
  AccountingSettings,
  ActiveStatus,
  CostCenter,
  EntryFilters,
  EntryInput,
  FiscalYear,
  JournalEntry,
  Ledger,
  PendingPosting,
  PendingStatus,
  PostingSettingsInput,
  PostingSettingsResponse,
  SetupInput,
  TrialBalance,
} from '@/types/accounting';

/** Hoy en la fecha local del navegador (`YYYY-MM-DD`). */
export function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Contabilidad general: configuración, plan de cuentas, centros de costo, ejercicios, asientos e informes. Un asiento contabilizado
 * nunca se edita aquí: la pantalla ofrece reversarlo.
 */
export const useAccountingStore = defineStore('accounting', () => {
  const configured = ref<boolean | null>(null);
  const settings = ref<AccountingSettings | null>(null);
  const accounts = ref<Account[]>([]);
  const costCenters = ref<CostCenter[]>([]);
  const years = ref<FiscalYear[]>([]);
  const entries = ref<JournalEntry[]>([]);
  const entriesTotal = ref(0);
  const trialBalance = ref<TrialBalance | null>(null);
  const ledger = ref<Ledger | null>(null);
  const balanceSheet = ref<BalanceSheet | null>(null);
  const incomeStatement = ref<IncomeStatement | null>(null);
  const posting = ref<PostingSettingsResponse | null>(null);
  const pending = ref<PendingPosting[]>([]);
  const pendingTotal = ref(0);
  /** Cuántos eventos esperan a una persona: es el globo de la pestaña «Automática». */
  const pendingCount = computed(() => posting.value?.pendingCount ?? 0);

  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  const currency = computed(() => settings.value?.baseCurrency ?? 'USD');
  const accountById = computed(() => new Map(accounts.value.map((a) => [a.id, a])));

  async function run<T>(fn: () => Promise<T>, isWrite = false): Promise<T> {
    if (isWrite) saving.value = true;
    else loading.value = true;
    error.value = null;
    try {
      return await fn();
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      if (isWrite) saving.value = false;
      else loading.value = false;
    }
  }

  async function fetchSettings(): Promise<void> {
    const res = await run(() => accountingApi.getSettings());
    configured.value = res.configured;
    settings.value = res.settings;
  }

  async function setup(body: SetupInput): Promise<void> {
    await run(() => accountingApi.setup(body), true);
    await fetchSettings();
  }

  async function fetchAccounts(): Promise<void> {
    accounts.value = await run(() => accountingApi.listAccounts());
  }

  async function createAccount(body: AccountInput): Promise<Account> {
    const created = await run(() => accountingApi.createAccount(body), true);
    // El padre pudo pasar a ser de agrupación: se recarga el plan completo.
    await fetchAccounts();
    return created;
  }

  async function updateAccount(id: string, body: { name?: string; status?: ActiveStatus; systemRole?: string | null }): Promise<void> {
    const updated = await run(() => accountingApi.updateAccount(id, body), true);
    accounts.value = accounts.value.map((a) => (a.id === id ? updated : a));
    // Mover un rol deja sin él a otra cuenta: se recarga el plan completo.
    if (body.systemRole !== undefined) await fetchAccounts();
  }

  async function fetchCostCenters(): Promise<void> {
    costCenters.value = await run(() => accountingApi.listCostCenters());
  }

  async function createCostCenter(body: { code: string; name: string }): Promise<void> {
    await run(() => accountingApi.createCostCenter(body), true);
    await fetchCostCenters();
  }

  async function updateCostCenter(id: string, body: { name?: string; status?: ActiveStatus }): Promise<void> {
    const updated = await run(() => accountingApi.updateCostCenter(id, body), true);
    costCenters.value = costCenters.value.map((c) => (c.id === id ? updated : c));
  }

  async function fetchYears(): Promise<void> {
    years.value = await run(() => accountingApi.listFiscalYears());
  }

  async function createYear(year: number): Promise<void> {
    await run(() => accountingApi.createFiscalYear(year), true);
    await fetchYears();
  }

  async function closePeriod(id: string): Promise<void> {
    await run(() => accountingApi.closePeriod(id), true);
    await fetchYears();
  }

  async function reopenPeriod(id: string): Promise<void> {
    await run(() => accountingApi.reopenPeriod(id), true);
    await fetchYears();
  }

  async function fetchEntries(filters: EntryFilters): Promise<void> {
    const res = await run(() => accountingApi.listEntries(filters));
    entries.value = res.items;
    entriesTotal.value = res.total;
  }

  const getEntry = (id: string) => run(() => accountingApi.getEntry(id));
  const createEntry = (body: EntryInput & { post: boolean }) => run(() => accountingApi.createEntry(body), true);
  const updateEntry = (id: string, body: EntryInput) => run(() => accountingApi.updateEntry(id, body), true);
  const deleteEntry = (id: string) => run(() => accountingApi.deleteEntry(id), true);
  const postEntry = (id: string) => run(() => accountingApi.postEntry(id), true);
  const reverseEntry = (id: string, body: { reason: string; entryDate?: string }) => run(() => accountingApi.reverseEntry(id, body), true);

  async function fetchPosting(): Promise<void> {
    posting.value = await run(() => accountingApi.postingSettings());
  }

  /** Para el globo de las pestañas: no debe mostrar un error si falla (la pestaña funciona igual). */
  async function refreshPendingCount(): Promise<void> {
    try {
      posting.value = await accountingApi.postingSettings();
    } catch {
      /* sin globo */
    }
  }

  async function updatePosting(body: PostingSettingsInput): Promise<void> {
    await run(() => accountingApi.updatePostingSettings(body), true);
    await fetchPosting();
  }

  async function fetchPending(params: { status?: PendingStatus; page: number; pageSize: number }): Promise<void> {
    const res = await run(() => accountingApi.listPending(params));
    pending.value = res.items;
    pendingTotal.value = res.total;
  }

  async function retryPending(ids?: string[]) {
    const res = await run(() => accountingApi.retryPending(ids), true);
    await fetchPosting();
    return res;
  }

  async function discardPending(id: string, reason: string): Promise<void> {
    await run(() => accountingApi.discardPending(id, reason), true);
    await fetchPosting();
  }

  async function fetchTrialBalance(params: Parameters<typeof accountingApi.trialBalance>[0]): Promise<void> {
    trialBalance.value = await run(() => accountingApi.trialBalance(params));
  }

  async function fetchBalanceSheet(params: Parameters<typeof accountingApi.balanceSheet>[0]): Promise<void> {
    balanceSheet.value = await run(() => accountingApi.balanceSheet(params));
  }

  async function fetchIncomeStatement(params: Parameters<typeof accountingApi.incomeStatement>[0]): Promise<void> {
    incomeStatement.value = await run(() => accountingApi.incomeStatement(params));
  }

  async function fetchLedger(params: Parameters<typeof accountingApi.ledger>[0]): Promise<void> {
    ledger.value = await run(() => accountingApi.ledger(params));
  }

  return {
    configured,
    settings,
    accounts,
    costCenters,
    years,
    entries,
    entriesTotal,
    trialBalance,
    ledger,
    balanceSheet,
    incomeStatement,
    posting,
    pending,
    pendingTotal,
    pendingCount,
    loading,
    saving,
    error,
    currency,
    accountById,
    fetchSettings,
    setup,
    fetchAccounts,
    createAccount,
    updateAccount,
    fetchCostCenters,
    createCostCenter,
    updateCostCenter,
    fetchYears,
    createYear,
    closePeriod,
    reopenPeriod,
    fetchEntries,
    getEntry,
    createEntry,
    updateEntry,
    deleteEntry,
    postEntry,
    reverseEntry,
    fetchPosting,
    refreshPendingCount,
    updatePosting,
    fetchPending,
    retryPending,
    discardPending,
    fetchTrialBalance,
    fetchBalanceSheet,
    fetchIncomeStatement,
    fetchLedger,
  };
});
