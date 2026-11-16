import { http } from '@/utils/http';
import type {
  FeedbackDetail,
  FeedbackKind,
  FeedbackPage,
  FeedbackReply,
  FeedbackStatus,
  OrganizationBalance,
  PointsEntry,
  RespondInput,
  SubmitFeedbackInput,
} from '@/types/feedback';

/** Comentarios, mejoras y puntos (feedback-service, por el gateway en `/feedback/*`). */
export const feedbackApi = {
  // ── La persona ──
  submit: (input: SubmitFeedbackInput) => http.post('/feedback', input).then((r) => r.data),
  mine: (params: { cursor?: string; limit?: number } = {}) => http.get<FeedbackPage>('/feedback', { params }).then((r) => r.data),
  get: (id: string) => http.get<FeedbackDetail>(`/feedback/${id}`).then((r) => r.data),
  reply: (id: string, body: string) => http.post<FeedbackReply>(`/feedback/${id}/replies`, { body }).then((r) => r.data),
  unread: () => http.get<{ count: number }>('/feedback/unread').then((r) => r.data.count),
  points: () => http.get<{ balance: number; entries: PointsEntry[] }>('/feedback/points').then((r) => r.data),

  // ── El dueño de la plataforma (`feedback:manage`) ──
  adminList: (params: { status?: FeedbackStatus; kind?: FeedbackKind; organizationId?: string; unread?: boolean; q?: string; cursor?: string; limit?: number } = {}) =>
    http.get<FeedbackPage>('/feedback/admin/items', { params: { ...params, unread: params.unread ? 'true' : undefined } }).then((r) => r.data),
  adminGet: (id: string) => http.get<FeedbackDetail>(`/feedback/admin/items/${id}`).then((r) => r.data),
  respond: (id: string, input: RespondInput) => http.post<FeedbackDetail>(`/feedback/admin/items/${id}/respond`, input).then((r) => r.data),
  adminUnread: () => http.get<{ count: number }>('/feedback/admin/unread').then((r) => r.data.count),
  suggestions: () => http.get<{ points: Partial<Record<FeedbackStatus, number>> }>('/feedback/admin/suggestions').then((r) => r.data.points),
  balances: () => http.get<{ items: OrganizationBalance[] }>('/feedback/admin/points').then((r) => r.data.items),
  adjust: (input: { organizationId: string; amount: number; reason: string; idempotencyKey: string }) =>
    http.post<PointsEntry>('/feedback/admin/points', input).then((r) => r.data),
};
