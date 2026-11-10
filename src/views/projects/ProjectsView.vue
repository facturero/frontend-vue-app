<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import EmptyState from '@/components/ui/EmptyState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import DueDateChip from '@/components/projects/DueDateChip.vue';
import ProjectFormDialog from '@/components/projects/ProjectFormDialog.vue';
import ProjectSearchDialog from '@/components/projects/ProjectSearchDialog.vue';
import ProjectTemplateDialog from '@/components/projects/ProjectTemplateDialog.vue';
import UserAvatar from '@/components/projects/UserAvatar.vue';
import { useAuthStore } from '@/stores/auth';
import { useProjectsStore } from '@/stores/projects';
import { HEALTH_COLOR } from '@/utils/projects';
import type { ProjectWithRole } from '@/types/projects';

/**
 * Proyectos visibles para la persona: los de toda la organización y los privados donde es miembro.
 *
 * Cada tarjeta dice de un vistazo cómo va (avance, vencidas, próxima entrega, salud) y quién está, como la lista de proyectos de
 * Asana; los números los calcula `GET /projects` (`summary`). Buscar, ordenar y tarjetas o tabla van en la URL (REGLAS-FRONT
 * R-54): se comparten con un enlace y sobreviven a recargar.
 */
type SortKey = 'name' | 'nextDue' | 'progress' | 'overdue';
type ViewMode = 'cards' | 'table';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { smAndDown } = useDisplay();
const auth = useAuthStore();
const store = useProjectsStore();

const status = ref<'active' | 'archived'>('active');
const creating = ref(false);
/** «Nuevo proyecto» abre primero las plantillas; «En blanco» pasa al formulario de siempre. */
const choosing = ref(false);
const searching = ref(false);

const SORTS: SortKey[] = ['name', 'nextDue', 'progress', 'overdue'];
const fromQuery = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  const value = route.query[key];
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
};
const query = ref(typeof route.query.q === 'string' ? route.query.q : '');
const sort = ref<SortKey>(fromQuery('sort', SORTS, 'name'));
// En el teléfono la tabla no cabe: allí siempre tarjetas, sea cual sea la vista elegida (el alternador ni se muestra).
const view = ref<ViewMode>(fromQuery('view', ['cards', 'table'] as const, 'cards'));

// Solo lo que no es el valor por defecto va a la URL, así el enlace a /projects sigue limpio.
watch([query, sort, view], ([q, s, v]) => {
  const next = { ...route.query, q: q?.trim() || undefined, sort: s === 'name' ? undefined : s, view: v === 'cards' ? undefined : v };
  void router.replace({ query: next });
});

onMounted(() => {
  void store.fetchProjects(status.value);
  void store.ensureDirectory();
});
watch(status, (s) => store.fetchProjects(s));

const summaryOf = (p: ProjectWithRole) => p.summary ?? { total: 0, completed: 0, overdue: 0, nextDueOn: null, memberCount: 0, memberUserIds: [] };
const percent = (p: ProjectWithRole) => {
  const s = summaryOf(p);
  return s.total ? Math.round((s.completed / s.total) * 100) : 0;
};

const visible = computed(() => {
  const q = query.value.trim().toLocaleLowerCase();
  const list = q
    ? store.projects.filter((p) => p.name.toLocaleLowerCase().includes(q) || (p.description ?? '').toLocaleLowerCase().includes(q))
    : [...store.projects];
  const byName = (a: ProjectWithRole, b: ProjectWithRole) => a.name.localeCompare(b.name);
  const compare: Record<SortKey, (a: ProjectWithRole, b: ProjectWithRole) => number> = {
    name: byName,
    // Sin próxima entrega, al final.
    nextDue: (a, b) => (summaryOf(a).nextDueOn ?? '9999').localeCompare(summaryOf(b).nextDueOn ?? '9999') || byName(a, b),
    progress: (a, b) => percent(b) - percent(a) || byName(a, b),
    overdue: (a, b) => summaryOf(b).overdue - summaryOf(a).overdue || byName(a, b),
  };
  return list.sort(compare[sort.value]);
});

const sortItems = computed(() => SORTS.map((value) => ({ value, title: t(`projects.list.sort.${value}`) })));

/** Columnas de la tabla. Los anchos, una vez aquí (R-51). */
const headers = computed(() => [
  { key: 'name', title: t('projects.list.columns.name'), sortable: true, minWidth: 240 },
  { key: 'health', title: t('projects.list.columns.health'), sortable: false, width: 140 },
  { key: 'progress', title: t('projects.list.columns.progress'), width: 200, value: (p: ProjectWithRole) => percent(p) },
  { key: 'overdue', title: t('projects.list.columns.overdue'), width: 110, align: 'end' as const, value: (p: ProjectWithRole) => summaryOf(p).overdue },
  { key: 'nextDue', title: t('projects.list.columns.nextDue'), width: 150, value: (p: ProjectWithRole) => summaryOf(p).nextDueOn ?? '9999' },
  { key: 'members', title: t('projects.list.columns.members'), sortable: false, width: 160 },
  { key: 'role', title: t('projects.list.columns.role'), sortable: false, width: 130 },
]);

