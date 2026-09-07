import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/utils/http';
import { useRealtimeStore } from '@/stores/realtime';
import { useAuthStore } from '@/stores/auth';

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

  socket.on('permissions.changed', () => {
    // Tus roles/permisos (o estado) cambiaron desde otro lugar (BUG #9):
    // el gateway emite esto en tu sala `user:<uid>` y aquí refrescamos el
    // store de auth al instante. El token viejo quedaría stale y cualquier
    // request respondería 401 TOKEN_STALE hasta re-autenticar (el interceptor
    // de http.ts refresca solo con el refresh token).
    try {
      void useAuthStore().fetchMe();
    } catch {
      // pinia aún no activa; el próximo fetchMe de la app deja el store al día
    }
  });
}

export function disconnectRealtime(): void {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}
