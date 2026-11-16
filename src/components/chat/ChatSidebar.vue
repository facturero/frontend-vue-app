<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChatStore } from '@/stores/chat';
import { useProjectsStore } from '@/stores/projects';
import { conversationTitle } from '@/utils/chat';
import type { ConversationSummary } from '@/types/chat';
import PresenceAvatar from './PresenceAvatar.vue';

/**
 * Barra de la mensajería, como la de Slack: canales (públicos con #, privados con candado) y mensajes directos. Lo no leído va en
 * negrita; las menciones y los DMs sin leer, con su número. Lo silenciado se ve atenuado y no suma.
 *
 * Cada sección se pliega con un clic en su título (como en Slack): plegada, solo deja a la vista la conversación abierta y las que
 * tienen algo sin leer, para no perderse nada. Con muchos canales la barra se hacía larguísima. Lo plegado se recuerda en este
 * navegador (es una comodidad de cada quien, no un dato del chat).
 */
const props = defineProps<{ activeId: string | null; threadsActive?: boolean }>();
const emit = defineEmits<{ open: [string]; newChannel: []; browse: []; newDirect: []; search: []; threads: [] }>();
const { t } = useI18n();
const chat = useChatStore();
const directory = useProjectsStore();

const title = (c: ConversationSummary) => conversationTitle(c, directory.users, (n) => t('chat.andMore', { n }));
const strong = (c: ConversationSummary) => c.unreadCount > 0 && !c.me?.muted;

const FOLD_KEY = 'chat:sidebar:folded';
function readFolded(): { channels: boolean; directs: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}') as Partial<Record<'channels' | 'directs', unknown>>;
    return { channels: saved.channels === true, directs: saved.directs === true };
  } catch {
    return { channels: false, directs: false };
  }
}
const folded = reactive(readFolded());
watch(folded, (v) => {
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify(v));
  } catch {
    // modo privado: no se recuerda, nada más
  }
});
/** Plegada, la sección deja a la vista lo abierto y lo que tiene algo que leer. */
const keep = (c: ConversationSummary) => c.id === props.activeId || strong(c) || c.mentionCount > 0;
const shownChannels = computed(() => (folded.channels ? chat.channels.filter(keep) : chat.channels));
const shownDirects = computed(() => (folded.directs ? chat.directs.filter(keep) : chat.directs));
/** Cuántas quedan escondidas al plegar (se muestra «N más» junto al título). */
const hidden = computed(() => ({ channels: chat.channels.length - shownChannels.value.length, directs: chat.directs.length - shownDirects.value.length }));
</script>

