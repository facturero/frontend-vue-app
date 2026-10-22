<script setup lang="ts">
/**
 * Estado de cuenta de un proveedor: sus deudas, lo que se le ha pagado o retenido y lo que se le debe. `Neto` es lo que se le debe
 * (deuda − pagos − retenciones). Los anticipos a proveedores (pagos de más) van aparte: no entran en el neto porque en el libro mayor
 * viven en «anticipos a proveedores», no en proveedores.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTreasuryPayablesStore } from '@/stores/treasuryPayables';
import { purchasingApi } from '@/api/purchasing';
import { formatMoney } from '@/utils/accounting';
import { downloadBlob, reportLang } from '@/utils/treasury';
import { isPayableOverdue, PAYABLE_STATUS_COLOR, payableDaysOverdue } from '@/utils/treasury-payments';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';

const { t, locale } = useI18n();
const route = useRoute();
const auth = useAuthStore();
const store = useTreasuryPayablesStore();

const supplierId = computed(() => route.params.id as string);
const canPay = computed(() => auth.can('payment:create'));
const canExport = computed(() => auth.can('payable:export'));
const statement = computed(() => store.statement);
const supplierName = ref('');
const money = (cents: number, currency = 'USD') => formatMoney(cents, locale.value, currency);
const print = (): void => window.print();

async function exportCsv(): Promise<void> {
  const blob = await store.exportStatement(supplierId.value, reportLang(locale.value));
  if (blob) downloadBlob(`${t('treasury.payables.fileStatement')}-${statement.value?.asOf ?? ''}.csv`, blob);
}

onMounted(async () => {
  await store.fetchSupplier(supplierId.value);
  // El nombre sale de la deuda (copia del evento); sin deudas, del catálogo de proveedores (si la persona puede verlo).
  supplierName.value = statement.value?.payables[0]?.supplierName ?? '';
  if (!supplierName.value) {
    try {
      supplierName.value = (await purchasingApi.getSupplier(supplierId.value)).legalName;
    } catch {
      supplierName.value = '';
    }
  }
});

const applicationsOf = (payableId: string) => statement.value?.applications.filter((a) => a.payableId === payableId) ?? [];
const dueChip = (p: { status: 'open' | 'partial' | 'paid' | 'cancelled'; dueDate: string; balanceCents: number }) =>
  statement.value && isPayableOverdue(p, statement.value.asOf) ? payableDaysOverdue(p.dueDate, statement.value.asOf) : 0;

const headers = computed(() => [
  { title: t('treasury.payables.document'), key: 'documentNumber', sortable: false, align: 'start' as const },
  { title: t('treasury.payables.issueDate'), key: 'issueDate', sortable: false, align: 'start' as const },
  { title: t('treasury.payables.dueDate'), key: 'dueDate', sortable: false, align: 'start' as const },
  { title: t('treasury.payables.original'), key: 'originalCents', sortable: false, align: 'end' as const },
  { title: t('treasury.payables.balance'), key: 'balanceCents', sortable: false, align: 'end' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
]);
const advanceHeaders = computed(() => [
  { title: t('treasury.payables.document'), key: 'documentNumber', sortable: false, align: 'start' as const },
  { title: t('treasury.payables.original'), key: 'originalCents', sortable: false, align: 'end' as const },
  { title: t('treasury.payables.available'), key: 'balanceCents', sortable: false, align: 'end' as const },
]);
</script>

<template>
  <v-container>
    <PageHeader :title="supplierName || $t('treasury.title')" :subtitle="$t('treasury.payables.statementIntro')">
      <template #actions>
        <v-btn v-if="canPay" class="d-print-none" color="primary" prepend-icon="mdi-cash-minus" :to="{ name: 'treasury-payment-new', query: { supplierId } }">{{ $t('treasury.payments.new') }}</v-btn>
        <v-btn v-if="canExport" class="d-print-none" variant="tonal" prepend-icon="mdi-download-outline" :loading="store.loading" @click="exportCsv">{{ $t('treasury.export.csv') }}</v-btn>
        <v-btn class="d-print-none" variant="tonal" prepend-icon="mdi-printer-outline" @click="print">{{ $t('treasury.export.print') }}</v-btn>
      </template>
    </PageHeader>
    <div class="d-print-none"><TreasuryTabs /></div>

    <v-alert v-if="store.error" type="error" closable class="mb-4 d-print-none">{{ store.error }}</v-alert>

    <v-row v-if="statement" class="mb-2">
      <v-col cols="12" sm="4">
        <v-card>
          <v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payables.owed') }}</div>
            <div class="text-h6">{{ money(statement.payableCents) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card>
          <v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payables.advances') }}</div>
            <div class="text-h6">{{ money(statement.advanceCents) }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payables.advancesHint') }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card>
          <v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payables.net') }}</div>
            <div class="text-h6" :class="statement.netCents < 0 ? 'text-error' : undefined">{{ money(statement.netCents) }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payables.asOf', { date: statement.asOf }) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="mb-4">
      <v-card-title class="text-h6">{{ $t('treasury.payables.debts') }}</v-card-title>
      <v-card-text>
        <v-data-table :headers="headers" :items="statement?.payables ?? []" :loading="store.loading" :items-per-page="-1" hide-default-footer>
          <template #item.documentNumber="{ item }">
            {{ item.documentNumber ?? item.internalNumber ?? $t(`treasury.payables.source.${item.sourceType}`) }}
            <div v-for="a in applicationsOf(item.id)" :key="a.id" class="text-body-2 text-medium-emphasis">
              {{ $t(`treasury.payables.applied.${a.sourceType}`, { doc: a.documentNumber ?? '—', amount: money(a.appliedCents) }) }}
            </div>
          </template>
          <template #item.dueDate="{ item }">
            {{ item.dueDate }}
            <v-chip v-if="dueChip(item) > 0" color="lighterror" variant="flat" size="x-small" class="ml-2">{{ $t('treasury.payables.overdueDays', { n: dueChip(item) }) }}</v-chip>
          </template>
          <template #item.originalCents="{ item }">{{ money(item.originalCents, item.currencyCode) }}</template>
          <template #item.balanceCents="{ item }">
            <span :class="item.balanceCents < 0 ? 'text-error' : undefined">{{ money(item.balanceCents, item.currencyCode) }}</span>
          </template>
          <template #item.status="{ item }">
            <v-chip :color="PAYABLE_STATUS_COLOR[item.status]" variant="flat" size="small">{{ $t(`treasury.payables.status.${item.status}`) }}</v-chip>
          </template>
          <template #no-data>{{ $t('treasury.payables.statementEmpty') }}</template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-card v-if="statement && statement.advances.length > 0">
      <v-card-title class="text-h6">{{ $t('treasury.payables.advancesTitle') }}</v-card-title>
      <v-card-text>
        <v-data-table :headers="advanceHeaders" :items="statement.advances" :items-per-page="-1" hide-default-footer>
          <template #item.documentNumber="{ item }">{{ item.documentNumber ?? '—' }}</template>
          <template #item.originalCents="{ item }">{{ money(item.originalCents, item.currencyCode) }}</template>
          <template #item.balanceCents="{ item }">{{ money(item.balanceCents, item.currencyCode) }}</template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>
