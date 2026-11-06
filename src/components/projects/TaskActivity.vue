<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatMinutes } from '@/utils/duration';
import { formatDate, formatDateTime, formatRelative } from '@/utils/format';
import { useProjectsStore } from '@/stores/projects';
import { displayName } from '@/utils/projects';
import type { TaskActivity } from '@/types/projects';

/**
 * El historial de la tarea (quién cambió qué y cuándo), al final del panel y separado de los comentarios: mezclado con ellos tapaba
 * la conversación. Siempre visible, pero corto: las últimas `MIN` líneas. «Ver todo» muestra el resto; si es mucho, «Ver más» lo
 * va soltando de `STEP` en `STEP` para no alargar el panel de golpe. Cierra con quién creó la tarea.
 */
const { t } = useI18n();
const store = useProjectsStore();

const MIN = 5;
const STEP = 20;
const limit = ref(MIN);

const items = computed<TaskActivity[]>(() => [...(store.detail?.activity ?? [])].sort((a, b) => a.at.localeCompare(b.at)));
/** Las más recientes, en orden de fecha: lo último que pasó queda abajo, junto a quién creó la tarea. */
const visible = computed(() => items.value.slice(-limit.value));
const hidden = computed(() => items.value.length - visible.value.length);
// Otra tarea: vuelve a empezar corto.
watch(() => store.detail?.id, () => (limit.value = MIN));

function showMore(): void {
  // Si lo que falta cabe en un tramo, se muestra todo de una vez («Ver todo»); si no, otro tramo («Ver más»).
  limit.value = hidden.value <= STEP ? items.value.length : limit.value + STEP;
}
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
    <div class="text-body-large font-weight-medium mb-2">{{ t('projects.activity.title') }} ({{ items.length }})</div>
    <div class="d-flex flex-column ga-2">
      <div class="d-flex flex-wrap ga-2">
        <v-btn v-if="hidden" variant="text" size="small" class="px-0" prepend-icon="mdi-history" @click="showMore">
          {{ hidden <= STEP ? t('projects.activity.showAll', { n: items.length }) : t('projects.activity.showMore', { n: STEP }) }}
        </v-btn>
        <v-btn v-if="limit > MIN" variant="text" size="small" class="px-0" @click="limit = MIN">{{ t('projects.activity.showLess') }}</v-btn>
      </div>
      <div v-for="a in visible" :key="a.id" class="d-flex align-center ga-2 text-body-small text-medium-emphasis">
        <v-icon icon="mdi-history" size="x-small" />
        <span><strong>{{ name(a.actorUserId) }}</strong> {{ describe(a) }} · {{ formatRelative(a.at) }}</span>
      </div>
    </div>
    <div class="text-body-small text-medium-emphasis mt-2">{{ createdLine }}</div>
  </div>
</template>
