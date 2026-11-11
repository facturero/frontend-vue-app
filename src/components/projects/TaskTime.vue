<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { formatDate } from '@/utils/format';
import DateField from '@/components/ui/DateField.vue';
import { useI18n } from 'vue-i18n';
import { projectsApi } from '@/api/projects';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { useProjectsStore } from '@/stores/projects';
import { TIME_TRACKING_PLUGIN, useTimerStore } from '@/stores/timer';
import { formatElapsed, formatMinutes, parseDuration } from '@/utils/duration';
import { extractError } from '@/utils/error';
import { localIsoDate } from '@/utils/projects';
import UserAvatar from './UserAvatar.vue';

/**
 * Horas de la tarea (entregable 5), como el «tiempo estimado / tiempo real» de Asana, en DOS FILAS de la tabla de propiedades
 * (junto a responsable y fechas), no en una sección aparte: lo pidió el dueño.
 *
 *   - «Horas»: el total GENERAL de la tarea (lo suyo + lo de sus subtareas) con el desglose, el cronómetro y «+» para registrar a mano.
 *     Un clic en el total muestra los registros (cada uno dice en qué subtarea se hizo). Con subtareas, el cronómetro y el registro
 *     preguntan dónde (la tarea o una subtarea): antes iba siempre a la tarea abierta y las horas de las subtareas caían «en general».
 *   - «Estimado»: el tiempo estimado (alimenta la carga de trabajo).
 *
 * Quien ve la tarea ve sus horas; registrar lo hace su responsable o un editor; borrar un registro, quien lo hizo. Va dentro del
 * `<tbody>` de TaskDetailPanel: la raíz son las filas (`<tr>`).
 */
const { t } = useI18n();
const store = useProjectsStore();
const timer = useTimerStore();
const auth = useAuthStore();
const plugins = usePluginsStore();

const task = computed(() => store.detail);
const tracking = computed(() => plugins.isActive(TIME_TRACKING_PLUGIN));
/** El estimado sirve también a la carga de trabajo, aunque no se registren horas. */
const showEstimate = computed(() => tracking.value || plugins.isActive('projects.resource_allocation'));
const me = computed(() => auth.user?.id ?? '');
onMounted(() => void timer.load());

const subtasks = computed(() => task.value?.subtasks ?? []);
/** Dónde se puede registrar: la tarea y sus subtareas. */
const targets = computed(() =>
  task.value ? [{ value: task.value.id, title: t('projects.time.thisTask') }, ...subtasks.value.map((s) => ({ value: s.id, title: s.title }))] : [],
);
/** El cronómetro corre en la tarea o en una de sus subtareas: en ambos casos se ve y se detiene aquí. */
const runningId = computed(() => {
  const id = timer.timer?.taskId;
  return id && (id === task.value?.id || subtasks.value.some((s) => s.id === id)) ? id : null;
});
const titleOf = (taskId: string) => (taskId === task.value?.id ? '' : (subtasks.value.find((s) => s.id === taskId)?.title ?? ''));

// ── Estimado ────────────────────────────────────────────────────────────────
const estimate = ref('');
watch(
  () => [task.value?.id, task.value?.estimatedMinutes],
  () => (estimate.value = task.value?.estimatedMinutes ? formatMinutes(task.value.estimatedMinutes) : ''),
  { immediate: true },
);

async function saveEstimate(): Promise<void> {
  const d = task.value;
  if (!d) return;
  const value = estimate.value.trim() ? parseDuration(estimate.value) : null;
  if (estimate.value.trim() && value === null) {
    estimate.value = d.estimatedMinutes ? formatMinutes(d.estimatedMinutes) : '';
    return;
  }
  if (value === d.estimatedMinutes) {
    estimate.value = value ? formatMinutes(value) : '';
    return;
  }
  try {
    await store.updateTask(d.id, d.version, { estimatedMinutes: value });
  } catch {
    // El aviso lo deja el store.
  }
}

