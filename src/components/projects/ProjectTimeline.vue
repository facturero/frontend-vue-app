<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { formatMonthYear } from '@/utils/format';
import { useI18n } from 'vue-i18n';
import { useProjectsStore } from '@/stores/projects';
import { localIsoDate } from '@/utils/projects';
import { arrowPath, daysBetween, type DragMode, dragDates, mondayOf, shiftDay, spanOf } from '@/utils/timeline';
import type { BoardTask } from '@/types/projects';
import UserAvatar from './UserAvatar.vue';

/**
 * Cronograma (timeline / gantt) como el de Asana: una fila por tarea agrupada por sección, la barra de inicio a entrega, los hitos
 * como rombo y las dependencias como flechas (en rojo si la que espera empieza antes de que termine la otra).
 *
 * Arrastrar la barra la mueve; arrastrar sus bordes estira el inicio o la entrega. Clic en la fila de una tarea sin fechas la
 * programa ese día. Se hace con eventos de puntero (no con el arrastre nativo de HTML5) para que funcione igual con ratón, lápiz y
 * dedo, y el cambio se guarda al soltar, con la versión de la tarea.
 */
const { t } = useI18n();
const store = useProjectsStore();

const DAY_W = 28;
const ROW_H = 40;
const NAME_W = 260;
const DAYS = 70;

const today = localIsoDate(new Date());
const start = ref(mondayOf(shiftDay(today, -7)));
const days = computed(() => Array.from({ length: DAYS }, (_, i) => shiftDay(start.value, i)));
const editable = computed(() => store.canEdit && store.current?.status === 'active');

type Row = { kind: 'section'; id: string; name: string } | { kind: 'task'; task: BoardTask };
const rows = computed<Row[]>(() =>
  store.sections.flatMap((s) => [
    { kind: 'section' as const, id: s.id, name: s.name },
    ...(store.columns[s.id] ?? []).map((task) => ({ kind: 'task' as const, task })),
  ]),
);
const rowOf = computed(() => new Map(rows.value.flatMap((r, i) => (r.kind === 'task' ? [[r.task.id, i] as const] : []))));

// ── Arrastre ────────────────────────────────────────────────────────────────
const drag = reactive<{ taskId: string | null; mode: DragMode; x0: number; delta: number }>({ taskId: null, mode: 'move', x0: 0, delta: 0 });

function datesOf(task: BoardTask): { startOn: string | null; dueOn: string | null } {
  return drag.taskId === task.id && drag.delta !== 0 ? dragDates(task, drag.delta, drag.mode) : task;
}

/**
 * ¿Cabe el título dentro de la barra? A `text-body-small` (11,3 px) cada carácter ocupa ~6,5 px, más 16 px de relleno. Si no cabe, el
 * título va a la derecha de la barra: dentro quedaba «Revi…» en las tareas de uno o dos días.
 */
const LABEL_CHAR_W = 6.5;
function labelInside(task: BoardTask): boolean {
  const b = bar(task);
  return !!b && b.width - 20 >= task.title.length * LABEL_CHAR_W;
}

function bar(task: BoardTask): { left: number; width: number } | null {
  const span = spanOf(datesOf(task));
  if (!span) return null;
  const from = daysBetween(start.value, span.start);
  const to = daysBetween(start.value, span.end);
  if (to < 0 || from >= DAYS) return null;
  const a = Math.max(from, 0);
  const b = Math.min(to, DAYS - 1);
  return { left: a * DAY_W, width: (b - a + 1) * DAY_W };
}

function color(task: BoardTask): string {
  if (task.completedAt) return 'success';
  if (task.dueOn && task.dueOn < today) return 'error';
  return store.current?.color ?? 'primary';
}

function onPointerDown(event: PointerEvent, task: BoardTask, mode: DragMode): void {
  if (!editable.value || event.button !== 0) return;
  event.stopPropagation();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  Object.assign(drag, { taskId: task.id, mode, x0: event.clientX, delta: 0 });
}

