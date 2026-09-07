import { http } from '@/utils/http';
import type {
  AppNotificationListResponse,
  NotificationPreferencesPutBody,
  NotificationPreferencesResponse,
  NotificationProviderCatalog,
} from '@/types/notifications';

export const notificationApi = {
  // Bandeja in-app: el socket solo avisa, la lista y el leído son del servidor.
  list: (params: { read?: boolean; limit?: number } = {}) =>
    http
      .get<AppNotificationListResponse>('/notifications', { params })
      .then((r) => r.data),

  markRead: (id: string) =>
    http.post<{ ok: true }>(`/notifications/${id}/read`).then((r) => r.data),

  markAllRead: () =>
    http.post<{ updated: number }>('/notifications/read-all').then((r) => r.data),

  // Catálogo de providers (qué eventos pueden notificar y en qué canales).
  providers: () =>
    http
      .get<NotificationProviderCatalog>('/notifications/providers')
      .then((r) => r.data),

  // Preferencias efectivas del usuario actual (pref guardado ?? default).
  myPreferences: () =>
    http
      .get<NotificationPreferencesResponse>('/notifications/me/preferences')
      .then((r) => r.data),

  // Guarda preferencias; devuelve las efectivas tras aplicar.
  savePreferences: (body: NotificationPreferencesPutBody) =>
    http
      .put<NotificationPreferencesResponse>('/notifications/me/preferences', body)
      .then((r) => r.data),
};