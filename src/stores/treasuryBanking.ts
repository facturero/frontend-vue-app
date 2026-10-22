import { defineStore } from 'pinia';
import { ref } from 'vue';
import { treasuryApi } from '@/api/treasury';
import { extractError } from '@/utils/error';
import type {
  BankAccount,
  BankAccountDetail,
  BankAccountInput,
  BankAccountSummary,
  BankAdjustmentInput,
  BankLine,
  BankLineView,
  BankMovement,
  BankMovementView,
  BankReconciliation,
  BankSuggestion,
  BatchMatchResult,
  CashFlow,
  ReconciliationPreview,
  StatementBody,
  StatementImportResult,
  StatementPreview,
} from '@/types/treasury';

/**
 * Bancos, extractos y conciliación. Mismo criterio que los demás stores de tesorería: cada lectura deja el mensaje del servidor en `error`
 * y cada escritura lo deja Y vuelve a lanzar para que la vista decida qué mostrar (un 409 de «ya emparejado» se muestra junto al botón).
 */
export const useTreasuryBankingStore = defineStore('treasuryBanking', () => {
  const accounts = ref<BankAccountSummary[]>([]);
  const unassignedMovements = ref(0);
  const detail = ref<BankAccountDetail | null>(null);
  const lines = ref<BankLineView[]>([]);
  const linesTotal = ref(0);
  const movements = ref<BankMovementView[]>([]);
  const suggestions = ref<BankSuggestion[]>([]);
  const preview = ref<ReconciliationPreview | null>(null);
  const reconciliations = ref<BankReconciliation[]>([]);
  const cashFlow = ref<CashFlow | null>(null);
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

  async function fetchAccounts(activeOnly = false): Promise<void> {
    const out = await run(loading, () => treasuryApi.listBankAccounts(activeOnly), false);
    if (!out) return;
    accounts.value = out.items;
    unassignedMovements.value = out.unassignedMovements;
  }

  async function fetchAccount(id: string): Promise<void> {
    detail.value = null;
    const out = await run(loading, () => treasuryApi.getBankAccount(id), false);
    if (out) detail.value = out;
  }

  const createAccount = async (input: BankAccountInput): Promise<BankAccount> => (await run(saving, () => treasuryApi.createBankAccount(input), true))!;
  const updateAccount = async (id: string, patch: Parameters<typeof treasuryApi.updateBankAccount>[1]): Promise<BankAccount> =>
    (await run(saving, () => treasuryApi.updateBankAccount(id, patch), true))!;

  const previewStatement = async (id: string, body: StatementBody): Promise<StatementPreview> => (await run(saving, () => treasuryApi.previewStatement(id, body), true))!;
  const importStatement = async (id: string, body: StatementBody): Promise<StatementImportResult> => (await run(saving, () => treasuryApi.importStatement(id, body), true))!;

  async function fetchLines(id: string, filters: Parameters<typeof treasuryApi.listBankLines>[1] = {}): Promise<void> {
    const out = await run(loading, () => treasuryApi.listBankLines(id, filters), false);
    if (!out) return;
    lines.value = out.items;
    linesTotal.value = out.total;
  }

  async function fetchMovements(filters: Parameters<typeof treasuryApi.listBankMovements>[0] = {}): Promise<BankMovementView[]> {
    const out = await run(loading, () => treasuryApi.listBankMovements(filters), false);
    if (!out) return [];
    movements.value = out.items;
    return out.items;
  }

  async function fetchSuggestions(id: string): Promise<void> {
    const out = await run(loading, () => treasuryApi.listBankSuggestions(id), false);
    if (out) suggestions.value = out;
  }

  async function fetchPreview(id: string, cutoffDate: string, statementBalanceCents?: number): Promise<void> {
    const out = await run(loading, () => treasuryApi.previewReconciliation(id, cutoffDate, statementBalanceCents), false);
    if (out) preview.value = out;
  }

  async function fetchReconciliations(id: string): Promise<void> {
    const out = await run(loading, () => treasuryApi.listReconciliations(id), false);
    if (out) reconciliations.value = out;
  }

  const assignMovementAccount = async (movementId: string, bankAccountId: string): Promise<BankMovement> =>
    (await run(saving, () => treasuryApi.assignMovementAccount(movementId, bankAccountId), true))!;
  const matchLine = async (lineId: string, movementIds: string[]): Promise<BankLineView> => (await run(saving, () => treasuryApi.matchLine(lineId, movementIds), true))!;
  const matchMany = async (pairs: { lineId: string; movementIds: string[] }[]): Promise<BatchMatchResult> => (await run(saving, () => treasuryApi.matchMany(pairs), true))!;
  const unmatchLine = async (lineId: string): Promise<BankLine> => (await run(saving, () => treasuryApi.unmatchLine(lineId), true))!;
  const markLineExternal = async (lineId: string, reason: string): Promise<BankLine> => (await run(saving, () => treasuryApi.markLineExternal(lineId, reason), true))!;
  const unmarkLineExternal = async (lineId: string): Promise<BankLine> => (await run(saving, () => treasuryApi.unmarkLineExternal(lineId), true))!;
  const postAdjustment = async (body: BankAdjustmentInput): Promise<BankMovement> => (await run(saving, () => treasuryApi.postBankAdjustment(body), true))!;
  const voidAdjustment = async (id: string, reason: string): Promise<BankMovement> => (await run(saving, () => treasuryApi.voidBankAdjustment(id, reason), true))!;
  const closeReconciliation = async (id: string, body: { cutoffDate: string; statementBalanceCents: number; notes?: string | null }): Promise<BankReconciliation> =>
    (await run(saving, () => treasuryApi.closeReconciliation(id, body), true))!;
  const reopenReconciliation = async (reconciliationId: string, reason: string): Promise<BankReconciliation> =>
    (await run(saving, () => treasuryApi.reopenReconciliation(reconciliationId, reason), true))!;

  async function fetchCashFlow(weeks?: number): Promise<void> {
    const out = await run(loading, () => treasuryApi.getCashFlow(weeks), false);
    if (out) cashFlow.value = out;
  }
  async function exportCashFlow(weeks: number | undefined, lang: string): Promise<Blob | undefined> {
    return run(loading, () => treasuryApi.exportCashFlow(weeks, lang), false);
  }

  return {
    accounts,
    unassignedMovements,
    detail,
    lines,
    linesTotal,
    movements,
    suggestions,
    preview,
    reconciliations,
    cashFlow,
    loading,
    saving,
    error,
    fetchAccounts,
    fetchAccount,
    createAccount,
    updateAccount,
    previewStatement,
    importStatement,
    fetchLines,
    fetchMovements,
    fetchSuggestions,
    fetchPreview,
    fetchReconciliations,
    assignMovementAccount,
    matchLine,
    matchMany,
    unmatchLine,
    markLineExternal,
    unmarkLineExternal,
    postAdjustment,
    voidAdjustment,
    closeReconciliation,
    reopenReconciliation,
    fetchCashFlow,
    exportCashFlow,
  };
});
