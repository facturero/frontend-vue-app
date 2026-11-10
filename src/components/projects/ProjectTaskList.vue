<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { VueDraggable } from 'vue-draggable-plus';
import { useProjectsStore } from '@/stores/projects';
import { formatMinutes } from '@/utils/duration';
import { fieldValueText } from '@/utils/projects';
import type { BoardTask, CustomField } from '@/types/projects';
import DueDateChip from './DueDateChip.vue';
import SectionMenu from './SectionMenu.vue';
import TaskBulkBar from './TaskBulkBar.vue';
import UserAvatar from './UserAvatar.vue';

/**
 * Vista de lista, como la de Asana: tareas agrupadas por sección, título editable en la propia fila, arrastre para reordenar o
 * cambiar de sección, y al pie de cada sección «Agregar tarea», que se queda con el foco tras Enter para escribir una tarea tras
 * otra sin tocar el ratón. Un clic en la fila abre el detalle a la derecha.
 *
 * Las finalizadas se ocultan con `d-none`, no se quitan de la lista: el arrastre calcula las vecinas sobre la columna completa,
 * que es contra la que ordena el servidor.
 */
const props = defineProps<{ showCompleted: boolean }>();
const { t, locale } = useI18n();
const store = useProjectsStore();
const { mobile, smAndDown } = useDisplay();

/**
 * Anchos de las columnas, una sola vez para la cabecera y las filas (REGLAS-FRONT R-51). El título tiene un mínimo: con muchos campos
 * la tarjeta hace scroll horizontal en vez de dejar el título en cero.
 */
const COL = { title: '240px', assignee: '120px', due: '120px', field: '140px' } as const;

/** Filas marcadas para editar en lote (Asana: casilla al pasar el ratón; aquí siempre visible para que funcione en táctil). */
const selected = ref<Set<string>>(new Set());
const selectedIds = computed(() => [...selected.value]);
function toggleSelected(taskId: string, on: boolean): void {
  const next = new Set(selected.value);
  if (on) next.add(taskId);
  else next.delete(taskId);
  selected.value = next;
}

/** Valor de un campo en la fila: las opciones de lista van como chip de su color; lo demás, como texto. */
function optionOf(field: CustomField, task: BoardTask) {
  return field.type === 'select' ? field.options.find((o) => o.id === task.values[field.id]) : undefined;
}
function cellText(field: CustomField, task: BoardTask): string {
  return fieldValueText(field, task.values[field.id], store.users, locale.value);
}

const collapsed = reactive<Record<string, boolean>>({});
const drafts = reactive<Record<string, string>>({});
const titles = reactive<Record<string, string>>({});
const addInputs = ref<Record<string, { focus: () => void } | null>>({});

const editable = () => store.canEdit && store.current?.status === 'active';

async function add(sectionId: string): Promise<void> {
  const title = (drafts[sectionId] ?? '').trim();
  if (!title || !store.current) return;
  drafts[sectionId] = '';
  try {
    await store.createTask({ title, projectId: store.current.id, sectionId });
    await nextTick();
    addInputs.value[sectionId]?.focus();
  } catch {
    drafts[sectionId] = title;
  }
}

function startEdit(task: BoardTask): void {
  titles[task.id] = task.title;
}

async function saveTitle(task: BoardTask): Promise<void> {
  const value = (titles[task.id] ?? '').trim();
  delete titles[task.id];
  if (!value || value === task.title) return;
  try {
    await store.updateTask(task.id, task.version, { title: value });
  } catch {
    // El aviso lo deja el store.
  }
}

async function toggle(task: BoardTask): Promise<void> {
  try {
    await store.toggleComplete(task);
  } catch {
    // El aviso lo deja el store.
  }
}

/**
 * Mover con el teclado (REGLAS-FRONT R-90, R-91): el asa es un botón enfocable; ↑/↓ sube o baja la tarea un puesto visible y en el
 * borde la pasa a la sección vecina. El foco sigue al asa de la tarea movida y la región `aria-live` dice dónde quedó, para quien no
 * ve la pantalla.
 */
const announcement = ref('');
/**
 * La ayuda del asa sobra en cuanto se usa el teclado: sin esto, al mover con ↑ ↓ el foco salta al asa de la tarea movida, la ayuda
 * se vuelve a abrir en cada pulsación y viaja con la fila tapando lo que se está mirando.
 */
const keyboardUsed = ref(false);
async function keyMove(task: BoardTask, direction: -1 | 1): Promise<void> {
  keyboardUsed.value = true;
  const result = await store.moveTaskBy(task.id, direction, { visible: (x) => !x.completedAt || props.showCompleted });
  if (!result) return;
  announcement.value = t('projects.task.movedTo', { title: task.title, position: result.position, total: result.total, section: result.sectionName });
  await nextTick();
  document.querySelector<HTMLElement>(`[data-handle="${task.id}"]`)?.focus();
}

