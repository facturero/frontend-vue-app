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
 * Horas de la tarea (entregable 5), como el «tiempo estimado / tiempo real» de Asana: el estimado se edita aquí (alimenta la carga
 * de trabajo) y las horas se registran con el cronómetro o a mano. Quien ve la tarea ve sus horas; registrar lo hace su responsable o
 * un editor; borrar un registro, quien lo hizo.
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
const running = computed(() => !!task.value && timer.timer?.taskId === task.value.id);
const me = computed(() => auth.user?.id ?? '');
onMounted(() => void timer.load());

const estimate = ref('');
watch(
  () => [task.value?.id, task.value?.estimatedMinutes],
  () => (estimate.value = task.value?.estimatedMinutes ? formatMinutes(task.value.estimatedMinutes) : ''),
  { immediate: true },
);

const adding = ref(false);
const workedOn = ref<string | null>(localIsoDate(new Date()));
const duration = ref('');
const billable = ref(true);
const note = ref('');
const failure = ref<string | null>(null);
const saving = ref(false);
const parsed = computed(() => parseDuration(duration.value));

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
    await projectsApi.logTime({ taskId: d.id, workedOn: workedOn.value, minutes: parsed.value, billable: billable.value, note: note.value.trim() || null });
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

async function toggleTimer(): Promise<void> {
  const d = task.value;
  if (!d) return;
  if (running.value) await timer.stop();
  else await timer.start(d.id);
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
  <div v-if="task && (tracking || showEstimate)">
    <div class="d-flex align-center flex-wrap ga-2 mb-2">
      <span class="text-body-large font-weight-medium">{{ t('projects.time.title') }}</span>
      <v-chip v-if="tracking" size="small" prepend-icon="mdi-timer-outline">
        {{ t('projects.time.actual') }}: {{ formatMinutes(task.actualMinutes) }}
      </v-chip>
      <v-spacer />
      <template v-if="tracking && task.canLogTime">
        <v-btn
          size="small"
          :color="running ? 'error' : 'primary'"
          :variant="running ? 'flat' : 'tonal'"
          :prepend-icon="running ? 'mdi-stop' : 'mdi-play'"
          :loading="timer.busy"
          @click="toggleTimer"
        >
          {{ running ? formatElapsed(timer.elapsedMs) : t('projects.time.start') }}
        </v-btn>
        <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="adding = !adding">{{ t('projects.time.log') }}</v-btn>
      </template>
    </div>

    <v-text-field
      v-if="showEstimate"
      v-model="estimate"
      :label="t('projects.time.estimate')"
      :hint="t('projects.time.durationHint')"
      :readonly="!task.canEdit"
      prepend-inner-icon="mdi-timer-sand"
      class="mb-2"
      @blur="saveEstimate"
      @keyup.enter="($event.target as HTMLInputElement).blur()"
    />

    <v-alert v-if="failure" type="error" closable class="mb-2" @click:close="failure = null">{{ failure }}</v-alert>
    <v-alert v-if="timer.error" type="error" closable class="mb-2" @click:close="timer.error = null">{{ timer.error }}</v-alert>

    <v-card v-if="adding" variant="tonal" class="pa-4 mb-2 d-flex flex-column ga-2">
      <div class="d-flex flex-column flex-sm-row ga-2">
        <v-text-field v-model="duration" :label="t('projects.time.duration')" :hint="t('projects.time.durationHint')" persistent-hint autofocus @keyup.enter="log" />
        <DateField v-model="workedOn" :label="t('projects.time.workedOn')" />
      </div>
      <v-text-field v-model="note" :label="t('projects.time.note')" :counter="500" />
      <div class="d-flex align-center flex-wrap ga-2">
        <v-switch v-model="billable" :label="t('projects.time.billable')" class="flex-grow-0" />
        <v-spacer />
        <v-btn variant="text" @click="adding = false">{{ t('common.cancel') }}</v-btn>
        <v-btn color="primary" :disabled="!parsed || !workedOn" :loading="saving" @click="log">
          {{ parsed ? t('projects.time.logAmount', { amount: formatMinutes(parsed) }) : t('projects.time.log') }}
        </v-btn>
      </div>
    </v-card>

    <v-list v-if="tracking && task.timeEntries.length" density="compact" class="pa-0">
      <v-list-item v-for="e in task.timeEntries" :key="e.id" class="px-0">
        <template #prepend><UserAvatar :user-id="e.userId" :size="24" class="mr-2" /></template>
        <v-list-item-title class="text-body-medium">
          {{ formatMinutes(e.minutes) }} · {{ day(e.workedOn) }}
          <v-icon v-if="e.source === 'timer'" icon="mdi-timer-outline" size="x-small" class="ml-1" />
        </v-list-item-title>
        <v-list-item-subtitle v-if="e.note">{{ e.note }}</v-list-item-subtitle>
        <template #append>
          <v-chip v-if="!e.billable" size="x-small" class="mr-1">{{ t('projects.time.nonBillable') }}</v-chip>
          <v-btn v-if="e.userId === me" icon="mdi-close" variant="text" size="x-small" :aria-label="t('common.delete')" @click="remove(e.id)" />
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>