function onPointerMove(event: PointerEvent): void {
  if (!drag.taskId) return;
  drag.delta = Math.round((event.clientX - drag.x0) / DAY_W);
}

async function onPointerUp(task: BoardTask): Promise<void> {
  if (drag.taskId !== task.id) return;
  const { delta, mode } = drag;
  drag.taskId = null;
  if (delta === 0) {
    // Un clic sin arrastre abre la tarea, como en el resto de vistas.
    void store.openTask(task.id);
    return;
  }
  await store.reschedule(task.id, dragDates(task, delta, mode));
}

/** Clic en la fila de una tarea sin fechas: se programa para ese día. */
function schedule(event: MouseEvent, task: BoardTask): void {
  if (!editable.value || spanOf(task)) return;
  const x = event.offsetX;
  const day = days.value[Math.floor(x / DAY_W)];
  if (day) void store.reschedule(task.id, { dueOn: day });
}

// ── Dependencias ────────────────────────────────────────────────────────────
const arrows = computed(() =>
  store.dependencies.flatMap((d) => {
    const fromRow = rowOf.value.get(d.dependsOnTaskId);
    const toRow = rowOf.value.get(d.taskId);
    const fromTask = fromRow !== undefined ? (rows.value[fromRow] as { task: BoardTask }).task : null;
    const toTask = toRow !== undefined ? (rows.value[toRow] as { task: BoardTask }).task : null;
    if (!fromTask || !toTask) return [];
    const a = bar(fromTask);
    const b = bar(toTask);
    if (!a || !b) return [];
    const x1 = a.left + a.width;
    const x2 = b.left;
    return [
      {
        id: `${d.dependsOnTaskId}-${d.taskId}`,
        d: arrowPath(x1, fromRow! * ROW_H + ROW_H / 2, x2, toRow! * ROW_H + ROW_H / 2),
        late: x2 < x1,
      },
    ];
  }),
);

const monthLabel = (iso: string) => formatMonthYear(iso);
const months = computed(() => {
  const out: Array<{ label: string; span: number }> = [];
  for (const d of days.value) {
    const label = monthLabel(d);
    if (out.at(-1)?.label === label) out.at(-1)!.span += 1;
    else out.push({ label, span: 1 });
  }
  return out;
});
const todayX = computed(() => {
  const i = daysBetween(start.value, today);
  return i >= 0 && i < DAYS ? i * DAY_W + DAY_W / 2 : null;
});
const width = DAYS * DAY_W;
</script>

