<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PieChart from '@/components/ui/PieChart.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { treasuryApi } from '@/api/treasury';
import { formatMoney } from '@/utils/format';
import type { AgingBucket } from '@/types/treasury';

/**
 * Cuentas por cobrar por antigüedad: una dona con lo que está al día y lo vencido por tramos, el total en el centro y la leyenda con
 * importes. Verde lo corriente, naranja hasta 60 días, rojo lo que pasa de 60.
 */
const { t } = useI18n();
const loading = ref(true);
const failed = ref(false);
const totals = ref<AgingBucket | null>(null);

const slices = computed(() => {
  const a = totals.value;
  if (!a) return [];
  return [
    { key: 'current', title: t('widgets.aging.current'), value: a.currentCents, color: 'success' },
    { key: 'd30', title: t('widgets.aging.d30'), value: a.days1To30Cents, color: 'warning' },
    { key: 'd60', title: t('widgets.aging.d60'), value: a.days31To60Cents, color: 'warning' },
    { key: 'd90', title: t('widgets.aging.d90'), value: a.days61To90Cents, color: 'error' },
    { key: 'over', title: t('widgets.aging.over'), value: a.daysOver90Cents, color: 'error' },
  ];
});

async function load(): Promise<void> {
  loading.value = true;
  failed.value = false;
  try {
    totals.value = (await treasuryApi.getAging()).totals;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>

<template>
  <v-skeleton-loader v-if="loading" type="image" />
  <div v-else-if="failed" class="d-flex flex-column align-start ga-2">
    <span class="text-body-small text-error">{{ t('dashboard.loadError') }}</span>
    <v-btn variant="text" size="small" prepend-icon="mdi-refresh" class="px-0 no-drag" @click="load">{{ t('dashboard.retry') }}</v-btn>
  </div>
  <EmptyState v-else-if="!totals?.totalCents" compact icon="mdi-check-circle-outline" :title="t('widgets.emptyReceivables')" />
  <div v-else class="d-flex align-center flex-wrap ga-4">
    <PieChart :items="slices" :size="140" :label="t('widgets.receivablesAging')">
      <template #center>
        <div class="text-center">
          <div class="text-body-small text-medium-emphasis">{{ t('widgets.total') }}</div>
          <div class="text-body-large font-weight-bold">{{ formatMoney(totals.totalCents) }}</div>
        </div>
      </template>
    </PieChart>
    <div class="d-flex flex-column ga-1 flex-grow-1">
      <div v-for="s in slices" :key="s.key" class="d-flex align-center ga-2 text-body-small">
        <v-icon icon="mdi-circle" :color="s.color" size="10" />
        <span class="flex-grow-1">{{ s.title }}</span>
        <span class="font-weight-medium">{{ formatMoney(s.value) }}</span>
      </div>
    </div>
  </div>
</template>
