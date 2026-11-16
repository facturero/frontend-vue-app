<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useProjectsStore } from '@/stores/projects';
import { useConfirm } from '@/composable/useConfirm';
import { useNotify } from '@/composable/useNotify';
import { displayName } from '@/utils/projects';
import { extractError } from '@/utils/error';
import type { RichDoc } from '@/types/projects';
import type { ChatMessage } from '@/types/chat';
import UserAvatar from '@/components/projects/UserAvatar.vue';
import RichTextView from '@/components/projects/RichTextView.vue';
import RichTextEditor from '@/components/projects/RichTextEditor.vue';
import EmojiPicker from './EmojiPicker.vue';
import CustomEmojiImg from './CustomEmoji.vue';
import ChatCreateTaskDialog from './ChatCreateTaskDialog.vue';
import { usePluginsStore } from '@/stores/plugins';

/**
 * Un mensaje, como en Slack: avatar, nombre y hora en el primero de una racha; los siguientes del mismo autor (`compact`) solo el texto,
 * con la hora al pasar el ratón. Al pasar el ratón aparecen las acciones: reacciones rápidas, responder en un hilo y ⋯ (editar, borrar,
 * copiar enlace). Debajo, las reacciones (clic para sumarse o quitarse) y el resumen del hilo.
 *
 * Quién edita y borra lo decide el servidor; aquí solo se ofrece lo que tiene sentido (editar: el autor; borrar: el autor, o
 * `chat:admin` en un canal).
 */
const props = withDefaults(defineProps<{ message: ChatMessage; compact: boolean; inThread?: boolean; isChannel?: boolean; canWrite?: boolean; readonly?: boolean }>(), {
  inThread: false,
  isChannel: true,
  canWrite: true,
  // Vista «Hilos»: solo se lee; para responder, reaccionar o editar se abre el hilo (allí el mensaje vive en el store y se actualiza).
  readonly: false,
});
const emit = defineEmits<{ retry: [ChatMessage]; openThread: [string] }>();
const { t, locale } = useI18n();
const chat = useChatStore();
const auth = useAuthStore();
const directory = useProjectsStore();
const confirm = useConfirm();
const notify = useNotify();

const QUICK = ['👍', '✅', '😂', '🎉'];
/**
 * Fondo de «te mencionan» con el token del tema, sin `bg-lightwarning`: esa utilidad pone además el color de texto del token
 * (naranja) y el mensaje se leía peor. Así queda el fondo suave con el texto de siempre.
 */
const MENTION_BG = { backgroundColor: 'rgb(var(--v-theme-lightwarning))' };
const editing = ref(false);
const draft = ref<RichDoc | null>(null);
const hover = ref(false);
/** Un menú de la barra abierto (⋯ o emojis): la barra se queda aunque el ratón salga de la fila hacia el menú. */
const menus = ref(0);
const onMenu = (open: boolean) => (menus.value = Math.max(0, menus.value + (open ? 1 : -1)));
const actionsVisible = computed(() => !props.readonly && (hover.value || menus.value > 0) && live.value && !editing.value);

