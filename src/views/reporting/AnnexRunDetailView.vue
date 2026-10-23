<script setup lang="ts">
/**
 * Una versión de un anexo: sus cifras, lo que hay que revisar antes de declarar (hallazgos), qué cambió respecto a la versión anterior,
 * el detalle, los casilleros del contador y la conciliación con el libro mayor. La versión es inmutable: "Generar de nuevo" crea otra
 * si algo cambió, o devuelve esta misma si no.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useReportingStore } from '@/stores/reporting';
import { formatMoney } from '@/utils/accounting';
import { extractError } from '@/utils/error';
import { downloadBlob, formatDateTime, formatPeriod, isMoneyKey, orderedSummary } from '@/utils/reporting';
import type { F104Content } from '@/types/reporting';
import PageHeader from '@/components/ui/PageHeader.vue';
import ReportingTabs from '@/components/reporting/ReportingTabs.vue';
import FindingsCard from '@/components/reporting/FindingsCard.vue';
import AnnexContent from '@/components/reporting/AnnexContent.vue';
import ManualInputsCard from '@/components/reporting/ManualInputsCard.vue';
import ReconciliationCard from '@/components/reporting/ReconciliationCard.vue';

const { t, te, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useReportingStore();

const id = computed(() => String(route.params.id));
const detail = computed(() => store.detail);
const run = computed(() => detail.value?.run ?? null);
const notice = ref<{ type: 'success' | 'info'; text: string } | null>(null);
const actionError = ref<string | null>(null);

const canGenerate = computed(() => auth.can('tax_annex:generate'));
const canExport = computed(() => auth.can('tax_annex:export'));
const money = (cents: number) => formatMoney(cents, locale.value);
const metricLabel = (key: string) => (te(`reporting.metrics.${key}`) ? t(`reporting.metrics.${key}`) : key);
const metricValue = (key: string, value: number) => (isMoneyKey(key) ? money(value) : String(value));
const summary = computed(() => (run.value ? orderedSummary(run.value.annex, run.value.summary) : []));
const settlement = computed(() => (run.value?.annex === 'f104' ? (run.value.content as F104Content).liquidacion : null));
const title = computed(() => (run.value ? `${t(`reporting.annexName.${run.value.annex}`)} · ${formatPeriod(run.value.period, locale.value)}` : t('reporting.title')));

async function load(): Promise<void> {
  actionError.value = null;
  await store.fetchDetail(id.value);
  if (run.value?.annex === 'f104') await store.fetchManual(run.value.annex, run.value.period);
}
onMounted(async () => {
  // El aviso lleva el número de versión, que solo se conoce cuando la versión ya cargó.
  await load();
  const created = route.query.created;
  if (created === '1' || created === '0') showNotice(created === '1');
});
watch(id, load);

function showNotice(created: boolean): void {
  const version = run.value?.version ?? detail.value?.run.version ?? '';
  notice.value = { type: created ? 'success' : 'info', text: t(created ? 'reporting.generate.created' : 'reporting.generate.unchanged', { version }) };
}

async function regenerate(): Promise<void> {
  if (!run.value) return;
  actionError.value = null;
  try {
    const result = await store.generate(run.value.annex, run.value.period);
    if (result.run.id !== run.value.id) {
      await router.replace({ name: 'reporting-annex-run', params: { id: result.run.id }, query: { created: '1' } });
      notice.value = { type: 'success', text: t('reporting.generate.created', { version: result.run.version }) };
    } else {
      notice.value = { type: 'info', text: t('reporting.generate.unchanged', { version: result.run.version }) };
    }
  } catch (err) {
    actionError.value = extractError(err);
  }
}

async function exportFile(format: 'csv' | 'xml'): Promise<void> {
  if (!run.value) return;
  actionError.value = null;
  try {
    const blob = await store.exportRun(run.value.id, format);
    downloadBlob(`${run.value.annex.toUpperCase()}_${run.value.period.replace('-', '')}_v${run.value.version}.${format}`, blob);
  } catch (err) {
    actionError.value = extractError(err);
  }
}

const showDocument = (documentId: string) => router.push({ name: 'reporting-documents', query: { id: documentId } });

const changeHeaders = computed(() => [
  { title: t('reporting.changes.figure'), key: 'key', sortable: false },
  { title: t('reporting.changes.previous'), key: 'previous', sortable: false, align: 'end' as const },
  { title: t('reporting.changes.current'), key: 'current', sortable: false, align: 'end' as const },
  { title: t('reporting.changes.delta'), key: 'delta', sortable: false, align: 'end' as const },
]);
</script>

<template>
  <v-container>
    <PageHeader :title="title" :subtitle="run ? $t('reporting.detail.subtitle', { version: run.version, date: formatDateTime(run.generatedAt, locale) }) : undefined">
      <template #actions>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" :to="{ name: 'reporting-annexes' }">{{ $t('reporting.detail.back') }}</v-btn>
        <v-btn v-if="run && canGenerate" variant="tonal" prepend-icon="mdi-refresh" :loading="store.saving" data-testid="regenerate-button" @click="regenerate">{{ $t('reporting.generate.again') }}</v-btn>
        <v-btn v-if="run && canExport" variant="tonal" prepend-icon="mdi-download-outline" data-testid="export-csv" @click="exportFile('csv')">{{ $t('reporting.export.csv') }}</v-btn>
        <v-btn v-if="run?.annex === 'ats' && canExport" variant="tonal" prepend-icon="mdi-file-xml-box" data-testid="export-xml" @click="exportFile('xml')">{{ $t('reporting.export.xml') }}</v-btn>
      </template>
    </PageHeader>
    <ReportingTabs />

    <v-alert v-if="store.error && !run" type="error" class="mb-4">{{ store.error }}</v-alert>
    <v-alert v-if="actionError" type="error" closable class="mb-4" data-testid="action-error">{{ actionError }}</v-alert>
    <v-alert v-if="notice" :type="notice.type" closable class="mb-4" data-testid="notice">{{ notice.text }}</v-alert>

    <template v-if="run && detail">
      <v-row class="mb-2">
        <v-col v-for="[key, value] in summary" :key="key" cols="12" sm="6" md="3">
          <v-card>
            <v-card-text>
              <div class="text-body-2 text-medium-emphasis">{{ metricLabel(key) }}</div>
              <div class="text-h6">{{ metricValue(key, key === 'saldoCents' ? Math.abs(value) : value) }}</div>
              <div v-if="key === 'saldoCents' && settlement" class="text-body-2">{{ $t(`reporting.result.${settlement.resultado}`) }}</div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12">
          <FindingsCard :findings="detail.findings" @show-document="showDocument" />
        </v-col>

        <v-col cols="12">
          <v-card>
            <v-card-title class="text-h6">
              {{ detail.previous ? $t('reporting.changes.title', { version: detail.previous.version }) : $t('reporting.summary.title') }}
            </v-card-title>
            <v-card-text>
              <p v-if="!detail.previous" class="text-body-2 text-medium-emphasis">{{ $t('reporting.changes.first') }}</p>
              <p v-else-if="detail.changes.length === 0" class="text-body-2 text-medium-emphasis">{{ $t('reporting.changes.none') }}</p>
              <v-data-table v-else :headers="changeHeaders" :items="detail.changes" :items-per-page="-1" hide-default-footer>
                <template #item.key="{ item }">{{ metricLabel(item.key) }}</template>
                <template #item.previous="{ item }">{{ metricValue(item.key, item.previous) }}</template>
                <template #item.current="{ item }">{{ metricValue(item.key, item.current) }}</template>
                <template #item.delta="{ item }">{{ item.delta > 0 ? '+' : '' }}{{ metricValue(item.key, item.delta) }}</template>
              </v-data-table>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12">
          <AnnexContent :annex="run.annex" :content="run.content" />
        </v-col>

        <v-col v-if="run.annex === 'f104'" cols="12">
          <ManualInputsCard :annex="run.annex" :period="run.period" :editable="canGenerate" />
        </v-col>

        <v-col cols="12">
          <ReconciliationCard :annex="run.annex" :period="run.period" />
        </v-col>
      </v-row>

      <p class="text-body-2 text-medium-emphasis mt-4">{{ $t('reporting.detail.hash') }}: {{ run.contentHash.slice(0, 16) }}…</p>
    </template>
  </v-container>
</template>
