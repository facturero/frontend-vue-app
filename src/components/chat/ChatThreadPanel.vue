<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChatStore } from '@/stores/chat';
import { useProjectsStore } from '@/stores/projects';
import { draftHasContent, typingText } from '@/utils/chat';
import { extractError } from '@/utils/error';
import type { RichDoc } from '@/types/projects';
import type { ChatMessage } from '@/types/chat';
import RichTextEditor from '@/components/projects/RichTextEditor.vue';
import ChatMessageRow from './ChatMessageRow.vue';
import CrmLinkPicker from './CrmLinkPicker.vue';
import EmojiPicker from './EmojiPicker.vue';

/**
 * El hilo abierto (panel derecho; en el teléfono ocupa la pantalla): el mensaje raíz, sus respuestas y un editor para responder.
 * Responder en un hilo no deja el canal sin leer; avisa a quien sigue el hilo (el servidor decide a quién).
 */
const props = defineProps<{ conversationId: string; title: string; canWrite: boolean; isChannel: boolean; mentionExtras: Array<{ id: string; label: string; hint: string }>; mentionUserIds: string[] | null; mobile?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const chat = useChatStore();
const directory = useProjectsStore();

const scroller = ref<HTMLElement | null>(null);
const editor = ref<InstanceType<typeof RichTextEditor> | null>(null);
const draft = ref<RichDoc | null>(null);
watch(draft, (d) => {
  if (draftHasContent(d) && chat.threadId) chat.notifyTyping(props.conversationId, chat.threadId);
});
const typingLabel = computed(() => (chat.threadId ? typingText(chat.typingIn(props.conversationId, chat.threadId), directory.users, t, t('chat.unknownUser')) : null));
const loading = ref(true);
const failure = ref<string | null>(null);
const root = computed(() => chat.threadRoot);

async function toBottom(): Promise<void> {
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
}

watch(
  () => chat.threadId,
  async (id) => {
    if (!id) return;
    loading.value = true;
    failure.value = null;
    try {
      await chat.openThread(id);
      await toBottom();
      // Abrirlo es leerlo (si la pestaña está a la vista): baja el contador de «Hilos».
      if (!document.hidden) void chat.markThreadRead(id);
    } catch (e) {
      failure.value = extractError(e);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
watch(() => chat.threadMessages.length, toBottom);

async function submit(): Promise<void> {
  const doc = draft.value;
  if (!doc || !chat.threadId || !JSON.stringify(doc).match(/"type":"(text|image|file|mention|crmLink)"/)) return;
  editor.value?.clear();
  draft.value = null;
  await chat.send(props.conversationId, doc, undefined, chat.threadId);
}
const upload = (file: File) => chat.uploadFile(props.conversationId, file);
const crmOpen = ref(false);
const retry = (m: ChatMessage) => chat.send(props.conversationId, m.bodyDoc!, m);
</script>

<template>
  <div class="d-flex flex-column h-100">
    <div class="d-flex align-center ga-2 px-4 py-2">
      <div class="flex-grow-1" :style="{ minWidth: 0 }">
        <div class="text-title-medium">{{ t('chat.thread') }}</div>
        <div class="text-body-small text-medium-emphasis text-truncate">{{ title }}</div>
      </div>
      <v-btn icon="mdi-close" variant="text" size="small" :aria-label="t('common.close')" @click="emit('close')" />
    </div>
    <v-divider />
    <div ref="scroller" class="flex-grow-1 overflow-y-auto py-2" :style="{ minHeight: 0 }">
      <div v-if="loading" class="d-flex justify-center pa-6"><v-progress-circular indeterminate color="primary" /></div>
      <v-alert v-else-if="failure" type="error" class="ma-4" :text="failure" />
      <template v-else-if="root">
        <ChatMessageRow :message="root" :compact="false" in-thread :is-channel="isChannel" :can-write="canWrite" />
        <div class="d-flex align-center ga-2 px-4 my-2 text-medium-emphasis">
          <span class="text-body-small flex-shrink-0">{{ t('chat.replies', { n: root.replyCount }, root.replyCount) }}</span>
          <v-divider />
        </div>
        <ChatMessageRow
          v-for="m in chat.threadMessages"
          :key="m.id"
          :message="m"
          :compact="false"
          in-thread
          :is-channel="isChannel"
          :can-write="canWrite"
          @retry="retry"
        />
      </template>
    </div>
    <v-divider />
    <!-- A la derecha, sitio para el botón flotante del asistente (abajo a la derecha en toda la app), que si no tapa «Enviar». En el
         teléfono ese botón queda debajo de la tarjeta: el margen solo apretaba el editor. -->
    <div v-if="canWrite" class="pa-4" :style="{ paddingRight: mobile ? undefined : '80px' }">
      <!-- Como en la conversación: todos los botones arriba del editor (aquí sin los de formato: el panel es estrecho). -->
      <RichTextEditor
        ref="editor"
        v-model="draft"
        :placeholder="t('chat.composer.reply')"
        enter-sends
        :formatting="false"
        :mention-extras="mentionExtras"
        :mention-user-ids="mentionUserIds"
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
    <div v-if="typingLabel" class="text-body-small text-medium-emphasis px-4 pb-2" data-typing>{{ typingLabel }}</div>
  </div>
</template>
