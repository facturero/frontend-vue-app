import { defineStore } from 'pinia';
import { ref } from 'vue';
import { auditApi } from '@/api/audit';
import { extractError } from '@/utils/error';
import type {
  AuditLogDetail,
  AuditLogEntry,
  AuditLogListParams,
  AuditSummary,
} from '@/types/audit';

/**
 * Bitácora de auditoría. A diferencia del resto de listados de la app, la
 * paginación es de SERVIDOR: la tabla crece sin techo (registra todo lo que
 * pasa por `crm.events`), así que traerla entera al cliente no es viable.
 */
export const useAuditStore = defineStore('audit', () => {
  const items = ref<AuditLogEntry[]>([]);
  const total = ref(0);
  const current = ref<AuditLogDetail | null>(null);
  const summary = ref<AuditSummary | null>(null);
  const loading = ref(false);
  const loadingDetail = ref(false);
  const error = ref<string | null>(null);

  async function fetch(params: AuditLogListParams = {}): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const page = await auditApi.list(params);
      items.value = page.items;
      total.value = page.total;
    } catch (e) {
      error.value = extractError(e);
      items.value = [];
      total.value = 0;
    } finally {
      loading.value = false;
    }
  }

  async function fetchDetail(id: string): Promise<void> {
    loadingDetail.value = true;
    error.value = null;
    current.value = null;
    try {
      current.value = await auditApi.getById(id);
    } catch (e) {
      error.value = extractError(e);
    } finally {
      loadingDetail.value = false;
    }
  }

  async function fetchSummary(params: { from?: string; to?: string } = {}): Promise<void> {
    try {
      summary.value = await auditApi.summary(params);
    } catch (e) {
      // El resumen es accesorio: si falla, el listado sigue siendo útil.
      error.value = extractError(e);
    }
  }

  function clearDetail(): void {
    current.value = null;
  }

  return {
    items, total, current, summary, loading, loadingDetail, error,
    fetch, fetchDetail, fetchSummary, clearDetail,
  };
});
