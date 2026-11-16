import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { chatApi } from '@/api/chat';
import { fileApi } from '@/api/files';
import { notify } from '@/composable/useNotify';
import { extractError } from '@/utils/error';
import { getSocket } from '@/utils/realtime';
import { useAuthStore } from '@/stores/auth';
import type { RichDoc } from '@/types/projects';
import type {
  ChannelVisibility,
  ChatMessage,
  ChatMessageEvent,
  ConversationDetail,
  ConversationSummary,
  NotifyLevel,
  PresenceState,
  UnreadSummary,
  ChatThreadItem,
  CustomEmoji,
} from '@/types/chat';
import { conversationTitle } from '@/utils/chat';
import { useProjectsStore } from '@/stores/projects';

/** Cuántos mensajes se piden por página (hacia atrás). */
const PAGE = 50;

/**
 * Mensajería al estilo Slack (backend/chat-service). chat-service es la única fuente de verdad: enviar y marcar leído van por REST; el
 * socket del hub (`utils/realtime.ts`) solo avisa y aquí se aplica el aviso. Al reconectar se vuelve a pedir lo que pudo perderse.
 *
 * - Envío optimista: el mensaje aparece al instante con `pending`, con un `clientMsgId` propio; la respuesta del servidor (o el mismo
 *   mensaje llegando por socket) lo reemplaza. Reintentar reusa el `clientMsgId`: el servidor no lo duplica.
 * - Leído: se avanza el cursor cuando la conversación está abierta y la pestaña visible; el servidor nunca lo deja retroceder.
 */