function opened(id: string): void {
  void router.push(`/projects/${id}`);
}
</script>

<template>
  <v-container>
    <PageHeader :title="t('projects.title')" :subtitle="t('projects.subtitle')">
      <template #actions>
        <v-btn variant="text" prepend-icon="mdi-magnify" @click="searching = true">{{ t('projects.search.button') }}</v-btn>
        <v-btn variant="text" prepend-icon="mdi-check-circle-outline" to="/my-tasks">{{ t('projects.myTasks.title') }}</v-btn>
        <v-btn v-if="auth.can('project:create')" color="primary" prepend-icon="mdi-plus" @click="choosing = true">
          {{ t('projects.new') }}
        </v-btn>
      </template>
    </PageHeader>

    <v-alert v-if="store.error" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-tabs v-model="status" color="primary" class="mb-4">
      <v-tab value="active" prepend-icon="mdi-folder-outline">{{ t('projects.tabs.active') }}</v-tab>
      <v-tab value="archived" prepend-icon="mdi-archive-outline">{{ t('projects.tabs.archived') }}</v-tab>
    </v-tabs>

    <v-row v-if="store.projects.length" class="mb-2" align="center">
      <v-col cols="12" sm="6" md="4">
        <v-text-field v-model="query" :label="t('projects.list.filter')" prepend-inner-icon="mdi-magnify" clearable @click:clear="query = ''" />
      </v-col>
      <v-col v-if="view === 'cards' || smAndDown" cols="12" sm="4" md="3">
        <v-select v-model="sort" :items="sortItems" :label="t('projects.list.sort.label')" />
      </v-col>
      <v-spacer />
      <v-col v-if="!smAndDown" cols="auto" class="d-flex justify-end">
        <v-btn-toggle v-model="view" mandatory density="compact" variant="outlined" divided>
          <v-tooltip location="top" :text="t('projects.list.cards')">
            <template #activator="{ props: tip }"><v-btn v-bind="tip" value="cards" icon="mdi-view-grid-outline" :aria-label="t('projects.list.cards')" /></template>
          </v-tooltip>
          <v-tooltip location="top" :text="t('projects.list.table')">
            <template #activator="{ props: tip }"><v-btn v-bind="tip" value="table" icon="mdi-table" :aria-label="t('projects.list.table')" /></template>
          </v-tooltip>
        </v-btn-toggle>
      </v-col>
    </v-row>

    <v-progress-linear v-if="store.loading" indeterminate color="primary" class="mb-4" />

    <v-card v-if="!store.loading && store.projects.length === 0">
      <EmptyState
        :icon="status === 'active' ? 'mdi-folder-star-outline' : 'mdi-archive-outline'"
        :title="status === 'active' ? t('projects.empty.title') : t('projects.empty.archived')"
        :text="status === 'active' ? t('projects.empty.text') : undefined"
        :action-text="status === 'active' && auth.can('project:create') ? t('projects.new') : undefined"
        action-icon="mdi-plus"
        @action="choosing = true"
      />
    </v-card>

    <v-card v-else-if="!visible.length && query">
      <EmptyState compact icon="mdi-magnify" :title="t('projects.list.noMatch', { q: query })" :action-text="t('projects.list.clear')" @action="query = ''" />
    </v-card>

    <v-row v-else-if="view === 'cards' || smAndDown">
      <v-col v-for="p in visible" :key="p.id" cols="12" sm="6" md="4" xl="3">
        <v-card :to="`/projects/${p.id}`" class="h-100 d-flex flex-column">
          <v-card-item>
            <template #prepend>
              <v-avatar :color="p.color" rounded="lg">
                <v-icon :icon="p.icon" />
              </v-avatar>
            </template>
            <v-card-title>{{ p.name }}</v-card-title>
            <v-card-subtitle class="d-flex align-center ga-1">
              <v-icon :icon="p.visibility === 'members' ? 'mdi-lock-outline' : 'mdi-domain'" size="small" />
              {{ p.visibility === 'members' ? t('projects.visibility.members') : t('projects.visibility.organization') }}
            </v-card-subtitle>
            <template v-if="p.latestStatus" #append>
              <v-chip :color="HEALTH_COLOR[p.latestStatus.status]" size="small" prepend-icon="mdi-circle">
                {{ t(`projects.health.${p.latestStatus.status}`) }}
              </v-chip>
            </template>
          </v-card-item>

          <v-card-text class="d-flex flex-column ga-2 flex-grow-1">
            <div v-if="p.description" class="text-body-medium text-medium-emphasis text-truncate">{{ p.description }}</div>
            <template v-if="summaryOf(p).total">
              <div class="d-flex align-center ga-2 text-body-small text-medium-emphasis">
                <span>{{ t('projects.list.progress', { done: summaryOf(p).completed, total: summaryOf(p).total }) }}</span>
                <v-spacer />
                <span>{{ percent(p) }} %</span>
              </div>
              <v-progress-linear :model-value="percent(p)" :color="p.color" rounded height="6" />
            </template>
            <div v-else class="text-body-small text-medium-emphasis">{{ t('projects.list.noTasks') }}</div>
            <div class="d-flex align-center flex-wrap ga-2">
              <v-chip v-if="summaryOf(p).overdue" color="error" size="small" prepend-icon="mdi-alert-circle-outline">
                {{ t('projects.list.overdue', { n: summaryOf(p).overdue }, summaryOf(p).overdue) }}
              </v-chip>
              <span v-if="summaryOf(p).nextDueOn" class="d-flex align-center ga-1 text-body-small text-medium-emphasis">
                {{ t('projects.list.nextDue') }} <DueDateChip :due-on="summaryOf(p).nextDueOn" />
              </span>
            </div>
          </v-card-text>

          <v-card-actions>
            <v-avatar-group :size="26" border>
              <UserAvatar v-for="id in summaryOf(p).memberUserIds" :key="id" :user-id="id" :size="26" />
              <v-avatar v-if="summaryOf(p).memberCount > summaryOf(p).memberUserIds.length" color="surface-variant" class="text-label-small">
                +{{ summaryOf(p).memberCount - summaryOf(p).memberUserIds.length }}
              </v-avatar>
            </v-avatar-group>
            <v-spacer />
            <v-chip size="small">{{ t(`projects.roles.${p.myRole}`) }}</v-chip>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-card v-else>
      <v-data-table
        :headers="headers"
        :items="visible"
        item-value="id"
        :items-per-page="-1"
        hide-default-footer
        class="cursor-pointer"
        @click:row="(_e: unknown, { item }: { item: ProjectWithRole }) => opened(item.id)"
      >
        <template #[`item.name`]="{ item }">
          <div class="d-flex align-center ga-2">
            <v-avatar :color="item.color" rounded="lg" size="28"><v-icon :icon="item.icon" size="small" /></v-avatar>
            <span class="font-weight-medium">{{ item.name }}</span>
            <v-icon v-if="item.visibility === 'members'" icon="mdi-lock-outline" size="x-small" />
          </div>
        </template>
        <template #[`item.health`]="{ item }">
          <v-chip v-if="item.latestStatus" :color="HEALTH_COLOR[item.latestStatus.status]" size="x-small" prepend-icon="mdi-circle">
            {{ t(`projects.health.${item.latestStatus.status}`) }}
          </v-chip>
        </template>
        <template #[`item.progress`]="{ item }">
          <div v-if="summaryOf(item).total" class="d-flex align-center ga-2">
            <v-progress-linear :model-value="percent(item)" :color="item.color" rounded height="6" />
            <span class="text-body-small text-medium-emphasis text-no-wrap">{{ summaryOf(item).completed }}/{{ summaryOf(item).total }}</span>
          </div>
          <span v-else class="text-body-small text-medium-emphasis">{{ t('projects.list.noTasks') }}</span>
        </template>
        <template #[`item.overdue`]="{ item }">
          <span :class="summaryOf(item).overdue ? 'text-error font-weight-medium' : 'text-medium-emphasis'">{{ summaryOf(item).overdue }}</span>
        </template>
        <template #[`item.nextDue`]="{ item }">
          <DueDateChip :due-on="summaryOf(item).nextDueOn" />
        </template>
        <template #[`item.members`]="{ item }">
          <v-avatar-group :size="24" border>
            <UserAvatar v-for="id in summaryOf(item).memberUserIds" :key="id" :user-id="id" :size="24" />
            <v-avatar v-if="summaryOf(item).memberCount > summaryOf(item).memberUserIds.length" color="surface-variant" class="text-label-small">
              +{{ summaryOf(item).memberCount - summaryOf(item).memberUserIds.length }}
            </v-avatar>
          </v-avatar-group>
        </template>
        <template #[`item.role`]="{ item }">
          <v-chip size="x-small">{{ t(`projects.roles.${item.myRole}`) }}</v-chip>
        </template>
      </v-data-table>
    </v-card>

    <ProjectFormDialog v-model="creating" @saved="opened" />
    <ProjectTemplateDialog v-model="choosing" @blank="creating = true" @saved="opened" />
    <ProjectSearchDialog v-model="searching" />
  </v-container>
</template>
