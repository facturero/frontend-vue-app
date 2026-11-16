import { describe, expect, it } from 'vitest';
import { mergeMessages } from '@/stores/chat';
import type { ChatMessage } from '@/types/chat';
import type { DirectoryUser } from '@/types/projects';
import { conversationTitle, draftHasContent, messageRows, typingText } from './chat';

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: crypto.randomUUID(), conversationId: 'c', seq: 1, threadRootId: null, threadSeq: null, senderId: 'a', kind: 'user', bodyDoc: null,
  bodyText: 'x', clientMsgId: null, replyCount: 0, lastReplyAt: null, replyUserIds: [], reactions: [], mentionsMe: false, editedAt: null,
  deletedAt: null, createdAt: '2026-11-14T15:00:00', ...over,
});

describe('título de una conversación', () => {
  const users = new Map<string, DirectoryUser>(
    ['Ana', 'Bruno', 'Carla', 'Diego'].map((n, i) => [`u${i}`, { id: `u${i}`, email: `${n}@x`, fullName: n, avatarFileId: null }]),
  );
  it('canal: su nombre; DM: las personas; grupo grande: dos y «más»', () => {
    expect(conversationTitle({ kind: 'channel', name: 'ventas', participantUserIds: [] }, users, (n) => `y ${n} más`)).toBe('ventas');
    expect(conversationTitle({ kind: 'dm', name: null, participantUserIds: ['u0'] }, users, (n) => `y ${n} más`)).toBe('Ana');
    expect(conversationTitle({ kind: 'group_dm', name: null, participantUserIds: ['u0', 'u1', 'u2', 'u3'] }, users, (n) => `y ${n} más`)).toBe('Ana, Bruno y 2 más');
  });
});

describe('filas de la conversación', () => {
  it('rachas del mismo autor, separador de día y línea de «nuevos» en el primer ajeno sin leer', () => {
    const list = [
      msg({ seq: 1, senderId: 'a', createdAt: '2026-11-13T18:00:00' }),
      msg({ seq: 2, senderId: 'a', createdAt: '2026-11-14T09:00:00' }),
      msg({ seq: 3, senderId: 'a', createdAt: '2026-11-14T09:02:00' }),
      msg({ seq: 4, senderId: 'me', createdAt: '2026-11-14T09:03:00' }),
      msg({ seq: 5, senderId: 'b', createdAt: '2026-11-14T09:04:00' }),
      msg({ seq: 6, senderId: 'b', createdAt: '2026-11-14T09:20:00' }),
    ];
    const rows = messageRows(list, 3, 'me');
    expect(rows.map((r) => r.dayBreak)).toEqual(['2026-11-13', '2026-11-14', null, null, null, null]);
    expect(rows.map((r) => r.compact)).toEqual([false, false, true, false, false, false]);
    expect(rows.map((r) => r.firstUnread)).toEqual([false, false, false, false, true, false]);
  });
});

describe('unir mensajes', () => {
  it('el borrador local se reemplaza por el confirmado (mismo clientMsgId) y nunca lo pisa de vuelta', () => {
    const draft = msg({ id: 'local-1', seq: null, clientMsgId: 'k1', pending: 'sending', createdAt: '2026-11-14T10:00:00' });
    const saved = msg({ id: 'm9', seq: 9, clientMsgId: 'k1' });
    expect(mergeMessages([draft], [saved]).map((m) => m.id)).toEqual(['m9']);
    expect(mergeMessages([saved], [draft]).map((m) => [m.id, m.pending])).toEqual([['m9', undefined]]);
  });
  it('ordena por seq y deja los borradores al final', () => {
    const out = mergeMessages([msg({ id: 'b', seq: 5 }), msg({ id: 'd', seq: null, pending: 'sending' })], [msg({ id: 'a', seq: 2 })]);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'd']);
  });
});

describe('typingText y draftHasContent', () => {
  const users = new Map([
    ['a', { id: 'a', email: 'a@x', fullName: 'Ana', avatarFileId: null }],
    ['b', { id: 'b', email: 'b@x', fullName: 'Luis', avatarFileId: null }],
  ]);
  const t = (key: string, v?: Record<string, unknown>) => `${key}${v ? JSON.stringify(v) : ''}`;

  it('nombra a una o dos personas y a partir de tres dice «varias»', () => {
    expect(typingText([], users, t, '?')).toBeNull();
    expect(typingText(['a'], users, t, '?')).toBe('chat.typing.one{"name":"Ana"}');
    expect(typingText(['a', 'b'], users, t, '?')).toBe('chat.typing.two{"a":"Ana","b":"Luis"}');
    expect(typingText(['a', 'b', 'z'], users, t, '?')).toBe('chat.typing.many');
    expect(typingText(['z'], users, t, 'Alguien')).toBe('chat.typing.one{"name":"Alguien"}');
  });

  it('solo cuenta como escribir si hay texto o algo adjunto', () => {
    expect(draftHasContent(null)).toBe(false);
    expect(draftHasContent({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(false);
    expect(draftHasContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'h' }] }] })).toBe(true);
  });
});
