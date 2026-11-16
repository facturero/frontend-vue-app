<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useChatStore } from '@/stores/chat';
import { useProjectsStore } from '@/stores/projects';
import type { ConversationDetail } from '@/types/chat';
import EmptyState from '@/components/ui/EmptyState.vue';
import ChatSidebar from '@/components/chat/ChatSidebar.vue';
import ChatConversation from '@/components/chat/ChatConversation.vue';
import NewChannelDialog from '@/components/chat/NewChannelDialog.vue';
import BrowseChannelsDialog from '@/components/chat/BrowseChannelsDialog.vue';
import NewDirectDialog from '@/components/chat/NewDirectDialog.vue';
import ChatSearchDialog from '@/components/chat/ChatSearchDialog.vue';
import ChatThreadsView from '@/components/chat/ChatThreadsView.vue';

/**
 * Mensajería al estilo Slack (`/messages` y `/messages/:conversationId`). EXCEPCIÓN aprobada por el dueño (UI-UX.md): sin `PageHeader`,
 * a todo el alto, con la barra de canales a la izquierda y la conversación al lado; el nombre del canal hace de título. En el teléfono, un
 * panel a la vez: la lista o la conversación (con «atrás»).
 *
 * Sin conversación en la ruta se abre la última que se miró, o #general.
 */
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { smAndDown } = useDisplay();
const chat = useChatStore();
const directory = useProjectsStore();

const LAST_KEY = 'chat:last-conversation';
const conversationId = computed(() => (typeof route.params.conversationId === 'string' ? route.params.conversationId : null));
/** `/messages/threads`: en el centro, la vista «Hilos» en vez de una conversación. */
const threadsView = computed(() => route.name === 'messages-threads');
/** En el teléfono, un panel a la vez: la barra, o lo que se abrió (conversación o «Hilos»). */
const contentOpen = computed(() => !!conversationId.value || threadsView.value);
const newChannel = ref(false);
const browse = ref(false);
const newDirect = ref(false);
const searching = ref(false);

/** Alto útil: la ventana menos la barra superior y el relleno del contenedor de la app (en el teléfono, el sitio del botón del asistente). */
const height = computed(() => (smAndDown.value ? 'calc(100dvh - var(--v-layout-top, 56px) - 64px)' : 'calc(100dvh - var(--v-layout-top, 64px) - 32px)'));

function open(id: string): void {
  void router.push({ name: 'messages', params: { conversationId: id } });
}
const opened = (c: ConversationDetail) => open(c.id);

watch(conversationId, (id) => {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
  } catch {
    // modo privado: no se recuerda, nada más
  }
});

onMounted(async () => {
  void directory.ensureDirectory();
  await chat.loadConversations();
  if (conversationId.value || threadsView.value || smAndDown.value) return;
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_KEY);
  } catch {
    last = null;
  }
  const target = chat.conversations.find((c) => c.id === last) ?? chat.conversations.find((c) => c.isGeneral);
  if (target) void router.replace({ name: 'messages', params: { conversationId: target.id } });
});
</script>

<template>
  <v-card class="d-flex overflow-hidden" :style="{ height }">
    <v-alert v-if="chat.error && !chat.loaded" type="error" class="ma-4" :text="t('chat.loadError')" />
    <template v-else>
      <div v-if="!smAndDown || !contentOpen" class="flex-shrink-0 border-e" :style="{ width: smAndDown ? '100%' : '280px' }">
        <ChatSidebar
          :active-id="conversationId"
          :threads-active="threadsView"
          @threads="router.push({ name: 'messages-threads' })"
          @open="open" @new-channel="newChannel = true" @browse="browse = true" @new-direct="newDirect = true" @search="searching = true" />
      </div>
      <div v-if="!smAndDown || contentOpen" class="flex-grow-1" :style="{ minWidth: 0 }">
        <ChatThreadsView v-if="threadsView" :mobile="smAndDown" @back="router.push({ name: 'messages' })" />
        <ChatConversation
          v-else-if="conversationId"
          :key="conversationId"
          :conversation-id="conversationId"
          :mobile="smAndDown"
          @back="router.push({ name: 'messages' })"
        />
        <div v-else class="d-flex align-center justify-center h-100">
          <EmptyState icon="mdi-forum-outline" :title="t('chat.pickTitle')" :text="t('chat.pickText')" :action-text="t('chat.newDirect.title')" action-icon="mdi-plus" @action="newDirect = true" />
        </div>
      </div>
    </template>

    <NewChannelDialog v-model="newChannel" @created="opened" />
    <BrowseChannelsDialog v-model="browse" @pick="open" @create="newChannel = true" />
    <NewDirectDialog v-model="newDirect" @opened="opened" />
    <ChatSearchDialog v-model="searching" />
  </v-card>
</template>
