<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useConfirm } from '@/composable/useConfirm';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/components/ui/PageHeader.vue';
import ProjectBilling from '@/components/projects/ProjectBilling.vue';
import ProjectDashboard from '@/components/projects/ProjectDashboard.vue';
import ProjectFormsDialog from '@/components/projects/ProjectFormsDialog.vue';
import ProjectRulesDialog from '@/components/projects/ProjectRulesDialog.vue';
import ProjectBoard from '@/components/projects/ProjectBoard.vue';
import ProjectCalendar from '@/components/projects/ProjectCalendar.vue';
import ProjectOverview from '@/components/projects/ProjectOverview.vue';
import ProjectTimeline from '@/components/projects/ProjectTimeline.vue';
import ProjectFieldsDialog from '@/components/projects/ProjectFieldsDialog.vue';
import ProjectFormDialog from '@/components/projects/ProjectFormDialog.vue';
import ProjectTaskList from '@/components/projects/ProjectTaskList.vue';
import ShareDialog from '@/components/projects/ShareDialog.vue';
import ShortcutsDialog from '@/components/projects/ShortcutsDialog.vue';
import { useViewShortcuts } from '@/composable/useViewShortcuts';
import TaskCelebration from '@/components/projects/TaskCelebration.vue';
import TaskDetailPanel from '@/components/projects/TaskDetailPanel.vue';
import UserAvatar from '@/components/projects/UserAvatar.vue';
import RunningTimerChip from '@/components/projects/RunningTimerChip.vue';
import { useCelebration } from '@/composable/useCelebration';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { useProjectsStore } from '@/stores/projects';
import { HEALTH_COLOR } from '@/utils/projects';

/** Pestañas del proyecto, como las de Asana. Lista y Tablero pueden ser la vista por defecto del proyecto; las demás se eligen. */
type Tab = 'overview' | 'list' | 'board' | 'calendar' | 'timeline' | 'dashboard' | 'billing';
const TABS: Tab[] = ['overview', 'list', 'board', 'calendar', 'timeline', 'dashboard', 'billing'];

/** Un proyecto: Lista o Tablero (como las pestañas de Asana), «Compartir», y el detalle de la tarea en el panel derecho. */
const { t } = useI18n();
const confirm = useConfirm();
const route = useRoute();
const router = useRouter();
const store = useProjectsStore();
const auth = useAuthStore();
const plugins = usePluginsStore();
/** Facturación: módulo propio y solo Administrador o Contador (muestra tarifas e importes). */
const canBill = computed(() => plugins.isActive('projects.project_billing') && auth.can('project:bill'));
const celebration = useCelebration();

const projectId = computed(() => String(route.params.id));
const view = ref<Tab>('list');
const showCompleted = ref(false);
const editing = ref(false);
const sharing = ref(false);
const managingFields = ref(false);
const managingRules = ref(false);
const managingForms = ref(false);
const duplicating = ref(false);
const copyName = ref('');
const list = ref<InstanceType<typeof ProjectTaskList> | null>(null);
const board = ref<InstanceType<typeof ProjectBoard> | null>(null);
// Tab+Q: agregar una tarea en la primera sección, en la vista que esté abierta.
const { helpOpen } = useViewShortcuts({
  quickAdd: () => {
    if (view.value === 'board') board.value?.focusAdd();
    else {
      view.value = 'list';
      void Promise.resolve().then(() => list.value?.focusAdd());
    }
  },
});

async function load(): Promise<void> {
  store.closeTask();
  void store.ensureDirectory();
  await store.loadProject(projectId.value);
  const fromQuery = route.query.view;
  view.value = TABS.includes(fromQuery as Tab) && (fromQuery !== 'billing' || canBill.value) ? (fromQuery as Tab) : (store.current?.defaultView ?? 'list');
  if (typeof route.query.task === 'string') void store.openTask(route.query.task);
}

onMounted(load);
watch(projectId, load);
// La vista elegida queda en la URL: un enlace al tablero abre el tablero.
watch(view, (v) => {
  if (route.query.view !== v) void router.replace({ query: { ...route.query, view: v } });
});

