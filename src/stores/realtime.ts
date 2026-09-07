import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { notificationApi } from '@/api/notifications';
import type { AppNotification } from '@/types/notifications';

export interface RealtimeNotification {
  id: string;
  event: string;
  /** Clave i18n; se traduce al renderizar, no al recibir el evento. */
  titleKey: string;
  detail: string;
  at: number;
  read: boolean;
  /** false = solo vive en esta pestaña (eventos de plugin, que no son
   *  providers de notificación y por tanto no se persisten en el servidor). */
  persisted: boolean;
  data: Record<string, unknown>;
}

/**
 * Clave i18n por evento. Se guarda la clave, no el texto ya traducido: la
 * notificación puede quedar en la bandeja mientras el usuario cambia de idioma.
 */
const EVENT_TITLE_KEYS: Record<string, string> = {
  'plugin.activated': 'notifications.pluginActivated',
  'plugin.deactivated': 'notifications.pluginDeactivated',
  'plugin.created': 'notifications.customPluginReady',
  'plugin.custom_request.created': 'notifications.requestSent',
  'plugin.custom_request.fulfilled': 'notifications.requestFulfilled',
  'plugin.custom_request.rejected': 'notifications.requestRejected',
  // Providers de notification-service (canal app): estos sí se persisten y
  // llegan por REST; el socket solo avisa de que hay algo nuevo.
  'identity.user.invited': 'notifications.invited',
  'identity.user.enabled': 'notifications.accountEnabled',
  'identity.user.disabled': 'notifications.accountDisabled',
  'identity.user.password_reset_requested': 'notifications.passwordResetRequested',
  'billing.invoice.issued': 'notifications.invoiceIssued',
  'billing.invoice.voided': 'notifications.invoiceVoided',
};

/**
 * Destino del click. Cada evento lleva al elemento del que habla; si el payload
 * no trae con qué construir la ruta, se cae a la vista de la sección. Devolver
 * null significa "no navegues" (la notificación es solo informativa).
 */
export function routeForEvent(
  event: string,
  data: Record<string, unknown>,
): string | null {
  if (event.startsWith('billing.invoice.')) {
    const id = typeof data.invoiceId === 'string' ? data.invoiceId : null;
    return id ? `/invoices/${id}` : '/invoices';
  }
  if (event.startsWith('plugin.')) return '/plugins';
  // Los identity.* de la campana (cuenta activada/desactivada) hablan de la
  // cuenta del propio usuario.
  if (event.startsWith('identity.')) return '/settings';
  return null;
}

/** Texto de apoyo bajo el título, con lo que traiga el payload de cada evento. */
function detailFor(event: string, data: Record<string, unknown>): string {
  if (event.startsWith('billing.invoice.')) {
    return typeof data.number === 'string' ? data.number : '';
  }
  if (event.startsWith('identity.')) {
    return typeof data.organizationName === 'string' ? data.organizationName : '';
  }
  return typeof data.code === 'string' ? data.code : '';
}

function fromServer(n: AppNotification): RealtimeNotification {
  return {
    id: n.id,
    event: n.event,
    titleKey: EVENT_TITLE_KEYS[n.event] ?? 'notifications.pluginsUpdate',
    detail: detailFor(n.event, n.data),
    at: new Date(n.createdAt).getTime(),
    read: n.read,
    persisted: true,
    data: n.data,
  };
}

export const useRealtimeStore = defineStore('realtime', () => {
  /** Persistidas (servidor) y efímeras (plugins) se guardan aparte y se
   *  mezclan al leer: así un refetch no borra lo que llegó por socket. */
  const stored = ref<RealtimeNotification[]>([]);
  const ephemeral = ref<RealtimeNotification[]>([]);
  /** No leídas en servidor: puede ser mayor que las descargadas en la página. */
  const storedUnread = ref(0);
  const loading = ref(false);

  const items = computed(() =>
    [...stored.value, ...ephemeral.value].sort((a, b) => b.at - a.at),
  );

  const unread = computed(
    () => storedUnread.value + ephemeral.value.filter((n) => !n.read).length,
  );

  /** Lee la bandeja del servidor. Es la fuente de verdad del estado de leído. */
  async function fetchNotifications(): Promise<void> {
    loading.value = true;
    try {
      const data = await notificationApi.list({ limit: 20 });
      stored.value = data.notifications.map(fromServer);
      storedUnread.value = data.unread;
    } catch {
      // Sin bandeja el resto de la app sigue funcionando: la campana se queda
      // con lo que ya tuviera en vez de romper la barra superior.
    } finally {
      loading.value = false;
    }
  }

  /** Evento `notification` del socket: el servidor la persiste, así que en vez
   *  de construirla en cliente (id inventado, sin leído) se recarga.
   *
   *  El gateway (que emite) y notification-service (que persiste) consumen el
   *  evento en paralelo, así que el aviso puede adelantarse al INSERT. Se
   *  reintenta una vez para no dejar la campana desfasada hasta que el usuario
   *  la abra; si aun así se pierde, el fetch de `onOpen` la recupera. */
  function onIncoming(): void {
    void fetchNotifications();
    setTimeout(() => void fetchNotifications(), 1500);
  }

  /** Eventos de plugin: no son providers, no se persisten, viven en memoria. */
  function pushPluginEvent(data: Record<string, unknown>): void {
    const event = String(data.event ?? '');
    ephemeral.value.unshift({
      id: crypto.randomUUID(),
      event,
      titleKey: EVENT_TITLE_KEYS[event] ?? 'notifications.pluginsUpdate',
      detail: detailFor(event, data),
      at: Date.now(),
      read: false,
      persisted: false,
      data,
    });
    if (ephemeral.value.length > 20) ephemeral.value.pop();
  }

  async function markRead(item: RealtimeNotification): Promise<void> {
    if (item.read) return;
    item.read = true;
    if (!item.persisted) return;
    storedUnread.value = Math.max(0, storedUnread.value - 1);
    try {
      await notificationApi.markRead(item.id);
    } catch {
      // Se revierte para no mentir sobre el estado: el próximo fetch manda.
      item.read = false;
      storedUnread.value += 1;
    }
  }

  async function markAllRead(): Promise<void> {
    for (const n of ephemeral.value) n.read = true;
    if (storedUnread.value === 0) return;
    const previous = storedUnread.value;
    storedUnread.value = 0;
    for (const n of stored.value) n.read = true;
    try {
      await notificationApi.markAllRead();
    } catch {
      storedUnread.value = previous;
      await fetchNotifications();
    }
  }

  function clear(): void {
    stored.value = [];
    ephemeral.value = [];
    storedUnread.value = 0;
  }

  return {
    items,
    unread,
    loading,
    fetchNotifications,
    onIncoming,
    pushPluginEvent,
    markRead,
    markAllRead,
    clear,
  };
});
