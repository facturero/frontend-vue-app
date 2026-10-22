<script setup lang="ts">
/**
 * Flujo de caja proyectado: parte del saldo del registro de bancos y suma lo que se espera COBRAR (la cartera, por su vencimiento) y resta lo
 * que se espera PAGAR (las deudas con proveedores, por el suyo), semana a semana. Lo que ya venció cae en la primera columna: se espera
 * cobrar o pagar ya, no en una fecha pasada. Es una proyección con las fechas de vencimiento, no un pronóstico: un cliente que paga tarde
 * mueve su cobro, y por eso lo vencido se muestra aparte. Solo lectura: no toca la contabilidad.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useTreasuryBankingStore } from '@/stores/treasuryBanking';
import { formatMoney } from '@/utils/accounting';
import { downloadBlob, reportLang } from '@/utils/treasury';
import { cashFlowBucketLabel, cashFlowClosingColor } from '@/utils/treasury-banking';
import type { CashFlowBucket } from '@/types/treasury';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';

const { t, locale } = useI18n();
const auth = useAuthStore();
const store = useTreasuryBankingStore();

const canExport = computed(() => auth.can('bank_account:read'));
const weeks = ref(13);
const weekItems = [4, 8, 13, 26].map((value) => ({ value, title: t('treasury.cashFlow.weeksOption', { n: value }) }));
const flow = computed(() => store.cashFlow);
const money = (cents: number) => formatMoney(cents, locale.value);

onMounted(() => void store.fetchCashFlow(weeks.value));
watch(weeks, (value) => void store.fetchCashFlow(value));

function label(bucket: CashFlowBucket): string {
  const l = cashFlowBucketLabel(bucket);
  return l.n === undefined ? t(l.key) : t(l.key, { n: l.n });
}
function period(bucket: CashFlowBucket): string {
  if (bucket.key === 'overdue') return t('treasury.cashFlow.before', { date: flow.value?.asOf ?? '' });
  if (bucket.from && bucket.to) return `${bucket.from} → ${bucket.to}`;
  return bucket.from ? t('treasury.cashFlow.from', { date: bucket.from }) : '';
}
const negativeLabel = computed(() => {
  const key = flow.value?.firstNegativeKey;
  const bucket = key ? flow.value?.buckets.find((b) => b.key === key) : null;
  return bucket ? label(bucket) : null;
});

async function exportCsv(): Promise<void> {
  const blob = await store.exportCashFlow(weeks.value, reportLang(locale.value));
  if (blob) downloadBlob(`${t('treasury.cashFlow.fileName')}-${flow.value?.asOf ?? ''}.csv`, blob);
}

const headers = computed(() => [
  { title: t('treasury.cashFlow.period'), key: 'period', sortable: false, align: 'start' as const },
  { title: t('treasury.cashFlow.inflow'), key: 'inflowCents', sortable: false, align: 'end' as const },
  { title: t('treasury.cashFlow.outflow'), key: 'outflowCents', sortable: false, align: 'end' as const },
  { title: t('treasury.cashFlow.net'), key: 'netCents', sortable: false, align: 'end' as const },
  { title: t('treasury.cashFlow.closing'), key: 'closingCents', sortable: false, align: 'end' as const },
]);
</script>

<template>
  <v-container>
    <PageHeader :title="$t('treasury.title')" :subtitle="$t('treasury.cashFlow.intro')">
      <template #actions>
        <v-btn v-if="canExport" variant="tonal" prepend-icon="mdi-download-outline" :loading="store.loading" @click="exportCsv">{{ $t('treasury.export.csv') }}</v-btn>
      </template>
    </PageHeader>
    <TreasuryTabs />

    <v-alert v-if="store.error" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-row class="mb-2">
      <v-col cols="12" sm="4" md="3">
        <v-select v-model="weeks" :items="weekItems" :label="$t('treasury.cashFlow.horizon')" />
      </v-col>
    </v-row>

    <template v-if="flow">
      <v-alert v-if="negativeLabel" type="warning" class="mb-4">{{ $t('treasury.cashFlow.goesNegative', { when: negativeLabel }) }}</v-alert>

      <v-row class="mb-2">
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.cashFlow.opening') }}</div>
            <div class="text-h6">{{ money(flow.openingCents) }}</div>
            <div v-for="a in flow.accounts" :key="a.id" class="text-body-2 text-medium-emphasis">{{ a.name }}: {{ money(a.balanceCents) }}</div>
            <div v-if="flow.unassignedCents !== 0" class="text-body-2 text-medium-emphasis">{{ $t('treasury.cashFlow.unassigned') }}: {{ money(flow.unassignedCents) }}</div>
          </v-card-text></v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.cashFlow.inflow') }}</div>
            <div class="text-h6 text-success">{{ money(flow.totals.inflowCents) }}</div>
            <div v-if="flow.totals.overdueInflowCents > 0" class="text-body-2 text-medium-emphasis">{{ $t('treasury.cashFlow.ofWhichOverdue', { amount: money(flow.totals.overdueInflowCents) }) }}</div>
          </v-card-text></v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.cashFlow.outflow') }}</div>
            <div class="text-h6 text-error">{{ money(flow.totals.outflowCents) }}</div>
            <div v-if="flow.totals.overdueOutflowCents > 0" class="text-body-2 text-medium-emphasis">{{ $t('treasury.cashFlow.ofWhichOverdue', { amount: money(flow.totals.overdueOutflowCents) }) }}</div>
          </v-card-text></v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card :color="flow.totals.endingCents < 0 ? 'lighterror' : undefined" :variant="flow.totals.endingCents < 0 ? 'flat' : 'elevated'"><v-card-text>
            <div class="text-body-2" :class="{ 'text-medium-emphasis': flow.totals.endingCents >= 0 }">{{ $t('treasury.cashFlow.ending') }}</div>
            <div class="text-h6">{{ money(flow.totals.endingCents) }}</div>
          </v-card-text></v-card>
        </v-col>
      </v-row>

      <v-card>
        <v-card-text>
          <v-data-table :headers="headers" :items="flow.buckets" :items-per-page="-1" hide-default-footer>
            <template #item.period="{ item }">
              <div class="font-weight-medium">{{ label(item) }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ period(item) }}</div>
            </template>
            <template #item.inflowCents="{ item }"><span class="text-success">{{ item.inflowCents > 0 ? money(item.inflowCents) : '—' }}</span></template>
            <template #item.outflowCents="{ item }"><span class="text-error">{{ item.outflowCents > 0 ? money(item.outflowCents) : '—' }}</span></template>
            <template #item.netCents="{ item }">{{ money(item.netCents) }}</template>
            <template #item.closingCents="{ item }">
              <v-chip :color="cashFlowClosingColor(item.closingCents) === 'error' ? 'lighterror' : undefined" variant="flat" size="small">{{ money(item.closingCents) }}</v-chip>
            </template>
          </v-data-table>
          <div class="text-body-2 text-medium-emphasis mt-3">{{ $t('treasury.cashFlow.note') }}</div>
        </v-card-text>
      </v-card>
    </template>
  </v-container>
</template>