// ── Registrar a mano ────────────────────────────────────────────────────────
const adding = ref(false);
const target = ref<string | null>(null);
const workedOn = ref<string | null>(localIsoDate(new Date()));
const duration = ref('');
const billable = ref(true);
const note = ref('');
const failure = ref<string | null>(null);
const saving = ref(false);
const parsed = computed(() => parseDuration(duration.value));
// Cada vez que se abre, empieza en la tarea abierta.
watch(adding, (open) => {
  if (open) {
    target.value = task.value?.id ?? null;
    failure.value = null;
  }
});

/** Tras registrar o borrar: el detalle (lista y total) y el total de la tarjeta en el tablero. */
async function refresh(): Promise<void> {
  const d = task.value;
  if (!d) return;
  await store.openTask(d.id);
  const card = Object.values(store.columns).flat().find((c) => c.id === d.id);
  if (card && store.detail) card.actualMinutes = store.detail.actualMinutes;
}

async function log(): Promise<void> {
  const d = task.value;
  if (!d || !parsed.value || !workedOn.value) return;
  saving.value = true;
  failure.value = null;
  try {
    await projectsApi.logTime({ taskId: target.value ?? d.id, workedOn: workedOn.value, minutes: parsed.value, billable: billable.value, note: note.value.trim() || null });
    duration.value = '';
    note.value = '';
    adding.value = false;
    await refresh();
  } catch (err) {
    failure.value = extractError(err);
  } finally {
    saving.value = false;
  }
}

// ── Cronómetro ──────────────────────────────────────────────────────────────
async function startOn(taskId: string): Promise<void> {
  await timer.start(taskId);
  await refresh();
}

async function stopTimer(): Promise<void> {
  await timer.stop();
  await refresh();
}

async function remove(id: string): Promise<void> {
  try {
    await projectsApi.deleteTime(id);
    await refresh();
  } catch (err) {
    failure.value = extractError(err);
  }
}

const day = (iso: string) => formatDate(iso);
</script>

