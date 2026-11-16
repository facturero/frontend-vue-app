<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { chatApi } from '@/api/chat';
import { useProjectsStore } from '@/stores/projects';
import { useConfirm } from '@/composable/useConfirm';
import { useNotify } from '@/composable/useNotify';
import { conversationTitle, draftHasContent, messageRows, typingText } from '@/utils/chat';
import { extractError } from '@/utils/error';
import type { RichDoc } from '@/types/projects';
import type { ChatMessage, NotifyLevel } from '@/types/chat';
import RichTextEditor from '@/components/projects/RichTextEditor.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ChatMessageRow from './ChatMessageRow.vue';
import ChatThreadPanel from './ChatThreadPanel.vue';
import CrmLinkPicker from './CrmLinkPicker.vue';
import ChannelDetailsDialog from './ChannelDetailsDialog.vue';
import EmojiPicker from './EmojiPicker.vue';

/**
 * La conversación abierta: encabezado (nombre, tema, miembros, menú), los mensajes y el editor. Al abrir se va a la línea de «nuevos»
 * (o al final); si llega un mensaje y la persona está abajo, baja sola; si está leyendo más arriba, aparece «Mensajes nuevos».
 * Subir hasta arriba pide la página anterior sin mover lo que se está leyendo.
 */
const props = defineProps<{ conversationId: string; mobile: boolean }>();
const emit = defineEmits<{ back: [] }>();
const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const chat = useChatStore();
const auth = useAuthStore();
const directory = useProjectsStore();
const confirm = useConfirm();
const notify = useNotify();

const scroller = ref<HTMLElement | null>(null);
const editor = ref<InstanceType<typeof RichTextEditor> | null>(null);
const upload = (file: File) => chat.uploadFile(props.conversationId, file);
/** Buscador de registros del CRM: lo abre su botón o «/» en el editor vacío. */
const crmOpen = ref(false);
/** «Detalles del canal» (acerca de / miembros): el título, el contador de miembros o el menú lo abren. */
const detailsOpen = ref(false);
const detailsTab = ref<'about' | 'members'>('about');
const openDetails = (tab: 'about' | 'members') => {
  detailsTab.value = tab;
  detailsOpen.value = true;
};
const draft = ref<RichDoc | null>(null);
// Mientras se escribe, el resto ve «escribiendo…» (el store lo limita a uno cada 3 s).
watch(draft, (d) => {
  if (draftHasContent(d)) chat.notifyTyping(props.conversationId);
});
const typingLabel = computed(() => typingText(chat.typingIn(props.conversationId), directory.users, t, t('chat.unknownUser')));
/** En un mensaje directo 1-a-1, la otra persona: su presencia va en el encabezado. */
const dmPeer = computed(() => (detail.value?.kind === 'dm' ? detail.value.participantUserIds[0] ?? null : null));
const loading = ref(true);
const failure = ref<string | null>(null);
const busy = ref(false);
/** Cursor de leído AL ABRIR: la línea de «nuevos» se queda ahí aunque al leer avance. */
const readAtOpen = ref<number | null>(null);
const newBelow = ref(false);
/** A quién se puede @mencionar: los miembros (en un canal público sin unirse, nadie: hay que unirse para escribir). */
const memberIds = ref<string[] | null>(null);
/** Mensaje del enlace permanente (`?m=`): se resalta un momento al abrir. */
const highlighted = ref<string | null>(null);

