<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PageHeader from '@/components/ui/PageHeader.vue';
import DueDateChip from '@/components/projects/DueDateChip.vue';
import TaskDetailPanel from '@/components/projects/TaskDetailPanel.vue';
import UserAvatar from '@/components/projects/UserAvatar.vue';
import { projectsApi } from '@/api/projects';
import { useAuthStore } from '@/stores/auth';
import { useProjectsStore } from '@/stores/projects';
import { formatMinutes, parseDuration } from '@/utils/duration';
import { extractError } from '@/utils/error';
import { addDays, displayName, localIsoDate } from '@/utils/projects';
import { mondayOf } from '@/utils/timeReport';
import type { Workload, WorkloadPerson } from '@/types/projects';

/**
 * «Carga de trabajo» (entregable 5), como el Workload de Asana: por persona y semana, las horas estimadas de sus tareas abiertas
 * contra su capacidad. En verde hay margen, en naranja está casi llena, en rojo se pasó: ahí conviene mover o reasignar tareas.
 * Las tareas sin estimación cuentan en el número de tareas, no en las horas.
 */
const WEEKS = 4;
const { t, locale } = useI18n();
const auth = useAuthStore();
const store = useProjectsStore();

const start = ref(mondayOf(localIsoDate(new Date())));
const projectId = ref<string | null>(null);
const data = ref<Workload | null>(null);
const loading = ref(false);
const failure = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  failure.value = null;
  try {
    data.value = await projectsApi.workload(start.value, WEEKS, projectId.value ?? undefined);
  } catch (err) {
    failure.value = extractError(err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void store.ensureDirectory();
  void store.fetchProjects();
  void load();
});
watch([start, projectId], () => void load());

const projectItems = computed(() => store.projects.map((p) => ({ value: p.id, title: p.name })));
const weekFmt = computed(() => new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }));
function weekLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return weekFmt.value.format(new Date(y!, m! - 1, d!));
}
const thisWeek = mondayOf(localIsoDate(new Date()));

/** Personas con tareas en el rango, por nombre. */
const people = computed(() =>
  [...(data.value?.people ?? [])].sort((a, b) => (displayName(store.users.get(a.userId)) || a.userId).localeCompare(displayName(store.users.get(b.userId)) || b.userId)),
);

function load_(p: WorkloadPerson, week: number): { minutes: number; taskCount: number; percent: number; color: string } {
  const w = p.weeks[week]!;
  const percent = p.weeklyMinutes ? Math.round((w.minutes / p.weeklyMinutes) * 100) : w.minutes ? 999 : 0;
  const color = percent > 100 ? 'error' : percent >= 80 ? 'warning' : 'success';
  return { minutes: w.minutes, taskCount: w.taskCount, percent, color };
}

// ── Detalle de una celda: las tareas de esa persona esa semana ──
const cell = ref<{ person: WorkloadPerson; weekStart: string } | null>(null);
const cellTasks = computed(() => (cell.value ? cell.value.person.tasks.filter((x) => x.weeks.includes(cell.value!.weekStart)) : []));

// ── Capacidad ──
const canEditCapacity = computed(() => auth.can('project:admin'));
const capacityFor = ref<WorkloadPerson | null>(null);
const capacityText = ref('');
const capacityParsed = computed(() => (capacityText.value.trim() === '0' ? 0 : parseDuration(capacityText.value)));

function editCapacity(p: WorkloadPerson): void {
  capacityFor.value = p;
  capacityText.value = String(p.weeklyMinutes / 60).replace('.', ',');
}

