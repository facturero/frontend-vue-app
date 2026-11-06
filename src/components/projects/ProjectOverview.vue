<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { formatDateTime } from '@/utils/format';
import { useI18n } from 'vue-i18n';
import { useProjectsStore } from '@/stores/projects';
import { displayName, HEALTH_COLOR, localIsoDate } from '@/utils/projects';
import type { ProjectHealth, RichDoc } from '@/types/projects';
import DueDateChip from './DueDateChip.vue';
import RichTextEditor from './RichTextEditor.vue';
import RichTextView from './RichTextView.vue';
import UserAvatar from './UserAvatar.vue';

/**
 * Resumen del proyecto, como la pestaña «Overview» de Asana: el estado (en curso / en riesgo / con retraso / completado) con su
 * historial, el avance, los próximos hitos y quién está en el proyecto. Publicar el estado avisa a los miembros.
 */
const emit = defineEmits<{ share: [] }>();
const { t } = useI18n();
const store = useProjectsStore();

const HEALTHS: ProjectHealth[] = ['on_track', 'at_risk', 'off_track', 'complete'];

const posting = ref(false);
const status = ref<ProjectHealth>('on_track');
const body = ref<RichDoc | null>(null);
const saving = ref(false);
const editor = ref<InstanceType<typeof RichTextEditor> | null>(null);

// El `autofocus` de TipTap llega antes de que el diálogo sea visible y se pierde: se enfoca cuando ya está abierto.
watch(posting, async (open) => {
  if (!open) return;
  await nextTick();
  setTimeout(() => editor.value?.focus(), 150);
});

onMounted(() => store.fetchStatusUpdates());

const tasks = computed(() => Object.values(store.columns).flat());
const today = localIsoDate(new Date());
const stats = computed(() => {
  const all = tasks.value;
  const done = all.filter((x) => x.completedAt).length;
  return {
    total: all.length,
    done,
    overdue: all.filter((x) => !x.completedAt && x.dueOn && x.dueOn < today).length,
    percent: all.length ? Math.round((done / all.length) * 100) : 0,
  };
});
const milestones = computed(() =>
  tasks.value
    .filter((x) => x.kind === 'milestone' && !x.completedAt)
    .sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'))
    .slice(0, 5),
);
const latest = computed(() => store.statusUpdates[0] ?? null);
const when = (iso: string) => formatDateTime(iso);

function open(): void {
  status.value = latest.value?.status ?? 'on_track';
  body.value = null;
  posting.value = true;
}

