<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatMinutes } from '@/utils/duration';
import { formatDate, formatDateTime, formatRelative } from '@/utils/format';
import { useStoredFlag } from '@/composable/useStoredFlag';
import { useProjectsStore } from '@/stores/projects';
import { displayName } from '@/utils/projects';
import type { TaskActivity } from '@/types/projects';

/**
 * El historial de la tarea (quién cambió qué y cuándo), al final del panel y separado de los comentarios: mezclado con ellos tapaba
 * la conversación. Va plegado al principio y cada persona lo encuentra como lo dejó. Cierra con quién creó la tarea.
 */
const { t } = useI18n();
const store = useProjectsStore();

const open = useStoredFlag('crm:projects:panel:activity', false);

const items = computed<TaskActivity[]>(() => [...(store.detail?.activity ?? [])].sort((a, b) => a.at.localeCompare(b.at)));
const name = (id: string | null) => (id ? displayName(store.users.get(id)) || t('projects.share.unknownUser') : t('projects.activity.system'));
const date = (value: unknown) => (typeof value === 'string' && value ? formatDate(value) : '');

const createdLine = computed(() => {
  const task = store.detail;
  if (!task) return '';
  const who = displayName(store.users.get(task.createdBy)) || t('projects.share.unknownUser');
  return t('projects.detail.createdBy', { who, when: formatDateTime(task.createdAt) });
});

/** Texto de una línea del historial. Las claves y sus datos los define projects-service (application/activity.ts). */
function describe(a: TaskActivity): string {
  const d = a.data;
  switch (a.kind) {
    case 'assigned':
      return t('projects.activity.assigned', { to: name(String(d.to ?? '')) });
    case 'due_changed':
      return d.to ? t('projects.activity.dueChanged', { to: date(d.to) }) : t('projects.activity.dueRemoved');
    case 'start_changed':
      return d.to ? t('projects.activity.startChanged', { to: date(d.to) }) : t('projects.activity.startRemoved');
    case 'title_changed':
      return t('projects.activity.titleChanged', { to: String(d.to ?? '') });
    case 'moved':
      return t('projects.activity.moved', { from: String(d.from ?? ''), to: String(d.to ?? '') });
    case 'approval_decided':
      return t(`projects.approval.decided.${String(d.decision)}`);
    case 'kind_changed':
      return t(`projects.activity.kindChanged.${String(d.to)}`);
    case 'dependency_added':
      return t('projects.activity.dependencyAdded', { task: String(d.dependsOn ?? '') });
    case 'dependency_removed':
      return t('projects.activity.dependencyRemoved', { task: String(d.dependsOn ?? '') });
    case 'rule_applied':
      return d.error ? t('projects.activity.ruleFailed', { rule: String(d.rule ?? '') }) : t('projects.activity.ruleApplied', { rule: String(d.rule ?? '') });
    case 'form_submitted':
      return t('projects.activity.formSubmitted', { form: String(d.form ?? '') });
    case 'time_logged':
      return t('projects.activity.timeLogged', { amount: formatMinutes(Number(d.minutes ?? 0)) });
    case 'estimate_changed':
      return d.to ? t('projects.activity.estimateChanged', { amount: formatMinutes(Number(d.to)) }) : t('projects.activity.estimateRemoved');
    case 'link_added':
      return t('projects.activity.linkAdded', { what: t(`projects.links.type.${String(d.entityType)}`), label: String(d.label ?? '') });
    case 'link_removed':
      return t('projects.activity.linkRemoved', { what: t(`projects.links.type.${String(d.entityType)}`), label: String(d.label ?? '') });
    case 'field_set':
      return d.value === null || d.value === undefined
        ? t('projects.activity.fieldCleared', { field: String(d.field ?? '') })
        : t('projects.activity.fieldSet', { field: String(d.field ?? ''), value: String(d.value) });
    case 'attachment_added':
    case 'attachment_removed':
      return t(`projects.activity.${a.kind === 'attachment_added' ? 'attachmentAdded' : 'attachmentRemoved'}`, { file: String(d.fileName ?? '') });
    default:
      return t(`projects.activity.${({ created: 'created', unassigned: 'unassigned', completed: 'completed', reopened: 'reopened', description_changed: 'descriptionChanged' } as Record<string, string>)[a.kind] ?? 'changed'}`);
  }
}
</script>

<template>
  <div v-if="store.detail">
    <v-btn
      variant="text"
      class="px-0 mb-2 text-body-large font-weight-medium"
      :append-icon="open ? 'mdi-chevron-up' : 'mdi-chevron-down'"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ t('projects.activity.title') }} ({{ items.length }})
    </v-btn>
    <div v-if="open" class="d-flex flex-column ga-2">
      <div v-for="a in items" :key="a.id" class="d-flex align-center ga-2 text-body-small text-medium-emphasis">
        <v-icon icon="mdi-history" size="x-small" />
        <span><strong>{{ name(a.actorUserId) }}</strong> {{ describe(a) }} · {{ formatRelative(a.at) }}</span>
      </div>
    </div>
    <div class="text-body-small text-medium-emphasis mt-2">{{ createdLine }}</div>
  </div>
</template>
