<script setup lang="ts">
import { nextTick, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { VueDraggable } from 'vue-draggable-plus';
import { useProjectsStore } from '@/stores/projects';
import type { BoardTask } from '@/types/projects';
import DueDateChip from './DueDateChip.vue';
import SectionMenu from './SectionMenu.vue';
import UserAvatar from './UserAvatar.vue';

/**
 * Tablero kanban, como el de Asana: una columna por sección, tarjetas que se arrastran entre columnas, columnas que se arrastran
 * entre sí, «+ Agregar tarea» al pie de cada columna y «+ Agregar sección» al final. Un clic en la tarjeta abre el detalle.
 */
const { t } = useI18n();
const store = useProjectsStore();

const adding = reactive<Record<string, boolean>>({});
const drafts = reactive<Record<string, string>>({});
const newSection = ref('');
const addingSection = ref(false);

const editable = () => store.canEdit && store.current?.status === 'active';

/** En la tarjeta se ven los campos de lista (la «Prioridad» o la «Etapa» de Asana) como chips de su color; los demás, en el detalle. */
function chipsOf(task: BoardTask) {
  return store.fields.flatMap((f) => (f.type === 'select' ? f.options.filter((o) => o.id === task.values[f.id]) : []));
}

async function add(sectionId: string): Promise<void> {
  const title = (drafts[sectionId] ?? '').trim();
  if (!title || !store.current) return;
  drafts[sectionId] = '';
  try {
    await store.createTask({ title, projectId: store.current.id, sectionId });
  } catch {
    drafts[sectionId] = title;
  }
}

async function addSection(): Promise<void> {
  const name = newSection.value.trim();
  if (!name) return;
  try {
    await store.createSection(name);
    newSection.value = '';
    addingSection.value = false;
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

type DropEvent = { item: HTMLElement; to: HTMLElement; from: HTMLElement; oldIndex?: number; newIndex?: number };

function onCardDrop(evt: DropEvent): void {
  if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;
  const taskId = evt.item.dataset.taskId;
  const sectionId = evt.to.dataset.sectionId;
  if (taskId && sectionId) void nextTick(() => store.moveTask(taskId, sectionId));
}

/** Tab+Q: abre «Agregar tarea» en la primera columna. */
defineExpose({
  focusAdd: () => {
    const first = store.sections[0];
    if (first) adding[first.id] = true;
  },
});

function onColumnDrop(evt: DropEvent): void {
  if (evt.oldIndex === evt.newIndex) return;
  const sectionId = evt.item.dataset.sectionId;
  if (sectionId) void nextTick(() => store.moveSection(sectionId));
}
</script>

<template>
  <div class="d-flex align-start ga-4 overflow-x-auto pb-4">
    <VueDraggable
      v-model="store.sections"
      handle=".column-drag"
      :animation="150"
      :disabled="!editable()"
      class="d-flex align-start ga-4"
      @end="onColumnDrop"
    >
      <v-sheet
        v-for="section in store.sections"
        :key="section.id"
        :data-section-id="section.id"
        color="background"
        width="300"
        class="flex-shrink-0 pa-2 border"
      >
        <div class="d-flex align-center ga-2 px-2 py-1" :class="{ 'column-drag': editable() }">
          <span class="text-body-large font-weight-bold text-truncate">{{ section.name }}</span>
          <span class="text-body-small text-medium-emphasis">{{ (store.columns[section.id] ?? []).length }}</span>
          <v-spacer />
          <v-btn
            v-if="editable()"
            icon="mdi-plus"
            variant="text"
            size="small"
            :aria-label="t('projects.task.addTask')"
            @click.stop="adding[section.id] = true"
          />
          <SectionMenu :section="section" />
        </div>

        <VueDraggable
          v-model="store.columns[section.id]"
          group="project-tasks"
          :animation="150"
          :disabled="!editable()"
          :data-section-id="section.id"
          class="d-flex flex-column ga-2 pa-1 board-column"
          @end="onCardDrop"
        >
          <v-card
            v-for="task in store.columns[section.id]"
            :key="task.id"
            :data-task-id="task.id"
            class="pa-3 board-card"
            :class="{ 'border-primary border-md': store.detail?.id === task.id }"
            @click="store.openTask(task.id)"
          >
            <div class="d-flex align-start ga-1">
              <v-btn
                :icon="task.completedAt ? 'mdi-check-circle' : 'mdi-check-circle-outline'"
                :color="task.completedAt ? 'success' : undefined"
                variant="text"
                size="x-small"
                :aria-label="t('projects.task.markComplete')"
                @click.stop="toggle(task)"
              />
              <span class="text-body-medium pt-1" :class="{ 'text-medium-emphasis text-decoration-line-through': task.completedAt }">
                <v-icon v-if="task.kind === 'approval'" icon="mdi-thumbs-up-down-outline" size="x-small" color="info" class="mr-1" />
                <v-icon v-else-if="task.kind === 'milestone'" icon="mdi-rhombus" size="x-small" color="warning" class="mr-1" />{{ task.title }}
              </span>
            </div>
            <div v-if="task.tags.length || chipsOf(task).length" class="d-flex flex-wrap ga-1 mt-2">
              <v-chip v-for="c in chipsOf(task)" :key="c.id" size="x-small" :color="c.color" variant="flat">{{ c.label }}</v-chip>
              <v-chip v-for="tag in task.tags" :key="tag.id" size="x-small" :color="tag.color">{{ tag.name }}</v-chip>
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <UserAvatar :user-id="task.assigneeUserId" :size="24" />
              <DueDateChip :due-on="task.dueOn" :completed="!!task.completedAt" />
              <v-spacer />
              <span v-if="task.subtasks.total" class="text-body-small text-medium-emphasis d-flex align-center ga-1">
                <v-icon icon="mdi-file-tree-outline" size="x-small" />{{ task.subtasks.completed }}/{{ task.subtasks.total }}
              </span>
            </div>
          </v-card>
        </VueDraggable>

        <div v-if="editable()" class="px-1 pt-2">
          <v-textarea
            v-if="adding[section.id]"
            v-model="drafts[section.id]"
            :placeholder="t('projects.task.newTaskPlaceholder')"
            rows="2"
            auto-grow
            autofocus
            @keydown.enter.exact.prevent="add(section.id)"
            @keydown.esc="adding[section.id] = false"
            @blur="!drafts[section.id] && (adding[section.id] = false)"
          />
          <v-btn v-else block variant="text" prepend-icon="mdi-plus" class="justify-start" @click="adding[section.id] = true">
            {{ t('projects.task.addTask') }}
          </v-btn>
        </div>
      </v-sheet>
    </VueDraggable>

    <div v-if="editable()" class="flex-shrink-0" style="width: 300px">
      <v-text-field
        v-if="addingSection"
        v-model="newSection"
        :placeholder="t('projects.section.name')"
        autofocus
        @keyup.enter="addSection"
        @keyup.esc="addingSection = false"
        @blur="!newSection && (addingSection = false)"
      />
      <v-btn v-else block variant="text" prepend-icon="mdi-plus" class="justify-start" @click="addingSection = true">
        {{ t('projects.section.add') }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.board-column {
  min-height: 48px;
}
.board-card {
  cursor: grab;
}
.column-drag {
  cursor: grab;
}
</style>
