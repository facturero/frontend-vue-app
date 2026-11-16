/** Comentarios, mejoras y puntos de fidelidad (feedback-service). Forma de `backend/feedback-service/openapi.yaml`. */
export type FeedbackKind = 'improvement' | 'comment' | 'problem';
export type FeedbackStatus = 'new' | 'reviewing' | 'accepted' | 'implemented' | 'declined';

export const FEEDBACK_KINDS: FeedbackKind[] = ['improvement', 'comment', 'problem'];
export const FEEDBACK_STATUSES: FeedbackStatus[] = ['new', 'reviewing', 'accepted', 'implemented', 'declined'];

export interface FeedbackItem {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  status: FeedbackStatus;
  traceId: string | null;
  urlPath: string | null;
  replyCount: number;
  /** Sin leer por quien mira (la persona o la plataforma). */
  unread: boolean;
  lastActivityAt: string;
  createdAt: string;
  /** Solo en la vista del dueño de la plataforma. */
  organizationId?: string;
  organizationName?: string | null;
  authorId?: string;
  authorName?: string | null;
  authorEmail?: string | null;
}

export interface FeedbackReply {
  id: string;
  fromPlatform: boolean;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface PointsEntry {
  id: string;
  itemId: string | null;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface FeedbackDetail {
  item: FeedbackItem;
  replies: FeedbackReply[];
  points: PointsEntry[];
}

export interface FeedbackPage {
  items: FeedbackItem[];
  nextCursor: string | null;
}

export interface OrganizationBalance {
  organizationId: string;
  organizationName: string | null;
  balance: number;
  entries: number;
}

export interface SubmitFeedbackInput {
  kind: FeedbackKind;
  title: string;
  body: string;
  organizationName?: string | null;
  traceId?: string | null;
  urlPath?: string | null;
}

export interface RespondInput {
  body?: string | null;
  status?: FeedbackStatus;
  points?: { amount: number; reason?: string | null; idempotencyKey: string } | null;
}