const myId = computed(() => ((auth.user as { id?: string } | null)?.id ?? '').toLowerCase());
const mine = computed(() => props.message.senderId === myId.value);
const live = computed(() => !props.message.pending && !props.message.deletedAt && props.message.kind === 'user');
const canEdit = computed(() => live.value && mine.value && props.canWrite);
/** Crear tarea: con el módulo de Proyectos y `project:read` (lo único que exige projects-service para una tarea propia). */
const plugins = usePluginsStore();
const canCreateTask = computed(() => live.value && plugins.isActive('projects.tasks_kanban') && auth.can('project:read'));
const taskOpen = ref(false);
const canDelete = computed(() => live.value && (mine.value || (props.isChannel && auth.can('chat:admin'))));
const name = computed(() => displayName(directory.users.get(props.message.senderId ?? '')) || t('chat.unknownUser'));
const time = computed(() => new Date(props.message.createdAt).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' }));
const fullDate = computed(() => new Date(props.message.createdAt).toLocaleString(locale.value, { dateStyle: 'full', timeStyle: 'short' }));
const reactors = (ids: string[]) => ids.map((id) => (id === myId.value ? t('chat.you') : displayName(directory.users.get(id)) || '…')).join(', ');

function startEdit(): void {
  draft.value = props.message.bodyDoc;
  editing.value = true;
}
async function saveEdit(): Promise<void> {
  if (!draft.value) return;
  try {
    await chat.edit(props.message, draft.value);
    editing.value = false;
  } catch (e) {
    notify.error(extractError(e));
  }
}
async function remove(): Promise<void> {
  if (!(await confirm({ title: t('chat.delete.title'), text: t('chat.delete.text'), confirmText: t('chat.delete.confirm'), destructive: true }))) return;
  try {
    await chat.remove(props.message);
  } catch (e) {
    notify.error(extractError(e));
  }
}
async function copyLink(): Promise<void> {
  const m = props.message;
  const url = new URL(`/messages/${m.conversationId}`, window.location.origin);
  if (m.threadRootId) url.searchParams.set('thread', m.threadRootId);
  url.searchParams.set('m', m.id);
  await navigator.clipboard.writeText(url.toString());
  notify.success(t('chat.linkCopied'));
}
const react = (emoji: string) => chat.toggleReaction(props.message, emoji);
/** `:fiesta:` → `fiesta` (reacción con un emoji personalizado); un emoji normal → null. */
const customName = (emoji: string) => emoji.match(/^:([a-z0-9_+-]{2,32}):$/)?.[1] ?? null;
</script>

<template>
  <div
    class="position-relative d-flex ga-2 px-4 rounded"
    :class="[compact ? 'py-0' : 'pt-2 pb-0', !message.mentionsMe && hover ? 'bg-hoverColor' : '', message.pending === 'sending' ? 'text-medium-emphasis' : '']"
    :style="message.mentionsMe ? MENTION_BG : undefined"
    :data-mentions-me="message.mentionsMe || undefined"
    :data-message-id="message.id"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <div class="flex-shrink-0 d-flex justify-center" :style="{ width: '36px' }">
      <UserAvatar v-if="!compact" :user-id="message.senderId" :size="36" :tooltip="false" />
      <span v-else-if="hover" class="text-body-small text-disabled pt-1" :title="fullDate">{{ time }}</span>
    </div>
    <div class="flex-grow-1 pb-1" :style="{ minWidth: 0 }">
      <div v-if="!compact" class="d-flex align-baseline ga-2">
        <span class="text-body-medium font-weight-bold">{{ name }}</span>
        <span class="text-body-small text-medium-emphasis" :title="fullDate">{{ time }}</span>
      </div>

      <div v-if="message.deletedAt" class="text-body-medium text-medium-emphasis font-italic">{{ t('chat.deleted') }}</div>
      <div v-else-if="editing" class="d-flex flex-column ga-2 py-1">
        <RichTextEditor v-model="draft" enter-sends autofocus :toolbar="false" :custom-emojis="chat.emojiList" @submit="saveEdit" @keydown.esc="editing = false" />
        <div class="d-flex ga-2">
          <v-btn size="small" color="primary" variant="flat" @click="saveEdit">{{ t('common.save') }}</v-btn>
          <v-btn size="small" variant="text" @click="editing = false">{{ t('common.cancel') }}</v-btn>
          <span class="text-body-small text-medium-emphasis align-self-center">{{ t('chat.editHint') }}</span>
        </div>
      </div>
      <template v-else>
        <RichTextView v-if="message.bodyDoc" :doc="message.bodyDoc" :suffix="message.editedAt ? t('chat.edited') : ''" class="text-body-medium" />
      </template>

      <div v-if="message.pending === 'failed'" class="d-flex align-center ga-2 text-error text-body-small">
        <v-icon icon="mdi-alert-circle-outline" size="small" />
        {{ t('chat.sendFailed') }}
        <v-btn size="x-small" variant="text" color="error" @click="emit('retry', message)">{{ t('chat.retry') }}</v-btn>
      </div>

      <!-- Reacciones -->
      <div v-if="message.reactions.length" class="d-flex flex-wrap ga-1 mt-1">
        <v-tooltip v-for="r in message.reactions" :key="r.emoji" :text="reactors(r.userIds)" location="top">
          <template #activator="{ props: tip }">
            <v-chip
              v-bind="tip"
              size="small"
              :color="r.mine ? 'primary' : undefined"
              :variant="r.mine ? 'tonal' : 'outlined'"
              :disabled="!canWrite"
              @click="react(r.emoji)"
            >
              <CustomEmojiImg v-if="customName(r.emoji)" :name="customName(r.emoji)!" size="18px" />
              <template v-else>{{ r.emoji }}</template>
              <span class="ml-1">{{ r.count }}</span>
            </v-chip>
          </template>
        </v-tooltip>
        <EmojiPicker v-if="canWrite" @pick="react" />
      </div>

      <!-- Resumen del hilo -->
      <div v-if="!inThread && message.replyCount > 0" class="d-flex align-center ga-2 mt-1">
        <div class="d-flex">
          <UserAvatar v-for="u in message.replyUserIds" :key="u" :user-id="u" :size="20" class="mr-n1" />
        </div>
        <v-btn variant="text" size="small" color="primary" class="px-1" @click="emit('openThread', message.id)">
          {{ t('chat.replies', { n: message.replyCount }, message.replyCount) }}
        </v-btn>
      </div>
    </div>

    <!-- Acciones al pasar el ratón -->
    <v-sheet v-if="actionsVisible" class="position-absolute d-flex align-center px-1 rounded border" elevation="1" :style="{ top: '-14px', right: '16px' }">
      <template v-if="canWrite">
        <v-btn v-for="e in QUICK" :key="e" variant="text" size="x-small" min-width="28" class="px-0" :aria-label="e" @click="react(e)">{{ e }}</v-btn>
        <EmojiPicker @pick="react" @open="onMenu" />
      </template>
      <v-btn v-if="!inThread" icon="mdi-message-reply-text-outline" variant="text" size="x-small" :aria-label="t('chat.replyInThread')" @click="emit('openThread', message.id)" />
      <v-menu location="bottom end" @update:model-value="onMenu">
        <template #activator="{ props: menu }">
          <v-btn v-bind="menu" icon="mdi-dots-horizontal" variant="text" size="x-small" :aria-label="t('chat.more')" />
        </template>
        <v-list density="compact">
          <v-list-item prepend-icon="mdi-link-variant" :title="t('chat.copyLink')" @click="copyLink" />
          <v-list-item v-if="canCreateTask" prepend-icon="mdi-checkbox-marked-circle-plus-outline" :title="t('chat.task.action')" @click="taskOpen = true" />
          <v-list-item v-if="canEdit" prepend-icon="mdi-pencil-outline" :title="t('chat.edit')" @click="startEdit" />
          <v-list-item v-if="canDelete" prepend-icon="mdi-delete-outline" :title="t('chat.delete.action')" base-color="error" @click="remove" />
        </v-list>
      </v-menu>
    </v-sheet>
    <!-- Se monta solo al pedirlo: una fila por mensaje, no un diálogo por mensaje. -->
    <ChatCreateTaskDialog v-if="taskOpen" v-model="taskOpen" :message="message" />
  </div>
</template>
