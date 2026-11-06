<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatDate } from '@/utils/format';
import { useI18n } from 'vue-i18n';
import { useProjectsStore } from '@/stores/projects';
import { localIsoDate } from '@/utils/projects';
import { daysBetween, monthGrid, shiftDay } from '@/utils/timeline';
import type { BoardTask } from '@/types/projects';

/**
 * Vista Calendario, como la de Asana: el mes con las tareas en su fecha de entrega. Arrastrar una tarea a otro día la reprograma
 * (si tenía inicio, se desplaza igual: la duración no cambia). «+» en un día crea ahí una tarea. Clic en una tarea abre el detalle.
 */
const { t, locale } = useI18n();
const store = useProjectsStore();

const today = localIsoDate(new Date());
const cursor = ref({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
const days = computed(() => monthGrid(cursor.value.year, cursor.value.month));
const editable = computed(() => store.canEdit && store.current?.status === 'active');

const byDay = computed(() => {
  const out = new Map<string, BoardTask[]>();
  for (const task of Object.values(store.columns).flat()) {
    if (!task.dueOn) continue;
    out.set(task.dueOn, [...(out.get(task.dueOn) ?? []), task]);
  }
  return out;
});
const undated = computed(() => Object.values(store.columns).flat().filter((t) => !t.dueOn && !t.completedAt).length);

const weekdays = computed(() =>
  Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale.value, { weekday: 'short' }).format(new Date(Date.UTC(2026, 10, 2 + i, 12)))),
);
// Solo la primera letra en mayúscula («Noviembre de 2026»): `text-capitalize` ponía «De» en mayúscula.
const title = computed(() => {
  const text = new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric' }).format(new Date(cursor.value.year, cursor.value.month - 1, 1));
  return text.charAt(0).toLocaleUpperCase(locale.value) + text.slice(1);
});

function move(delta: number): void {
  const d = new Date(cursor.value.year, cursor.value.month - 1 + delta, 1);
  cursor.value = { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// ── Arrastrar entre días ────────────────────────────────────────────────────
const dragging = ref<string | null>(null);
const over = ref<string | null>(null);

async function drop(day: string): Promise<void> {
  over.value = null;
  const id = dragging.value;
  dragging.value = null;
  const task = id ? Object.values(store.columns).flat().find((x) => x.id === id) : null;
  if (!task?.dueOn || task.dueOn === day) return;
  const delta = daysBetween(task.dueOn, day);
  await store.reschedule(task.id, { dueOn: day, ...(task.startOn ? { startOn: shiftDay(task.startOn, delta) } : {}) });
}

// ── Crear en un día ─────────────────────────────────────────────────────────
const addingOn = ref<string | null>(null);
const draft = ref('');

async function add(): Promise<void> {
  const title = draft.value.trim();
  const day = addingOn.value;
  if (!title || !day || !store.current) return;
  draft.value = '';
  try {
    await store.createTask({ title, projectId: store.current.id, sectionId: store.sections[0]?.id, dueOn: day });
  } catch {
    draft.value = title;
  }
}
</script>

<template>
  <v-card>
    <div class="d-flex align-center flex-wrap ga-2 pa-2 border-b">
      <v-btn icon="mdi-chevron-left" variant="text" size="small" :aria-label="t('projects.timeline.previous')" @click="move(-1)" />
      <v-btn variant="outlined" size="small" @click="cursor = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }">{{ t('projects.due.today') }}</v-btn>
      <v-btn icon="mdi-chevron-right" variant="text" size="small" :aria-label="t('projects.timeline.next')" @click="move(1)" />
      <span class="text-body-large font-weight-medium">{{ title }}</span>
      <v-spacer />
      <span v-if="undated" class="text-body-small text-medium-emphasis">{{ t('projects.calendar.undated', undated) }}</span>
    </div>

    <div class="calendar">
      <div v-for="w in weekdays" :key="w" class="text-body-small text-medium-emphasis text-center py-1 border-b text-capitalize">{{ w }}</div>
      <div
        v-for="day in days"
        :key="day"
        class="calendar__cell pa-1 border-e border-b"
        :class="{
          'bg-lightprimary': over === day,
          'calendar__cell--other': day.slice(5, 7) !== String(cursor.month).padStart(2, '0'),
        }"
        @dragover.prevent="over = day"
        @dragleave="over === day && (over = null)"
        @drop.prevent="drop(day)"
      >
        <div class="d-flex align-center">
          <span
            class="text-body-small calendar__day"
            :class="day === today ? 'bg-primary font-weight-bold' : 'text-medium-emphasis'"
          >{{ Number(day.slice(8)) }}</span>
          <v-spacer />
          <v-btn
            v-if="editable"
            icon="mdi-plus"
            variant="text"
            size="x-small"
            class="calendar__add"
            :aria-label="t('projects.task.addTask')"
            @click="addingOn = day"
          />
        </div>
        <div class="d-flex flex-column ga-1">
          <div
            v-for="task in (byDay.get(day) ?? []).slice(0, 4)"
            :key="task.id"
            :draggable="editable"
            class="calendar__chip text-body-small text-truncate px-1 rounded cursor-pointer"
            :class="[
              task.completedAt ? 'bg-lightsuccess text-decoration-line-through' : day < today ? 'bg-lighterror' : 'bg-lightprimary',
              { 'font-weight-bold': task.kind === 'milestone' },
            ]"
            :title="task.title"
            @dragstart="dragging = task.id"
            @dragend="dragging = null"
            @click="store.openTask(task.id)"
          >
            <v-icon v-if="task.kind === 'milestone'" icon="mdi-rhombus" size="x-small" color="warning" />
            {{ task.title }}
          </div>
          <span v-if="(byDay.get(day) ?? []).length > 4" class="text-body-small text-medium-emphasis px-1">
            {{ t('projects.calendar.more', { n: (byDay.get(day) ?? []).length - 4 }) }}
          </span>
        </div>
      </div>
    </div>

    <v-dialog :model-value="!!addingOn" @update:model-value="addingOn = null">
      <v-card>
        <v-card-title>{{ t('projects.calendar.addOn', { day: formatDate(addingOn) }) }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="draft" :label="t('projects.task.title')" autofocus @keyup.enter="add" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="addingOn = null">{{ t('common.close') }}</v-btn>
          <v-btn variant="flat" color="primary" :disabled="!draft.trim()" @click="add">{{ t('projects.task.addTask') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
.calendar {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.calendar__cell {
  min-height: 112px;
}
.calendar__cell--other {
  opacity: 0.5;
}
.calendar__day {
  width: 22px;
  height: 22px;
  line-height: 22px;
  text-align: center;
  border-radius: 50%;
}
.calendar__add {
  opacity: 0;
}
.calendar__cell:hover .calendar__add {
  opacity: 1;
}
</style>
