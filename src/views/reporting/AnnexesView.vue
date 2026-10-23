<script setup lang="ts">
/**
 * Anexos del SRI: se elige el anexo y el periodo y se genera una versión. Cada generación queda guardada (no se pisa la anterior), y si
 * nada cambió desde la última, el sistema lo dice y no crea otra. Es un BORRADOR para el contador: el sistema no presenta nada al SRI.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useReportingStore } from '@/stores/reporting';
import { formatMoney } from '@/utils/accounting';
import { extractError } from '@/utils/error';
import { ANNEXES, currentPeriod, formatDateTime, formatPeriod, isMoneyKey, keyFigure, recentPeriods } from '@/utils/reporting';
import type { AnnexType, RunSummary } from '@/types/reporting';
import PageHeader from '@/components/ui/PageHeader.vue';
import ReportingTabs from '@/components/reporting/ReportingTabs.vue';

const { t, te, locale } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = useReportingStore();

const annex = ref<AnnexType>('f104');
const period = ref(currentPeriod());
const generateError = ref<string | null>(null);

const periods = computed(() => recentPeriods(24).map((value) => ({ value, title: formatPeriod(value, locale.value) })));
const canGenerate = computed(() => auth.can('tax_annex:generate'));

const load = (): Promise<void> => store.fetchRuns({ period: period.value });
onMounted(load);
watch(period, load);

async function generate(): Promise<void> {
  generateError.value = null;
  try {
    const result = await store.generate(annex.value, period.value);
    await router.push({ name: 'reporting-annex-run', params: { id: result.run.id }, query: { created: result.created ? '1' : '0' } });
  } catch (err) {
    generateError.value = extractError(err);
  }
}

const money = (cents: number) => formatMoney(cents, locale.value);
const headers = computed(() => [
  { title: t('reporting.versions.annex'), key: 'annex', sortable: false },
  { title: t('reporting.versions.period'), key: 'period', sortable: false },
  { title: t('reporting.versions.version'), key: 'version', sortable: false, align: 'end' as const },
  { title: t('reporting.versions.generatedAt'), key: 'generatedAt', sortable: false },
  { title: t('reporting.summary.title'), key: 'figure', sortable: false, align: 'end' as const },
]);
const figure = (run: RunSummary): string => {
  const { key, value } = keyFigure(run.annex, run.summary);
  const label = te(`reporting.metrics.${key}`) ? t(`reporting.metrics.${key}`) : key;
  return `${label}: ${isMoneyKey(key) ? money(value) : value}`;
};
const open = (_: Event, { item }: { item: RunSummary }) => router.push({ name: 'reporting-annex-run', params: { id: item.id } });
</script>

<template>
  <v-container>
    <PageHeader :title="$t('reporting.title')" :subtitle="$t('reporting.intro')" />
    <ReportingTabs />

    <v-alert type="info" class="mb-4">{{ $t('reporting.draftNote') }}</v-alert>

    <v-row class="mb-2">
      <v-col v-for="a in ANNEXES" :key="a.value" cols="12" md="4">
        <v-card :color="annex === a.value ? 'primary' : undefined" :variant="annex === a.value ? 'tonal' : 'elevated'" :data-testid="`annex-${a.value}`" @click="annex = a.value">
          <v-card-title class="text-h6"><v-icon :icon="a.icon" class="mr-2" />{{ $t(`reporting.annexName.${a.value}`) }}</v-card-title>
          <v-card-text class="text-body-2">{{ $t(`reporting.annexHint.${a.value}`) }}</v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="mb-4">
      <v-card-text>
        <v-row align="center">
          <v-col cols="12" sm="6" md="4">
            <v-select v-model="period" :items="periods" item-value="value" item-title="title" :label="$t('reporting.generate.period')" hide-details data-testid="period-select" />
          </v-col>
          <v-col v-if="canGenerate" cols="12" sm="6" md="4">
            <v-btn color="primary" prepend-icon="mdi-file-cog-outline" :loading="store.saving" data-testid="generate-button" @click="generate">
              {{ $t('reporting.generate.button') }} · {{ $t(`reporting.annexName.${annex}`) }}
            </v-btn>
          </v-col>
        </v-row>
        <v-alert v-if="generateError" type="error" class="mt-4" data-testid="generate-error">{{ generateError }}</v-alert>
      </v-card-text>
    </v-card>

    <v-alert v-if="store.error" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-card>
      <v-card-title class="text-h6">{{ $t('reporting.versions.title') }} · {{ formatPeriod(period, locale) }}</v-card-title>
      <v-card-text>
        <v-data-table :headers="headers" :items="store.runs" :loading="store.loading" :items-per-page="-1" hide-default-footer @click:row="open">
          <template #item.annex="{ item }"><v-chip size="small">{{ $t(`reporting.annexName.${item.annex}`) }}</v-chip></template>
          <template #item.period="{ item }">{{ formatPeriod(item.period, locale) }}</template>
          <template #item.generatedAt="{ item }">{{ formatDateTime(item.generatedAt, locale) }}</template>
          <template #item.figure="{ item }">{{ figure(item) }}</template>
          <template #no-data>{{ $t('reporting.versions.empty') }}</template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>
