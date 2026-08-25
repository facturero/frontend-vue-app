import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/utils/http';
import { useRealtimeStore } from '@/stores/realtime';

let socket: Socket | null = null;

export function isConnected(): boolean {
  return socket?.connected ?? false;
}

export function getSocket(): Socket | null {
  return socket;
}

/**
 * Abre la conexión global de tiempo real (idempotente). El gateway autentica
 * con el mismo JWT del API y deriva la sala `catalog:<orgId>` del claim org_id.
 */
export function connectRealtime(): void {
  if (socket) return;
  const token = getAccessToken();
  if (!token) return;

  socket = io(import.meta.env.VITE_API_URL, {
    path: '/ws',
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('plugins.changed', (data: Record<string, unknown>) => {
    try {
      useRealtimeStore().pushPluginEvent(data);
    } catch {
      // pinia aún no activa (no debería ocurrir tras el login)
    }
  });
}

export function disconnectRealtime(): void {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}
