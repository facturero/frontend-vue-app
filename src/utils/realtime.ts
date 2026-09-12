import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/utils/http';
import { useRealtimeStore } from '@/stores/realtime';
import { useAuthStore } from '@/stores/auth';
import type { AssistantTurn } from '@/types/assistant';

let socket: Socket | null = null;

/**
 * Turnos del asistente por el socket. El HTTP normal moría en 502 cuando un
 * turno pasaba de ~30s: Cloudflare Tunnel bufferiza las respuestas HTTP y corta
 * (el asistente a veces tarda un minuto o más con el LLM local). El WebSocket
 * no pasa por ese buffer, así que el turno completo viaja por aquí. El gateway
 * llama al assistant-service internamente y contesta por el socket.
 */
const ASSISTANT_TURN_TIMEOUT_MS = 11 * 60_000;

export function isConnected(): boolean {
  return socket?.connected ?? false;
}

export function getSocket(): Socket | null {
  return socket;
}

/** Manda un turno del asistente por el socket y espera la respuesta del gateway. */
export function assistantSend(text: string, conversationId: string | null): Promise<AssistantTurn> {
  return emitAssistant('assistant:send', { text, conversationId });
}

/** Confirma o rechaza una escritura propuesta por el asistente. */
export function assistantDecide(actionId: string, approve: boolean): Promise<AssistantTurn> {
  return emitAssistant('assistant:decide', { actionId, approve });
}

function emitAssistant<T>(event: string, payload: Record<string, unknown>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Sin conexión con el asistente'));
      return;
    }
    // El ack del gateway llega cuando el turno termina (puede tardar más de un
    // minuto). socket.io por defecto no corta los acks; nosotras fijamos el cap.
    socket.timeout(ASSISTANT_TURN_TIMEOUT_MS).emit(event, payload, (err, res?: { ok?: boolean; data?: T; message?: string }) => {
      if (err) {
        reject(new Error('El asistente tardó demasiado'));
        return;
      }
      if (res && res.ok && res.data !== undefined) {
        resolve(res.data);
        return;
      }
      reject(new Error(res?.message ?? 'El asistente no respondió'));
    });
  });
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
    // El locale va en el auth (no en un header): el navegador no deja fijar
    // headers en un transport websocket, pero socket.io entrega `auth` al
    // gateway, que lo guarda en socket.data.locale para el asistente.
    auth: { token, locale: localStorage.getItem('app-locale') || 'es' },
    transports: ['websocket', 'polling'],
  });

  // Carga inicial de la bandeja: lo que llegó con la sesión cerrada también
  // tiene que aparecer en la campana, no solo lo que pase de ahora en adelante.
  try {
    void useRealtimeStore().fetchNotifications();
  } catch {
    // pinia aún no activa; el primer evento por socket la recargará
  }

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

  socket.on('notification', () => {
    // Canal `app` de notification-service: el gateway emite esto en tu sala
    // `user:<uid>` solo si tienes activa la notificación para ese provider.
    // notification-service ya la persistió, así que el socket es solo el aviso:
    // la lista y el estado de leído se recargan del servidor, que es quien
    // tiene el id estable. Evita inventar un id en cliente y desincronizar
    // pestañas.
    try {
      useRealtimeStore().onIncoming();
    } catch {
      // pinia aún no activa (no debería ocurrir tras el login)
    }
  });
}

export function disconnectRealtime(): void {
  if (!socket) return;
  socket.disconnect();
  socket = null;
  // La bandeja es por usuario: al cerrar sesión no puede quedar en memoria
  // para el siguiente que entre en esta misma pestaña.
  try {
    useRealtimeStore().clear();
  } catch {
    // pinia aún no activa: no hay nada que limpiar
  }
}
