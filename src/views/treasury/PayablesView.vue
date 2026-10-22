<script setup lang="ts">
/**
 * Cuentas por pagar: lo que la empresa le debe a sus proveedores. Cada deuda nace sola de una factura de compra contabilizada (con el
 * vencimiento que trae la factura) o de un saldo inicial; la reducen los pagos y las retenciones. El saldo y lo vencido los calcula el
 * servidor: aquí solo se muestran y se filtran. Arriba, la antigüedad: lo que hay que pagar pronto y lo que ya está vencido.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTreasuryPayablesStore } from '@/stores/treasuryPayables';
import { formatMoney } from '@/utils/accounting';
import { downloadBlob, reportLang } from '@/utils/treasury';
import { isPayableOverdue, PAYABLE_STATUS_COLOR, PAYABLES_AGING_BUCKETS, payableDaysOverdue } from '@/utils/treasury-payments';
import { PAYABLE_STATUSES, type Payable, type PayableStatus } from '@/types/treasury';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';

const { t, locale } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = useTreasuryPayablesStore();

const canExport = computed(() => auth.can('payable:export'));
const canPay = computed(() => auth.can('payment:create'));
const search = ref('');
const status = ref<PayableStatus | null>(null);
const overdueOnly = ref(false);
const dueSoon = ref(false);
const from = ref('');
const to = ref('');
const pages = computed(() => Math.max(1, Math.ceil(store.total / store.pageSize)));
const aging = computed(() => store.aging);

const headers = computed(() => [
  { title: t('treasury.payables.supplier'), key: 'supplierName', sortable: false, align: 'start' as const },
  { title: t('treasury.payables.document'), key: 'documentNumber', sortable: false, align: 'start' as const },
  { title: t('treasury.payables.dueDate'), key: 'dueDate', sortable: false, align: 'start' as const },
  { title: t('treasury.payables.original'), key: 'originalCents', sortable: false, align: 'end' as const },
  { title: t('treasury.payables.balance'), key: 'balanceCents', sortable: false, align: 'end' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
]);
const statusItems = computed(() => PAYABLE_STATUSES.map((value) => ({ value, title: t(`treasury.payables.status.${value}`) })));

function filters() {
  return {
    q: search.value || undefined,
    status: status.value ? [status.value] : undefined,
    overdueOnly: overdueOnly.value || undefined,
    dueSoon: dueSoon.value || undefined,
    from: from.value || undefined,
    to: to.value || undefined,
  };
}
const load = (page = 1) => store.fetchPayables({ ...filters(), page });

let timer: ReturnType<typeof setTimeout> | null = null;
watch([search, status, overdueOnly, dueSoon, from, to], () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void load(1), 300);
});
onMounted(() => {
  void load(1);
  void store.fetchAging();
});

/** Exporta lo que se está viendo: los MISMOS filtros que la lista, pero todas las filas. El servidor deja constancia en la bitácora. */
async function exportCsv(): Promise<void> {
  const blob = await store.exportPayables(filters(), reportLang(locale.value));
  if (blob) downloadBlob(`${t('treasury.payables.fileName')}-${store.asOf ?? ''}.csv`, blob);
}
async function exportAgingCsv(): Promise<void> {
  const blob = await store.exportAging(reportLang(locale.value));
  if (blob) downloadBlob(`${t('treasury.payables.fileAging')}-${aging.value?.asOf ?? ''}.csv`, blob);
}

const openSupplier = (item: Payable) => router.push({ name: 'treasury-supplier-statement', params: { id: item.supplierId } });
const money = (cents: number, currency = 'USD') => formatMoney(cents, locale.value, currency);
const overdueDays = (item: Payable) => (store.asOf && isPayableOverdue(item, store.asOf) ? payableDaysOverdue(item.dueDate, store.asOf) : 0);
const sourceLabel = (item: Payable) => item.documentNumber ?? item.internalNumber ?? t(`treasury.payables.source.${item.sourceType}`);
</script>

