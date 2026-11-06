<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { formatDate } from '@/utils/format';
import DateField from '@/components/ui/DateField.vue';
import { useI18n } from 'vue-i18n';
import PageHeader from '@/components/ui/PageHeader.vue';
import RunningTimerChip from '@/components/projects/RunningTimerChip.vue';
import TaskDetailPanel from '@/components/projects/TaskDetailPanel.vue';
import UserAvatar from '@/components/projects/UserAvatar.vue';
import { projectsApi } from '@/api/projects';
import { useAuthStore } from '@/stores/auth';
import { useProjectsStore } from '@/stores/projects';
import { formatMinutes, hoursDecimal, parseDuration } from '@/utils/duration';
import { extractError } from '@/utils/error';
import { displayName, localIsoDate } from '@/utils/projects';
import { downloadText } from '@/utils/statements';
import { RANGE_PRESETS, rangeFor, timeReportCsv, totalsBy, type RangePreset } from '@/utils/timeReport';
import type { TimeReport, TimeReportRow } from '@/types/projects';

/**
 * «Horas» (entregable 5): el reporte de tiempo de Asana, por persona y proyecto, con CSV. Cada quien ve sus horas; con
 * `time_entry:read_all` (Administrador, Contador), las de todos. Corregir o borrar un registro lo hace quien lo hizo.
 */
const { t, locale } = useI18n();
const auth = useAuthStore();
const store = useProjectsStore();

const canReadAll = computed(() => auth.can('time_entry:read_all'));
const preset = ref<RangePreset>('thisWeek');
const from = ref<string | null>(null);
const to = ref<string | null>(null);
const userId = ref<string | null>(null);
const projectId = ref<string | null>(null);
const billable = ref<'all' | 'yes' | 'no'>('all');
const report = ref<TimeReport | null>(null);
const loading = ref(false);
const failure = ref<string | null>(null);

function applyPreset(): void {
  if (preset.value === 'custom') return;
  const r = rangeFor(preset.value, localIsoDate(new Date()));
  from.value = r.from;
  to.value = r.to;
}

