/** Una escritura que el asistente quiere hacer y que espera confirmación. */
export interface PendingAction {
  id: string;
  toolName: string;
  /** Frase en claro de lo que va a pasar. La escribe el servidor, no el modelo. */
  summary: string;
  input: Record<string, unknown>;
}

export interface AssistantTurn {
  conversationId: string;
  reply: string;
  pendingActions: PendingAction[];
  /** El agente se quedó sin pasos antes de cerrar. */
  truncated: boolean;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

export interface ConversationDetail {
  id: string;
  title: string | null;
  messages: ConversationMessage[];
  pendingActions: PendingAction[];
}