<template>
  <v-container>
    <PageHeader :title="$t('treasury.title')" :subtitle="$t('treasury.payables.intro')">
      <template #actions>
        <v-btn v-if="canPay" color="primary" prepend-icon="mdi-cash-minus" :to="{ name: 'treasury-payment-new' }">{{ $t('treasury.payments.new') }}</v-btn>
        <v-btn v-if="canExport" variant="tonal" prepend-icon="mdi-download-outline" :loading="store.loading" @click="exportCsv">{{ $t('treasury.export.csv') }}</v-btn>
      </template>
    </PageHeader>
    <TreasuryTabs />

    <v-alert v-if="store.error" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-row v-if="aging" class="mb-2">
      <v-col v-for="bucket in PAYABLES_AGING_BUCKETS" :key="bucket.key" cols="6" sm="4" md="2">
        <v-card>
          <v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t(bucket.labelKey) }}</div>
            <div class="text-h6">{{ money(aging.totals[bucket.key]) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
    <div v-if="aging && canExport" class="d-flex justify-end mb-4">
      <v-btn variant="text" size="small" prepend-icon="mdi-download-outline" @click="exportAgingCsv">{{ $t('treasury.payables.exportAging') }}</v-btn>
    </div>

    <v-card>
      <v-card-text>
        <v-row class="mb-2">
          <v-col cols="12" sm="6" md="4">
            <v-text-field v-model="search" :label="$t('treasury.payables.search')" prepend-inner-icon="mdi-magnify" clearable />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select v-model="status" :items="statusItems" :label="$t('common.status')" clearable />
          </v-col>
          <v-col cols="6" md="2">
            <v-text-field v-model="from" type="date" :label="$t('treasury.payables.from')" />
          </v-col>
          <v-col cols="6" md="2">
            <v-text-field v-model="to" type="date" :label="$t('treasury.payables.to')" />
          </v-col>
          <v-col cols="12" class="d-flex flex-wrap ga-4">
            <v-checkbox v-model="overdueOnly" :label="$t('treasury.payables.overdueOnly')" hide-details density="comfortable" />
            <v-checkbox v-model="dueSoon" :label="$t('treasury.payables.dueSoonOnly')" hide-details density="comfortable" />
          </v-col>
        </v-row>

        <v-data-table :headers="headers" :items="store.payables" :loading="store.loading" :items-per-page="-1" hide-default-footer @click:row="(_: Event, { item }: { item: Payable }) => openSupplier(item)">
          <template #item.supplierName="{ item }">
            {{ item.supplierName }}
            <div v-if="item.supplierIdentification" class="text-body-2 text-medium-emphasis">{{ item.supplierIdentification }}</div>
          </template>
          <template #item.documentNumber="{ item }">
            {{ sourceLabel(item) }}
            <div v-if="item.internalNumber && item.documentNumber" class="text-body-2 text-medium-emphasis">{{ item.internalNumber }}</div>
          </template>
          <template #item.dueDate="{ item }">
            {{ item.dueDate }}
            <v-chip v-if="overdueDays(item) > 0" color="lighterror" variant="flat" size="x-small" class="ml-2">{{ $t('treasury.payables.overdueDays', { n: overdueDays(item) }) }}</v-chip>
          </template>
          <template #item.originalCents="{ item }">{{ money(item.originalCents, item.currencyCode) }}</template>
          <template #item.balanceCents="{ item }">{{ money(item.balanceCents, item.currencyCode) }}</template>
          <template #item.status="{ item }">
            <v-chip :color="PAYABLE_STATUS_COLOR[item.status]" variant="flat" size="small">{{ $t(`treasury.payables.status.${item.status}`) }}</v-chip>
          </template>
          <template #no-data>{{ $t('treasury.payables.empty') }}</template>
        </v-data-table>

        <div v-if="pages > 1" class="d-flex justify-center mt-4">
          <v-pagination :model-value="store.page" :length="pages" density="comfortable" @update:model-value="load" />
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>