const myId = computed(() => ((auth.user as { id?: string } | null)?.id ?? '').toLowerCase());
const detail = computed(() => chat.details.get(props.conversationId) ?? null);
const rows = computed(() => messageRows(chat.activeMessages, readAtOpen.value, myId.value));
const title = computed(() => (detail.value ? conversationTitle(detail.value, directory.users, (n) => t('chat.andMore', { n })) : ''));
const isChannel = computed(() => detail.value?.kind === 'channel');
const canManage = computed(() => detail.value?.me?.role === 'owner' || auth.can('chat:admin'));
const canWrite = computed(() => !!detail.value?.isMember && !detail.value.archivedAt);
const mentionExtras = computed(() =>
  isChannel.value
    ? [
        { id: 'channel', label: t('chat.mention.channel'), hint: t('chat.mention.channelHint') },
        { id: 'here', label: t('chat.mention.here'), hint: t('chat.mention.hereHint') },
      ]
    : [],
);
const NOTIFY: NotifyLevel[] = ['all', 'mentions', 'none'];
const placeholder = computed(() => (isChannel.value ? t('chat.composer.channel', { name: title.value }) : t('chat.composer.direct', { name: title.value })));
const dayLabel = (day: string) => {
  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (day === iso(today)) return t('chat.today');
  if (day === iso(yesterday)) return t('chat.yesterday');
  return new Date(`${day}T12:00:00`).toLocaleDateString(locale.value, { weekday: 'long', day: 'numeric', month: 'long' });
};

function nearBottom(): boolean {
  const el = scroller.value;
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
}
async function toBottom(): Promise<void> {
  await nextTick();
  const el = scroller.value;
  if (el) el.scrollTop = el.scrollHeight;
  newBelow.value = false;
}
async function toFirstUnread(): Promise<void> {
  await nextTick();
  const line = scroller.value?.querySelector('[data-first-unread]') as HTMLElement | null;
  if (line && scroller.value) scroller.value.scrollTop = Math.max(0, line.offsetTop - 80);
  else await toBottom();
}

async function load(): Promise<void> {
  loading.value = true;
  failure.value = null;
  const around = typeof route.query.m === 'string' && !route.query.thread ? route.query.m : undefined;
  try {
    await chat.open(props.conversationId, around);
    readAtOpen.value = chat.pages.get(props.conversationId)?.lastReadSeq ?? null;
    if (around) await toMessage(around);
    else await toFirstUnread();
    chat.markActiveRead();
    void chatApi
      .members(props.conversationId)
      .then((list) => {
        memberIds.value = list.filter((m) => !m.inactive).map((m) => m.userId);
        chat.loadPresence(memberIds.value);
      })
      .catch(() => (memberIds.value = null));
    if (typeof route.query.thread === 'string') chat.threadId = route.query.thread;
  } catch (e) {
    failure.value = extractError(e);
  } finally {
    loading.value = false;
  }
}

async function toMessage(id: string): Promise<void> {
  await nextTick();
  const row = scroller.value?.querySelector(`[data-message-id="${id}"]`) as HTMLElement | null;
  if (!row || !scroller.value) return toBottom();
  scroller.value.scrollTop = Math.max(0, row.offsetTop - 120);
  highlighted.value = id;
  setTimeout(() => (highlighted.value = null), 2500);
}

function openThread(id: string): void {
  chat.threadId = id;
  void router.replace({ query: { ...route.query, thread: id, m: undefined } });
}
function closeThread(): void {
  chat.closeThread();
  const { thread: _t, ...rest } = route.query;
  void router.replace({ query: rest });
}
const prefs = (p: { notify?: NotifyLevel; muted?: boolean }) => run(() => chat.setPreferences(props.conversationId, p));

let loadingOlder = false;
async function onScroll(): Promise<void> {
  const el = scroller.value;
  if (!el) return;
  if (nearBottom()) newBelow.value = false;
  if (el.scrollTop > 60 || loadingOlder) return;
  loadingOlder = true;
  const before = el.scrollHeight;
  try {
    if (await chat.loadOlder(props.conversationId)) {
      await nextTick();
      el.scrollTop = el.scrollHeight - before + el.scrollTop;
    }
  } finally {
    loadingOlder = false;
  }
}

