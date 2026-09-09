import { http } from '@/utils/http';
import type {
  AuditLogDetail,
  AuditLogListParams,
  AuditLogPage,
  AuditSummary,
} from '@/types/audit';

// Todas las rutas exigen el permiso `audit:read`; el gateway lo comprueba antes
// de enrutar, así que un usuario sin él recibe 403 sin llegar al servicio.
export const auditApi = {
  list: (params: AuditLogListParams = {}) =>
    http.get<AuditLogPage>('/audit-logs', { params }).then((r) => r.data),

  getById: (id: string) =>
    http.get<AuditLogDetail>(`/audit-logs/${id}`).then((r) => r.data),

  summary: (params: { from?: string; to?: string } = {}) =>
    http.get<AuditSummary>('/audit-logs/summary', { params }).then((r) => r.data),
};