<template>
  <template v-if="task">
    <tr v-if="tracking">
      <td class="text-medium-emphasis text-no-wrap">{{ t('projects.time.title') }}</td>
      <td>
        <!-- Izquierda: el total general y, debajo, el desglose. Derecha: cronómetro y «+». En una sola línea aunque el panel sea estrecho. -->
        <div class="d-flex align-center ga-2 py-1">
          <div class="d-flex flex-column align-start">
          <!-- El total general; un clic muestra los registros (de la tarea y de sus subtareas). -->
          <v-menu :close-on-content-click="false" location="bottom start" :disabled="!task.timeEntries.length">
            <template #activator="{ props: menu }">
              <v-btn v-bind="menu" variant="text" size="small" prepend-icon="mdi-timer-outline" class="px-1" :aria-label="t('projects.time.entries')">
                {{ task.actualMinutes ? formatMinutes(task.actualMinutes) : t('projects.time.none') }}
              </v-btn>
            </template>
            <v-card min-width="320" max-width="420" class="pa-2">
              <div class="text-body-small text-medium-emphasis px-2 pt-1">{{ t('projects.time.entries') }}</div>
              <v-list density="compact" class="pa-0">
                <v-list-item v-for="e in task.timeEntries" :key="e.id">
                  <template #prepend><UserAvatar :user-id="e.userId" :size="24" class="mr-2" /></template>
                  <v-list-item-title class="text-body-medium">
                    {{ formatMinutes(e.minutes) }} · {{ day(e.workedOn) }}
                    <v-icon v-if="e.source === 'timer'" icon="mdi-timer-outline" size="x-small" class="ml-1" />
                  </v-list-item-title>
                  <v-list-item-subtitle v-if="e.note || titleOf(e.taskId)">
                    <span v-if="titleOf(e.taskId)" class="text-primary">{{ t('projects.time.inSubtask', { task: titleOf(e.taskId) }) }}</span>
                    <template v-if="e.note && titleOf(e.taskId)"> · </template>{{ e.note }}
                  </v-list-item-subtitle>
                  <template #append>
                    <v-chip v-if="!e.billable" size="x-small" class="mr-1">{{ t('projects.time.nonBillable') }}</v-chip>
                    <v-btn v-if="e.userId === me" icon="mdi-close" variant="text" size="x-small" :aria-label="t('common.delete')" @click="remove(e.id)" />
                  </template>
                </v-list-item>
              </v-list>
            </v-card>
          </v-menu>
          <span v-if="task.subtasksMinutes > 0" class="text-body-small text-medium-emphasis px-1">
            {{ t('projects.time.breakdown', { own: formatMinutes(task.ownMinutes), subtasks: formatMinutes(task.subtasksMinutes) }) }}
          </span>
          </div>
          <v-spacer />

          <template v-if="task.canLogTime">
            <!-- Cronómetro: corriendo (aquí o en una subtarea) se detiene; si no, arranca en la tarea o, con subtareas, se elige en cuál. -->
            <v-btn
              v-if="runningId"
              v-tooltip:top="titleOf(runningId) ? t('projects.time.runningOn', { task: titleOf(runningId) }) : undefined"
              size="small"
              color="error"
              prepend-icon="mdi-stop"
              :loading="timer.busy"
              @click="stopTimer"
            >
              {{ formatElapsed(timer.elapsedMs) }}<template v-if="titleOf(runningId)"> · {{ titleOf(runningId) }}</template>
            </v-btn>
            <v-menu v-else-if="subtasks.length" location="bottom end">
              <template #activator="{ props: menu }">
                <v-btn v-bind="menu" size="small" variant="tonal" color="primary" prepend-icon="mdi-play" :loading="timer.busy">{{ t('projects.time.start') }}</v-btn>
              </template>
              <v-list density="compact">
                <v-list-subheader>{{ t('projects.time.startOn') }}</v-list-subheader>
                <v-list-item v-for="o in targets" :key="o.value" :title="o.title" @click="startOn(o.value)" />
              </v-list>
            </v-menu>
            <v-btn v-else size="small" variant="tonal" color="primary" prepend-icon="mdi-play" :loading="timer.busy" @click="startOn(task.id)">
              {{ t('projects.time.start') }}
            </v-btn>

            <!-- Registrar a mano; con subtareas, eligiendo dónde. -->
            <v-menu v-model="adding" :close-on-content-click="false" location="bottom end">
              <template #activator="{ props: menu }">
                <v-btn v-bind="menu" v-tooltip:top="t('projects.time.log')" icon="mdi-plus" size="small" variant="text" :aria-label="t('projects.time.log')" />
              </template>
              <v-card min-width="320" class="pa-4 d-flex flex-column ga-2">
                <v-select v-if="subtasks.length" v-model="target" :items="targets" :label="t('projects.time.logOn')" />
                <v-text-field v-model="duration" :label="t('projects.time.duration')" :hint="t('projects.time.durationHint')" persistent-hint autofocus @keyup.enter="log" />
                <DateField v-model="workedOn" :label="t('projects.time.workedOn')" />
                <v-text-field v-model="note" :label="t('projects.time.note')" :counter="500" />
                <v-switch v-model="billable" :label="t('projects.time.billable')" />
                <v-alert v-if="failure" type="error">{{ failure }}</v-alert>
                <div class="d-flex ga-2">
                  <v-spacer />
                  <v-btn variant="text" @click="adding = false">{{ t('common.cancel') }}</v-btn>
                  <v-btn color="primary" :disabled="!parsed || !workedOn" :loading="saving" @click="log">
                    {{ parsed ? t('projects.time.logAmount', { amount: formatMinutes(parsed) }) : t('projects.time.log') }}
                  </v-btn>
                </div>
              </v-card>
            </v-menu>
          </template>
        </div>
        <div v-if="timer.error" class="text-body-small text-error">{{ timer.error }}</div>
      </td>
    </tr>
    <tr v-if="showEstimate">
      <td class="text-medium-emphasis text-no-wrap">{{ t('projects.time.estimate') }}</td>
      <td>
        <v-text-field
          v-model="estimate"
          :placeholder="task.canEdit ? t('projects.time.estimatePlaceholder') : '—'"
          :readonly="!task.canEdit"
          variant="plain"
          @blur="saveEstimate"
          @keyup.enter="($event.target as HTMLInputElement).blur()"
        />
      </td>
    </tr>
  </template>
</template>
