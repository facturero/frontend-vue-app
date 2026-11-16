<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useChatStore } from '@/stores/chat';
import { useProjectsStore } from '@/stores/projects';
import { conversationTitle } from '@/utils/chat';
import { extractError } from '@/utils/error';
import type { ChatThreadItem } from '@/types/chat';
import EmptyState from '@/components/ui/EmptyState.vue';
import ChatMessageRow from './ChatMessageRow.vue';

/**
 * Vista «Hilos», como la de Slack: los hilos que sigo (escribí la raíz, respondí o me mencionaron), el de respuesta más reciente
 * primero, con la raíz y sus dos últimas respuestas. Lo nuevo se resalta y una mención lleva su «@». Aquí solo se lee: «Responder»
 * abre el hilo en su conversación (y al abrirlo queda leído). Se actualiza sola cuando llegan respuestas (`stores/chat.ts`).
 */
defineProps<{ mobile: boolean }>();
const emit = defineEmits<{ back: [] }>();
const { t } = useI18n();
const router = useRouter();
const chat = useChatStore();
const directory = useProjectsStore();

const loading = ref(!chat.threadsLoaded);
const loadingMore = ref(false);
const failure = ref<string | null>(null);

onMounted(async () => {
  try {
    await chat.loadThreads();
  } catch (e) {
    failure.value = extractError(e);
  } finally {
    loading.value = false;
  }
});

async function more(): Promise<void> {
  loadingMore.value = true;
  try {
    await chat.loadThreads(true);
  } catch (e) {
    failure.value = extractError(e);
  } finally {
    loadingMore.value = false;
  }
}

/** «#canal», o el nombre del mensaje directo (está en la barra con sus participantes). */
function where(x: ChatThreadItem): string {
  if (x.conversation.kind === 'channel') return `#${x.conversation.name ?? ''}`;
  const c = chat.conversations.find((y) => y.id === x.conversation.id);
  return c ? conversationTitle(c, directory.users, (n) => t('chat.andMore', { n })) : t('chat.search.direct');
}
const hidden = (x: ChatThreadItem) => Math.max(0, x.root.replyCount - x.latestReplies.length);
const empty = computed(() => !loading.value && !failure.value && chat.threadInbox.length === 0);

function openThread(x: ChatThreadItem): void {
  void router.push({ name: 'messages', params: { conversationId: x.conversation.id }, query: { thread: x.root.id } });
}
</script>

<template>
  <div class="d-flex flex-column h-100">
    <div class="d-flex align-center ga-2 px-4 py-2">
      <v-btn v-if="mobile" icon="mdi-arrow-left" variant="text" size="small" :aria-label="t('common.back')" @click="emit('back')" />
      <v-icon icon="mdi-message-text-outline" size="small" />
      <div class="flex-grow-1 text-title-medium">{{ t('chat.threads.title') }}</div>
    </div>
    <v-divider />
    <div class="flex-grow-1 overflow-y-auto py-4" :style="{ minHeight: 0 }">
      <div v-if="loading" class="d-flex justify-center pa-6"><v-progress-circular indeterminate color="primary" /></div>
      <v-alert v-else-if="failure" type="error" class="mx-4" :text="failure" />
      <div v-else-if="empty" class="d-flex align-center justify-center h-100">
        <EmptyState icon="mdi-message-text-outline" :title="t('chat.threads.emptyTitle')" :text="t('chat.threads.emptyText')" />
      </div>
      <template v-else>
        <v-card
          v-for="x in chat.threadInbox"
          :key="x.root.id"
          :data-thread="x.root.id"
          variant="flat"
          class="border mx-4 mb-4"
          :class="{ 'border-primary border-opacity-100 border-md': x.unreadCount || x.mentionCount }"
        >
          <div class="d-flex align-center ga-2 px-4 pt-3 pb-1">
            <span class="text-body-medium font-weight-medium text-truncate">{{ where(x) }}</span>
            <v-spacer />
            <v-chip v-if="x.mentionCount" size="small" color="error" variant="flat" data-thread-mentions>{{ t('chat.threads.mentions', { n: x.mentionCount }) }}</v-chip>
            <v-chip v-if="x.unreadCount" size="small" color="primary" data-thread-unread>{{ t('chat.threads.unread', { n: x.unreadCount }) }}</v-chip>
          </div>
          <ChatMessageRow :message="x.root" :compact="false" in-thread readonly :can-write="false" :is-channel="x.conversation.kind === 'channel'" />
          <div v-if="hidden(x)" class="px-4 py-1">
            <v-btn variant="text" size="small" color="primary" class="px-1" @click="openThread(x)">{{ t('chat.threads.more', { n: hidden(x) }, hidden(x)) }}</v-btn>
          </div>
          <div class="ml-8">
            <ChatMessageRow v-for="m in x.latestReplies" :key="m.id" :message="m" :compact="false" in-thread readonly :can-write="false" :is-channel="x.conversation.kind === 'channel'" />
          </div>
          <div class="d-flex justify-end px-4 pb-3">
            <v-btn variant="tonal" color="primary" size="small" prepend-icon="mdi-reply-outline" @click="openThread(x)">{{ t('chat.threads.reply') }}</v-btn>
          </div>
        </v-card>
        <div v-if="chat.threadsCursor" class="d-flex justify-center pb-4">
          <v-btn variant="text" :loading="loadingMore" @click="more">{{ t('chat.search.more') }}</v-btn>
        </div>
      </template>
    </div>
  </div>
</template>