<template>
  <v-card>
    <div class="d-flex align-center flex-wrap ga-2 pa-2 border-b">
      <v-tooltip location="top" :text="t('projects.timeline.previous')"><template #activator="{ props: tip }"><v-btn v-bind="tip" icon="mdi-chevron-left" variant="text" size="small" :aria-label="t('projects.timeline.previous')" @click="start = shiftDay(start, -14)" /></template></v-tooltip>
      <v-btn variant="tonal" size="small" @click="start = mondayOf(shiftDay(today, -7))">{{ t('projects.due.today') }}</v-btn>
      <v-tooltip location="top" :text="t('projects.timeline.next')"><template #activator="{ props: tip }"><v-btn v-bind="tip" icon="mdi-chevron-right" variant="text" size="small" :aria-label="t('projects.timeline.next')" @click="start = shiftDay(start, 14)" /></template></v-tooltip>
      <span class="text-body-medium text-medium-emphasis">{{ t('projects.timeline.hint') }}</span>
    </div>

    <div class="overflow-x-auto">
      <div class="timeline" :style="{ width: `${NAME_W + width}px` }">
        <!-- Cabecera: meses y días -->
        <div class="d-flex timeline__head">
          <div class="timeline__name" />
          <div>
            <div class="d-flex">
              <div v-for="m in months" :key="m.label" class="text-body-small font-weight-medium px-2 text-truncate border-e" :style="{ width: `${m.span * DAY_W}px` }">
                {{ m.label }}
              </div>
            </div>
            <div class="d-flex">
              <div
                v-for="d in days"
                :key="d"
                class="text-body-small text-center"
                :class="{ 'bg-lightprimary text-primary font-weight-bold': d === today, 'text-medium-emphasis': d !== today }"
                :style="{ width: `${DAY_W}px` }"
              >
                {{ Number(d.slice(8)) }}
              </div>
            </div>
          </div>
        </div>

        <div class="position-relative">
          <div v-for="row in rows" :key="row.kind === 'section' ? row.id : row.task.id" class="d-flex timeline__row" :style="{ height: `${ROW_H}px` }">
            <template v-if="row.kind === 'section'">
              <div class="timeline__name d-flex align-center px-3 text-body-medium font-weight-bold">{{ row.name }}</div>
              <div class="timeline__grid" :style="{ width: `${width}px` }" />
            </template>
            <template v-else>
              <div class="timeline__name d-flex align-center ga-2 px-3 cursor-pointer" @click="store.openTask(row.task.id)">
                <v-icon v-if="row.task.kind === 'milestone'" icon="mdi-rhombus" size="x-small" color="warning" />
                <span class="text-body-medium text-truncate" :class="{ 'text-decoration-line-through text-medium-emphasis': row.task.completedAt }">{{ row.task.title }}</span>
                <v-spacer />
                <UserAvatar :user-id="row.task.assigneeUserId" :size="22" />
              </div>
              <div
                class="timeline__grid position-relative"
                :class="{ 'cursor-pointer': editable && !spanOf(row.task) }"
                :style="{ width: `${width}px` }"
                :title="!spanOf(row.task) && editable ? t('projects.timeline.clickToSchedule') : undefined"
                @click="schedule($event, row.task)"
              >
                <template v-if="bar(row.task)">
                  <!-- Hito: rombo en su fecha -->
                  <div
                    v-if="row.task.kind === 'milestone'"
                    class="timeline__milestone"
                    :class="`bg-${row.task.completedAt ? 'success' : 'warning'}`"
                    :style="{ left: `${bar(row.task)!.left + DAY_W / 2 - 8}px` }"
                    :data-task-id="row.task.id"
                    @pointerdown="onPointerDown($event, row.task, 'move')"
                    @pointermove="onPointerMove"
                    @pointerup="onPointerUp(row.task)"
                    @click.stop
                  />
                  <div
                    v-else
                    class="timeline__bar d-flex align-center"
                    :class="[`bg-${color(row.task)}`, { 'timeline__bar--dragging': drag.taskId === row.task.id }]"
                    :style="{ left: `${bar(row.task)!.left + 2}px`, width: `${bar(row.task)!.width - 4}px` }"
                    :data-task-id="row.task.id"
                    @pointerdown="onPointerDown($event, row.task, 'move')"
                    @pointermove="onPointerMove"
                    @pointerup="onPointerUp(row.task)"
                    @click.stop
                  >
                    <span
                      v-if="editable"
                      class="timeline__edge timeline__edge--start"
                      @pointerdown="onPointerDown($event, row.task, 'start')"
                      @pointermove="onPointerMove"
                      @pointerup.stop="onPointerUp(row.task)"
                    />
                    <span v-if="labelInside(row.task)" class="text-body-small text-truncate px-2">{{ row.task.title }}</span>
                    <span
                      v-if="editable"
                      class="timeline__edge timeline__edge--end"
                      @pointerdown="onPointerDown($event, row.task, 'end')"
                      @pointermove="onPointerMove"
                      @pointerup.stop="onPointerUp(row.task)"
                    />
                  </div>
                  <!-- El título que no cabe en la barra (o el de un hito), a su derecha; no recibe clics para no estorbar al arrastre. -->
                  <span
                    v-if="row.task.kind === 'milestone' || !labelInside(row.task)"
                    class="timeline__label text-body-small text-medium-emphasis text-no-wrap"
                    :style="{ left: `${bar(row.task)!.left + (row.task.kind === 'milestone' ? DAY_W : bar(row.task)!.width) + 4}px` }"
                  >
                    {{ row.task.title }}
                  </span>
                </template>
              </div>
            </template>
          </div>

          <!-- Flechas de dependencias y línea de hoy, sobre la rejilla (no sobre la columna de nombres). -->
          <svg class="timeline__overlay" :style="{ left: `${NAME_W}px` }" :width="width" :height="rows.length * ROW_H">
            <defs>
              <marker id="tl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" class="timeline__arrowhead" />
              </marker>
              <marker id="tl-arrow-late" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" class="timeline__arrowhead timeline__arrowhead--late" />
              </marker>
            </defs>
            <line v-if="todayX !== null" :x1="todayX" :x2="todayX" y1="0" :y2="rows.length * ROW_H" class="timeline__today" />
            <path
              v-for="a in arrows"
              :key="a.id"
              :d="a.d"
              class="timeline__arrow"
              :class="{ 'timeline__arrow--late': a.late }"
              :marker-end="a.late ? 'url(#tl-arrow-late)' : 'url(#tl-arrow)'"
            />
          </svg>
        </div>
      </div>
    </div>
    <div v-if="rows.every((r) => r.kind === 'section')" class="pa-6 text-center text-body-medium text-medium-emphasis">{{ t('projects.timeline.empty') }}</div>
    <div class="d-flex flex-wrap ga-4 pa-2 border-t text-body-small text-medium-emphasis">
      <span class="d-flex align-center ga-1"><v-icon icon="mdi-rhombus" size="x-small" color="warning" />{{ t('projects.timeline.legendMilestone') }}</span>
      <span class="d-flex align-center ga-1"><v-icon icon="mdi-arrow-right" size="x-small" />{{ t('projects.timeline.legendDependency') }}</span>
      <span class="d-flex align-center ga-1"><v-icon icon="mdi-arrow-right" size="x-small" color="error" />{{ t('projects.timeline.legendLate') }}</span>
    </div>
  </v-card>