<template>
  <div class="d-flex flex-column h-100" data-tour="chat-sidebar">
    <div class="d-flex align-center px-4 py-3">
      <span class="text-title-large flex-grow-1">{{ t('chat.title') }}</span>
      <v-btn
        v-if="chat.browserPermission === 'default'"
        icon="mdi-bell-ring-outline"
        variant="text"
        size="small"
        color="primary"
        :aria-label="t('chat.browserNotify.enable')"
        :title="t('chat.browserNotify.enable')"
        @click="chat.askBrowserPermission()"
      />
      <v-btn icon="mdi-magnify" variant="text" size="small" :aria-label="t('chat.search.action')" :title="t('chat.search.action')" @click="emit('search')" />
      <v-btn icon="mdi-pencil-box-outline" variant="text" size="small" :aria-label="t('chat.newDirect.title')" @click="emit('newDirect')" />
    </div>
    <v-divider />
    <div class="flex-grow-1 overflow-y-auto">
      <v-list nav density="compact" class="py-2">
        <!-- «Hilos»: en negrita si alguno que sigo tiene respuestas nuevas; con número si me mencionaron en alguno. -->
        <v-list-item slim rounded="lg" :active="threadsActive" data-threads-entry @click="emit('threads')">
          <template #prepend>
            <v-avatar size="22" class="mr-2"><v-icon icon="mdi-message-text-outline" size="small" /></v-avatar>
          </template>
          <v-list-item-title :class="{ 'font-weight-bold': (chat.unread.threads?.unread ?? 0) > 0 }">{{ t('chat.threads.title') }}</v-list-item-title>
          <template v-if="chat.unread.threads?.mentions" #append>
            <v-badge :content="chat.unread.threads.mentions" color="error" inline />
          </template>
        </v-list-item>
        <v-list-item
          slim
          rounded="lg"
          class="text-medium-emphasis mt-1"
          :aria-expanded="!folded.channels"
          data-fold="channels"
          @click="folded.channels = !folded.channels"
        >
          <template #prepend>
            <v-avatar size="22" class="mr-2"><v-icon :icon="folded.channels ? 'mdi-chevron-right' : 'mdi-chevron-down'" size="small" /></v-avatar>
          </template>
          <v-list-item-title class="text-body-small font-weight-medium">{{ t('chat.channels') }}</v-list-item-title>
          <template v-if="folded.channels && hidden.channels" #append>
            <span class="text-body-small">{{ t('chat.foldedMore', { n: hidden.channels }) }}</span>
          </template>
        </v-list-item>
        <v-list-item
          v-for="c in shownChannels"
          slim
          :key="c.id"
          :active="c.id === activeId"
          :class="{ 'text-medium-emphasis': c.me?.muted }"
          rounded="lg"
          @click="emit('open', c.id)"
        >
          <template #prepend>
            <!-- En un avatar del mismo tamaño que el de los DMs: así el nombre empieza a la misma distancia en las dos listas. -->
            <v-avatar size="22" class="mr-2">
              <v-icon :icon="c.visibility === 'private' ? 'mdi-lock-outline' : 'mdi-pound'" size="small" />
            </v-avatar>
          </template>
          <v-list-item-title :class="{ 'font-weight-bold': strong(c) }">{{ title(c) }}</v-list-item-title>
          <template v-if="c.mentionCount" #append>
            <v-badge :content="c.mentionCount" color="error" inline />
          </template>
        </v-list-item>
        <v-list-item v-if="!folded.channels" slim rounded="lg" prepend-icon="mdi-plus" :title="t('chat.addChannel')" class="text-medium-emphasis" @click="emit('browse')" />

        <v-list-item
          slim
          rounded="lg"
          class="text-medium-emphasis mt-1"
          :aria-expanded="!folded.directs"
          data-fold="directs"
          @click="folded.directs = !folded.directs"
        >
          <template #prepend>
            <v-avatar size="22" class="mr-2"><v-icon :icon="folded.directs ? 'mdi-chevron-right' : 'mdi-chevron-down'" size="small" /></v-avatar>
          </template>
          <v-list-item-title class="text-body-small font-weight-medium">{{ t('chat.directs') }}</v-list-item-title>
          <template v-if="folded.directs && hidden.directs" #append>
            <span class="text-body-small">{{ t('chat.foldedMore', { n: hidden.directs }) }}</span>
          </template>
        </v-list-item>
        <v-list-item
          v-for="c in shownDirects"
          slim
          :key="c.id"
          :active="c.id === activeId"
          :class="{ 'text-medium-emphasis': c.me?.muted }"
          rounded="lg"
          @click="emit('open', c.id)"
        >
          <template #prepend>
            <PresenceAvatar v-if="c.kind === 'dm'" :user-id="c.participantUserIds[0] ?? null" :size="22" class="mr-2" />
            <v-avatar v-else size="22" color="lightsecondary" class="mr-2">
              <span class="text-body-small font-weight-bold">{{ c.participantUserIds.length }}</span>
            </v-avatar>
          </template>
          <v-list-item-title :class="{ 'font-weight-bold': strong(c) }">{{ title(c) }}</v-list-item-title>
          <template v-if="c.mentionCount" #append>
            <v-badge :content="c.mentionCount" color="error" inline />
          </template>
        </v-list-item>
        <v-list-item v-if="!folded.directs" slim rounded="lg" prepend-icon="mdi-plus" :title="t('chat.newDirect.title')" class="text-medium-emphasis" @click="emit('newDirect')" />
      </v-list>
    </div>
  </div>
</template>
