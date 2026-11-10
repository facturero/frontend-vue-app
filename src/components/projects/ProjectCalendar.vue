<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDisplay } from 'vuetify';
import { formatDate, formatLongDay, formatMonthYear } from '@/utils/format';
import { useI18n } from 'vue-i18n';
import { useProjectsStore } from '@/stores/projects';
import { localIsoDate } from '@/utils/projects';
import { daysBetween, shiftDay } from '@/utils/timeline';
import type { BoardTask } from '@/types/projects';
import EmptyState from '@/components/ui/EmptyState.vue';
import UserAvatar from './UserAvatar.vue';

/**
 * Vista Calendario, como la de Asana: el mes con las tareas en su fecha de entrega. Arrastrar una tarea a otro día la reprograma
 * (si tenía inicio, se desplaza igual: la duración no cambia). «+» en un día crea ahí una tarea. Clic en una tarea abre el detalle.
 *
 * La rejilla del mes es `v-calendar` (núcleo de Vuetify 4): pone las semanas, los nombres de los días en el idioma activo, el día de
 * hoy y los días de otros meses. Las tareas van en su hueco `day` como fichas propias, porque las fichas de evento de `v-calendar` no
 * se arrastran de un día a otro y eso es lo que más se usa en esta vista.
 *
 * En el teléfono, agenda: la rejilla de siete columnas dejaba cada tarea en dos letras («Re…»). Allí van solo los días del mes que
 * tienen tareas, uno debajo de otro y con el título entero; no se arrastra (no hay dónde soltar) y se crea con el botón flotante.
 */
const { t, locale } = useI18n();
const store = useProjectsStore();

const today = localIsoDate(new Date());
const cursor = ref({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
/** El día que `v-calendar` usa para saber qué mes pintar. */
const focus = computed(() => `${cursor.value.year}-${String(cursor.value.month).padStart(2, '0')}-01`);
/** La semana empieza el lunes, como en el resto de la aplicación (cronograma, carga de trabajo). */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const editable = computed(() => store.canEdit && store.current?.status === 'active');
const { smAndDown } = useDisplay();

const byDay = computed(() => {
  const out = new Map<string, BoardTask[]>();
  for (const task of Object.values(store.columns).flat()) {
    if (!task.dueOn) continue;
    out.set(task.dueOn, [...(out.get(task.dueOn) ?? []), task]);
  }
  return out;
});
const undated = computed(() => Object.values(store.columns).flat().filter((t) => !t.dueOn && !t.completedAt).length);


/** Agenda del teléfono: los días del mes en pantalla que tienen tareas, en orden. */
const agenda = computed(() => {
  const prefix = `${cursor.value.year}-${String(cursor.value.month).padStart(2, '0')}-`;
  return [...byDay.value.entries()]
    .filter(([day]) => day.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, tasks]) => ({ day, tasks }));
});
const title = computed(() => formatMonthYear(new Date(cursor.value.year, cursor.value.month - 1, 1)));

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
/** El día cuyo «+» tiene el foco del teclado: así se ve aunque el ratón no esté encima. */
const focusedAdd = ref<string | null>(null);
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
      <v-tooltip location="top" :text="t('projects.timeline.previous')"><template #activator="{ props: tip }"><v-btn v-bind="tip" icon="mdi-chevron-left" variant="text" size="small" :aria-label="t('projects.timeline.previous')" @click="move(-1)" /></template></v-tooltip>
      <v-btn variant="tonal" size="small" @click="cursor = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }">{{ t('projects.due.today') }}</v-btn>
      <v-tooltip location="top" :text="t('projects.timeline.next')"><template #activator="{ props: tip }"><v-btn v-bind="tip" icon="mdi-chevron-right" variant="text" size="small" :aria-label="t('projects.timeline.next')" @click="move(1)" /></template></v-tooltip>
      <span class="text-body-large font-weight-medium">{{ title }}</span>
      <v-spacer />
      <span v-if="undated" class="text-body-small text-medium-emphasis">{{ t('projects.calendar.undated', undated) }}</span>
    </div>

    <div v-if="smAndDown">
      <EmptyState v-if="!agenda.length" compact icon="mdi-calendar-blank-outline" :title="t('projects.calendar.agendaEmpty')" />
      <div v-for="entry in agenda" :key="entry.day" class="border-b">
        <div class="d-flex align-center ga-2 px-4 pt-2">
          <span class="text-body-medium font-weight-medium" :class="{ 'text-primary': entry.day === today }">{{ formatLongDay(entry.day) }}</span>
          <v-chip v-if="entry.day === today" color="primary" size="x-small">{{ t('projects.due.today') }}</v-chip>
        </div>
        <v-list density="compact" class="py-0">
          <v-list-item v-for="task in entry.tasks" :key="task.id" @click="store.openTask(task.id)">
            <template #prepend>
              <v-icon
                :icon="task.kind === 'milestone' ? 'mdi-rhombus-outline' : task.completedAt ? 'mdi-check-circle' : 'mdi-check-circle-outline'"
                :color="task.completedAt ? 'success' : entry.day < today ? 'error' : undefined"
                size="small"
              />
            </template>
            <v-list-item-title :class="{ 'text-decoration-line-through text-medium-emphasis': task.completedAt }">{{ task.title }}</v-list-item-title>
            <template #append>
              <UserAvatar v-if="task.assigneeUserId" :user-id="task.assigneeUserId" :size="24" />
            </template>
          </v-list-item>
        </v-list>
      </div>
    </div>

    <v-calendar v-else :model-value="focus" type="month" :weekdays="WEEKDAYS" :locale="locale">
      <template #day="{ date }">
        <v-hover v-slot="{ isHovering, props: hover }">
          <div
            v-bind="hover"
            class="calendar-day d-flex flex-column ga-1 pa-1"
            :class="{ 'bg-lightprimary': over === date }"
            @dragover.prevent="over = date"
            @dragleave="over === date && (over = null)"
            @drop.prevent="drop(date)"
          >
            <div
              v-for="task in (byDay.get(date) ?? []).slice(0, 4)"
              :key="task.id"
              :draggable="editable"
              class="text-body-small text-truncate px-1 rounded cursor-pointer"
              :class="[
                task.completedAt ? 'bg-lightsuccess text-decoration-line-through' : date < today ? 'bg-lighterror' : 'bg-lightprimary',
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
            <span v-if="(byDay.get(date) ?? []).length > 4" class="text-body-small text-medium-emphasis px-1">
              {{ t('projects.calendar.more', { n: (byDay.get(date) ?? []).length - 4 }) }}
            </span>
            <!-- «+» aparece al pasar el ratón (como en Asana); con el teclado también se llega a él y se ve al enfocarlo. -->
            <v-btn
              v-if="editable"
              icon="mdi-plus"
              variant="text"
              size="x-small"
              class="align-self-end mt-auto"
              :class="{ 'opacity-0': !isHovering && focusedAdd !== date }"
              :aria-label="t('projects.calendar.addOn', { day: formatDate(date) })"
              @focus="focusedAdd = date"
              @blur="focusedAdd = null"
              @click="addingOn = date"
            />
          </div>
        </v-hover>
      </template>
    </v-calendar>

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
/* `v-calendar` deja el día a la altura de su contenido: sin un mínimo, un mes sin tareas quedaría en filas de 30 px. */
.calendar-day {
  min-height: 96px;
}
</style>
