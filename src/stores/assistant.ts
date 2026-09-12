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

  function reset(): void {
    conversationId.value = null;
    messages.value = [];
    pendingActions.value = [];
    error.value = null;
  }

  /** Prefiere el socket: un turno puede durar más del cap de 30s del túnel.
   *  Si el socket no está (p.ej. recarga en curso), cae al HTTP. */
  function sendTurn(text: string, conversationId: string | null): Promise<AssistantTurn> {
    if (isConnected()) return assistantSend(text, conversationId);
    return assistantApi.send(text, conversationId);
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
    if (!clean || sending.value) return;

    sending.value = true;
    error.value = null;
    messages.value.push({ role: 'user', text: clean, createdAt: new Date().toISOString() });

    try {
      const turn = await sendTurn(clean, conversationId.value);
      conversationId.value = turn.conversationId;
      if (turn.reply) {
        messages.value.push({
          role: 'assistant',
          text: turn.reply,
          createdAt: new Date().toISOString(),
        });
      }
      pendingActions.value = turn.pendingActions;
      void loadConversations();
    } catch (e) {
      error.value = extractError(e);
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
    if (deciding.value) return;
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
    } catch (e) {
      error.value = extractError(e);
      // La propuesta se queda en pantalla: si falló la red, se puede reintentar.
    } finally {
      deciding.value = null;
    }
  }

  return {
    open, conversationId, messages, pendingActions, conversations,
    sending, deciding, error,
    toggle, reset, send, decide, loadConversations, openConversation,
  };
});