const project = computed(() => store.current);
const archived = computed(() => project.value?.status === 'archived');
const visibleMembers = computed(() => (project.value?.members ?? []).slice(0, 5));

async function setArchived(value: boolean): Promise<void> {
  try {
    await store.setArchived(value);
  } catch {
    // El aviso lo deja el store.
  }
}

function startDuplicate(): void {
  copyName.value = t('projects.duplicate.defaultName', { name: project.value?.name ?? '' });
  duplicating.value = true;
}

async function duplicate(): Promise<void> {
  if (!project.value || !copyName.value.trim()) return;
  try {
    const copy = await store.duplicateProject(project.value.id, copyName.value.trim());
    duplicating.value = false;
    void router.push(`/projects/${copy.id}`);
  } catch {
    // El aviso lo deja el store.
  }
}

async function remove(): Promise<void> {
  const ok = await confirm({
    title: t('projects.deleteTitle', { name: project.value?.name }),
    text: t('projects.deleteText'),
    confirmText: t('common.delete'),
    destructive: true,
  });
  if (!ok) return;
  try {
    await store.removeProject();
    void router.push('/projects');
  } catch {
    // El aviso lo deja el store.
  }
}
</script>

<template>
  <v-container>
    <v-alert v-if="store.error && !project" type="error" class="mb-4">{{ store.error }}</v-alert>
    <v-progress-linear v-if="store.loading && !project" indeterminate color="primary" />

    <template v-if="project">
      <PageHeader :title="project.name" :subtitle="project.description ?? undefined">
        <template #actions>
          <v-chip v-if="project.latestStatus" :color="HEALTH_COLOR[project.latestStatus.status]" prepend-icon="mdi-circle" size="small" @click="view = 'overview'">
            {{ t(`projects.health.${project.latestStatus.status}`) }}
          </v-chip>
          <v-avatar-group :size="30" border hoverable>
            <UserAvatar v-for="m in visibleMembers" :key="m.userId" :user-id="m.userId" :size="30" />
            <v-avatar v-if="project.members.length > visibleMembers.length" color="surface-variant" class="text-label-medium">
              +{{ project.members.length - visibleMembers.length }}
            </v-avatar>
          </v-avatar-group>
          <RunningTimerChip />
          <v-menu>
            <template #activator="{ props: menu }">
              <v-btn v-bind="menu" icon="mdi-dots-horizontal" variant="text" :aria-label="t('projects.menu')" />
            </template>
            <!-- Ancho mínimo: sin él el menú mide lo justo y el atajo y el interruptor quedan pegados a su texto. -->
            <v-list min-width="300">
              <v-list-item prepend-icon="mdi-account-plus-outline" :title="t('projects.share.button')" @click="sharing = true" />
              <v-list-item v-if="store.canManage" prepend-icon="mdi-pencil-outline" :title="t('projects.edit')" @click="editing = true" />
              <v-list-item prepend-icon="mdi-form-select" :title="t('projects.fields.title')" @click="managingFields = true" />
              <v-list-item prepend-icon="mdi-lightning-bolt-outline" :title="t('projects.rules.title')" @click="managingRules = true" />
              <v-list-item v-if="store.canEdit" prepend-icon="mdi-clipboard-text-outline" :title="t('projects.forms.title')" @click="managingForms = true" />
              <v-list-item v-if="auth.can('project:create')" prepend-icon="mdi-content-copy" :title="t('projects.duplicate.action')" @click="startDuplicate" />
              <v-list-item
                v-if="store.canManage"
                :prepend-icon="archived ? 'mdi-archive-arrow-up-outline' : 'mdi-archive-outline'"
                :title="archived ? t('projects.unarchive') : t('projects.archive')"
                @click="setArchived(!archived)"
              />
              <v-list-item v-if="store.canManage" prepend-icon="mdi-trash-can-outline" :title="t('projects.delete')" @click="remove" />
              <v-divider />
              <!-- Los atajos son ayuda, no una acción: van al menú y no ocupan sitio en el encabezado (REGLAS-FRONT R-70). -->
              <v-list-item prepend-icon="mdi-keyboard-outline" :title="t('projects.shortcuts.title')" @click="helpOpen = true">
                <template #append><v-hotkey keys="shift+slash" /></template>
              </v-list-item>
              <!-- Una opción del menú con su interruptor al final (el patrón de Vuetify para un ajuste en una lista): toda la fila
                   alterna; el interruptor es `readonly` para que el clic no cuente dos veces. -->
              <v-list-item prepend-icon="mdi-party-popper" :title="t('projects.celebrations')" @click="celebration.setEnabled(!celebration.enabled.value)">
                <template #append>
                  <v-switch :model-value="celebration.enabled.value" readonly tabindex="-1" aria-hidden="true" />
                </template>
              </v-list-item>
            </v-list>
          </v-menu>
        </template>
      </PageHeader>

      <v-alert v-if="archived" type="info" class="mb-4">{{ t('projects.archivedNotice') }}</v-alert>
      <v-alert v-if="store.error" type="error" closable class="mb-4">{{ store.error }}</v-alert>

      <div class="d-flex align-center flex-wrap ga-4 mb-4">
        <v-tabs v-model="view" color="primary" show-arrows>
          <v-tab value="overview" prepend-icon="mdi-information-outline">{{ t('projects.views.overview') }}</v-tab>
          <v-tab value="list" prepend-icon="mdi-format-list-checkbox">{{ t('projects.views.list') }}</v-tab>
          <v-tab value="board" prepend-icon="mdi-view-column-outline">{{ t('projects.views.board') }}</v-tab>
          <v-tab value="calendar" prepend-icon="mdi-calendar-month-outline">{{ t('projects.views.calendar') }}</v-tab>
          <v-tab value="timeline" prepend-icon="mdi-chart-gantt">{{ t('projects.views.timeline') }}</v-tab>
          <v-tab value="dashboard" prepend-icon="mdi-view-dashboard-outline">{{ t('projects.views.dashboard') }}</v-tab>
          <v-tab v-if="canBill" value="billing" prepend-icon="mdi-receipt-text-outline">{{ t('projects.views.billing') }}</v-tab>
        </v-tabs>
        <v-spacer />
        <v-chip v-if="!store.canEdit" size="small" prepend-icon="mdi-eye-outline">{{ t(`projects.roles.${store.myRole}`) }}</v-chip>
        <v-switch v-if="view === 'list'" v-model="showCompleted" :label="t('projects.showCompleted')" class="flex-grow-0" />
      </div>

      <ProjectOverview v-if="view === 'overview'" @share="sharing = true" />
      <ProjectTaskList v-else-if="view === 'list'" ref="list" :show-completed="showCompleted" />
      <ProjectBoard v-else-if="view === 'board'" ref="board" />
      <ProjectCalendar v-else-if="view === 'calendar'" />
      <ProjectDashboard v-else-if="view === 'dashboard'" />
      <ProjectBilling v-else-if="view === 'billing' && canBill" />
      <ProjectTimeline v-else />
    </template>

    <TaskDetailPanel />
    <TaskCelebration />
    <ShortcutsDialog v-model="helpOpen" />
    <ProjectFormDialog v-model="editing" :project="project" />
    <ProjectFieldsDialog v-model="managingFields" />
    <ProjectRulesDialog v-model="managingRules" />
    <ProjectFormsDialog v-model="managingForms" />

    <v-dialog v-model="duplicating">
      <v-card>
        <v-card-title>{{ t('projects.duplicate.title') }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-4">
          <div class="text-body-medium text-medium-emphasis">{{ t('projects.duplicate.text') }}</div>
          <v-text-field v-model="copyName" :label="t('projects.form.name')" :counter="120" autofocus @keyup.enter="duplicate" />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="duplicating = false">{{ t('common.cancel') }}</v-btn>
          <v-btn variant="flat" color="primary" :disabled="!copyName.trim()" @click="duplicate">{{ t('projects.duplicate.action') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <ShareDialog v-model="sharing" @left="router.push('/projects')" />


  </v-container>
</template>
