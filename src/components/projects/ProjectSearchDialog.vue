<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { projectsApi } from '@/api/projects';
import { extractError } from '@/utils/error';
import type { SearchResult } from '@/types/projects';
import DueDateChip from './DueDateChip.vue';

/**
 * Buscar en todos los proyectos (como la barra de Asana): tareas y proyectos por título. El servidor solo devuelve lo que quien busca
 * puede ver; una tarea de un proyecto privado ajeno no aparece aunque coincida.
 */
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
const { t } = useI18n();
const router = useRouter();

const q = ref('');
const result = ref<SearchResult | null>(null);
const loading = ref(false);
const failure = ref<string | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      q.value = '';
      result.value = null;
    }
  },
);

watch(q, (value) => {
  if (timer) clearTimeout(timer);
  if (value.trim().length < 2) {
    result.value = null;
    return;
  }
  timer = setTimeout(() => void search(value.trim()), 250);
});

async function search(value: string): Promise<void> {
  loading.value = true;
  failure.value = null;
  try {
    const out = await projectsApi.search(value);
    if (q.value.trim() === value) result.value = out;
  } catch (err) {
    failure.value = extractError(err);
  } finally {
    loading.value = false;
  }
}

function go(path: string, query?: Record<string, string>): void {
  emit('update:modelValue', false);
  void router.push({ path, query });
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="640" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-text class="d-flex flex-column ga-2">
        <v-text-field v-model="q" :label="t('projects.search.placeholder')" prepend-inner-icon="mdi-magnify" :loading="loading" autofocus clearable />
        <v-alert v-if="failure" type="error">{{ failure }}</v-alert>
        <div v-if="q.trim().length < 2" class="text-body-medium text-medium-emphasis">{{ t('projects.search.hint') }}</div>
        <template v-else-if="result">
          <div v-if="!result.tasks.length && !result.projects.length" class="text-body-medium text-medium-emphasis">{{ t('projects.search.none') }}</div>
          <v-list v-if="result.projects.length" density="compact">
            <v-list-subheader>{{ t('projects.title') }}</v-list-subheader>
            <v-list-item v-for="p in result.projects" :key="p.id" @click="go(`/projects/${p.id}`)">
              <!-- `v-highlight` (Vuetify 4.3) marca lo buscado; sin tildes ni mayúsculas, como busca el servidor. -->
              <v-list-item-title><v-highlight :text="p.name" :query="q.trim()" ignore-case ignore-accents /></v-list-item-title>
              <template #prepend>
                <v-avatar :color="p.color" rounded="lg" size="28"><v-icon :icon="p.icon" size="small" /></v-avatar>
              </template>
            </v-list-item>
          </v-list>
          <v-list v-if="result.tasks.length" density="compact">
            <v-list-subheader>{{ t('projects.search.tasks') }}</v-list-subheader>
            <v-list-item
              v-for="task in result.tasks"
              :key="task.id"
              :prepend-icon="task.completedAt ? 'mdi-check-circle' : 'mdi-check-circle-outline'"
              @click="task.projects[0] ? go(`/projects/${task.projects[0].projectId}`, { task: task.id }) : go('/my-tasks', { task: task.id })"
            >
              <v-list-item-title :class="{ 'text-decoration-line-through text-medium-emphasis': task.completedAt }"><v-highlight :text="task.title" :query="q.trim()" ignore-case ignore-accents /></v-list-item-title>
              <v-list-item-subtitle>{{ task.projects.map((p) => p.name).join(' · ') || t('projects.task.personal') }}</v-list-item-subtitle>
              <template #append><DueDateChip :due-on="task.dueOn" :completed="!!task.completedAt" /></template>
            </v-list-item>
          </v-list>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
