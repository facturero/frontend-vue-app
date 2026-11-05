<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { projectsApi } from '@/api/projects';
import { useProjectsStore } from '@/stores/projects';
import { formatMinutes } from '@/utils/duration';
import { extractError } from '@/utils/error';
import { displayName } from '@/utils/projects';
import type { ProjectDashboard } from '@/types/projects';
import DueDateChip from './DueDateChip.vue';
import UserAvatar from './UserAvatar.vue';

/**
 * Panel del proyecto (entregable 7), como el «Dashboard» de Asana: lo mismo que la lista, contado. Sin librería de gráficos: barras
 * de Vuetify, que bastan para «cuánto hay en cada sección» y «cuánto se cerró cada semana».
 */
const { t, locale } = useI18n();
const store = useProjectsStore();
const data = ref<ProjectDashboard | null>(null);
const failure = ref<string | null>(null);

async function load(): Promise<void> {
  if (!store.current) return;
  try {
    data.value = await projectsApi.dashboard(store.current.id);
  } catch (err) {
    failure.value = extractError(err);
  }
}
onMounted(load);
// El tablero en vivo recarga el tablero; el panel se recalcula con él.
watch(() => store.columns, () => void load(), { deep: true });

const percentDone = computed(() => (data.value?.totals.total ? Math.round((data.value.totals.completed / data.value.totals.total) * 100) : 0));
const maxSection = computed(() => Math.max(1, ...(data.value?.bySection ?? []).map((s) => s.open + s.completed)));
const maxWeek = computed(() => Math.max(1, ...(data.value?.completedByWeek ?? []).map((w) => w.count)));
const weekFmt = computed(() => new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }));
function weekLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return weekFmt.value.format(new Date(y!, m! - 1, d!));
}
const person = (id: string | null) => (id ? displayName(store.users.get(id)) || t('projects.share.unknownUser') : t('projects.task.unassigned'));
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <v-alert v-if="failure" type="error" closable @click:close="failure = null">{{ failure }}</v-alert>
    <template v-if="data">
      <v-row>
        <v-col v-for="k in (['open', 'completed', 'overdue', 'dueThisWeek', 'unassigned'] as const)" :key="k" cols="6" sm="4" md>
          <v-card class="pa-4 h-100">
            <div class="text-body-2 text-medium-emphasis">{{ t(`projects.dashboard.${k}`) }}</div>
            <div class="text-h6" :class="{ 'text-error': k === 'overdue' && data.totals.overdue > 0, 'text-success': k === 'completed' }">{{ data.totals[k] }}</div>
          </v-card>
        </v-col>
      </v-row>

      <v-card class="pa-6">
        <div class="d-flex align-center mb-2">
          <span class="text-h6">{{ t('projects.dashboard.progress') }}</span>
          <v-spacer />
          <span class="text-body-2 text-medium-emphasis">{{ t('projects.dashboard.progressText', { done: data.totals.completed, total: data.totals.total }) }}</span>
        </div>
        <v-progress-linear :model-value="percentDone" color="success" height="10" rounded />
        <div v-if="data.time.estimatedMinutes || data.time.actualMinutes" class="text-body-2 text-medium-emphasis mt-2">
          {{ t('projects.dashboard.time', { estimated: formatMinutes(data.time.estimatedMinutes), actual: formatMinutes(data.time.actualMinutes) }) }}
        </div>
      </v-card>

      <v-row>
        <v-col cols="12" md="6">
          <v-card class="pa-6 h-100">
            <div class="text-h6 mb-4">{{ t('projects.dashboard.bySection') }}</div>
            <div v-for="s in data.bySection" :key="s.sectionId" class="mb-2">
              <div class="d-flex text-body-2">
                <span>{{ s.name }}</span>
                <v-spacer />
                <span class="text-medium-emphasis">{{ t('projects.dashboard.openDone', { open: s.open, done: s.completed }) }}</span>
              </div>
              <v-progress-linear :model-value="((s.open + s.completed) / maxSection) * 100" :buffer-value="(s.open / maxSection) * 100" color="primary" bg-color="success" height="8" rounded />
            </div>
          </v-card>
        </v-col>
        <v-col cols="12" md="6">
          <v-card class="pa-6 h-100">
            <div class="text-h6 mb-4">{{ t('projects.dashboard.byAssignee') }}</div>
            <div v-if="!data.byAssignee.length" class="text-body-2 text-medium-emphasis">{{ t('projects.dashboard.nothingOpen') }}</div>
            <div v-for="a in data.byAssignee" :key="a.userId ?? 'none'" class="d-flex align-center ga-2 mb-2">
              <UserAvatar :user-id="a.userId" :size="26" :tooltip="false" />
              <span class="text-body-2 flex-grow-1 text-truncate">{{ person(a.userId) }}</span>
              <v-chip v-if="a.overdue" size="x-small" color="error">{{ t('projects.dashboard.overdueCount', a.overdue) }}</v-chip>
              <span class="text-body-2 font-weight-medium">{{ a.open }}</span>
            </div>
          </v-card>
        </v-col>
        <v-col cols="12" md="6">
          <v-card class="pa-6 h-100">
            <div class="text-h6 mb-4">{{ t('projects.dashboard.completedByWeek') }}</div>
            <div class="d-flex align-end ga-2" style="height: 140px">
              <div v-for="w in data.completedByWeek" :key="w.weekStart" class="flex-grow-1 d-flex flex-column align-center justify-end h-100">
                <span class="text-caption">{{ w.count || '' }}</span>
                <div class="bg-primary rounded w-100" :style="{ height: `${(w.count / maxWeek) * 100}px`, minHeight: w.count ? '4px' : '0' }" />
                <span class="text-caption text-medium-emphasis text-no-wrap">{{ weekLabel(w.weekStart) }}</span>
              </div>
            </div>
          </v-card>
        </v-col>
        <v-col cols="12" md="6">
          <v-card class="pa-6 h-100">
            <div class="text-h6 mb-4">{{ t('projects.dashboard.milestones') }}</div>
            <div v-if="!data.milestones.length" class="text-body-2 text-medium-emphasis">{{ t('projects.overview.noMilestones') }}</div>
            <v-list density="compact" class="pa-0">
              <v-list-item
                v-for="m in data.milestones"
                :key="m.taskId"
                :prepend-icon="m.completed ? 'mdi-rhombus' : 'mdi-rhombus-outline'"
                class="px-0"
                @click="store.openTask(m.taskId)"
              >
                <v-list-item-title :class="{ 'text-decoration-line-through text-medium-emphasis': m.completed }">{{ m.title }}</v-list-item-title>
                <template #append><DueDateChip :due-on="m.dueOn" :completed="m.completed" /></template>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </div>
</template>
