<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { chatApi } from '@/api/chat';
import { useProjectsStore } from '@/stores/projects';
import { useChatStore } from '@/stores/chat';
import { conversationTitle } from '@/utils/chat';
import { displayName } from '@/utils/projects';
import { extractError } from '@/utils/error';
import type { ChatSearchHit } from '@/types/chat';
import UserAvatar from '@/components/projects/UserAvatar.vue';
import EmptyState from '@/components/ui/EmptyState.vue';

/**
 * Buscar mensajes: solo en lo que la persona puede leer (sus conversaciones y los canales públicos; lo decide chat-service). Cada
 * palabra cuenta como principio de palabra («factu» encuentra «facturas»). Un resultado abre el mensaje en su conversación (o en su hilo)
 * con el enlace permanente de siempre.
 */
const open = defineModel<boolean>({ required: true });
const { t, locale } = useI18n();
const router = useRouter();
const { xs } = useDisplay();
const directory = useProjectsStore();
const chat = useChatStore();

const query = ref('');
const items = ref<ChatSearchHit[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(false);
const failure = ref<string | null>(null);
const searched = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;
let ticket = 0;

watch(open, (v) => {
  if (!v) return;
  void directory.ensureDirectory();
});
watch(query, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void run(false), 350);
});

async function run(more: boolean): Promise<void> {
  const q = query.value.trim();
  if (q.length < 2) {
    items.value = [];
    nextCursor.value = null;
    searched.value = false;
    return;
  }
  // Escribir rápido: solo vale la última respuesta.
  const mine = ++ticket;
  loading.value = true;
  failure.value = null;
  try {
    const page = await chatApi.search({ q, cursor: more ? nextCursor.value ?? undefined : undefined, limit: 20 });
    if (mine !== ticket) return;
    items.value = more ? [...items.value, ...page.items] : page.items;
    nextCursor.value = page.nextCursor;
    searched.value = true;
  } catch (e) {
    if (mine === ticket) failure.value = extractError(e);
  } finally {
    if (mine === ticket) loading.value = false;
  }
}

/** Partes del trozo con las palabras buscadas marcadas, sin `v-html` (el texto lo escribió otra persona). */
function parts(snippet: string): Array<{ text: string; hit: boolean }> {
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const words = query.value.trim().split(/\s+/).map(fold).filter((w) => w.length >= 2);
  if (!words.length) return [{ text: snippet, hit: false }];
  const folded = fold(snippet);
  // Igual longitud tras quitar tildes (texto en español): las posiciones del texto plegado sirven para cortar el original.
  if (folded.length !== snippet.length) return [{ text: snippet, hit: false }];
  const marks = new Array<boolean>(snippet.length).fill(false);
  for (const w of words) for (let i = folded.indexOf(w); i >= 0; i = folded.indexOf(w, i + 1)) marks.fill(true, i, i + w.length);
  const out: Array<{ text: string; hit: boolean }> = [];
  for (let i = 0; i < snippet.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === marks[i]) last.text += snippet[i];
    else out.push({ text: snippet[i], hit: marks[i] });
  }
  return out;
}

/** Dónde está: «#canal», o el nombre del mensaje directo (siempre es mío: está en la barra con sus participantes). */
function where(h: ChatSearchHit): string {
  if (h.conversation.kind === 'channel') return `#${h.conversation.name ?? ''}`;
  const c = chat.conversations.find((x) => x.id === h.conversation.id);
  return c ? conversationTitle(c, directory.users, (n) => t('chat.andMore', { n })) : t('chat.search.direct');
}
const when = (iso: string) => new Date(iso).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' });
const author = (h: ChatSearchHit) => displayName(directory.users.get(h.message.senderId ?? '')) || t('chat.unknownUser');
const empty = computed(() => searched.value && !loading.value && !items.value.length && !failure.value);

function go(h: ChatSearchHit): void {
  open.value = false;
  const query: Record<string, string> = { m: h.message.id };
  if (h.message.threadRootId) query.thread = h.message.threadRootId;
  void router.push({ name: 'messages', params: { conversationId: h.conversation.id }, query });
}
</script>

<template>
  <v-dialog v-model="open" max-width="720" :fullscreen="xs" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <span class="flex-grow-1">{{ t('chat.search.title') }}</span>
        <v-btn icon="mdi-close" variant="text" size="small" :aria-label="t('common.close')" @click="open = false" />
      </v-card-title>
      <div class="px-6 pb-2">
        <v-text-field v-model="query" :placeholder="t('chat.search.placeholder')" prepend-inner-icon="mdi-magnify" :loading="loading" autofocus clearable hide-details />
        <div class="text-body-small text-medium-emphasis mt-1">{{ t('chat.search.hint') }}</div>
      </div>
      <v-divider />
      <v-card-text class="pa-0" :style="{ minHeight: '240px' }">
        <v-alert v-if="failure" type="error" class="ma-4" :text="failure" />
        <EmptyState v-else-if="empty" icon="mdi-text-search" :title="t('chat.search.none')" />
        <v-list v-else lines="three">
          <v-list-item v-for="h in items" :key="h.message.id" :data-search-hit="h.message.id" @click="go(h)">
            <template #prepend>
              <UserAvatar :user-id="h.message.senderId" :size="32" :tooltip="false" class="mr-3" />
            </template>
            <v-list-item-title class="d-flex align-center ga-2">
              <span class="font-weight-medium text-truncate">{{ author(h) }}</span>
              <span class="text-body-small text-medium-emphasis text-truncate">{{ where(h) }} · {{ when(h.message.createdAt) }}</span>
              <v-icon v-if="h.message.threadRootId" icon="mdi-message-reply-text-outline" size="14" class="text-medium-emphasis" />
            </v-list-item-title>
            <div class="text-body-medium">
              <template v-for="(p, i) in parts(h.snippet)" :key="i">
                <mark v-if="p.hit" class="bg-lightwarning">{{ p.text }}</mark>
                <template v-else>{{ p.text }}</template>
              </template>
            </div>
          </v-list-item>
        </v-list>
        <div v-if="nextCursor" class="d-flex justify-center pa-4">
          <v-btn variant="text" :loading="loading" @click="run(true)">{{ t('chat.search.more') }}</v-btn>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