async function load(): Promise<void> {
  loading.value = true;
  failure.value = null;
  try {
    report.value = await projectsApi.timeReport({
      from: from.value || undefined,
      to: to.value || undefined,
      userId: userId.value ?? undefined,
      projectId: projectId.value ?? undefined,
      billable: billable.value === 'all' ? undefined : billable.value === 'yes',
    });
  } catch (err) {
    failure.value = extractError(err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  applyPreset();
  void store.ensureDirectory();
  void store.fetchProjects();
  void load();
});
watch(preset, () => {
  applyPreset();
  void load();
});
watch([userId, projectId, billable], () => void load());

const items = computed(() => report.value?.items ?? []);
const person = (id: string) => displayName(store.users.get(id)) || t('projects.share.unknownUser');
const projectName = (id: string) => (id ? (items.value.find((e) => e.projectId === id)?.projectName ?? '—') : t('projects.time.noProject'));
const byPerson = computed(() => totalsBy(items.value, 'userId'));
const byProject = computed(() => totalsBy(items.value, 'projectId'));
const people = computed(() => store.directory.map((u) => ({ value: u.id, title: displayName(u) })));
const projectItems = computed(() => store.projects.map((p) => ({ value: p.id, title: p.name })));
const presetItems = computed(() => RANGE_PRESETS.map((p) => ({ value: p, title: t(`projects.time.range.${p}`) })));
const billableItems = computed(() => (['all', 'yes', 'no'] as const).map((v) => ({ value: v, title: t(`projects.time.billableFilter.${v}`) })));

function day(iso: string): string {
  return formatDate(iso);
}

function exportCsv(): void {
  const csv = timeReportCsv(
    items.value,
    {
      date: t('projects.time.workedOn'),
      person: t('projects.time.person'),
      project: t('projects.time.project'),
      task: t('projects.time.task'),
      hours: t('projects.time.hours'),
      minutes: t('projects.time.minutes'),
      billable: t('projects.time.billable'),
      note: t('projects.time.note'),
      source: t('projects.time.source'),
      yes: t('common.yes'),
      no: t('common.no'),
      timer: t('projects.time.sourceTimer'),
      manual: t('projects.time.sourceManual'),
    },
    person,
  );
  downloadText(`${t('projects.time.fileName')}-${from.value || 'todo'}-${to.value || ''}.csv`, csv);
}

// ── Corregir un registro ──
const editing = ref<TimeReportRow | null>(null);
const editDuration = ref('');
const editDate = ref<string | null>(null);
const editBillable = ref(true);
const editNote = ref('');
const editParsed = computed(() => parseDuration(editDuration.value));

function startEdit(e: TimeReportRow): void {
  editing.value = e;
  editDuration.value = formatMinutes(e.minutes);
  editDate.value = e.workedOn;
  editBillable.value = e.billable;
  editNote.value = e.note ?? '';
}

async function saveEdit(): Promise<void> {
  const e = editing.value;
  if (!e || !editParsed.value || !editDate.value) return;
  try {
    await projectsApi.updateTime(e.id, { minutes: editParsed.value, workedOn: editDate.value, billable: editBillable.value, note: editNote.value.trim() || null });
    editing.value = null;
    await load();
  } catch (err) {
    failure.value = extractError(err);
  }
}

async function remove(e: TimeReportRow): Promise<void> {
  try {
    await projectsApi.deleteTime(e.id);
    await load();
  } catch (err) {
    failure.value = extractError(err);
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="t('projects.time.pageTitle')" :subtitle="t('projects.time.pageSubtitle')">
      <template #actions>
        <RunningTimerChip @stopped="load" />
        <v-btn variant="text" prepend-icon="mdi-download" :disabled="!items.length" @click="exportCsv">{{ t('projects.time.exportCsv') }}</v-btn>
      </template>
    </PageHeader>

    <v-card class="pa-4 mb-4">
      <v-row>
        <v-col cols="12" sm="6" md="3"><v-select v-model="preset" :items="presetItems" :label="t('projects.time.period')" /></v-col>
        <template v-if="preset === 'custom'">
          <v-col cols="6" md="2">
            <DateField :model-value="from" :max="to" :label="t('projects.time.from')" @update:model-value="(v) => { from = v; load(); }" />
          </v-col>
          <v-col cols="6" md="2">
            <DateField :model-value="to" :min="from" :label="t('projects.time.to')" @update:model-value="(v) => { to = v; load(); }" />
          </v-col>
        </template>
        <v-col v-if="canReadAll" cols="12" sm="6" md="3">
          <v-autocomplete v-model="userId" :items="people" :label="t('projects.time.person')" clearable />
        </v-col>
        <v-col cols="12" sm="6" md="3"><v-autocomplete v-model="projectId" :items="projectItems" :label="t('projects.time.project')" clearable /></v-col>
        <v-col cols="12" sm="6" md="2"><v-select v-model="billable" :items="billableItems" :label="t('projects.time.billable')" /></v-col>
      </v-row>
    </v-card>

    <v-alert v-if="failure" type="error" closable class="mb-4" @click:close="failure = null">{{ failure }}</v-alert>
    <v-alert v-if="report?.truncated" type="warning" class="mb-4">{{ t('projects.time.truncated') }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <v-row v-if="report" class="mb-2">
      <v-col cols="12" sm="4">
        <v-card class="pa-4">
          <div class="text-body-medium text-medium-emphasis">{{ t('projects.time.total') }}</div>
          <div class="text-title-large">{{ formatMinutes(report.totalMinutes) }}</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card class="pa-4">
          <div class="text-body-medium text-medium-emphasis">{{ t('projects.time.billableTotal') }}</div>
          <div class="text-title-large text-success">{{ formatMinutes(report.billableMinutes) }}</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card class="pa-4">
          <div class="text-body-medium text-medium-emphasis">{{ t('projects.time.nonBillableTotal') }}</div>
          <div class="text-title-large">{{ formatMinutes(report.totalMinutes - report.billableMinutes) }}</div>
        </v-card>
      </v-col>
    </v-row>

    <v-row v-if="items.length" class="mb-2">
      <v-col v-if="canReadAll" cols="12" md="6">
        <v-card class="pa-4 h-100">
          <div class="text-title-large mb-2">{{ t('projects.time.byPerson') }}</div>
          <v-table density="compact">
            <tbody>
              <tr v-for="p in byPerson" :key="p.key">
                <td><div class="d-flex align-center ga-2"><UserAvatar :user-id="p.key" :size="24" :tooltip="false" />{{ person(p.key) }}</div></td>
                <td class="text-right">{{ formatMinutes(p.minutes) }}</td>
                <td class="text-right text-medium-emphasis">{{ t('projects.time.ofWhichBillable', { amount: formatMinutes(p.billableMinutes) }) }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
      <v-col cols="12" :md="canReadAll ? 6 : 12">
        <v-card class="pa-4 h-100">
          <div class="text-title-large mb-2">{{ t('projects.time.byProject') }}</div>
          <v-table density="compact">
            <tbody>
              <tr v-for="p in byProject" :key="p.key">
                <td>{{ projectName(p.key) }}</td>
                <td class="text-right">{{ formatMinutes(p.minutes) }}</td>
                <td class="text-right text-medium-emphasis">{{ t('projects.time.ofWhichBillable', { amount: formatMinutes(p.billableMinutes) }) }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
    </v-row>

    <v-card>
      <v-table>
        <thead>
          <tr>
            <th>{{ t('projects.time.workedOn') }}</th>
            <th v-if="canReadAll">{{ t('projects.time.person') }}</th>
            <th>{{ t('projects.time.task') }}</th>
            <th class="d-none d-md-table-cell">{{ t('projects.time.project') }}</th>
            <th class="text-right">{{ t('projects.time.hours') }}</th>
            <th class="d-none d-sm-table-cell" />
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in items" :key="e.id">
            <td class="text-no-wrap">{{ day(e.workedOn) }}</td>
            <td v-if="canReadAll"><div class="d-flex align-center ga-2"><UserAvatar :user-id="e.userId" :size="24" :tooltip="false" /><span class="d-none d-lg-inline">{{ person(e.userId) }}</span></div></td>
            <td>
              <a class="text-primary cursor-pointer" @click="store.openTask(e.taskId)">{{ e.taskTitle }}</a>
              <v-chip v-if="e.taskDeleted" size="x-small" class="ml-1">{{ t('projects.time.inTrash') }}</v-chip>
              <div v-if="e.note" class="text-body-medium text-medium-emphasis">{{ e.note }}</div>
            </td>
            <td class="d-none d-md-table-cell">{{ e.projectName ?? t('projects.time.noProject') }}</td>
            <td class="text-right text-no-wrap" :title="hoursDecimal(e.minutes, locale) + ' h'">
              {{ formatMinutes(e.minutes) }}
              <v-icon v-if="e.source === 'timer'" icon="mdi-timer-outline" size="x-small" />
            </td>
            <td class="d-none d-sm-table-cell">
              <v-chip :color="e.billable ? 'success' : undefined" size="x-small">{{ e.billable ? t('projects.time.billableShort') : t('projects.time.nonBillable') }}</v-chip>
            </td>
            <td class="text-right text-no-wrap">
              <template v-if="e.canEdit">
                <v-btn icon="mdi-pencil-outline" size="x-small" variant="text" :aria-label="t('common.edit')" @click="startEdit(e)" />
                <v-btn icon="mdi-trash-can-outline" size="x-small" variant="text" :aria-label="t('common.delete')" @click="remove(e)" />
              </template>
            </td>
          </tr>
          <tr v-if="!loading && !items.length">
            <td :colspan="7" class="text-center text-medium-emphasis pa-6">{{ t('projects.time.empty') }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <v-dialog :model-value="!!editing" max-width="480" @update:model-value="(v) => !v && (editing = null)">
      <v-card>
        <v-card-title>{{ t('projects.time.editTitle') }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-4">
          <v-text-field v-model="editDuration" :label="t('projects.time.duration')" :hint="t('projects.time.durationHint')" persistent-hint />
          <DateField v-model="editDate" :label="t('projects.time.workedOn')" />
          <v-text-field v-model="editNote" :label="t('projects.time.note')" :counter="500" />
          <v-switch v-model="editBillable" :label="t('projects.time.billable')" />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="editing = null">{{ t('common.cancel') }}</v-btn>
          <v-btn variant="flat" color="primary" :disabled="!editParsed || !editDate" @click="saveEdit">{{ t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <TaskDetailPanel />
  </v-container>
</template>
