<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { projectsApi } from '@/api/projects';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { extractError } from '@/utils/error';
import type { LinkEntity, Task } from '@/types/projects';
import DueDateChip from './DueDateChip.vue';

/**
 * «Tareas» en la ficha de un cliente (o de cualquier registro del ERP): las tareas de Proyectos vinculadas a él, y un atajo para
 * crear una nueva ya vinculada (queda en «Mis tareas» de quien la crea). Solo aparece si la organización tiene el módulo de
 * Proyectos y la persona puede verlo; el servidor, además, oculta las tareas de proyectos privados ajenos.
 */
const props = defineProps<{ entityType: LinkEntity; entityId: string; label: string }>();
const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const plugins = usePluginsStore();

const enabled = computed(() => plugins.isActive('projects.tasks_kanban') && auth.can('project:read'));
const tasks = ref<Task[]>([]);
const loading = ref(false);
const failure = ref<string | null>(null);
const draft = ref('');
const adding = ref(false);

const open = computed(() => tasks.value.filter((x) => !x.completedAt));
const done = computed(() => tasks.value.length - open.value.length);

async function load(): Promise<void> {
  if (!enabled.value) return;
  loading.value = true;
  failure.value = null;
  try {
    tasks.value = await projectsApi.linkedTasks(props.entityType, props.entityId);
  } catch (err) {
    failure.value = extractError(err);
  } finally {
    loading.value = false;
  }
}

async function add(): Promise<void> {
  const title = draft.value.trim();
  if (!title || !auth.user) return;
  draft.value = '';
  try {
    const task = await projectsApi.createTask({ title, assigneeUserId: auth.user.id });
    await projectsApi.addLink(task.id, { entityType: props.entityType, entityId: props.entityId, label: props.label });
    await load();
  } catch (err) {
    failure.value = extractError(err);
    draft.value = title;
  }
}

onMounted(load);
watch(() => [props.entityType, props.entityId], load);
</script>

<template>
  <v-card v-if="enabled" class="mb-4">
    <v-card-title class="text-h6 d-flex align-center">
      {{ t('projects.linked.title') }}
      <v-spacer />
      <v-btn icon="mdi-plus" variant="text" size="small" :aria-label="t('projects.linked.add')" @click="adding = !adding" />
    </v-card-title>
    <v-card-text>
      <v-alert v-if="failure" type="error" class="mb-2">{{ failure }}</v-alert>
      <v-progress-linear v-if="loading" indeterminate color="primary" />
      <v-text-field
        v-if="adding"
        v-model="draft"
        :placeholder="t('projects.linked.placeholder')"
        prepend-inner-icon="mdi-check-circle-outline"
        autofocus
        @keyup.enter="add"
      />
      <v-list v-if="open.length" density="compact" class="pa-0">
        <v-list-item
          v-for="task in open"
          :key="task.id"
          class="px-0"
          prepend-icon="mdi-check-circle-outline"
          :title="task.title"
          @click="router.push({ path: '/my-tasks', query: { task: task.id } })"
        >
          <template #append><DueDateChip :due-on="task.dueOn" :completed="false" /></template>
        </v-list-item>
      </v-list>
      <p v-else-if="!loading" class="text-body-2 text-medium-emphasis">{{ t('projects.linked.none') }}</p>
      <p v-if="done" class="text-caption text-medium-emphasis mt-2">{{ t('projects.linked.done', done) }}</p>
    </v-card-text>
  </v-card>
</template>
