export type NotificationChannel = 'app' | 'smtp';

// Provider del catálogo de notification-service (estilo Moodle): un evento o
// caso declarado por un plugin. `pluginCode` cruza contra los plugins activos
// de la org para saber si el provider aplica en el plan actual.
export interface NotificationProvider {
  code: string;
  pluginCode: string;
  nameKey: string;
  descriptionKey: string;
  channels: NotificationChannel[];
  defaults: Record<NotificationChannel, boolean>;
}

export interface NotificationProviderCatalog {
  providers: NotificationProvider[];
  channels: NotificationChannel[];
}

// Preferencias efectivas del usuario (GET /notifications/me/preferences):
// providers en un solo objeto con sus canales ya resueltos (pref ?? default).
export interface NotificationPrefEntry {
  providerCode: string;
  channels: Record<NotificationChannel, boolean>;
}

export interface NotificationPreferencesResponse {
  preferences: NotificationPrefEntry[];
}

// Cuerpo de PUT: canales omitidos = no tocar; null = volver al default.
export interface NotificationPrefUpdate {
  providerCode: string;
  app?: boolean | null;
  smtp?: boolean | null;
}

export interface NotificationPreferencesPutBody {
  preferences: NotificationPrefUpdate[];
}

// Notificación in-app persistida (GET /notifications). `event` es la routing
// key del provider; `data` es el subconjunto seguro que el servidor guardó,
// con lo justo para pintar el texto y resolver el deep-link.
export interface AppNotification {
  id: string;
  event: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface AppNotificationListResponse {
  notifications: AppNotification[];
  /** No leídas totales del usuario, no solo las de esta página. */
  unread: number;
}