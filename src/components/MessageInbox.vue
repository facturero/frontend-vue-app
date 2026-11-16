<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useChatStore } from '@/stores/chat';
import { usePluginsStore } from '@/stores/plugins';
import { useProjectsStore } from '@/stores/projects';
import { conversationTitle } from '@/utils/chat';
import { displayName } from '@/utils/projects';
import UserAvatar from '@/components/projects/UserAvatar.vue';

/**
 * El sobre de la barra superior: lo último sin leer de la mensajería (una fila por conversación) y un atajo a «Mensajes». El globo rojo
 * cuenta menciones y mensajes directos sin leer; con solo mensajes de canal, un punto. Los datos los mantiene al día el store del chat
 * con los avisos del socket.
 */
const { t, locale } = useI18n();
const router = useRouter();
const chat = useChatStore();
const plugins = usePluginsStore();
const directory = useProjectsStore();

const enabled = computed(() => plugins.isActive('comm.internal_chat'));
const items = computed(() => chat.unread.latest);
/** Hilos que sigo con respuestas nuevas (o menciones): una fila propia arriba, que lleva a la vista «Hilos». */
const threads = computed(() => chat.unread.threads ?? { unread: 0, mentions: 0 });
const hasThreads = computed(() => threads.value.unread > 0 || threads.value.mentions > 0);

function title(i: (typeof items.value)[number]): string {
  const name = conversationTitle({ kind: i.kind, name: i.name, participantUserIds: i.participantUserIds }, directory.users, (n) => t('chat.andMore', { n }));
  return i.kind === 'channel' ? `#${name}` : name;
}
function excerpt(i: (typeof items.value)[number]): string {
  const who = displayName(directory.users.get(i.lastMessage.senderId ?? ''));
  const text = i.lastMessage.bodyText ?? '';
  return who && i.kind !== 'dm' ? `${who}: ${text}` : text;
}
function when(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(locale.value, { day: 'numeric', month: 'short' });
}
function openMenu(open: boolean): void {
  if (!open) return;
  void directory.ensureDirectory();
  void chat.refreshUnread();
}
</script>

<template>
  <v-menu v-if="enabled" min-width="360" max-width="420" transition="slide-y-transition" location="bottom center" :offset="[0, 8]" @update:model-value="openMenu">
    <template #activator="{ props }">
      <v-btn icon v-bind="props" :aria-label="t('chat.title')">
        <v-badge v-if="chat.badge.mentions" :content="chat.badge.mentions > 99 ? '99+' : chat.badge.mentions" color="error">
          <v-icon icon="mdi-forum-outline" />
        </v-badge>
        <v-badge v-else-if="chat.badge.any" dot color="primary">
          <v-icon icon="mdi-forum-outline" />
        </v-badge>
        <v-icon v-else icon="mdi-forum-outline" />
      </v-btn>
    </template>
    <v-card>
      <div class="d-flex align-center px-4 pt-4 pb-2">
        <span class="text-title-medium flex-grow-1">{{ t('chat.title') }}</span>
        <v-btn variant="text" size="small" :to="{ name: 'messages' }">{{ t('chat.inbox.open') }}</v-btn>
      </div>
      <v-list v-if="items.length || hasThreads" density="compact" max-height="360" class="py-0" lines="two">
        <v-list-item v-if="hasThreads" data-inbox-threads @click="router.push({ name: 'messages-threads' })">
          <template #prepend>
            <v-avatar size="36" color="lightprimary" class="mr-2"><v-icon icon="mdi-message-text-outline" color="primary" size="20" /></v-avatar>
          </template>
          <v-list-item-title class="text-body-medium font-weight-medium">{{ t('chat.threads.title') }}</v-list-item-title>
          <v-list-item-subtitle class="text-body-small">{{ t('chat.threads.inboxLine', { n: threads.unread }, threads.unread) }}</v-list-item-subtitle>
          <template v-if="threads.mentions" #append>
            <v-badge :content="threads.mentions" color="error" inline />
          </template>
        </v-list-item>
        <v-list-item v-for="i in items" :key="i.conversationId" @click="router.push({ name: 'messages', params: { conversationId: i.conversationId } })">
          <template #prepend>
            <UserAvatar :user-id="i.lastMessage.senderId" :size="36" :tooltip="false" class="mr-2" />
          </template>
          <v-list-item-title class="text-body-medium font-weight-medium">{{ title(i) }}</v-list-item-title>
          <v-list-item-subtitle class="text-body-small">{{ excerpt(i) }}</v-list-item-subtitle>
          <template #append>
            <div class="d-flex flex-column align-end ga-1">
              <span class="text-body-small text-medium-emphasis">{{ when(i.lastMessage.createdAt) }}</span>
              <v-badge v-if="i.mentionCount" :content="i.mentionCount" color="error" inline />
            </div>
          </template>
        </v-list-item>
      </v-list>
      <div v-else class="text-center text-medium-emphasis pa-8">
        <v-icon icon="mdi-forum-outline" size="48" class="mb-4" />
        <p class="text-body-medium">{{ t('chat.inbox.empty') }}</p>
      </div>
    </v-card>
  </v-menu>
</template>