async function saveCapacity(): Promise<void> {
  const p = capacityFor.value;
  if (!p || capacityParsed.value === null) return;
  try {
    await projectsApi.setCapacity(p.userId, capacityParsed.value);
    capacityFor.value = null;
    await load();
  } catch (err) {
    failure.value = extractError(err);
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="t('projects.workload.title')" :subtitle="t('projects.workload.subtitle')" />

    <div class="d-flex align-center flex-wrap ga-2 mb-4">
      <v-btn icon="mdi-chevron-left" variant="text" :aria-label="t('projects.workload.previous')" @click="start = addDays(start, -7 * WEEKS)" />
      <v-btn variant="outlined" :disabled="start === thisWeek" @click="start = thisWeek">{{ t('projects.workload.today') }}</v-btn>
      <v-btn icon="mdi-chevron-right" variant="text" :aria-label="t('projects.workload.next')" @click="start = addDays(start, 7 * WEEKS)" />
      <v-spacer />
      <v-autocomplete v-model="projectId" :items="projectItems" :label="t('projects.time.project')" clearable class="flex-grow-0 w-100" style="max-width: 320px" />
    </div>

    <v-alert v-if="failure" type="error" closable class="mb-4" @click:close="failure = null">{{ failure }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <v-card v-if="data">
      <v-table>
        <thead>
          <tr>
            <th>{{ t('projects.time.person') }}</th>
            <th v-for="w in data.weekStarts" :key="w" class="text-center" :class="{ 'text-primary': w === thisWeek }">
              {{ t('projects.workload.weekOf', { date: weekLabel(w) }) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in people" :key="p.userId">
            <td>
              <div class="d-flex align-center ga-2 py-2">
                <UserAvatar :user-id="p.userId" :size="28" :tooltip="false" />
                <div>
                  <div class="text-body-2">{{ displayName(store.users.get(p.userId)) || t('projects.share.unknownUser') }}</div>
                  <div class="text-caption text-medium-emphasis">
                    {{ t('projects.workload.capacity', { amount: formatMinutes(p.weeklyMinutes) }) }}
                    <v-btn v-if="canEditCapacity" icon="mdi-pencil-outline" size="x-small" variant="text" :aria-label="t('projects.workload.editCapacity')" @click="editCapacity(p)" />
                  </div>
                </div>
              </div>
            </td>
            <td v-for="(w, i) in data.weekStarts" :key="w" class="text-center" style="min-width: 120px">
              <div v-if="load_(p, i).taskCount" class="cursor-pointer py-2" @click="cell = { person: p, weekStart: w }">
                <div class="text-body-2 font-weight-medium" :class="`text-${load_(p, i).color}`">{{ formatMinutes(load_(p, i).minutes) }}</div>
                <v-progress-linear :model-value="Math.min(100, load_(p, i).percent)" :color="load_(p, i).color" rounded height="6" class="my-1" />
                <div class="text-caption text-medium-emphasis">{{ t('projects.workload.tasks', load_(p, i).taskCount) }}</div>
              </div>
              <span v-else class="text-medium-emphasis">—</span>
            </td>
          </tr>
          <tr v-if="!people.length && !loading">
            <td :colspan="data.weekStarts.length + 1" class="text-center text-medium-emphasis pa-6">{{ t('projects.workload.empty') }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
    <div class="text-body-2 text-medium-emphasis mt-2">{{ t('projects.workload.hint') }}</div>

    <v-dialog :model-value="!!cell" max-width="560" scrollable @update:model-value="(v) => !v && (cell = null)">
      <v-card v-if="cell">
        <v-card-title>
          {{ displayName(store.users.get(cell.person.userId)) }} · {{ t('projects.workload.weekOf', { date: weekLabel(cell.weekStart) }) }}
        </v-card-title>
        <v-list density="compact">
          <v-list-item
            v-for="task in cellTasks"
            :key="task.id"
            :title="task.title"
            :prepend-icon="task.kind === 'milestone' ? 'mdi-rhombus' : 'mdi-check-circle-outline'"
            @click="store.openTask(task.id); cell = null"
          >
            <v-list-item-subtitle>
              {{ task.estimatedMinutes ? t('projects.workload.thisWeek', { amount: formatMinutes(task.minutesByWeek[cell.weekStart] ?? 0), total: formatMinutes(task.estimatedMinutes) }) : t('projects.workload.noEstimate') }}
            </v-list-item-subtitle>
            <template #append><DueDateChip :due-on="task.dueOn" :completed="false" /></template>
          </v-list-item>
        </v-list>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cell = null">{{ t('common.close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="!!capacityFor" max-width="400" @update:model-value="(v) => !v && (capacityFor = null)">
      <v-card v-if="capacityFor">
        <v-card-title>{{ t('projects.workload.editCapacity') }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-2">
          <div class="text-body-2">{{ displayName(store.users.get(capacityFor.userId)) }}</div>
          <v-text-field v-model="capacityText" :label="t('projects.workload.hoursPerWeek')" :hint="t('projects.workload.capacityHint')" persistent-hint autofocus @keyup.enter="saveCapacity" />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="capacityFor = null">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" :disabled="capacityParsed === null" @click="saveCapacity">{{ t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <TaskDetailPanel />
  </v-container>
</template>
