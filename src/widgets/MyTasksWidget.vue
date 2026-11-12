<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import EmptyState from '@/components/ui/EmptyState.vue';
import DueDateChip from '@/components/projects/DueDateChip.vue';
import { projectsApi } from '@/api/projects';
import { groupMyTasks, localIsoDate } from '@/utils/projects';
import type { MyTask } from '@/types/projects';

/**
 * «Mis tareas» en el tablero: cuántas vencen hoy (o ya vencieron) y cuántas esta semana, y la lista de las más urgentes. Mismos grupos
 * que la pantalla Mis tareas (`groupMyTasks`); un clic abre la tarea en Mis tareas.
 */
defineProps<{ editing?: boolean }>();
const { t } = useI18n();
const router = useRouter();

const loading = ref(true);
const failed = ref(false);
const tasks = ref<MyTask[]>([]);

const groups = computed(() => groupMyTasks(tasks.value, localIsoDate(new Date())));
const urgent = computed(() => [...groups.value.today, ...groups.value.upcoming, ...groups.value.recent].slice(0, 12));

async function load(): Promise<void> {
  loading.value = true;
  failed.value = false;
  try {
    tasks.value = await projectsApi.myTasks(false);
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>

<template>
  <v-skeleton-loader v-if="loading" type="list-item-two-line@3" />
  <div v-else-if="failed" class="d-flex flex-column align-start ga-2">
    <span class="text-body-small text-error">{{ t('dashboard.loadError') }}</span>
    <v-btn variant="text" size="small" prepend-icon="mdi-refresh" class="px-0 no-drag" @click="load">{{ t('dashboard.retry') }}</v-btn>
  </div>
  <template v-else>
    <div class="d-flex flex-wrap ga-2 mb-2">
      <v-chip size="small" :color="groups.today.length ? 'error' : undefined" prepend-icon="mdi-calendar-alert">
        {{ t('projects.myTasks.groups.today') }}: {{ groups.today.length }}
      </v-chip>
      <v-chip size="small" prepend-icon="mdi-calendar-week">{{ t('projects.myTasks.groups.upcoming') }}: {{ groups.upcoming.length }}</v-chip>
      <v-chip size="small" prepend-icon="mdi-inbox-arrow-down">{{ t('projects.myTasks.groups.recent') }}: {{ groups.recent.length }}</v-chip>
    </div>
    <EmptyState v-if="!tasks.length" compact icon="mdi-party-popper" :title="t('widgets.emptyTasks')" />
    <v-list v-else density="compact" class="pa-0">
      <v-list-item
        v-for="task in urgent"
        :key="task.id"
        class="px-0 no-drag"
        :link="!editing"
        @click="!editing && router.push({ path: '/my-tasks', query: { task: task.id } })"
      >
        <v-list-item-title class="text-body-medium">{{ task.title }}</v-list-item-title>
        <v-list-item-subtitle v-if="task.projects.length">{{ task.projects.map((p) => p.name).join(' · ') }}</v-list-item-subtitle>
        <template #append>
          <DueDateChip :due-on="task.dueOn" :completed="!!task.completedAt" />
        </template>
      </v-list-item>
    </v-list>
  </template>
</template>
