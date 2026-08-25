import { onBeforeUnmount, onMounted } from 'vue';
import { getSocket } from '@/utils/realtime';
import { usePluginsStore } from '@/stores/plugins';

/**
 * Suscribe componentes al canal global de plugins. La conexión es un
 * singleton gestionado por el router; aquí solo se cuelga/despega el handler.
 */
export function usePluginsRealtime(): void {
  const store = usePluginsStore();
  let handler: ((data?: unknown) => void) | null = null;

  onMounted(() => {
    const socket = getSocket();
    if (!socket) return;
    handler = () => {
      void store.fetchCatalog();
      void store.fetchMy();
      void store.fetchRequests();
    };
    socket.on('plugins.changed', handler);
  });

  onBeforeUnmount(() => {
    if (handler) getSocket()?.off('plugins.changed', handler);
  });
}