function onDrop(evt: { item: HTMLElement; to: HTMLElement; from: HTMLElement; oldIndex?: number; newIndex?: number }): void {
  if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;
  const taskId = evt.item.dataset.taskId;
  const sectionId = evt.to.dataset.sectionId;
  if (taskId && sectionId) void nextTick(() => store.moveTask(taskId, sectionId));
}

function setAddInput(sectionId: string, el: unknown): void {
  addInputs.value[sectionId] = el as { focus: () => void } | null;
}

/** Tab+Q: al campo «Agregar tarea» de la primera sección (desplegándola si estaba cerrada). */
defineExpose({
  focusAdd: () => {
    const first = store.sections[0];
    if (!first) return;
    collapsed[first.id] = false;
    void nextTick(() => addInputs.value[first.id]?.focus());
  },
});
</script>

<template>
  <TaskBulkBar v-if="editable()" :task-ids="selectedIds" class="mb-2" @done="selected = new Set()" />
  <div class="d-sr-only" aria-live="polite">{{ announcement }}</div>
  <v-card class="overflow-x-auto">
    <div class="d-none d-md-flex align-center px-4 py-2 border-b text-body-medium text-medium-emphasis">
      <div class="flex-grow-1 pl-16" :style="{ minWidth: COL.title }">{{ t('projects.task.title') }}</div>
      <div class="flex-shrink-0 text-center" :style="{ width: COL.assignee }">{{ t('projects.task.assignee') }}</div>
      <div class="flex-shrink-0" :style="{ width: COL.due }">{{ t('projects.task.dueOn') }}</div>
      <div v-for="f in store.fields" :key="f.id" class="flex-shrink-0 text-truncate" :style="{ width: COL.field }">{{ f.name }}</div>
    </div>

    <div v-for="section in store.sections" :key="section.id">
      <div class="d-flex align-center ga-2 px-2 py-1 border-b">
        <v-tooltip location="top" :text="section.name"><template #activator="{ props: tip }"><v-btn v-bind="tip"
          :icon="collapsed[section.id] ? 'mdi-chevron-right' : 'mdi-chevron-down'"
          variant="text"
          size="small"
          :aria-label="section.name"
          @click="collapsed[section.id] = !collapsed[section.id]" /></template></v-tooltip>
        <span class="text-body-large font-weight-bold">{{ section.name }}</span>
        <span class="text-body-small text-medium-emphasis">{{ (store.columns[section.id] ?? []).filter((x) => !x.completedAt).length }}</span>
        <SectionMenu :section="section" />
      </div>

      <div v-show="!collapsed[section.id]">
        <VueDraggable
          v-model="store.columns[section.id]"
          group="project-tasks"
          handle=".task-drag"
          :animation="150"
          :disabled="!editable()"
          :data-section-id="section.id"
          class="task-list-zone"
          @end="onDrop"
        >
          <div
            v-for="task in store.columns[section.id]"
            :key="task.id"
            :data-task-id="task.id"
            class="d-flex align-center ga-2 px-2 border-b task-row"
            :class="{ 'd-none': task.completedAt && !props.showCompleted, 'bg-lightprimary': store.detail?.id === task.id }"
            @click="store.openTask(task.id)"
          >
            <!-- En el teléfono no hay asa: arrastrar con el dedo choca con el scroll, y la fila gana sitio para el título (allí se mueve
                 con «Mover a» del detalle). En escritorio es un botón: se arrastra con el ratón o se mueve con ↑ ↓ (R-90). -->
            <!-- La ayuda va al costado (end), no encima: arriba tapaba el nombre de la sección en la primera tarea y la fila anterior
                 en las demás. -->
            <v-tooltip v-if="editable() && !mobile" location="end" :disabled="keyboardUsed" :text="t('projects.task.reorderHint')">
              <template #activator="{ props: tip }">
                <v-btn
                  v-bind="tip"
                  icon="mdi-drag-vertical"
                  variant="text"
                  size="x-small"
                  class="task-drag text-medium-emphasis"
                  :data-handle="task.id"
                  :aria-label="t('projects.task.reorder', { title: task.title })"
                  @click.stop
                  @keydown.up.prevent.stop="keyMove(task, -1)"
                  @keydown.down.prevent.stop="keyMove(task, 1)"
                />
              </template>
            </v-tooltip>
            <!-- La casilla de la edición en lote, solo con espacio: en el teléfono se comía el sitio del título y allí no se edita en lote. -->
            <v-checkbox-btn
              v-if="editable() && !smAndDown"
              :model-value="selected.has(task.id)"
              density="compact"
              class="flex-grow-0"
              :aria-label="t('projects.bulk.select')"
              @click.stop
              @update:model-value="(v: boolean | null) => toggleSelected(task.id, !!v)"
            />
            <v-icon v-if="task.kind === 'approval'" icon="mdi-thumbs-up-down-outline" size="small" color="info" />
            <v-icon v-else-if="task.kind === 'milestone'" icon="mdi-rhombus" size="small" color="warning" />
            <v-tooltip location="top" :text="t('projects.task.markComplete')"><template #activator="{ props: tip }"><v-btn v-bind="tip"
              :icon="task.completedAt ? 'mdi-check-circle' : 'mdi-check-circle-outline'"
              :color="task.completedAt ? 'success' : undefined"
              variant="text"
              size="small"
              :aria-label="t('projects.task.markComplete')"
              @click.stop="toggle(task)" /></template></v-tooltip>
            <!-- Teléfono: el título entero (antes cortado en «Definir mapa del sitio y ar…») y debajo lo que en escritorio va en
                 columnas: fecha, responsable y subtareas. Tocar la fila abre el detalle, como en Asana. -->
            <div v-if="smAndDown" class="flex-grow-1 py-2 overflow-hidden">
              <div :class="{ 'text-decoration-line-through text-medium-emphasis': task.completedAt }">{{ task.title }}</div>
              <div v-if="task.dueOn || task.assigneeUserId || task.subtasks.total" class="d-flex align-center flex-wrap ga-2 mt-1">
                <DueDateChip :due-on="task.dueOn" :completed="!!task.completedAt" />
                <UserAvatar v-if="task.assigneeUserId" :user-id="task.assigneeUserId" :size="20" />
                <span v-if="task.subtasks.total" class="text-body-small text-medium-emphasis">
                  <v-icon icon="mdi-file-tree-outline" size="x-small" /> {{ task.subtasks.completed }}/{{ task.subtasks.total }}
                </span>
              </div>
            </div>
            <!-- En pantallas táctiles el título no se edita en la fila: tocarla abre el detalle (como Asana), y ahí se edita. -->
            <div v-else class="flex-grow-1" :style="mobile ? undefined : { minWidth: COL.title }" @click="(e: MouseEvent) => !mobile && e.stopPropagation()">
              <v-text-field
                :model-value="titles[task.id] ?? task.title"
                variant="plain"
                class="inline-field"
                :readonly="!editable() || mobile"
                :class="{ 'text-decoration-line-through text-medium-emphasis': task.completedAt }"
                :aria-label="t('projects.task.title')"
                @focus="startEdit(task)"
                @update:model-value="(v: string) => (titles[task.id] = v)"
                @blur="saveTitle(task)"
                @keyup.enter="($event.target as HTMLInputElement).blur()"
              />
            </div>
            <v-chip v-for="tag in task.tags.slice(0, 2)" :key="tag.id" size="x-small" :color="tag.color" class="d-none d-sm-flex flex-shrink-0">{{ tag.name }}</v-chip>
            <v-chip v-if="task.tags.length > 2" size="x-small" class="d-none d-sm-flex flex-shrink-0">+{{ task.tags.length - 2 }}</v-chip>
            <v-chip v-if="task.actualMinutes" size="x-small" prepend-icon="mdi-timer-outline" class="d-none d-sm-flex flex-shrink-0">{{ formatMinutes(task.actualMinutes) }}</v-chip>
            <v-chip v-if="task.subtasks.total && !smAndDown" size="x-small" prepend-icon="mdi-file-tree-outline" class="flex-shrink-0">
              {{ task.subtasks.completed }}/{{ task.subtasks.total }}
            </v-chip>
            <div class="d-none d-md-flex justify-center flex-shrink-0" :style="{ width: COL.assignee }">
              <UserAvatar :user-id="task.assigneeUserId" />
            </div>
            <div class="d-none d-md-block flex-shrink-0" :style="{ width: COL.due }">
              <DueDateChip :due-on="task.dueOn" :completed="!!task.completedAt" />
            </div>
            <div v-for="f in store.fields" :key="f.id" class="d-none d-md-block flex-shrink-0 text-body-medium text-truncate" :style="{ width: COL.field }">
              <v-chip v-if="optionOf(f, task)" size="x-small" :color="optionOf(f, task)!.color">{{ optionOf(f, task)!.label }}</v-chip>
              <template v-else>{{ cellText(f, task) }}</template>
            </div>
          </div>
        </VueDraggable>

        <div v-if="editable()" class="d-flex align-center ga-2 px-2 border-b">
          <v-icon icon="mdi-plus" size="small" class="text-medium-emphasis ml-2" />
          <v-text-field
            :ref="(el) => setAddInput(section.id, el)"
            v-model="drafts[section.id]"
            variant="plain"
            class="inline-field"
            :placeholder="t('projects.task.addTask')"
            @keyup.enter="add(section.id)"
          />
        </div>
      </div>
    </div>
  </v-card>
</template>

<style scoped>
.task-row {
  cursor: pointer;
  min-height: 44px;
}
.task-drag {
  cursor: grab;
}
/* El campo `plain` trae más relleno arriba que abajo (es para una etiqueta flotante que aquí no hay): el texto quedaba unos píxeles
   más bajo que los iconos de la fila y «Agregar tarea» salía cortado por abajo. */
.inline-field :deep(.v-field__input) {
  padding-top: 0;
  padding-bottom: 0;
}
/* Una sección vacía sigue aceptando tarjetas que se suelten en ella. */
.task-list-zone {
  min-height: 8px;
}
</style>