export const useChatStore = defineStore('chat', () => {
  const conversations = ref<ConversationSummary[]>([]);
  const loaded = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const activeId = ref<string | null>(null);
  const details = ref(new Map<string, ConversationDetail>());
  const messages = ref(new Map<string, ChatMessage[]>());
  const pages = ref(new Map<string, { hasOlder: boolean; lastReadSeq: number | null }>());
  const unread = ref<UnreadSummary>({ conversations: 0, mentions: 0, latest: [] });
  /** Hilo abierto en el panel derecho y las respuestas cargadas de cada hilo. */
  const threadId = ref<string | null>(null);
  const threads = ref(new Map<string, ChatMessage[]>());
  /** Permiso de notificaciones del navegador (se pide con un botón, nunca al cargar). */
  const browserPermission = ref<NotificationPermission | 'unsupported'>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  /** Vista «Hilos»: los hilos que sigo (paginados) y mi cursor de leído por hilo, para no volver a avisar al servidor lo mismo. */
  const threadInbox = ref<ChatThreadItem[]>([]);
  const threadsCursor = ref<string | null>(null);
  const threadsLoaded = ref(false);
  const threadCursors = new Map<string, number>();
  /** Emojis personalizados de la organización, por nombre (`:fiesta:` → su imagen). */
  const emojis = ref(new Map<string, CustomEmoji>());
  const emojiList = computed(() => [...emojis.value.values()].sort((a, b) => a.name.localeCompare(b.name)));
  /** Presencia del equipo (punto verde / ausente), según el hub del gateway. Sin dato = desconectado. */
  const presence = ref(new Map<string, PresenceState>());
  /** «Escribiendo…»: por conversación (o hilo, `conv|raíz`), quién y hasta cuándo se muestra. */
  const typing = ref(new Map<string, Map<string, number>>());

  const myId = () => {
    const u = useAuthStore().user as { id?: string } | null;
    return u?.id?.toLowerCase() ?? '';
  };

  const channels = computed(() => conversations.value.filter((c) => c.kind === 'channel').sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')));
  const directs = computed(() =>
    conversations.value
      .filter((c) => c.kind !== 'channel')
      .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')),
  );
  const active = computed(() => (activeId.value ? details.value.get(activeId.value) ?? null : null));
  const activeMessages = computed(() => (activeId.value ? messages.value.get(activeId.value) ?? [] : []));
  const threadMessages = computed(() => (threadId.value ? threads.value.get(threadId.value) ?? [] : []));
  /** La raíz del hilo abierto, tal como está en la conversación (con su contador al día). */
  const threadRoot = computed(() => (threadId.value ? findMessage(threadId.value) : null));
  /** Para el globo del menú y el sobre de la barra superior. */
  /** Las menciones en hilos suman al globo (como en Slack); los hilos con respuestas nuevas, al punto de «hay algo». */
  const badge = computed(() => ({
    mentions: unread.value.mentions + (unread.value.threads?.mentions ?? 0),
    any: unread.value.conversations > 0 || (unread.value.threads?.unread ?? 0) > 0,
  }));

  // ── Carga ──────────────────────────────────────────────────────────────────

  async function loadConversations(): Promise<void> {
    loading.value = !loaded.value;
    try {
      conversations.value = await chatApi.conversations();
      loaded.value = true;
      refreshPresence();
      void loadEmojis();
      error.value = null;
    } catch (e) {
      error.value = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'error';
    } finally {
      loading.value = false;
    }
  }

  async function refreshUnread(): Promise<void> {
    try {
      unread.value = await chatApi.unread();
    } catch {
      // El sobre y el globo esperan al siguiente aviso; no es motivo para molestar a nadie.
    }
  }

  async function open(conversationId: string, around?: string): Promise<void> {
    activeId.value = conversationId;
    const [detail, page] = await Promise.all([chatApi.get(conversationId), chatApi.messages(conversationId, around ? { around, limit: PAGE } : { limit: PAGE })]);
    details.value.set(conversationId, detail);
    messages.value.set(conversationId, mergeMessages([], page.items));
    pages.value.set(conversationId, { hasOlder: page.hasOlder, lastReadSeq: page.lastReadSeq });
    upsertSummary(detail);
  }

  async function loadOlder(conversationId: string): Promise<boolean> {
    const list = messages.value.get(conversationId) ?? [];
    const first = list.find((m) => m.seq !== null)?.seq;
    if (!first || !pages.value.get(conversationId)?.hasOlder) return false;
    const page = await chatApi.messages(conversationId, { before: first, limit: PAGE });
    messages.value.set(conversationId, mergeMessages(messages.value.get(conversationId) ?? [], page.items));
    pages.value.set(conversationId, { ...pages.value.get(conversationId)!, hasOlder: page.hasOlder });
    return true;
  }

  // ── Leído ──────────────────────────────────────────────────────────────────

  let readTimer: ReturnType<typeof setTimeout> | null = null;
  /** Marca leído lo último de la conversación abierta (agrupado: un aviso por ráfaga de mensajes). */
  function markActiveRead(): void {
    if (readTimer) clearTimeout(readTimer);
    readTimer = setTimeout(async () => {
      const id = activeId.value;
      const detail = id ? details.value.get(id) : null;
      if (!id || !detail?.isMember || document.hidden) return;
      const last = lastSeq(id);
      if (!last || last <= (detail.me?.lastReadSeq ?? 0)) return;
      try {
        const r = await chatApi.read(id, last);
        applyRead(id, r.lastReadSeq, r.unreadCount, r.mentionCount);
        void refreshUnread();
      } catch {
        // se reintenta con el siguiente mensaje o al volver a la pestaña
      }
    }, 400);
  }

  function applyRead(id: string, lastReadSeq: number, unreadCount = 0, mentionCount = 0): void {
    const s = conversations.value.find((c) => c.id === id);
    if (s) Object.assign(s, { unreadCount, mentionCount, me: s.me ? { ...s.me, lastReadSeq } : s.me });
    const d = details.value.get(id);
    if (d?.me) details.value.set(id, { ...d, unreadCount, mentionCount, me: { ...d.me, lastReadSeq } });
  }

  // ── Escribir ───────────────────────────────────────────────────────────────

  /**
   * Sube un archivo pegado, soltado o elegido con el clip y devuelve su id en document-service (el mensaje guarda ese id, no la URL,
   * que caduca). Cuelga de la conversación (`chat_conversation`): document-service nunca lista esos archivos por recurso, así que solo
   * los ve quien recibe el mensaje que los enlaza (IMPLEMENTATION.md, privacidad).
   */
  async function uploadFile(conversationId: string, file: File): Promise<string | null> {
    const mimeType = file.type || 'application/octet-stream';
    try {
      const presigned = await fileApi.requestPresigned({
        resourceType: 'chat_conversation',
        resourceId: conversationId,
        category: 'attachment',
        originalName: file.name,
        mimeType,
        size: file.size,
      });
      const upload = await fetch(presigned.presignedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': mimeType } });
      if (!upload.ok) throw new Error(`HTTP ${upload.status}`);
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const checksum = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
      await fileApi.confirm(presigned.fileId, checksum);
      return presigned.fileId;
    } catch (e) {
      notify.error(extractError(e));
      return null;
    }
  }

  async function send(conversationId: string, bodyDoc: RichDoc, retryOf?: ChatMessage, threadRootId: string | null = null): Promise<void> {
    const clientMsgId = retryOf?.clientMsgId ?? crypto.randomUUID();
    const rootId = retryOf?.threadRootId ?? threadRootId;
    const draft: ChatMessage = retryOf
      ? { ...retryOf, pending: 'sending' }
      : {
          id: `local-${clientMsgId}`,
          conversationId,
          seq: null,
          threadRootId: rootId,
          threadSeq: null,
          senderId: myId(),
          kind: 'user',
          bodyDoc,
          bodyText: null,
          clientMsgId,
          replyCount: 0,
          lastReplyAt: null,
          replyUserIds: [],
          reactions: [],
          mentionsMe: false,
          editedAt: null,
          deletedAt: null,
          createdAt: new Date().toISOString(),
          pending: 'sending',
        };
    const put = (m: ChatMessage) => {
      if (rootId) threads.value.set(rootId, mergeThread(threads.value.get(rootId) ?? [], [m]));
      else messages.value.set(conversationId, mergeMessages(messages.value.get(conversationId) ?? [], [m]));
    };
    put(draft);
    try {
      const saved = await chatApi.send(conversationId, { clientMsgId, bodyDoc: draft.bodyDoc ?? bodyDoc, threadRootId: rootId });
      put(saved);
      if (rootId) countReply(rootId, saved);
      else bumpSummary(conversationId, saved, true);
      // Escribir en un canal público sin estar une a la persona: el detalle cambia.
      if (!details.value.get(conversationId)?.isMember) details.value.set(conversationId, await chatApi.get(conversationId));
    } catch {
      put({ ...draft, pending: 'failed' });
    }
  }

  // ── Hilos ──────────────────────────────────────────────────────────────────

  async function openThread(rootId: string): Promise<void> {
    threadId.value = rootId;
    const page = await chatApi.replies(rootId, { limit: 100 });
    threads.value.set(rootId, mergeThread([], page.items));
    replaceMessage(page.root, true);
  }

  function closeThread(): void {
    threadId.value = null;
  }

  // ── Emojis personalizados ──────────────────────────────────────────────────

  let emojisAt = 0;
  let unknownAt = 0;
  /**
   * La lista de la organización. Sin evento propio: se pide al entrar al chat, al abrir el selector (si tiene más de `maxAgeMs`) y
   * cuando aparece un `:nombre:` que no se conoce (`ensureEmoji`): así un emoji recién subido por otra persona aparece solo.
   */
  async function loadEmojis(force = false, maxAgeMs = 30_000): Promise<void> {
    if (!force && Date.now() - emojisAt < maxAgeMs) return;
    emojisAt = Date.now();
    try {
      emojis.value = new Map((await chatApi.emojis()).map((e) => [e.name, e]));
    } catch {
      // Sin la lista se ve `:nombre:` en texto; se reintenta en la próxima.
      emojisAt = 0;
    }
  }

  /** Un mensaje trae `:nombre:` que no está en la lista: se vuelve a pedir (como mucho una vez cada 5 s, aunque haya muchos). */
  let unknownTimer: ReturnType<typeof setTimeout> | null = null;
  function ensureEmoji(name: string): void {
    if (emojis.value.has(name) || unknownTimer) return;
    // Frenado: no se descarta, se agenda para cuando termine el freno (un emoji recién subido llega justo después de cargar la lista).
    const wait = Math.max(0, unknownAt + 5_000 - Date.now());
    unknownTimer = setTimeout(() => {
      unknownTimer = null;
      unknownAt = Date.now();
      void loadEmojis(true);
    }, wait);
  }

  /** Sube la imagen a document-service y la registra con su nombre. Devuelve el emoji (con el nombre ya normalizado por el servidor). */
  async function addEmoji(file: File, name: string): Promise<CustomEmoji> {
    const user = useAuthStore().user as { id?: string; orgId?: string } | null;
    const mimeType = file.type || 'image/png';
    const presigned = await fileApi.requestPresigned({
      resourceType: 'chat_emoji',
      resourceId: user?.orgId ?? user?.id ?? 'org',
      category: 'emoji',
      originalName: file.name,
      mimeType,
      size: file.size,
    });
    const upload = await fetch(presigned.presignedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': mimeType } });
    if (!upload.ok) throw new Error(`HTTP ${upload.status}`);
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    await fileApi.confirm(presigned.fileId, Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join(''));
    const emoji = await chatApi.createEmoji(name, presigned.fileId);
    emojis.value = new Map(emojis.value).set(emoji.name, emoji);
    return emoji;
  }

  async function removeEmoji(emoji: CustomEmoji): Promise<void> {
    await chatApi.removeEmoji(emoji.id);
    const next = new Map(emojis.value);
    next.delete(emoji.name);
    emojis.value = next;
  }

  // ── Vista «Hilos» ──────────────────────────────────────────────────────────

  async function loadThreads(more = false): Promise<void> {
    const page = await chatApi.threads({ cursor: more ? threadsCursor.value ?? undefined : undefined, limit: 20 });
    threadInbox.value = more ? [...threadInbox.value, ...page.items.filter((x) => !threadInbox.value.some((y) => y.root.id === x.root.id))] : page.items;
    threadsCursor.value = page.nextCursor;
    threadsLoaded.value = true;
    for (const x of page.items) threadCursors.set(x.root.id, x.lastReadThreadSeq);
  }

  /**
   * Leí el hilo hasta su última respuesta cargada. Solo se avisa al servidor si eso adelanta mi cursor (abrir el mismo hilo diez veces
   * no son diez peticiones). Sin seguir el hilo, el servidor no cambia nada.
   */
  async function markThreadRead(rootId: string): Promise<void> {
    const replies = threads.value.get(rootId) ?? [];
    const seq = Math.max(0, ...replies.map((m) => m.threadSeq ?? 0));
    if (!seq || (threadCursors.get(rootId) ?? -1) >= seq) return;
    threadCursors.set(rootId, seq);
    try {
      const res = await chatApi.markThreadRead(rootId, seq);
      const item = threadInbox.value.find((x) => x.root.id === rootId);
      if (item && res.lastReadThreadSeq !== null) Object.assign(item, { lastReadThreadSeq: res.lastReadThreadSeq, unreadCount: res.unreadCount, mentionCount: res.mentionCount });
      void refreshUnread();
    } catch {
      threadCursors.delete(rootId); // se reintenta la próxima vez
    }
  }

  let threadsTimer: ReturnType<typeof setTimeout> | null = null;
  /** Una ráfaga de respuestas en hilos: contadores (y la vista, si está cargada) una sola vez. */
  function scheduleThreadsRefresh(): void {
    if (threadsTimer) clearTimeout(threadsTimer);
    threadsTimer = setTimeout(() => {
      void refreshUnread();
      if (threadsLoaded.value) void loadThreads().catch(() => undefined);
    }, 400);
  }

  // ── Editar, borrar, reaccionar ─────────────────────────────────────────────

  async function edit(m: ChatMessage, bodyDoc: RichDoc): Promise<void> {
    replaceMessage(await chatApi.edit(m.id, bodyDoc), true);
  }

  async function remove(m: ChatMessage): Promise<void> {
    await chatApi.remove(m.id);
    replaceMessage({ ...m, bodyDoc: null, bodyText: null, deletedAt: new Date().toISOString(), reactions: [] }, false);
  }

  /** Poner o quitar mi reacción. Se ve al instante; si el servidor falla, vuelve a como estaba. */
  async function toggleReaction(m: ChatMessage, emoji: string): Promise<void> {
    const me = myId();
    const had = m.reactions.some((r) => r.emoji === emoji && r.userIds.includes(me));
    applyReaction(m.id, emoji, me, !had);
    try {
      if (had) await chatApi.unreact(m.id, emoji);
      else await chatApi.react(m.id, emoji);
    } catch {
      applyReaction(m.id, emoji, me, had);
    }
  }

  async function setPreferences(conversationId: string, prefs: { notify?: NotifyLevel; muted?: boolean }): Promise<void> {
    const me = await chatApi.preferences(conversationId, prefs);
    const d = details.value.get(conversationId);
    if (d) details.value.set(conversationId, { ...d, me });
    const s = conversations.value.find((c) => c.id === conversationId);
    if (s) s.me = me;
    void refreshUnread();
  }

  async function askBrowserPermission(): Promise<void> {
    if (typeof Notification === 'undefined') return;
    browserPermission.value = await Notification.requestPermission();
  }

  async function createChannel(input: { name: string; visibility: ChannelVisibility; topic?: string; userIds?: string[] }): Promise<ConversationDetail> {
    const c = await chatApi.create({ kind: 'channel', ...input });
    details.value.set(c.id, c);
    upsertSummary(c);
    return c;
  }

  async function openDirect(userIds: string[]): Promise<ConversationDetail> {
    const c = await chatApi.create({ kind: userIds.length === 1 ? 'dm' : 'group_dm', userIds });
    details.value.set(c.id, c);
    upsertSummary(c);
    return c;
  }

  async function join(conversationId: string): Promise<void> {
    const c = await chatApi.join(conversationId);
    details.value.set(c.id, c);
    upsertSummary(c);
  }

  async function leave(conversationId: string): Promise<void> {
    await chatApi.removeMember(conversationId, myId());
    conversations.value = conversations.value.filter((c) => c.id !== conversationId);
    const d = details.value.get(conversationId);
    if (d) details.value.set(conversationId, { ...d, isMember: false, me: null });
  }

  // ── Tiempo real ────────────────────────────────────────────────────────────

  async function onMessageNew(evt: ChatMessageEvent): Promise<void> {
    let message = evt.message ?? null;
    // Quien escribía ya envió: fuera de «escribiendo…» sin esperar a que caduque.
    if (message?.senderId) stopTyping(typingKey(evt.conversationId, evt.threadRootId ?? null), message.senderId);
    const loadedHere = messages.value.has(evt.conversationId);
    if (!message && loadedHere) {
      try {
        message = await chatApi.message(evt.messageId);
      } catch {
        return;
      }
    }
    if (message && evt.threadRootId) {
      // Respuesta de hilo: al hilo si está cargado, y el contador de la raíz en la conversación. El canal no queda sin leer.
      if (threads.value.has(evt.threadRootId)) threads.value.set(evt.threadRootId, mergeThread(threads.value.get(evt.threadRootId) ?? [], [message]));
      countReply(evt.threadRootId, message);
      notifyBrowser(evt, message);
      // Con el hilo a la vista, la respuesta ya se leyó; si no, cambian los contadores de «Hilos».
      if (threadId.value === evt.threadRootId && !document.hidden) void markThreadRead(evt.threadRootId);
      else scheduleThreadsRefresh();
      return;
    }
    if (message && loadedHere) {
      messages.value.set(evt.conversationId, mergeMessages(messages.value.get(evt.conversationId) ?? [], [message]));
    }
    notifyBrowser(evt, message);
    const mine = message?.senderId === myId();
    if (!conversations.value.some((c) => c.id === evt.conversationId)) {
      await loadConversations();
    } else if (message) {
      bumpSummary(evt.conversationId, message, mine);
    }
    if (evt.conversationId === activeId.value && !document.hidden) markActiveRead();
    else void refreshUnread();
  }

  /** Vuelve a pedir una conversación (tras renombrarla o cambiar sus miembros desde «Detalles») y la lista de la barra. */
  async function refreshDetail(conversationId: string): Promise<void> {
    details.value.set(conversationId, await chatApi.get(conversationId));
    await loadConversations();
  }

  let listTimer: ReturnType<typeof setTimeout> | null = null;
  /** Cambió una conversación (creada, renombrada, archivada, alguien entró o salió): se vuelve a pedir, agrupando ráfagas. */
  function onConversationChanged(evt: { event: string; conversationId: string }): void {
    if (listTimer) clearTimeout(listTimer);
    listTimer = setTimeout(async () => {
      await loadConversations();
      if (evt.conversationId === activeId.value) {
        try {
          details.value.set(evt.conversationId, await chatApi.get(evt.conversationId));
        } catch {
          // ya no se puede leer (me quitaron de un privado): la vista lo trata al ver que falta
          details.value.delete(evt.conversationId);
        }
      }
      void refreshUnread();
    }, 250);
  }

  /** Alguien editó un mensaje: el texto nuevo (lo trae el hub; si no, se pide). Las reacciones de aquí se conservan. */
  async function onMessageUpdated(evt: ChatMessageEvent): Promise<void> {
    if (!findMessage(evt.messageId)) return;
    let message = evt.message ?? null;
    if (!message) {
      try {
        message = await chatApi.message(evt.messageId);
      } catch {
        return;
      }
    }
    replaceMessage(message, true);
  }

  function onMessageDeleted(evt: { messageId: string }): void {
    const m = findMessage(evt.messageId);
    if (m) replaceMessage({ ...m, bodyDoc: null, bodyText: null, deletedAt: new Date().toISOString(), reactions: [] }, false);
  }

  /** Reacción de otra persona (o mía desde otra pestaña). Idempotente: si ya estaba aplicada, no cambia nada. */
  function onReactionChanged(evt: { messageId: string; emoji: string; userId: string; added: boolean }): void {
    applyReaction(evt.messageId, evt.emoji, evt.userId, evt.added);
  }

  /** Leí en otra pestaña o en otro equipo: los contadores de aquí se ponen al día. */
  function onRead(evt: { conversationId: string; lastReadSeq: number | null }): void {
    if (typeof evt.lastReadSeq !== 'number') return;
    applyRead(evt.conversationId, evt.lastReadSeq);
    void refreshUnread();
  }

  /** Tras reconectar el socket: lo que llegó sin conexión. */
  async function resync(): Promise<void> {
    await Promise.all([loadConversations(), refreshUnread()]);
    const id = activeId.value;
    const last = id ? lastSeq(id) : null;
    if (id && last) {
      const page = await chatApi.messages(id, { after: last, limit: 100 });
      messages.value.set(id, mergeMessages(messages.value.get(id) ?? [], page.items));
      markActiveRead();
    }
  }

  function close(): void {
    activeId.value = null;
    threadId.value = null;
  }

  /** Al cerrar sesión: nada de una persona queda para la siguiente en esta pestaña. */
  function reset(): void {
    conversations.value = [];
    loaded.value = false;
    activeId.value = null;
    details.value = new Map();
    messages.value = new Map();
    pages.value = new Map();
    unread.value = { conversations: 0, mentions: 0, latest: [] };
    threadId.value = null;
    threads.value = new Map();
    presence.value = new Map();
    typing.value = new Map();
    threadInbox.value = [];
    threadsCursor.value = null;
    threadsLoaded.value = false;
    threadCursors.clear();
  }

  // ── Presencia y «escribiendo…» (socket, no REST: contrato en chat-service/docs/tiempo-real.md) ─────────────────────────────

  /** Pide al hub el estado de estas personas (las de la barra y la conversación abierta). Solo responde por las de mi organización. */
  function loadPresence(userIds: string[]): void {
    const socket = getSocket();
    const ids = [...new Set(userIds)].filter(Boolean).slice(0, 200);
    if (!socket?.connected || !ids.length) return;
    socket.emit('chat:presence', { userIds: ids }, (res: { ok: boolean; data?: Record<string, PresenceState> }) => {
      if (!res?.ok || !res.data) return;
      const next = new Map(presence.value);
      for (const [id, state] of Object.entries(res.data)) next.set(id.toLowerCase(), state);
      presence.value = next;
    });
  }

  function onPresence(evt: { userId: string; state: PresenceState }): void {
    const next = new Map(presence.value);
    next.set(evt.userId.toLowerCase(), evt.state);
    presence.value = next;
  }

  /** La presencia de quienes salen en la barra (los de mis mensajes directos). Al conectar y al cargar la lista. */
  function refreshPresence(extra: string[] = []): void {
    loadPresence([...conversations.value.filter((c) => c.kind !== 'channel').flatMap((c) => c.participantUserIds), ...extra]);
  }

  const presenceOf = (userId: string | null | undefined): PresenceState => (userId ? presence.value.get(userId.toLowerCase()) ?? 'offline' : 'offline');

  const typingKey = (conversationId: string, threadRootId: string | null) => `${conversationId}|${threadRootId ?? ''}`;
  const TYPING_SHOWN_MS = 5_000;
  const lastTypingSent = new Map<string, number>();

  function stopTyping(key: string, userId: string): void {
    const who = typing.value.get(key);
    if (!who?.has(userId)) return;
    const next = new Map(who);
    next.delete(userId);
    const all = new Map(typing.value);
    if (next.size) all.set(key, next);
    else all.delete(key);
    typing.value = all;
  }

  function onTyping(evt: { conversationId: string; threadRootId: string | null; userId: string }): void {
    const key = typingKey(evt.conversationId, evt.threadRootId);
    const userId = evt.userId.toLowerCase();
    const until = Date.now() + TYPING_SHOWN_MS;
    const all = new Map(typing.value);
    all.set(key, new Map(all.get(key) ?? []).set(userId, until));
    typing.value = all;
    // Se borra solo si no llegó otro aviso entretanto (cada uno corre la hora de caducar).
    setTimeout(() => {
      if ((typing.value.get(key)?.get(userId) ?? 0) <= Date.now()) stopTyping(key, userId);
    }, TYPING_SHOWN_MS + 50);
  }

  /** Quién escribe en esta conversación o hilo (sin mí). */
  function typingIn(conversationId: string, threadRootId: string | null = null): string[] {
    const me = myId();
    return [...(typing.value.get(typingKey(conversationId, threadRootId))?.keys() ?? [])].filter((u) => u !== me);
  }

  /** Avisar que escribo: como mucho uno cada 3 s (el hub también lo limita). */
  function notifyTyping(conversationId: string, threadRootId: string | null = null): void {
    const key = typingKey(conversationId, threadRootId);
    const now = Date.now();
    if (now - (lastTypingSent.get(key) ?? -Infinity) < 3_000) return;
    lastTypingSent.set(key, now);
    getSocket()?.emit('chat:typing', { conversationId, threadRootId });
  }

  // ── Ayudantes ──────────────────────────────────────────────────────────────

  /** Un mensaje cargado, esté en una conversación o en un hilo. */
  function findMessage(id: string): ChatMessage | null {
    for (const list of messages.value.values()) {
      const m = list.find((x) => x.id === id);
      if (m) return m;
    }
    for (const list of threads.value.values()) {
      const m = list.find((x) => x.id === id);
      if (m) return m;
    }
    return null;
  }

  /** Reemplaza un mensaje donde esté cargado. `keepReactions`: lo que trae el hub no trae reacciones (dependen de quién mira). */
  function replaceMessage(m: ChatMessage, keepReactions: boolean): void {
    const swap = (list: ChatMessage[]) => list.map((x) => (x.id === m.id ? { ...m, reactions: keepReactions && !m.reactions.length ? x.reactions : m.reactions } : x));
    for (const [k, list] of messages.value) if (list.some((x) => x.id === m.id)) messages.value.set(k, swap(list));
    for (const [k, list] of threads.value) if (list.some((x) => x.id === m.id)) threads.value.set(k, swap(list));
  }

  function applyReaction(messageId: string, emoji: string, userId: string, add: boolean): void {
    const m = findMessage(messageId);
    if (!m) return;
    const me = myId();
    const groups = m.reactions.map((r) => ({ ...r, userIds: [...r.userIds] }));
    let g = groups.find((r) => r.emoji === emoji);
    if (add) {
      if (!g) groups.push((g = { emoji, count: 0, userIds: [], mine: false }));
      if (!g.userIds.includes(userId)) g.userIds.push(userId);
    } else if (g) {
      g.userIds = g.userIds.filter((u) => u !== userId);
    }
    const next = groups.filter((r) => r.userIds.length).map((r) => ({ ...r, count: r.userIds.length, mine: r.userIds.includes(me) }));
    replaceMessage({ ...m, reactions: next }, false);
  }

  /** Una respuesta nueva en un hilo: la raíz suma una, con quien respondió al frente (una sola vez por respuesta). */
  const countedReplies = new Set<string>();
  function countReply(rootId: string, reply: ChatMessage): void {
    if (countedReplies.has(reply.id)) return;
    countedReplies.add(reply.id);
    const root = findMessage(rootId);
    if (!root) return;
    const who = reply.senderId ?? '';
    replaceMessage(
      { ...root, replyCount: root.replyCount + 1, lastReplyAt: reply.createdAt, replyUserIds: [who, ...root.replyUserIds.filter((u) => u !== who)].slice(0, 3) },
      true,
    );
  }

  /**
   * Notificación del navegador: solo si el servidor marcó este mensaje como «avísale» (`notify`), el permiso está dado y la persona no lo
   * está viendo (pestaña oculta u otra conversación). Una por conversación (`tag`): la siguiente reemplaza a la anterior.
   */
  function notifyBrowser(evt: ChatMessageEvent, message: ChatMessage | null): void {
    if (!evt.notify || browserPermission.value !== 'granted' || typeof Notification === 'undefined') return;
    if (!document.hidden && evt.conversationId === activeId.value) return;
    const directory = useProjectsStore();
    const summary = conversations.value.find((c) => c.id === evt.conversationId);
    const who = message?.senderId ? directory.users.get(message.senderId) : undefined;
    const sender = who?.fullName || who?.email || '';
    const where = summary ? conversationTitle(summary, directory.users, (n) => `+${n}`) : '';
    const title = summary?.kind === 'channel' ? `${sender} · #${where}` : sender || where;
    const body = (message?.bodyText ?? '').slice(0, 140);
    try {
      const n = new Notification(title, { body, tag: evt.conversationId, icon: '/favicon.ico' });
      n.onclick = async () => {
        window.focus();
        const { default: router } = await import('@/router');
        void router.push({ name: 'messages', params: { conversationId: evt.conversationId }, query: evt.threadRootId ? { thread: evt.threadRootId } : {} });
        n.close();
      };
    } catch {
      // Algunos navegadores (Android) solo permiten notificaciones desde un service worker: no es grave, queda el globo.
    }
  }

  function lastSeq(conversationId: string): number | null {
    const list = messages.value.get(conversationId) ?? [];
    for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].seq !== null) return list[i].seq;
    return null;
  }

  function upsertSummary(c: ConversationSummary): void {
    if (!c.me) return; // un canal público visto sin unirse no va a la barra lateral
    const i = conversations.value.findIndex((x) => x.id === c.id);
    const summary: ConversationSummary = { ...c };
    if (i === -1) conversations.value = [...conversations.value, summary];
    else conversations.value.splice(i, 1, { ...conversations.value[i], ...summary });
  }

  function bumpSummary(conversationId: string, m: ChatMessage, mine: boolean): void {
    const s = conversations.value.find((c) => c.id === conversationId);
    if (!s || m.seq === null) return;
    s.lastMessageAt = m.createdAt;
    s.lastMessageSeq = Math.max(s.lastMessageSeq, m.seq);
    if (mine) {
      // Escribir marca leído lo anterior (como Slack; el servidor hace lo mismo).
      s.unreadCount = 0;
      s.mentionCount = 0;
      if (s.me) s.me = { ...s.me, lastReadSeq: Math.max(s.me.lastReadSeq, m.seq) };
    } else if (conversationId !== activeId.value || document.hidden) {
      s.unreadCount = Math.min(99, s.unreadCount + 1);
      if (m.mentionsMe || s.kind !== 'channel') s.mentionCount = Math.min(99, s.mentionCount + 1);
    }
  }

  return {
    conversations,
    loaded,
    loading,
    error,
    activeId,
    active,
    activeMessages,
    details,
    pages,
    unread,
    threadId,
    threads,
    threadMessages,
    threadRoot,
    browserPermission,
    presence,
    typing,
    loadPresence,
    refreshPresence,
    onPresence,
    presenceOf,
    onTyping,
    typingIn,
    notifyTyping,
    channels,
    directs,
    badge,
    loadConversations,
    refreshUnread,
    open,
    loadOlder,
    markActiveRead,
    send,
    uploadFile,
    openThread,
    closeThread,
    emojis,
    emojiList,
    loadEmojis,
    ensureEmoji,
    addEmoji,
    removeEmoji,
    threadInbox,
    threadsCursor,
    threadsLoaded,
    loadThreads,
    markThreadRead,
    edit,
    remove,
    toggleReaction,
    setPreferences,
    askBrowserPermission,
    onMessageUpdated,
    onMessageDeleted,
    onReactionChanged,
    createChannel,
    openDirect,
    join,
    leave,
    onMessageNew,
    onConversationChanged,
    refreshDetail,
    onRead,
    resync,
    close,
    reset,
  };
});

/** Como `mergeMessages`, pero ordena por `threadSeq` (las respuestas de un hilo). */
export function mergeThread(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  return mergeMessages(
    current.map((m) => ({ ...m, seq: m.threadSeq })),
    incoming.map((m) => ({ ...m, seq: m.threadSeq })),
  ).map((m) => ({ ...m, seq: null }));
}

/**
 * Une dos listas de mensajes sin repetir: por `id`, o por `clientMsgId` (el borrador local se reemplaza por el guardado). Ordena por
 * `seq`; los borradores sin `seq` van al final, en el orden en que se escribieron.
 */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const out = [...current];
  for (const m of incoming) {
    const i = out.findIndex((x) => x.id === m.id || (m.clientMsgId !== null && x.clientMsgId === m.clientMsgId));
    if (i === -1) out.push(m);
    // Un borrador nunca pisa al mensaje ya confirmado (puede llegar primero por socket).
    else if (!(m.pending && !out[i].pending)) out[i] = m;
  }
  return out.sort((a, b) => {
    if (a.seq === null && b.seq === null) return a.createdAt.localeCompare(b.createdAt);
    if (a.seq === null) return 1;
    if (b.seq === null) return -1;
    return a.seq - b.seq;
  });
}
