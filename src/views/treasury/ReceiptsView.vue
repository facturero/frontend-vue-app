<script setup lang="ts">
/**
 * Cobros a clientes. Un cobro nace en borrador (no toca saldos ni gasta número) y al contabilizarse recibe su `RC-AAAA-NNNNNN`, baja
 * lo que el cliente debe y genera su asiento. Anularlo es un permiso aparte: quien cobra no anula lo suyo sin que quede rastro.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTreasuryStore } from '@/stores/treasury';
import { formatMoney } from '@/utils/accounting';
import { RECEIPT_STATUS_COLOR } from '@/utils/treasury';
import { RECEIPT_STATUSES, type Receipt, type ReceiptStatus } from '@/types/treasury';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';

const { t, locale } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = useTreasuryStore();

const canCreate = computed(() => auth.can('receipt:create'));
const search = ref('');
const status = ref<ReceiptStatus | null>(null);
const from = ref('');
const to = ref('');
const pages = computed(() => Math.max(1, Math.ceil(store.receiptsTotal / store.pageSize)));

const headers = computed(() => [
  { title: t('treasury.receipts.number'), key: 'number', sortable: false, align: 'start' as const },
  { title: t('treasury.receipts.date'), key: 'receiptDate', sortable: false, align: 'start' as const },
  { title: t('treasury.receipts.customer'), key: 'customerName', sortable: false, align: 'start' as const },
  { title: t('treasury.receipts.method'), key: 'method', sortable: false, align: 'start' as const },
  { title: t('treasury.receipts.received'), key: 'totalCents', sortable: false, align: 'end' as const },
  { title: t('treasury.receipts.applied'), key: 'appliedCents', sortable: false, align: 'end' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
]);
const statusItems = computed(() => RECEIPT_STATUSES.map((value) => ({ value, title: t(`treasury.receipts.status.${value}`) })));

function load(page = 1): Promise<void> {
  return store.fetchReceipts({
    q: search.value || undefined,
    status: status.value ? [status.value] : undefined,
    from: from.value || undefined,
    to: to.value || undefined,
    page,
  });
}

let timer: ReturnType<typeof setTimeout> | null = null;
watch([search, status, from, to], () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void load(1), 300);
});
onMounted(() => void load(1));

const open = (receipt: Receipt) => router.push({ name: 'treasury-receipt', params: { id: receipt.id } });
const money = (cents: number, currency = 'USD') => formatMoney(cents, locale.value, currency);
</script>

<template>
  <v-container>
    <PageHeader :title="$t('treasury.title')" :subtitle="$t('treasury.receipts.intro')">
      <template #actions>
        <v-btn v-if="canCreate" color="primary" prepend-icon="mdi-plus" :to="{ name: 'treasury-receipt-new' }">{{ $t('treasury.receipts.new') }}</v-btn>
      </template>
    </PageHeader>
    <TreasuryTabs />

    <v-alert v-if="store.error" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-card>
      <v-card-text>
        <v-row class="mb-2">
          <v-col cols="12" sm="6" md="4">
            <v-text-field v-model="search" :label="$t('treasury.receipts.search')" prepend-inner-icon="mdi-magnify" clearable />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select v-model="status" :items="statusItems" :label="$t('common.status')" clearable />
          </v-col>
          <v-col cols="6" md="2">
            <v-text-field v-model="from" type="date" :label="$t('treasury.receipts.from')" />
          </v-col>
          <v-col cols="6" md="2">
            <v-text-field v-model="to" type="date" :label="$t('treasury.receipts.to')" />
          </v-col>
        </v-row>

        <v-data-table
          :headers="headers"
          :items="store.receipts"
          :loading="store.loading"
          :items-per-page="-1"
          hide-default-footer
          @click:row="(_: Event, { item }: { item: Receipt }) => open(item)"
        >
          <template #item.number="{ item }">{{ item.number ?? $t('treasury.receipts.draft') }}</template>
          <template #item.customerName="{ item }">
            {{ item.customerName }}
            <div v-if="item.customerIdentification" class="text-body-2 text-medium-emphasis">{{ item.customerIdentification }}</div>
          </template>
          <template #item.method="{ item }">
            {{ $t(`treasury.receipts.methods.${item.method}`) }}
            <div v-if="item.reference" class="text-body-2 text-medium-emphasis">{{ item.reference }}</div>
          </template>
          <template #item.totalCents="{ item }">{{ money(item.totalCents, item.currencyCode) }}</template>
          <template #item.appliedCents="{ item }">
            {{ money(item.appliedCents, item.currencyCode) }}
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.lines', { n: item.lineCount }) }}</div>
          </template>
          <template #item.status="{ item }">
            <v-chip :color="RECEIPT_STATUS_COLOR[item.status]" variant="flat" size="small">{{ $t(`treasury.receipts.status.${item.status}`) }}</v-chip>
          </template>
          <template #no-data>{{ $t('treasury.receipts.empty') }}</template>
        </v-data-table>

        <div v-if="pages > 1" class="d-flex justify-center mt-4">
          <v-pagination :model-value="store.receiptsPage" :length="pages" density="comfortable" @update:model-value="load" />
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>
