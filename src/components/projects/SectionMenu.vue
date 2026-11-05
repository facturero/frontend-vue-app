<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectsStore } from '@/stores/projects';
import type { Section } from '@/types/projects';

/** Menú «…» de una sección (en la lista y en el tablero): renombrar y borrar. Borrar una con tareas pide adónde moverlas. */
const props = defineProps<{ section: Section }>();
const { t } = useI18n();
const store = useProjectsStore();

const renaming = ref(false);
const deleting = ref(false);
const name = ref('');
const moveTo = ref<string | null>(null);
const failure = ref<string | null>(null);

const liveTasks = computed(() => (store.columns[props.section.id] ?? []).length);
const others = computed(() => store.sections.filter((s) => s.id !== props.section.id).map((s) => ({ value: s.id, title: s.name })));

function startRename(): void {
  name.value = props.section.name;
  failure.value = null;
  renaming.value = true;
}

function startDelete(): void {
  moveTo.value = others.value[0]?.value ?? null;
  failure.value = null;
  deleting.value = true;
}

async function rename(): Promise<void> {
  if (!name.value.trim()) return;
  try {
    await store.renameSection(props.section.id, name.value.trim());
    renaming.value = false;
  } catch {
    failure.value = store.notice;
  }
}

async function remove(): Promise<void> {
  try {
    await store.deleteSection(props.section.id, liveTasks.value ? (moveTo.value ?? undefined) : undefined);
    deleting.value = false;
  } catch {
    failure.value = store.notice;
  }
}
</script>

<template>
  <v-menu v-if="store.canEdit && store.current?.status === 'active'">
    <template #activator="{ props: menu }">
      <v-btn v-bind="menu" icon="mdi-dots-horizontal" variant="text" size="small" :aria-label="t('projects.section.menu')" />
    </template>
    <v-list>
      <v-list-item prepend-icon="mdi-pencil-outline" :title="t('projects.section.rename')" @click="startRename" />
      <v-list-item prepend-icon="mdi-trash-can-outline" :title="t('projects.section.delete')" :disabled="store.sections.length <= 1" @click="startDelete" />
    </v-list>
  </v-menu>

  <v-dialog v-model="renaming">
    <v-card>
      <v-card-title>{{ t('projects.section.rename') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <v-alert v-if="failure" type="error">{{ failure }}</v-alert>
        <v-text-field v-model="name" :label="t('projects.section.name')" autofocus @keyup.enter="rename" />
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn variant="text" @click="renaming = false">{{ t('common.cancel') }}</v-btn>
        <v-btn color="primary" :disabled="!name.trim()" @click="rename">{{ t('common.save') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="deleting">
    <v-card>
      <v-card-title>{{ t('projects.section.deleteTitle', { name: section.name }) }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <v-alert v-if="failure" type="error">{{ failure }}</v-alert>
        <template v-if="liveTasks">
          <div>{{ t('projects.section.deleteWithTasks', { n: liveTasks }) }}</div>
          <v-select v-model="moveTo" :items="others" :label="t('projects.section.moveTasksTo')" />
        </template>
        <div v-else>{{ t('projects.section.deleteEmpty') }}</div>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn variant="text" @click="deleting = false">{{ t('common.cancel') }}</v-btn>
        <v-btn color="error" :disabled="!!liveTasks && !moveTo" @click="remove">{{ t('common.delete') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
