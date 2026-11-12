<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { projectsApi } from '@/api/projects';
import { useTimerStore } from '@/stores/timer';
import { formatElapsed, formatMinutes } from '@/utils/duration';
import { localIsoDate } from '@/utils/projects';
import type { WidgetContext } from './registry';

/**
 * Mis horas de esta semana (de lunes a hoy), cuántas son facturables y, si hay un cronómetro en marcha, en qué tarea y desde cuándo.
 */
const props = defineProps<{ ctx: WidgetContext }>();
const { t } = useI18n();
const timer = useTimerStore();

const loading = ref(true);
const failed = ref(false);
const total = ref(0);
const billable = ref(0);

function monday(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localIsoDate(d);
}

async function load(): Promise<void> {
  loading.value = true;
  failed.value = false;
  try {
    const report = await projectsApi.timeReport({ from: monday(), to: localIsoDate(new Date()), userId: props.ctx.userId });
    total.value = report.totalMinutes;
    billable.value = report.billableMinutes;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(() => {
  void timer.load();
  void load();
});
const running = computed(() => timer.timer);
</script>

<template>
  <v-skeleton-loader v-if="loading" type="heading" />
  <div v-else-if="failed" class="d-flex flex-column align-start ga-2">
    <span class="text-body-small text-error">{{ t('dashboard.loadError') }}</span>
    <v-btn variant="text" size="small" prepend-icon="mdi-refresh" class="px-0 no-drag" @click="load">{{ t('dashboard.retry') }}</v-btn>
  </div>
  <template v-else>
    <div class="text-headline-small font-weight-bold">{{ formatMinutes(total) }}</div>
    <div class="text-body-small text-medium-emphasis">{{ t('widgets.billableHours', { amount: formatMinutes(billable) }) }}</div>
    <v-chip v-if="running" size="small" color="error" prepend-icon="mdi-record-circle-outline" class="mt-2">
      {{ formatElapsed(timer.elapsedMs) }} · {{ running.taskTitle }}
    </v-chip>
  </template>
</template>
