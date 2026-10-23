import { http } from '@/utils/http';
import { unwrapBlobError } from '@/utils/reporting';
import type {
  AnnexType,
  DocumentFilters,
  GenerateResult,
  ManualInputs,
  Paged,
  Reconciliation,
  ReportDocumentRow,
  RunDetail,
  RunFilters,
  RunSummary,
} from '@/types/reporting';

const base = '/reporting';

/** Quita lo que no se llenó: un parámetro vacío en la URL no es lo mismo que no mandarlo. */
const clean = (params: object) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export const reportingApi = {
  listRuns: (filters: RunFilters) => http.get<Paged<RunSummary>>(`${base}/annexes/runs`, { params: clean(filters) }).then((r) => r.data),
  getRun: (id: string) => http.get<RunDetail>(`${base}/annexes/runs/${id}`).then((r) => r.data),
  generate: (annex: AnnexType, period: string) => http.post<GenerateResult>(`${base}/annexes/${annex}/${period}/generate`, {}).then((r) => r.data),
  reconciliation: (annex: AnnexType, period: string) => http.get<Reconciliation>(`${base}/annexes/${annex}/${period}/reconciliation`).then((r) => r.data),
  manualInputs: (annex: AnnexType, period: string) => http.get<ManualInputs>(`${base}/annexes/${annex}/${period}/manual-inputs`).then((r) => r.data),
  setManualInput: (annex: AnnexType, period: string, fieldCode: string, amountCents: number) =>
    http.put<{ fieldCode: string; amountCents: number; needsRegeneration: boolean }>(`${base}/annexes/${annex}/${period}/manual-inputs/${fieldCode}`, { amountCents }).then((r) => r.data),
  /** El archivo llega como Blob: el servidor lo manda con BOM y no debe pasar por `JSON.parse`. */
  exportRun: (id: string, format: 'csv' | 'xml') =>
    http
      .get<Blob>(`${base}/annexes/runs/${id}/export`, { params: { format }, responseType: 'blob' })
      .then((r) => r.data)
      .catch(async (err) => {
        throw await unwrapBlobError(err);
      }),
  listDocuments: (filters: DocumentFilters) => http.get<Paged<ReportDocumentRow>>(`${base}/documents`, { params: clean(filters) }).then((r) => r.data),
};