// Mensaje nuevo: abajo, se baja; leyendo arriba, aviso. Lo propio siempre baja.
watch(
  () => chat.activeMessages.length,
  async (now, before) => {
    if (loading.value || now <= before) return;
    const last = chat.activeMessages[now - 1];
    if (nearBottom() || last?.senderId === myId.value) await toBottom();
    else newBelow.value = true;
  },
);

// Otra conversación, o un enlace a otro mensaje de ESTA (un resultado de la búsqueda): se carga alrededor del mensaje. Un solo
// vigilante para las dos cosas: cambiar de conversación y de mensaje a la vez no carga dos veces.
watch(
  () => [props.conversationId, route.query.m] as const,
  ([c, m], [pc, pm]) => {
    if (c !== pc || (typeof m === 'string' && m !== pm)) void load();
  },
);
const onVisible = () => {
  if (document.hidden) return;
  chat.markActiveRead();
  if (chat.threadId) void chat.markThreadRead(chat.threadId);
};
onMounted(() => {
  void load();
  document.addEventListener('visibilitychange', onVisible);
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible);
  chat.close();
});

async function submit(): Promise<void> {
  const doc = draft.value;
  const empty = !doc || !JSON.stringify(doc).match(/"type":"(text|image|file|mention|crmLink)"/);
  if (empty) return;
  editor.value?.clear();
  draft.value = null;
  await chat.send(props.conversationId, doc);
}
const retry = (m: ChatMessage) => chat.send(props.conversationId, m.bodyDoc!, m);

async function run(work: () => Promise<void>, done?: string): Promise<void> {
  busy.value = true;
  try {
    await work();
    if (done) notify.success(done);
  } catch (e) {
    notify.error(extractError(e));
  } finally {
    busy.value = false;
  }
}
const join = () => run(() => chat.join(props.conversationId));
async function leave(): Promise<void> {
  if (!(await confirm({ title: t('chat.leave.title', { name: title.value }), text: t('chat.leave.text'), confirmText: t('chat.leave.confirm') }))) return;
  await run(async () => {
    await chat.leave(props.conversationId);
    if (detail.value?.visibility === 'private') emit('back');
  }, t('chat.leave.done', { name: title.value }));
}
async function toggleArchive(): Promise<void> {
  const archived = !!detail.value?.archivedAt;
  if (!archived && !(await confirm({ title: t('chat.archive.title', { name: title.value }), text: t('chat.archive.text'), confirmText: t('chat.archive.confirm') }))) return;
  await run(async () => {
    const c = archived ? await chatApi.unarchive(props.conversationId) : await chatApi.archive(props.conversationId);
    chat.details.set(c.id, c);
    await chat.loadConversations();
  }, t(archived ? 'chat.archive.undone' : 'chat.archive.done'));
}
</script>

