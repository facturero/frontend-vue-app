import type { RichDoc } from '@/types/projects';

/** Mensajería al estilo Slack (chat-service). Forma de `backend/chat-service/openapi.yaml`. */
export type ConversationKind = 'channel' | 'dm' | 'group_dm';
export type ChannelVisibility = 'public' | 'private';
export type NotifyLevel = 'all' | 'mentions' | 'none';
/** Presencia según el hub del gateway: conectado, ausente (todas sus pestañas sin actividad 10 min) o desconectado. */
export type PresenceState = 'online' | 'away' | 'offline';

export interface ChatMembership {
  role: 'owner' | 'member';
  notify: NotifyLevel;
  muted: boolean;
  lastReadSeq: number;
  joinedAt: string;
}

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  visibility: ChannelVisibility | null;
  name: string | null;
  isGeneral: boolean;
  participantUserIds: string[];
  archivedAt: string | null;
  lastMessageAt: string | null;
  lastMessageSeq: number;
  unreadCount: number;
  mentionCount: number;
  me: ChatMembership | null;
}

export interface ConversationDetail extends ConversationSummary {
  topic: string | null;
  description: string | null;
  createdBy: string;
  createdAt: string;
  memberCount: number;
  isMember: boolean;
}

export interface ChannelListing {
  id: string;
  name: string;
  visibility: ChannelVisibility;
  topic: string | null;
  memberCount: number;
  isMember: boolean;
  archivedAt: string | null;
}

export interface ChatMember {
  userId: string;
  role: 'owner' | 'member';
  joinedAt: string;
  inactive: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  seq: number | null;
  threadRootId: string | null;
  threadSeq: number | null;
  senderId: string | null;
  kind: 'user' | 'system';
  bodyDoc: RichDoc | null;
  bodyText: string | null;
  clientMsgId: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  replyUserIds: string[];
  reactions: ChatReaction[];
  mentionsMe: boolean;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  /** Solo en el navegador: enviado pero aún sin confirmar, o falló. */
  pending?: 'sending' | 'failed';
}

export interface ChatReaction {
  emoji: string;
  count: number;
  userIds: string[];
  mine: boolean;
}

export interface MessagePage {
  items: ChatMessage[];
  hasOlder: boolean;
  hasNewer: boolean;
  lastReadSeq: number | null;
}

export interface InboxItem {
  conversationId: string;
  kind: ConversationKind;
  name: string | null;
  participantUserIds: string[];
  unreadCount: number;
  mentionCount: number;
  lastMessage: ChatMessage;
}

export interface UnreadSummary {
  conversations: number;
  mentions: number;
  /** Hilos que sigo con respuestas nuevas, y menciones a mí dentro de hilos (aparte de `mentions`, que son de los canales). */
  threads?: { unread: number; mentions: number };
  latest: InboxItem[];
}

export interface CreateConversationInput {
  kind: ConversationKind;
  name?: string;
  visibility?: ChannelVisibility;
  topic?: string;
  description?: string;
  userIds?: string[];
}

/** Lo que manda el hub del gateway por Socket.IO (backend/chat-service/docs/tiempo-real.md). */
export interface ChatMessageEvent {
  messageId: string;
  conversationId: string;
  threadRootId: string | null;
  notify: boolean;
  /** Lo trae el hub; si no pudo, falta y se pide por REST. */
  message?: ChatMessage;
}

/** Un resultado de `GET /chat/search`. */
export interface ChatSearchHit {
  message: ChatMessage;
  conversation: { id: string; kind: ConversationKind; name: string | null };
  snippet: string;
}

export interface ChatSearchPage {
  items: ChatSearchHit[];
  nextCursor: string | null;
}

/** Un hilo de la vista «Hilos» (`GET /chat/threads`). */
export interface ChatThreadItem {
  root: ChatMessage;
  conversation: { id: string; kind: ConversationKind; name: string | null };
  latestReplies: ChatMessage[];
  lastReadThreadSeq: number;
  unreadCount: number;
  mentionCount: number;
}

/** Emoji personalizado de la organización: se usa como `:nombre:` (imagen en document-service). */
export interface CustomEmoji {
  id: string;
  name: string;
  documentId: string;
  createdBy: string;
  createdAt: string;
}
