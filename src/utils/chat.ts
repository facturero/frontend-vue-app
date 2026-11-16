import type { DirectoryUser } from '@/types/projects';
import type { ChatMessage, ConversationSummary } from '@/types/chat';
import { displayName } from '@/utils/projects';

/** Dos mensajes del mismo autor con menos de esto entre sí van en la misma racha (el segundo sin avatar ni nombre), como Slack. */
export const RUN_GAP_MS = 5 * 60_000;

/** Nombre a mostrar: `#canal` (sin `#` para quien lo pinta con icono) o las personas del DM («Ana, Bruno y 2 más»). */
export function conversationTitle(c: Pick<ConversationSummary, 'kind' | 'name' | 'participantUserIds'>, users: Map<string, DirectoryUser>, andMore: (n: number) => string): string {
  if (c.kind === 'channel') return c.name ?? '';
  const names = c.participantUserIds.map((id) => displayName(users.get(id))).filter(Boolean);
  if (!names.length) return '…';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} ${andMore(names.length - 2)}`;
}

/** Día local (AAAA-MM-DD) de un instante: los separadores de día van por la fecha de quien mira, no la del servidor (UTC). */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface MessageRow {
  message: ChatMessage;
  /** Mismo autor que el anterior, poco después y mismo día: sin avatar ni nombre. */
  compact: boolean;
  /** Primer mensaje de su día: va con un separador encima. */
  dayBreak: string | null;
  /** Primer mensaje sin leer al abrir la conversación: va con la línea de «nuevos» encima. */
  firstUnread: boolean;
}

/**
 * Filas de la conversación. `lastReadSeq` es el cursor AL ABRIR (no el actual): la línea de «nuevos» se queda donde estaba aunque al
 * leer el cursor avance, como Slack. Los propios nunca son «nuevos».
 */
export function messageRows(list: ChatMessage[], lastReadSeq: number | null, myId: string): MessageRow[] {
  const rows: MessageRow[] = [];
  let unreadMarked = false;
  list.forEach((message, i) => {
    const prev = list[i - 1];
    const day = localDay(message.createdAt);
    const dayBreak = !prev || localDay(prev.createdAt) !== day ? day : null;
    const firstUnread =
      !unreadMarked && lastReadSeq !== null && message.seq !== null && message.seq > lastReadSeq && message.senderId !== myId;
    if (firstUnread) unreadMarked = true;
    const compact =
      !!prev && !dayBreak && !firstUnread && prev.kind === 'user' && message.kind === 'user' && prev.senderId === message.senderId &&
      new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < RUN_GAP_MS;
    rows.push({ message, compact, dayBreak, firstUnread });
  });
  return rows;
}

/**
 * «Ana está escribiendo…», «Ana y Luis están escribiendo…» o «Varias personas están escribiendo…» (como Slack, que deja de nombrar
 * a partir de tres). `null` si nadie escribe.
 */
export function typingText(userIds: string[], users: Map<string, DirectoryUser>, t: (key: string, values?: Record<string, unknown>) => string, unknown: string): string | null {
  const names = userIds.map((id) => displayName(users.get(id)) || unknown);
  if (names.length === 0) return null;
  if (names.length === 1) return t('chat.typing.one', { name: names[0] });
  if (names.length === 2) return t('chat.typing.two', { a: names[0], b: names[1] });
  return t('chat.typing.many');
}

/** ¿El borrador tiene algo escrito o adjunto? (para avisar «escribiendo…» solo cuando de verdad se escribe). */
export function draftHasContent(doc: unknown): boolean {
  return !!doc && /"type":"(text|image|file|mention|crmLink)"/.test(JSON.stringify(doc));
}
