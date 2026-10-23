import { defineStore } from 'pinia';
import { ref } from 'vue';
import { reportingApi } from '@/api/reporting';
import { extractError } from '@/utils/error';
import type {
  AnnexType,
  DocumentFilters,
  GenerateResult,
  ManualInputs,
  Reconciliation,
  ReportDocumentRow,
  RunDetail,
  RunFilters,
  RunSummary,
} from '@/types/reporting';

/**
 * Anexos del SRI. Mismo criterio que los stores de tesorería: cada lectura deja el mensaje del servidor en `error`, y cada escritura lo
 * deja Y vuelve a lanzar para que la vista decida qué mostrar (por ejemplo, el aviso de que el XML del ATS aún no está disponible).
 */
export const useReportingStore = defineStore('reporting', () => {
  const runs = ref<RunSummary[]>([]);
  const runsTotal = ref(0);
  const detail = ref<RunDetail | null>(null);
  const reconciliation = ref<Reconciliation | null>(null);
  /** Por qué no hay conciliación (sin versión, contabilidad caída…): se muestra junto a la tarjeta, no como error de toda la pantalla. */
  const reconciliationError = ref<string | null>(null);
  const manual = ref<ManualInputs | null>(null);
  const documents = ref<ReportDocumentRow[]>([]);
  const documentsTotal = ref(0);
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

  async function fetchRuns(filters: RunFilters = {}): Promise<void> {
    const out = await run(loading, () => reportingApi.listRuns({ pageSize: 50, ...filters }), false);
    if (!out) return;
    runs.value = out.items;
    runsTotal.value = out.total;
  }

  async function fetchDetail(id: string): Promise<void> {
    detail.value = null;
    reconciliation.value = null;
    reconciliationError.value = null;
    const out = await run(loading, () => reportingApi.getRun(id), false);
    if (out) detail.value = out;
  }

  /** Genera (o devuelve la última si nada cambió). La vista decide a dónde ir con el resultado. */
  async function generate(annex: AnnexType, period: string): Promise<GenerateResult> {
    const out = await run(saving, () => reportingApi.generate(annex, period), true);
    return out!;
  }

  async function fetchReconciliation(annex: AnnexType, period: string): Promise<void> {
    reconciliationError.value = null;
    reconciliation.value = null;
    loading.value = true;
    try {
      reconciliation.value = await reportingApi.reconciliation(annex, period);
    } catch (err) {
      reconciliationError.value = extractError(err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchManual(annex: AnnexType, period: string): Promise<void> {
    const out = await run(loading, () => reportingApi.manualInputs(annex, period), false);
    if (out) manual.value = out;
  }

  async function saveManual(annex: AnnexType, period: string, fieldCode: string, amountCents: number): Promise<void> {
    await run(saving, () => reportingApi.setManualInput(annex, period, fieldCode, amountCents), true);
    manual.value = await reportingApi.manualInputs(annex, period);
  }

  /** Devuelve el archivo; la vista lo descarga. Lanza si el servidor lo rechaza (el XML del ATS responde 501 hasta tener el esquema oficial). */
  async function exportRun(id: string, format: 'csv' | 'xml'): Promise<Blob> {
    const out = await run(loading, () => reportingApi.exportRun(id, format), true);
    return out!;
  }

  async function fetchDocuments(filters: DocumentFilters = {}): Promise<void> {
    const out = await run(loading, () => reportingApi.listDocuments({ pageSize: 50, ...filters }), false);
    if (!out) return;
    documents.value = out.items;
    documentsTotal.value = out.total;
  }

  return {
    runs, runsTotal, detail, reconciliation, reconciliationError, manual, documents, documentsTotal, loading, saving, error,
    fetchRuns, fetchDetail, generate, fetchReconciliation, fetchManual, saveManual, exportRun, fetchDocuments,
  };
});
