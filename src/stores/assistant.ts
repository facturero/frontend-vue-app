import { defineStore } from 'pinia';
import { ref } from 'vue';
import { assistantApi } from '@/api/assistant';
import { assistantSend, assistantDecide, isConnected } from '@/utils/realtime';
import { extractError } from '@/utils/error';
import type {
  ConversationMessage,
  ConversationSummary,
  PendingAction,
  AssistantTurn,
} from '@/types/assistant';

export const useAssistantStore = defineStore('assistant', () => {
  const open = ref(false);
  const conversationId = ref<string | null>(null);
  const messages = ref<ConversationMessage[]>([]);
  const pendingActions = ref<PendingAction[]>([]);
  const conversations = ref<ConversationSummary[]>([]);
  const sending = ref(false);
  const deciding = ref<string | null>(null);
  const error = ref<string | null>(null);
  // Vista grande (diálogo) o panel lateral. El borrador y la vista de historial viven aquí y no en el componente: al cambiar
  // de tamaño se monta otra instancia del chat, y lo que estabas escribiendo no debe perderse por eso.
  const expanded = ref(false);
  const draft = ref('');
  const showHistory = ref(false);
  // ¿Responde algún servidor de IA? Sin ninguno, el chat no deja escribir (fallaría a los segundos) pero sí leer el historial,
  // que vive en la base y no en el modelo. Empieza en `true`: sin saberlo todavía, no se le cierra el chat a nadie.
  const available = ref(true);
  // La última respuesta llegó con el principio de la conversación olvidado (el servidor lo recorta para que quepa en el
  // modelo). Se avisa bajo el chat y se ofrece empezar otra.
  const contextTrimmed = ref(false);
  let statusTimer: ReturnType<typeof setInterval> | null = null;
  const STATUS_POLL_MS = 20_000;

  // El historial vive en el servidor (assistant_db). Esto solo recuerda CUÁL
  // conversación estaba abierta: al recargar la página el chat que estabas
  // viendo vuelve a aparecer. La conversación en sí nunca se pierde, da igual
  // el navegador o el dispositivo.
  const ACTIVE_KEY = 'assistant.activeConversationId';

  function persistActive(): void {
    if (conversationId.value) {
      localStorage.setItem(ACTIVE_KEY, conversationId.value);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
  }

  function reset(): void {
    conversationId.value = null;
    messages.value = [];
    pendingActions.value = [];
    error.value = null;
    contextTrimmed.value = false;
    persistActive();
  }

  /** Prefiere el socket: un turno puede durar más del cap de 30s del túnel.
   *  Si el socket no está (p.ej. recarga en curso), cae al HTTP. */
  function sendTurn(text: string, conversationId: string | null): Promise<AssistantTurn> {
    if (isConnected()) return assistantSend(text, conversationId);
    return assistantApi.send(text, conversationId);
  }

  /**
   * Pregunta al servicio si hay modelo. Un 502/503/504 es que no llega ni al servicio: tampoco se puede escribir. Cualquier
   * otro fallo (un 404 de un servicio todavía sin la ruta, la red del navegador caída) no cambia nada: no hay pruebas de que
   * el modelo esté caído, y cerrar el chat por una duda es peor que un envío que falla y lo dice.
   */
  async function checkStatus(): Promise<void> {
    try {
      available.value = (await assistantApi.status()).available;
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status ?? 0;
      if (status >= 502 && status <= 504) available.value = false;
    }
  }

  /** Mientras el chat está abierto, cada 20 s: así se reabre solo cuando la tarjeta vuelve, sin recargar la página. */
  function watchStatus(on: boolean): void {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = null;
    if (!on) return;
    void checkStatus();
    statusTimer = setInterval(() => void checkStatus(), STATUS_POLL_MS);
  }

  function toggle(): void {
    open.value = !open.value;
    if (open.value) void loadConversations();
  }

  async function loadConversations(): Promise<void> {
    try {
      conversations.value = await assistantApi.conversations();
    } catch {
      // La lista lateral es un adorno: si falla, el chat sigue sirviendo.
    }
  }

  async function openConversation(id: string): Promise<void> {
    error.value = null;
    try {
      const detail = await assistantApi.conversation(id);
      conversationId.value = detail.id;
      messages.value = detail.messages;
      pendingActions.value = detail.pendingActions;
      contextTrimmed.value = false;
      persistActive();
    } catch (e) {
      error.value = extractError(e);
    }
  }

  /**
   * Borra una conversación del historial. Si es la que está abierta, el chat
   * vuelve a quedar en blanco: seguir escribiendo en un hilo borrado daría 404.
   */
  async function deleteConversation(id: string): Promise<void> {
    error.value = null;
    try {
      await assistantApi.deleteConversation(id);
      conversations.value = conversations.value.filter((c) => c.id !== id);
      if (conversationId.value === id) reset();
    } catch (e) {
      error.value = extractError(e);
    }
  }

  /**
   * Manda un mensaje. El mensaje del usuario se pinta antes de que conteste el
   * servidor: el turno tarda, y ver tu propia frase en pantalla es la diferencia
   * entre "está pensando" y "se ha colgado".
   */
  async function send(text: string): Promise<void> {
    const clean = text.trim();
    if (!clean || sending.value || !available.value) return;

    sending.value = true;
    error.value = null;
    messages.value.push({ role: 'user', text: clean, createdAt: new Date().toISOString() });

    try {
      const turn = await sendTurn(clean, conversationId.value);
      conversationId.value = turn.conversationId;
      persistActive();
      if (turn.reply) {
        messages.value.push({
          role: 'assistant',
          text: turn.reply,
          createdAt: new Date().toISOString(),
        });
      }
      pendingActions.value = turn.pendingActions;
      contextTrimmed.value = turn.contextTrimmed ?? false;
      void loadConversations();
    } catch (e) {
      error.value = extractError(e);
      // Si falló porque se cayeron las tarjetas, que el chat se cierre ya y no al siguiente sondeo.
      void checkStatus();
    } finally {
      sending.value = false;
    }
  }

  function decideTurn(actionId: string, approve: boolean): Promise<AssistantTurn> {
    if (isConnected()) return assistantDecide(actionId, approve);
    return assistantApi.decide(actionId, approve);
  }

  /** Confirma o rechaza una escritura propuesta. */
  async function decide(actionId: string, approve: boolean): Promise<void> {
    // Confirmar o rechazar reanuda el turno del modelo: sin servidores, fallaría igual que un mensaje.
    if (deciding.value || !available.value) return;
    deciding.value = actionId;
    error.value = null;
    try {
      const turn = await decideTurn(actionId, approve);
      if (turn.reply) {
        messages.value.push({
          role: 'assistant',
          text: turn.reply,
          createdAt: new Date().toISOString(),
        });
      }
      pendingActions.value = turn.pendingActions;
      if (turn.contextTrimmed !== undefined) contextTrimmed.value = turn.contextTrimmed;
    } catch (e) {
      error.value = extractError(e);
      void checkStatus();
      // La propuesta se queda en pantalla: si falló la red, se puede reintentar.
    } finally {
      deciding.value = null;
    }
  }

  async function restoreActive(): Promise<void> {
    const saved = localStorage.getItem(ACTIVE_KEY);
    if (!saved) return;
    try {
      const detail = await assistantApi.conversation(saved);
      conversationId.value = detail.id;
      messages.value = detail.messages;
      pendingActions.value = detail.pendingActions;
    } catch (e) {
      // La que estaba abierta pudo borrarse desde otro dispositivo: con un 404
      // se empieza en blanco en vez de enseñar un error al cargar la página.
      if ((e as { response?: { status?: number } }).response?.status === 404) reset();
      else error.value = extractError(e);
    }
  }

  return {
    open, conversationId, messages, pendingActions, conversations,
    sending, deciding, error, expanded, draft, showHistory, available, contextTrimmed,
    checkStatus, watchStatus, toggle, reset, send, decide, loadConversations, openConversation, deleteConversation, restoreActive,
  };
});
