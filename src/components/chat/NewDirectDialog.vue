<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useProjectsStore } from '@/stores/projects';
import { displayName } from '@/utils/projects';
import { extractError } from '@/utils/error';
import type { ConversationDetail } from '@/types/chat';

/** Mensaje directo con 1 persona o de grupo con 2 a 8. Si ya existe con exactamente esas personas, se abre el mismo (el servidor). */
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ opened: [ConversationDetail] }>();
const { t } = useI18n();
const chat = useChatStore();
const directory = useProjectsStore();
const auth = useAuthStore();

const people = ref<string[]>([]);
const busy = ref(false);
const failure = ref<string | null>(null);
const MAX = 8;

watch(open, (v) => {
  if (!v) return;
  people.value = [];
  failure.value = null;
  void directory.ensureDirectory();
});

const candidates = computed(() =>
  directory.directory.filter((u) => u.id !== (auth.user as { id?: string } | null)?.id).map((u) => ({ value: u.id, title: displayName(u), subtitle: u.email })),
);

async function start(): Promise<void> {
  if (!people.value.length) return;
  busy.value = true;
  failure.value = null;
  try {
    const c = await chat.openDirect(people.value);
    open.value = false;
    emit('opened', c);
  } catch (e) {
    failure.value = extractError(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="520">
    <v-card>
      <v-card-title>{{ t('chat.newDirect.title') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <v-alert v-if="failure" type="error" :text="failure" />
        <v-autocomplete
          v-model="people"
          :items="candidates"
          :label="t('chat.newDirect.people')"
          :hint="t('chat.newDirect.hint', { max: MAX })"
          persistent-hint
          multiple
          chips
          closable-chips
          autofocus
          :rules="[(v: string[]) => v.length <= MAX || t('chat.newDirect.tooMany', { max: MAX })]"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!people.length || people.length > MAX" :loading="busy" @click="start">{{ t('chat.newDirect.start') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
