<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { chatApi } from '@/api/chat';
import { extractError } from '@/utils/error';
import type { ChannelListing } from '@/types/chat';
import EmptyState from '@/components/ui/EmptyState.vue';

/** «Explorar canales»: los públicos de la organización (y los privados donde ya estoy). Abrir uno lo muestra aunque no me una. */
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ pick: [string]; create: [] }>();
const { t } = useI18n();

const q = ref('');
const items = ref<ChannelListing[]>([]);
const loading = ref(false);
const failure = ref<string | null>(null);

let timer: ReturnType<typeof setTimeout> | null = null;
async function load(): Promise<void> {
  loading.value = true;
  try {
    items.value = await chatApi.browse(q.value.trim());
    failure.value = null;
  } catch (e) {
    failure.value = extractError(e);
  } finally {
    loading.value = false;
  }
}
watch(open, (v) => {
  if (!v) return;
  q.value = '';
  void load();
});
watch(q, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(load, 250);
});

function pick(id: string): void {
  open.value = false;
  emit('pick', id);
}
</script>

<template>
  <v-dialog v-model="open" max-width="640" scrollable>
    <v-card>
      <v-card-title>{{ t('chat.browse.title') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <v-text-field v-model="q" :label="t('chat.browse.search')" prepend-inner-icon="mdi-magnify" clearable autofocus />
        <v-alert v-if="failure" type="error" :text="failure" />
        <v-progress-linear v-if="loading && !items.length" indeterminate color="primary" />
        <EmptyState
          v-else-if="!items.length"
          icon="mdi-pound"
          :title="t('chat.browse.emptyTitle')"
          :text="t('chat.browse.emptyText')"
          :action-text="t('chat.newChannel.title')"
          action-icon="mdi-plus"
          @action="open = false; emit('create')"
        />
        <v-list v-else lines="two">
          <v-list-item v-for="c in items" :key="c.id" @click="pick(c.id)">
            <template #prepend>
              <v-icon :icon="c.visibility === 'private' ? 'mdi-lock-outline' : 'mdi-pound'" class="mr-2" />
            </template>
            <v-list-item-title class="font-weight-medium">{{ c.name }}</v-list-item-title>
            <v-list-item-subtitle>
              {{ t('chat.members', { n: c.memberCount }, c.memberCount) }}<template v-if="c.topic"> · {{ c.topic }}</template>
            </v-list-item-subtitle>
            <template #append>
              <v-chip v-if="c.isMember" size="small" color="success" prepend-icon="mdi-check">{{ t('chat.browse.joined') }}</v-chip>
              <v-chip v-else-if="c.archivedAt" size="small">{{ t('chat.archived') }}</v-chip>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-btn variant="text" prepend-icon="mdi-plus" @click="open = false; emit('create')">{{ t('chat.newChannel.title') }}</v-btn>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
