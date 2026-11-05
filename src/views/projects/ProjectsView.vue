<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import PageHeader from '@/components/ui/PageHeader.vue';
import ProjectFormDialog from '@/components/projects/ProjectFormDialog.vue';
import ProjectSearchDialog from '@/components/projects/ProjectSearchDialog.vue';
import ProjectTemplateDialog from '@/components/projects/ProjectTemplateDialog.vue';
import { useAuthStore } from '@/stores/auth';
import { useProjectsStore } from '@/stores/projects';
import { HEALTH_COLOR } from '@/utils/projects';

/** Proyectos visibles para la persona: los de toda la organización y los privados donde es miembro. */
const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = useProjectsStore();

const status = ref<'active' | 'archived'>('active');
const creating = ref(false);
/** «Nuevo proyecto» abre primero las plantillas; «En blanco» pasa al formulario de siempre. */
const choosing = ref(false);
const searching = ref(false);

onMounted(() => store.fetchProjects(status.value));
watch(status, (s) => store.fetchProjects(s));

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

    <v-progress-linear v-if="store.loading" indeterminate color="primary" class="mb-4" />

    <v-card v-if="!store.loading && store.projects.length === 0" class="pa-6 text-center">
      <v-icon icon="mdi-folder-star-outline" size="48" color="primary" class="mb-2" />
      <div class="text-h6 mb-2">{{ status === 'active' ? t('projects.empty.title') : t('projects.empty.archived') }}</div>
      <div v-if="status === 'active'" class="text-body-2 text-medium-emphasis mb-4">{{ t('projects.empty.text') }}</div>
      <v-btn v-if="status === 'active' && auth.can('project:create')" color="primary" prepend-icon="mdi-plus" @click="choosing = true">
        {{ t('projects.new') }}
      </v-btn>
    </v-card>

    <v-row v-else>
      <v-col v-for="p in store.projects" :key="p.id" cols="12" sm="6" md="4" xl="3">
        <v-card :to="`/projects/${p.id}`" class="h-100">
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
          </v-card-item>
          <v-card-text v-if="p.description" class="text-body-2 text-medium-emphasis">{{ p.description }}</v-card-text>
          <v-card-actions>
            <v-chip size="small">{{ t(`projects.roles.${p.myRole}`) }}</v-chip>
            <v-chip v-if="p.latestStatus" :color="HEALTH_COLOR[p.latestStatus.status]" size="small" prepend-icon="mdi-circle">
              {{ t(`projects.health.${p.latestStatus.status}`) }}
            </v-chip>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <ProjectFormDialog v-model="creating" @saved="opened" />
    <ProjectTemplateDialog v-model="choosing" @blank="creating = true" @saved="opened" />
    <ProjectSearchDialog v-model="searching" />
  </v-container>
</template>
