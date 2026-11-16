<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useProjectsStore } from '@/stores/projects';
import { displayName } from '@/utils/projects';
import { extractError } from '@/utils/error';
import type { ConversationDetail } from '@/types/chat';

/**
 * Crear un canal: nombre (se guarda al estilo Slack, «Ventas Quito» → «ventas-quito»), público o privado, tema y a quién sumar.
 * El nombre único lo decide el servidor (409 si ya existe, sin distinguir tildes).
 */
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ created: [ConversationDetail] }>();
const { t } = useI18n();
const chat = useChatStore();
const directory = useProjectsStore();
const auth = useAuthStore();

const name = ref('');
const isPrivate = ref(false);
const topic = ref('');
const people = ref<string[]>([]);
const busy = ref(false);
const failure = ref<string | null>(null);

watch(open, (v) => {
  if (!v) return;
  name.value = '';
  isPrivate.value = false;
  topic.value = '';
  people.value = [];
  failure.value = null;
  void directory.ensureDirectory();
});

/** Lo mismo que hará el servidor: así la persona ve el nombre final antes de crear. */
const preview = computed(() =>
  name.value.trim().toLocaleLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 80),
);
const candidates = computed(() =>
  directory.directory.filter((u) => u.id !== (auth.user as { id?: string } | null)?.id).map((u) => ({ value: u.id, title: displayName(u), subtitle: u.email })),
);

async function create(): Promise<void> {
  if (!preview.value) return;
  busy.value = true;
  failure.value = null;
  try {
    const c = await chat.createChannel({ name: name.value, visibility: isPrivate.value ? 'private' : 'public', topic: topic.value || undefined, userIds: people.value });
    open.value = false;
    emit('created', c);
  } catch (e) {
    failure.value = extractError(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="560">
    <v-card>
      <v-card-title>{{ t('chat.newChannel.title') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <v-alert v-if="failure" type="error" :text="failure" />
        <v-text-field
          v-model="name"
          :label="t('chat.newChannel.name')"
          :prefix="isPrivate ? undefined : '#'"
          :prepend-inner-icon="isPrivate ? 'mdi-lock-outline' : undefined"
          :hint="preview && preview !== name.trim() ? t('chat.newChannel.willBe', { name: preview }) : t('chat.newChannel.nameHint')"
          persistent-hint
          autofocus
          maxlength="80"
          @keydown.enter="create"
        />
        <v-text-field v-model="topic" :label="t('chat.newChannel.topic')" maxlength="250" />
        <v-autocomplete v-model="people" :items="candidates" :label="t('chat.newChannel.people')" multiple chips closable-chips />
        <v-switch v-model="isPrivate" color="primary" :label="t('chat.newChannel.private')" :hint="t(isPrivate ? 'chat.newChannel.privateHint' : 'chat.newChannel.publicHint')" persistent-hint />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!preview" :loading="busy" @click="create">{{ t('chat.newChannel.create') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
