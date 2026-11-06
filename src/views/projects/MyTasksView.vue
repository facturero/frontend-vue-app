<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PageHeader from '@/components/ui/PageHeader.vue';
import DueDateChip from '@/components/projects/DueDateChip.vue';
import TaskCelebration from '@/components/projects/TaskCelebration.vue';
import ShortcutsDialog from '@/components/projects/ShortcutsDialog.vue';
import TaskDetailPanel from '@/components/projects/TaskDetailPanel.vue';
import { useViewShortcuts } from '@/composable/useViewShortcuts';
import { useCelebration } from '@/composable/useCelebration';
import { useAuthStore } from '@/stores/auth';
import RunningTimerChip from '@/components/projects/RunningTimerChip.vue';
import { useProjectsStore } from '@/stores/projects';
import { groupMyTasks, localIsoDate, MY_TASKS_GROUPS, type MyTasksGroup } from '@/utils/projects';
import type { MyTask } from '@/types/projects';

/**
 * «Mis tareas» de Asana: todo lo que me toca, de todos los proyectos, agrupado en Recién asignadas / Hoy / Próximas / Más tarde.
 * Arriba, una caja para anotar algo rápido: queda como tarea personal mía (sin proyecto), con Enter y sin soltar el teclado.
 */
const { t } = useI18n();
const auth = useAuthStore();
const store = useProjectsStore();
const celebration = useCelebration();

const showCompleted = ref(false);
const quick = ref('');
const quickInput = ref<{ focus: () => void } | null>(null);
const collapsed = reactive<Record<MyTasksGroup, boolean>>({ recent: false, today: false, upcoming: false, later: false });

const route = useRoute();
const { helpOpen } = useViewShortcuts({ quickAdd: () => quickInput.value?.focus() });

// Desde la campana se llega con `?task=<id>`: la tarea se abre en el panel, aunque sea de un proyecto privado del que no se es
// miembro (el servidor decide si se puede ver).
function openFromQuery(): void {
  if (typeof route.query.task === 'string') void store.openTask(route.query.task);
}

onMounted(() => {
  store.closeTask();
  store.myTasksOpen = true;
  void store.ensureDirectory();
  void store.fetchMyTasks(showCompleted.value);
  openFromQuery();
});
onBeforeUnmount(() => {
  store.myTasksOpen = false;
});
watch(() => route.query.task, openFromQuery);
watch(showCompleted, (v) => store.fetchMyTasks(v));

const groups = computed(() => groupMyTasks(store.myTasks, localIsoDate(new Date())));

async function addQuick(): Promise<void> {
  const title = quick.value.trim();
  if (!title || !auth.user) return;
  quick.value = '';
  try {
    await store.createMyTask(title, auth.user.id, null);
  } catch {
    quick.value = title;
  }
}

async function toggle(task: MyTask): Promise<void> {
  try {
    await store.toggleComplete(task);
  } catch {
    // El aviso lo deja el store.
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="t('projects.myTasks.title')" :subtitle="t('projects.myTasks.subtitle')">
      <template #actions>
        <RunningTimerChip />
        <v-btn variant="text" prepend-icon="mdi-folder-multiple-outline" to="/projects">{{ t('projects.title') }}</v-btn>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="quickInput?.focus()">{{ t('projects.task.addTask') }}</v-btn>
        <!-- Atajos y la celebración son ayuda y preferencia, no acciones: al menú (REGLAS-FRONT R-70). -->
        <v-menu>
          <template #activator="{ props: menu }">
            <v-btn v-bind="menu" icon="mdi-dots-horizontal" variant="text" :aria-label="t('projects.menu')" />
          </template>
          <v-list>
            <v-list-item prepend-icon="mdi-keyboard-outline" :title="t('projects.shortcuts.title')" @click="helpOpen = true">
              <template #append><v-hotkey keys="shift+slash" /></template>
            </v-list-item>
            <v-list-item>
              <v-switch
                :model-value="celebration.enabled.value"
                :label="t('projects.celebrations')"
                @update:model-value="(v) => celebration.setEnabled(!!v)"
              />
            </v-list-item>
          </v-list>
        </v-menu>
      </template>
    </PageHeader>

    <v-alert v-if="store.error" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <div class="d-flex align-center flex-wrap ga-4 mb-4">
      <v-text-field
        ref="quickInput"
        v-model="quick"
        :placeholder="t('projects.myTasks.quickAdd')"
        prepend-inner-icon="mdi-plus"
        class="flex-grow-1"
        @keyup.enter="addQuick"
      />
      <v-switch v-model="showCompleted" :label="t('projects.showCompleted')" class="flex-grow-0" />
    </div>

    <v-progress-linear v-if="store.loading" indeterminate color="primary" class="mb-4" />

    <v-card>
      <div v-for="group in MY_TASKS_GROUPS" :key="group">
        <div class="d-flex align-center ga-2 px-2 py-2 border-b">
          <v-tooltip location="top" :text="t(`projects.myTasks.groups.${group}`)"><template #activator="{ props: tip }"><v-btn v-bind="tip"
            :icon="collapsed[group] ? 'mdi-chevron-right' : 'mdi-chevron-down'"
            variant="text"
            size="small"
            :aria-label="t(`projects.myTasks.groups.${group}`)"
            @click="collapsed[group] = !collapsed[group]" /></template></v-tooltip>
          <span class="text-body-large font-weight-bold">{{ t(`projects.myTasks.groups.${group}`) }}</span>
          <span class="text-body-small text-medium-emphasis">{{ groups[group].length }}</span>
        </div>
        <div v-show="!collapsed[group]">
          <div v-if="groups[group].length === 0" class="px-6 py-3 text-body-medium text-medium-emphasis border-b">
            {{ t('projects.myTasks.emptyGroup') }}
          </div>
          <div
            v-for="task in groups[group]"
            :key="task.id"
            class="d-flex align-center flex-wrap ga-2 px-2 py-1 border-b cursor-pointer"
            :class="{ 'bg-lightprimary': store.detail?.id === task.id }"
            @click="store.openTask(task.id)"
          >
            <v-tooltip location="top" :text="t('projects.task.markComplete')"><template #activator="{ props: tip }"><v-btn v-bind="tip"
              :icon="task.completedAt ? 'mdi-check-circle' : 'mdi-check-circle-outline'"
              :color="task.completedAt ? 'success' : undefined"
              variant="text"
              size="small"
              :aria-label="t('projects.task.markComplete')"
              @click.stop="toggle(task)" /></template></v-tooltip>
            <div class="flex-grow-1">
              <div :class="{ 'text-decoration-line-through text-medium-emphasis': task.completedAt }">{{ task.title }}</div>
              <div v-if="task.parent" class="text-body-small text-medium-emphasis">{{ t('projects.task.subtaskOf', { title: task.parent.title }) }}</div>
            </div>
            <v-chip
              v-for="p in task.projects"
              :key="p.projectId"
              size="x-small"
              :color="p.color"
              :to="`/projects/${p.projectId}?task=${task.id}`"
              @click.stop
            >
              {{ p.name }}
            </v-chip>
            <DueDateChip :due-on="task.dueOn" :completed="!!task.completedAt" class="ml-2" />
          </div>
        </div>
      </div>
    </v-card>

    <TaskDetailPanel />
    <TaskCelebration />
    <ShortcutsDialog v-model="helpOpen" />
  </v-container>
</template>
