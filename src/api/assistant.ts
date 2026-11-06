import { http } from '@/utils/http';
import type {
  AssistantTurn,
  ConversationDetail,
  ConversationSummary,
  StatusDraft,
  SubtaskSuggestion,
  TaskSummary,
} from '@/types/assistant';

/**
 * El asistente actúa con la sesión de quien pregunta: el servicio reutiliza el
 * mismo token que manda este cliente, así que no puede hacer nada que el usuario
 * no pudiera hacer a mano.
 *
 * Un turno puede tardar: el agente encadena varias consultas antes de contestar.
 * Por eso estas llamadas llevan su propio tiempo de espera, más largo que el
 * que vale para el resto de la API.
 */
const TURN_TIMEOUT_MS = 120_000;

export const assistantApi = {
  conversations: () =>
    http.get<ConversationSummary[]>('/assistant/conversations').then((r) => r.data),

  conversation: (id: string) =>
    http.get<ConversationDetail>(`/assistant/conversations/${id}`).then((r) => r.data),

  /** Borrado virtual: el servidor la oculta, no destruye el historial. */
  deleteConversation: (id: string) =>
    http.delete(`/assistant/conversations/${id}`).then(() => undefined),

  send: (text: string, conversationId: string | null) =>
    http
      .post<AssistantTurn>(
        '/assistant/messages',
        { text, conversationId },
        { timeout: TURN_TIMEOUT_MS },
      )
      .then((r) => r.data),

  decide: (actionId: string, approve: boolean) =>
    http
      .post<AssistantTurn>(
        `/assistant/actions/${actionId}/decide`,
        { approve },
        { timeout: TURN_TIMEOUT_MS },
      )
      .then((r) => r.data),

  // IA de Proyectos: proponen, no guardan. Un modelo local tarda de 15 a 30 s, por eso el mismo tiempo de espera que un turno.
  summarizeTask: (taskId: string) =>
    http.post<TaskSummary>(`/assistant/projects/tasks/${taskId}/summary`, {}, { timeout: TURN_TIMEOUT_MS }).then((r) => r.data),

  suggestSubtasks: (taskId: string) =>
    http
      .post<{ subtasks: SubtaskSuggestion[] }>(`/assistant/projects/tasks/${taskId}/subtasks`, {}, { timeout: TURN_TIMEOUT_MS })
      .then((r) => r.data.subtasks),

  draftStatus: (projectId: string) =>
    http.post<StatusDraft>(`/assistant/projects/${projectId}/status-draft`, {}, { timeout: TURN_TIMEOUT_MS }).then((r) => r.data),
};
