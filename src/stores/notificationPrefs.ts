import { ref } from 'vue';
import { defineStore } from 'pinia';
import { notificationApi } from '@/api/notifications';
import { extractError } from '@/utils/error';
import type {
  NotificationChannel,
  NotificationPrefUpdate,
  NotificationProvider,
} from '@/types/notifications';

// Preferencias de notificaciones del usuario (estilo Moodle: matriz de
// providers por plugin con toggles App/Email). El guardado es por proveedor;
// para recargar prefs se usa `fetchProviders` + `fetchPreferences`.
export const useNotificationPrefsStore = defineStore('notificationPrefs', () => {
  const providers = ref<NotificationProvider[]>([]);
  const preferences = ref<Record<string, Record<NotificationChannel, boolean>>>({});
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  /** Providers del catálogo, filtrados a los plugins activos de la org. */
  async function fetchProviders(): Promise<NotificationProvider[]> {
    try {
      const data = await notificationApi.providers();
      providers.value = data.providers;
      return data.providers;
    } catch (e) {
      error.value = extractError(e);
      return [];
    }
  }

  /** Preferencias efectivas (pref ?? default) del usuario. */
  async function fetchPreferences(): Promise<void> {
    try {
      const data = await notificationApi.myPreferences();
      const map: Record<string, Record<NotificationChannel, boolean>> = {};
      for (const p of data.preferences) {
        map[p.providerCode] = { ...p.channels };
      }
      preferences.value = map;
    } catch (e) {
      error.value = extractError(e);
    }
  }

  async function loadAll(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await Promise.all([fetchProviders(), fetchPreferences()]);
    } finally {
      loading.value = false;
    }
  }

  /** Guarda un lote de actualizaciones y actualiza el estado con lo devuelto. */
  async function save(updates: NotificationPrefUpdate[]): Promise<boolean> {
    saving.value = true;
    error.value = null;
    try {
      const data = await notificationApi.savePreferences({ preferences: updates });
      const map: Record<string, Record<NotificationChannel, boolean>> = {};
      for (const p of data.preferences) {
        map[p.providerCode] = { ...p.channels };
      }
      preferences.value = map;
      return true;
    } catch (e) {
      error.value = extractError(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  return { providers, preferences, loading, saving, error, loadAll, save };
});