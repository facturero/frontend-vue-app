import { ref } from 'vue';
import { defineStore } from 'pinia';

export interface RealtimeNotification {
  id: string;
  event: string;
  title: string;
  detail: string;
  at: number;
}

const EVENT_TITLES: Record<string, string> = {
  'plugin.activated': 'Plugin activado',
  'plugin.deactivated': 'Plugin desactivado',
  'plugin.created': 'Tu plugin a medida está listo',
  'plugin.custom_request.created': 'Solicitud enviada',
  'plugin.custom_request.fulfilled': 'Solicitud atendida',
  'plugin.custom_request.rejected': 'Solicitud rechazada',
};

export const useRealtimeStore = defineStore('realtime', () => {
  const items = ref<RealtimeNotification[]>([]);
  const unread = ref(0);

  function pushPluginEvent(data: Record<string, unknown>): void {
    const event = String(data.event ?? '');
    items.value.unshift({
      id: crypto.randomUUID(),
      event,
      title: EVENT_TITLES[event] ?? 'Actualización de plugins',
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