<template>
  <div class="d-flex h-100">
  <div v-if="!(mobile && chat.threadId)" class="d-flex flex-column h-100 flex-grow-1" :style="{ minWidth: 0 }">
    <!-- Encabezado -->
    <div class="d-flex align-center ga-2 px-4 py-2">
      <v-btn v-if="mobile" icon="mdi-arrow-left" variant="text" size="small" :aria-label="t('common.back')" @click="emit('back')" />
      <v-icon v-if="detail && isChannel" :icon="detail.visibility === 'private' ? 'mdi-lock-outline' : 'mdi-pound'" size="small" />
      <div class="flex-grow-1" :style="{ minWidth: 0 }">
        <div v-if="isChannel" class="text-title-medium text-truncate cursor-pointer" data-channel-title @click="openDetails('about')">{{ title }}</div>
        <div v-else class="text-title-medium text-truncate">{{ title }}</div>
        <div v-if="detail?.topic" class="text-body-small text-medium-emphasis text-truncate">{{ detail.topic }}</div>
        <div v-else-if="dmPeer && chat.presenceOf(dmPeer) !== 'offline'" class="text-body-small text-medium-emphasis d-flex align-center ga-1">
          <v-icon icon="mdi-circle" size="8" :color="chat.presenceOf(dmPeer) === 'online' ? 'success' : 'warning'" />
          {{ t(`chat.presence.${chat.presenceOf(dmPeer)}`) }}
        </div>
      </div>
      <v-chip v-if="detail && isChannel" size="small" prepend-icon="mdi-account-multiple-outline" :aria-label="t('chat.details.membersAction')" @click="openDetails('members')">{{ detail.memberCount }}</v-chip>
      <v-menu v-if="detail" location="bottom end" :close-on-content-click="false">
        <template #activator="{ props: menu }">
          <v-btn v-bind="menu" :icon="detail.me?.muted ? 'mdi-bell-off-outline' : 'mdi-dots-vertical'" variant="text" size="small" :aria-label="t('chat.menu')" />
        </template>
        <v-list density="compact" min-width="260">
          <template v-if="detail.me">
            <v-list-subheader>{{ t('chat.notify.title') }}</v-list-subheader>
            <v-list-item
              v-for="n in NOTIFY"
              :key="n"
              :active="detail.me.notify === n"
              :prepend-icon="detail.me.notify === n ? 'mdi-radiobox-marked' : 'mdi-radiobox-blank'"
              :title="t(`chat.notify.${n}`)"
              :disabled="busy"
              @click="prefs({ notify: n })"
            />
            <v-list-item
              :prepend-icon="detail.me.muted ? 'mdi-bell-outline' : 'mdi-bell-off-outline'"
              :title="t(detail.me.muted ? 'chat.notify.unmute' : 'chat.notify.mute')"
              :subtitle="detail.me.muted ? undefined : t('chat.notify.muteHint')"
              :disabled="busy"
              @click="prefs({ muted: !detail.me.muted })"
            />
            <v-divider v-if="isChannel" class="my-1" />
          </template>
          <v-list-item v-if="isChannel" prepend-icon="mdi-information-outline" :title="t('chat.details.action')" @click="openDetails('about')" />
          <v-list-item v-if="isChannel && detail.isMember && !detail.isGeneral" prepend-icon="mdi-exit-run" :title="t('chat.leave.action')" @click="leave" />
          <v-list-item
            v-if="isChannel && canManage && !detail.isGeneral"
            :prepend-icon="detail.archivedAt ? 'mdi-archive-arrow-up-outline' : 'mdi-archive-outline'"
            :title="t(detail.archivedAt ? 'chat.archive.unarchive' : 'chat.archive.action')"
            @click="toggleArchive"
          />
          <v-list-item v-if="isChannel && detail.isGeneral" disabled prepend-icon="mdi-information-outline" :title="t('chat.generalHint')" />
        </v-list>
      </v-menu>
    </div>
    <v-divider />

    <!-- Mensajes -->
    <div class="position-relative flex-grow-1" :style="{ minHeight: 0 }">
      <div ref="scroller" class="h-100 overflow-y-auto py-2" @scroll.passive="onScroll">
        <div v-if="loading" class="d-flex justify-center pa-6"><v-progress-circular indeterminate color="primary" /></div>
        <v-alert v-else-if="failure" type="error" class="ma-4" :text="failure" />
        <template v-else>
          <EmptyState
            v-if="!rows.length"
            :icon="isChannel ? 'mdi-pound' : 'mdi-message-outline'"
            :title="isChannel ? t('chat.emptyChannel', { name: title }) : t('chat.emptyDirect', { name: title })"
            :text="t('chat.emptyText')"
            compact
          />
          <template v-for="row in rows" :key="row.message.id">
            <div v-if="row.dayBreak" class="d-flex align-center ga-2 px-4 my-2">
              <v-divider />
              <v-chip size="small" variant="outlined" class="flex-shrink-0">{{ dayLabel(row.dayBreak) }}</v-chip>
              <v-divider />
            </div>
            <div v-if="row.firstUnread" data-first-unread class="d-flex align-center ga-2 px-4 my-1 text-error">
              <v-divider color="error" :thickness="1" class="border-opacity-100" />
              <span class="text-body-small font-weight-bold flex-shrink-0">{{ t('chat.newMessages') }}</span>
            </div>
            <ChatMessageRow
              :message="row.message"
              :compact="row.compact"
              :is-channel="isChannel"
              :can-write="canWrite"
              :class="{ 'bg-lightprimary': highlighted === row.message.id }"
              @retry="retry"
              @open-thread="openThread"
            />
          </template>
        </template>
      </div>
      <v-btn
        v-if="newBelow"
        color="primary"
        size="small"
        rounded="xl"
        prepend-icon="mdi-arrow-down"
        class="position-absolute"
        :style="{ bottom: '12px', left: '50%', transform: 'translateX(-50%)' }"
        @click="toBottom"
      >
        {{ t('chat.newBelow') }}
      </v-btn>
    </div>

    <!-- Escribir -->
    <v-divider />
    <div class="pa-4">
      <v-alert v-if="detail?.archivedAt" type="info" :text="t('chat.archivedHint')" />
      <div v-else-if="detail && !detail.isMember" class="d-flex flex-column flex-sm-row align-center ga-2">
        <span class="text-body-medium text-medium-emphasis flex-grow-1">{{ t('chat.previewHint', { name: title }) }}</span>
        <v-btn color="primary" prepend-icon="mdi-login" :loading="busy" @click="join">{{ t('chat.join') }}</v-btn>
      </div>
      <!-- Todos los botones en la barra de arriba del editor (formato a la izquierda; emoji, tarjeta del CRM y «Enviar» a la derecha):
           a los lados del editor no va ninguno (pedido del dueño). En el teléfono la barra va sin los de formato. -->
      <div v-else-if="detail">
        <RichTextEditor
          ref="editor"
          v-model="draft"
          :placeholder="placeholder"
          enter-sends
          :formatting="!mobile"
          :mention-extras="mentionExtras"
          :mention-user-ids="memberIds"
          :upload-file="upload"
          :custom-emojis="chat.emojiList"
          crm-links
          @submit="submit"
          @slash="crmOpen = true"
        >
          <template #toolbar-end>
            <EmojiPicker icon="mdi-emoticon-outline" :label="t('chat.emojis.insert')" @pick="editor?.insertEmoji($event)" />
            <CrmLinkPicker v-model:open="crmOpen" size="x-small" @pick="editor?.insertCrmLink($event)" />
          </template>
          <template #append>
            <v-btn icon="mdi-send" color="primary" variant="text" size="small" :aria-label="t('chat.send')" @click="submit" />
          </template>
        </RichTextEditor>
      </div>
      <!-- «Escribiendo…» ocupa la línea de la ayuda: así el editor no salta cuando aparece. -->
      <div v-if="typingLabel" class="text-body-small text-medium-emphasis mt-1" data-typing>{{ typingLabel }}</div>
      <div v-else-if="detail?.isMember && !detail.archivedAt && !mobile" class="text-body-small text-medium-emphasis mt-1">{{ t('chat.composer.hint') }}</div>
    </div>
  </div>
  <!-- Hilo: panel a la derecha; en el teléfono ocupa la pantalla. -->
  <div v-if="chat.threadId" class="h-100 flex-shrink-0" :class="mobile ? 'flex-grow-1' : 'border-s'" :style="{ width: mobile ? '100%' : '380px' }">
    <ChatThreadPanel
      :conversation-id="conversationId"
      :title="isChannel ? `#${title}` : title"
      :can-write="canWrite"
      :is-channel="isChannel"
      :mention-extras="mentionExtras"
      :mention-user-ids="memberIds"
      :mobile="mobile"
      @close="closeThread"
    />
  </div>
  <ChannelDetailsDialog v-if="detailsOpen && isChannel" v-model="detailsOpen" :conversation-id="conversationId" :can-manage="canManage" :initial-tab="detailsTab" />
  </div>
</template>