</template>

<style scoped>
.timeline__head {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.timeline__name {
  width: 260px;
  min-width: 260px;
  position: sticky;
  left: 0;
  z-index: 2;
  background: rgb(var(--v-theme-surface));
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.timeline__row {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
/* Líneas verticales de cada día, del ancho de una columna (28 px). */
.timeline__grid {
  background-image: repeating-linear-gradient(
    to right,
    transparent 0,
    transparent 27px,
    rgba(var(--v-border-color), var(--v-border-opacity)) 27px,
    rgba(var(--v-border-color), var(--v-border-opacity)) 28px
  );
}
.timeline__label {
  position: absolute;
  top: 12px;
  pointer-events: none;
}
.timeline__bar {
  position: absolute;
  top: 8px;
  height: 24px;
  border-radius: 6px;
  cursor: grab;
  user-select: none;
  touch-action: none;
  z-index: 1;
}
.timeline__bar--dragging {
  cursor: grabbing;
  opacity: 0.85;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.timeline__edge {
  position: absolute;
  top: 0;
  bottom: 0;
  /* 12 px: con 8 costaba atinarle con el ratón, y con el dedo en una tablet era casi imposible. */
  width: 12px;
  cursor: ew-resize;
}
.timeline__edge--start {
  left: 0;
}
.timeline__edge--end {
  right: 0;
}
.timeline__milestone {
  position: absolute;
  top: 12px;
  width: 16px;
  height: 16px;
  transform: rotate(45deg);
  border-radius: 2px;
  cursor: grab;
  touch-action: none;
  z-index: 1;
}
.timeline__overlay {
  position: absolute;
  top: 0;
  pointer-events: none;
  z-index: 1;
}
.timeline__arrow {
  fill: none;
  stroke: rgba(var(--v-theme-on-surface), 0.55);
  stroke-width: 1.5;
}
.timeline__arrow--late {
  stroke: rgb(var(--v-theme-error));
}
.timeline__arrowhead {
  fill: rgba(var(--v-theme-on-surface), 0.55);
}
.timeline__arrowhead--late {
  fill: rgb(var(--v-theme-error));
}
.timeline__today {
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 2;
  stroke-dasharray: 4 3;
}
</style>