async function post(): Promise<void> {
  saving.value = true;
  try {
    await store.postStatusUpdate(status.value, body.value);
    posting.value = false;
  } catch {
    // El aviso lo deja el store.
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <v-row>
    <v-col cols="12" md="8">
      <v-card class="mb-4">
        <v-card-item>
          <v-card-title>{{ t('projects.overview.status') }}</v-card-title>
          <template #append>
            <v-btn v-if="store.canEdit" color="primary" size="small" prepend-icon="mdi-flag-outline" @click="open">{{ t('projects.overview.update') }}</v-btn>
          </template>
        </v-card-item>
        <v-card-text>
          <template v-if="latest">
            <div class="d-flex align-center flex-wrap ga-2 mb-2">
              <v-chip :color="HEALTH_COLOR[latest.status]" prepend-icon="mdi-circle" size="small">{{ t(`projects.health.${latest.status}`) }}</v-chip>
              <span class="text-body-small text-medium-emphasis">
                {{ displayName(store.users.get(latest.authorUserId)) || t('projects.share.unknownUser') }} · {{ when(latest.createdAt) }}
              </span>
            </div>
            <RichTextView v-if="latest.bodyDoc" :doc="latest.bodyDoc" class="text-body-medium" />
          </template>
          <div v-else class="text-body-medium text-medium-emphasis">{{ t('projects.overview.noStatus') }}</div>

          <v-expansion-panels v-if="store.statusUpdates.length > 1" variant="accordion" class="mt-4">
            <v-expansion-panel :title="t('projects.overview.history', { n: store.statusUpdates.length - 1 })">
              <v-expansion-panel-text>
                <div v-for="u in store.statusUpdates.slice(1)" :key="u.id" class="mb-4">
                  <div class="d-flex align-center flex-wrap ga-2 mb-1">
                    <v-chip :color="HEALTH_COLOR[u.status]" size="x-small">{{ t(`projects.health.${u.status}`) }}</v-chip>
                    <span class="text-body-small text-medium-emphasis">{{ displayName(store.users.get(u.authorUserId)) }} · {{ when(u.createdAt) }}</span>
                  </div>
                  <RichTextView v-if="u.bodyDoc" :doc="u.bodyDoc" class="text-body-medium" />
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>
      </v-card>

      <v-card v-if="store.current?.description">
        <v-card-title>{{ t('projects.overview.about') }}</v-card-title>
        <v-card-text class="text-body-medium">{{ store.current.description }}</v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" md="4">
      <v-card class="mb-4">
        <v-card-title>{{ t('projects.overview.progress') }}</v-card-title>
        <v-card-text>
          <div class="d-flex align-center ga-2 mb-2">
            <v-progress-linear :model-value="stats.percent" color="success" height="8" rounded />
            <span class="text-body-medium font-weight-medium">{{ stats.percent }}%</span>
          </div>
          <div class="text-body-medium">{{ t('projects.overview.doneOf', { done: stats.done, total: stats.total }) }}</div>
          <div v-if="stats.overdue" class="text-body-medium text-error">{{ t('projects.overview.overdue', { n: stats.overdue }) }}</div>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title>{{ t('projects.overview.milestones') }}</v-card-title>
        <v-list v-if="milestones.length" density="compact">
          <v-list-item v-for="m in milestones" :key="m.id" prepend-icon="mdi-rhombus-outline" @click="store.openTask(m.id)">
            <v-list-item-title class="text-body-medium">{{ m.title }}</v-list-item-title>
            <template #append><DueDateChip :due-on="m.dueOn" /></template>
          </v-list-item>
        </v-list>
        <v-card-text v-else class="text-body-medium text-medium-emphasis">{{ t('projects.overview.noMilestones') }}</v-card-text>
      </v-card>

      <v-card>
        <v-card-item>
          <v-card-title>{{ t('projects.overview.members') }}</v-card-title>
          <template #append>
            <v-btn variant="text" size="small" @click="emit('share')">{{ t('projects.share.button') }}</v-btn>
          </template>
        </v-card-item>
        <v-list density="compact">
          <v-list-item v-for="m in store.current?.members ?? []" :key="m.userId">
            <template #prepend><UserAvatar :user-id="m.userId" :size="28" :tooltip="false" class="mr-2" /></template>
            <v-list-item-title class="text-body-medium">{{ displayName(store.users.get(m.userId)) || t('projects.share.unknownUser') }}</v-list-item-title>
            <template #append><span class="text-body-small text-medium-emphasis">{{ t(`projects.roles.${m.role}`) }}</span></template>
          </v-list-item>
        </v-list>
      </v-card>
    </v-col>
  </v-row>

  <v-dialog v-model="posting" max-width="640">
    <v-card>
      <v-card-title>{{ t('projects.overview.update') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <v-chip-group v-model="status" mandatory selected-class="font-weight-bold">
          <v-chip v-for="h in HEALTHS" :key="h" :value="h" :color="HEALTH_COLOR[h]" filter>{{ t(`projects.health.${h}`) }}</v-chip>
        </v-chip-group>
        <RichTextEditor ref="editor" v-model="body" :placeholder="t('projects.overview.placeholder')" @submit="post" />
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn variant="text" @click="posting = false">{{ t('common.cancel') }}</v-btn>
        <v-btn variant="flat" color="primary" :loading="saving" @click="post">{{ t('projects.overview.publish') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
