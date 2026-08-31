import { ref } from 'vue';
import { defineStore } from 'pinia';

export interface RealtimeNotification {
  id: string;
  event: string;
  /** Clave i18n; se traduce al renderizar, no al recibir el evento. */
  titleKey: string;
  detail: string;
  at: number;
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
};

export const useRealtimeStore = defineStore('realtime', () => {
  const items = ref<RealtimeNotification[]>([]);
  const unread = ref(0);

  function pushPluginEvent(data: Record<string, unknown>): void {
    const event = String(data.event ?? '');
    items.value.unshift({
      id: crypto.randomUUID(),
      event,
      titleKey: EVENT_TITLE_KEYS[event] ?? 'notifications.pluginsUpdate',
      detail: typeof data.code === 'string' ? String(data.code) : '',
      at: Date.now(),
    });
    if (items.value.length > 20) items.value.pop();
    unread.value += 1;
  }

  function markAllRead(): void {
    unread.value = 0;
  }

  function clear(): void {
    items.value = [];
    unread.value = 0;
  }

  return { items, unread, pushPluginEvent, markAllRead, clear };
});
