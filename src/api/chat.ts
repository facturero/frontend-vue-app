import { http } from '@/utils/http';
import type { RichDoc } from '@/types/projects';
import type {
  ChannelListing,
  ChatMember,
  ChatMembership,
  ChatMessage,
  ChatReaction,
  ConversationDetail,
  ConversationSummary,
  CreateConversationInput,
  MessagePage,
  NotifyLevel,
  UnreadSummary,
  ChatSearchPage,
  ChatThreadItem,
  CustomEmoji,
} from '@/types/chat';

/** Mensajería (chat-service, por el gateway en `/chat/*`). Enviar y leer van siempre por aquí; el socket solo avisa. */
export const chatApi = {
  conversations: (includeArchived = false) =>
    http.get<{ items: ConversationSummary[] }>('/chat/conversations', { params: { includeArchived } }).then((r) => r.data.items),
  browse: (q?: string) => http.get<{ items: ChannelListing[] }>('/chat/conversations/browse', { params: { q: q || undefined } }).then((r) => r.data.items),
  get: (id: string) => http.get<ConversationDetail>(`/chat/conversations/${id}`).then((r) => r.data),
  create: (input: CreateConversationInput) => http.post<ConversationDetail>('/chat/conversations', input).then((r) => r.data),
  update: (id: string, input: { name?: string; topic?: string | null; description?: string | null }) =>
    http.patch<ConversationDetail>(`/chat/conversations/${id}`, input).then((r) => r.data),
  archive: (id: string) => http.post<ConversationDetail>(`/chat/conversations/${id}/archive`).then((r) => r.data),
  unarchive: (id: string) => http.post<ConversationDetail>(`/chat/conversations/${id}/unarchive`).then((r) => r.data),
  join: (id: string) => http.post<ConversationDetail>(`/chat/conversations/${id}/join`).then((r) => r.data),
  members: (id: string) => http.get<{ items: ChatMember[] }>(`/chat/conversations/${id}/members`).then((r) => r.data.items),
  addMembers: (id: string, userIds: string[]) => http.post<{ items: ChatMember[] }>(`/chat/conversations/${id}/members`, { userIds }).then((r) => r.data.items),
  removeMember: (id: string, userId: string) => http.delete(`/chat/conversations/${id}/members/${userId}`).then(() => undefined),
  read: (id: string, seq: number) =>
    http.post<{ lastReadSeq: number; unreadCount: number; mentionCount: number }>(`/chat/conversations/${id}/read`, { seq }).then((r) => r.data),
  preferences: (id: string, prefs: { notify?: NotifyLevel; muted?: boolean }) =>
    http.patch<ChatMembership>(`/chat/conversations/${id}/preferences`, prefs).then((r) => r.data),
  messages: (id: string, params: { before?: number; after?: number; around?: string; limit?: number } = {}) =>
    http.get<MessagePage>(`/chat/conversations/${id}/messages`, { params }).then((r) => r.data),
  send: (id: string, input: { clientMsgId: string; bodyDoc: RichDoc; threadRootId?: string | null }) =>
    http.post<ChatMessage>(`/chat/conversations/${id}/messages`, input).then((r) => r.data),
  message: (id: string) => http.get<ChatMessage>(`/chat/messages/${id}`).then((r) => r.data),
  edit: (id: string, bodyDoc: RichDoc) => http.patch<ChatMessage>(`/chat/messages/${id}`, { bodyDoc }).then((r) => r.data),
  remove: (id: string) => http.delete(`/chat/messages/${id}`).then(() => undefined),
  replies: (id: string, params: { after?: number; limit?: number } = {}) =>
    http.get<{ root: ChatMessage; items: ChatMessage[]; hasMore: boolean }>(`/chat/messages/${id}/replies`, { params }).then((r) => r.data),
  react: (id: string, emoji: string) => http.post<ChatReaction>(`/chat/messages/${id}/reactions`, { emoji }).then((r) => r.data),
  unreact: (id: string, emoji: string) => http.delete<ChatReaction>(`/chat/messages/${id}/reactions/${encodeURIComponent(emoji)}`).then((r) => r.data),
  unread: () => http.get<UnreadSummary>('/chat/unread').then((r) => r.data),
  /** Emojis personalizados de la organización. */
  emojis: () => http.get<{ items: CustomEmoji[] }>('/chat/emojis').then((r) => r.data.items),
  createEmoji: (name: string, documentId: string) => http.post<CustomEmoji>('/chat/emojis', { name, documentId }).then((r) => r.data),
  removeEmoji: (id: string) => http.delete(`/chat/emojis/${id}`).then(() => undefined),
  /** Vista «Hilos»: los hilos que sigo, el de respuesta más reciente primero. */
  threads: (params: { cursor?: string; limit?: number } = {}) =>
    http.get<{ items: ChatThreadItem[]; nextCursor: string | null }>('/chat/threads', { params }).then((r) => r.data),
  /** Leí el hilo hasta esta respuesta (el servidor no lo deja retroceder ni pasar de la última). */
  markThreadRead: (rootId: string, threadSeq: number) =>
    http.post<{ lastReadThreadSeq: number | null; unreadCount: number; mentionCount: number }>(`/chat/messages/${rootId}/thread/read`, { threadSeq }).then((r) => r.data),
  /** Búsqueda en lo que puedo leer (mis conversaciones y los canales públicos), más recientes primero. */
  search: (params: { q: string; conversationId?: string; fromUserId?: string; cursor?: string; limit?: number }) =>
    http.get<ChatSearchPage>('/chat/search', { params }).then((r) => r.data),
};
