<script setup lang="ts">
/**
 * Cartera: lo que cada cliente le debe a la empresa. Una partida nace sola de una factura a crédito (o de una nota de débito), la
 * reducen las notas de crédito y se cierra si la factura se anula; las ventas del POS y las cobradas al contado no entran. El saldo y
 * lo vencido los calcula el servidor: aquí solo se muestran y se filtran.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useTreasuryStore } from '@/stores/treasury';
import { formatMoney } from '@/utils/accounting';
import { daysOverdue, isOverdue, RECEIVABLE_STATUS_COLOR } from '@/utils/treasury';
import { RECEIVABLE_STATUSES, type Receivable, type ReceivableStatus } from '@/types/treasury';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';

const { t, locale } = useI18n();
const router = useRouter();
const store = useTreasuryStore();

const search = ref('');
const status = ref<ReceivableStatus | null>(null);
const overdueOnly = ref(false);
const from = ref('');
const to = ref('');
const pages = computed(() => Math.max(1, Math.ceil(store.total / store.pageSize)));

const headers = computed(() => [
  { title: t('treasury.receivables.customer'), key: 'customerName', sortable: false, align: 'start' as const },
  { title: t('treasury.receivables.document'), key: 'documentNumber', sortable: false, align: 'start' as const },
  { title: t('treasury.receivables.issueDate'), key: 'issueDate', sortable: false, align: 'start' as const },
  { title: t('treasury.receivables.dueDate'), key: 'dueDate', sortable: false, align: 'start' as const },
  { title: t('treasury.receivables.original'), key: 'originalCents', sortable: false, align: 'end' as const },
  { title: t('treasury.receivables.balance'), key: 'balanceCents', sortable: false, align: 'end' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
]);
const statusItems = computed(() => RECEIVABLE_STATUSES.map((value) => ({ value, title: t(`treasury.receivables.status.${value}`) })));

function load(page = 1): Promise<void> {
  return store.fetchReceivables({
    q: search.value || undefined,
    status: status.value ? [status.value] : undefined,
    overdueOnly: overdueOnly.value || undefined,
    from: from.value || undefined,
    to: to.value || undefined,
    page,
  });
}

let timer: ReturnType<typeof setTimeout> | null = null;
watch([search, status, overdueOnly, from, to], () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void load(1), 300);
});
onMounted(() => void load(1));

const openCustomer = (item: Receivable) => router.push({ name: 'treasury-customer-statement', params: { id: item.customerId } });
/** Días de atraso de una partida viva, o 0 si no está vencida. La fecha de corte es la del servidor. */
const overdueDays = (item: Receivable) => (store.asOf && isOverdue(item, store.asOf) ? daysOverdue(item.dueDate, store.asOf) : 0);
const sourceLabel = (item: Receivable) => (item.documentNumber ? item.documentNumber : t(`treasury.receivables.source.${item.sourceType}`));
</script>

<template>
  <v-container>
    <PageHeader :title="$t('treasury.title')" :subtitle="$t('treasury.receivables.intro')" />
    <TreasuryTabs />

    <v-alert v-if="store.error" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-card>
      <v-card-text>
        <v-row class="mb-2">
          <v-col cols="12" sm="6" md="4">
            <v-text-field v-model="search" :label="$t('treasury.receivables.search')" prepend-inner-icon="mdi-magnify" clearable />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-select v-model="status" :items="statusItems" :label="$t('common.status')" clearable />
          </v-col>
          <v-col cols="6" sm="3" md="2">
            <v-text-field v-model="from" type="date" :label="$t('treasury.receivables.from')" />
          </v-col>
          <v-col cols="6" sm="3" md="2">
            <v-text-field v-model="to" type="date" :label="$t('treasury.receivables.to')" />
          </v-col>
          <v-col cols="12" md="2" class="d-flex align-center">
            <v-switch v-model="overdueOnly" :label="$t('treasury.receivables.overdueOnly')" color="primary" />
          </v-col>
        </v-row>

        <v-data-table
          :headers="headers"
          :items="store.receivables"
          :loading="store.loading"
          :items-per-page="-1"
          hide-default-footer
          @click:row="(_: Event, { item }: { item: Receivable }) => openCustomer(item)"
        >
          <template #item.customerName="{ item }">
            {{ item.customerName }}
            <div v-if="item.customerIdentification" class="text-body-2 text-medium-emphasis">{{ item.customerIdentification }}</div>
          </template>
          <template #item.documentNumber="{ item }">
            {{ sourceLabel(item) }}
            <div v-if="item.documentNumber && item.sourceType !== 'invoice'" class="text-body-2 text-medium-emphasis">{{ $t(`treasury.receivables.source.${item.sourceType}`) }}</div>
          </template>
          <template #item.dueDate="{ item }">
            {{ item.dueDate }}
            <v-chip v-if="overdueDays(item) > 0" color="lighterror" variant="flat" size="x-small" class="ml-2">
              {{ $t('treasury.receivables.overdueDays', { n: overdueDays(item) }) }}
            </v-chip>
          </template>
          <template #item.originalCents="{ item }">{{ formatMoney(item.originalCents, locale, item.currencyCode) }}</template>
          <template #item.balanceCents="{ item }">
            <span :class="item.balanceCents < 0 ? 'text-error' : undefined">{{ formatMoney(item.balanceCents, locale, item.currencyCode) }}</span>
            <div v-if="item.appliedCents > 0" class="text-body-2 text-medium-emphasis">{{ $t('treasury.receivables.applied', { amount: formatMoney(item.appliedCents, locale, item.currencyCode) }) }}</div>
          </template>
          <template #item.status="{ item }">
            <v-chip :color="RECEIVABLE_STATUS_COLOR[item.status]" variant="flat" size="small">{{ $t(`treasury.receivables.status.${item.status}`) }}</v-chip>
          </template>
          <template #no-data>{{ $t('treasury.receivables.empty') }}</template>
        </v-data-table>

        <div v-if="pages > 1" class="d-flex justify-center mt-4">
          <v-pagination :model-value="store.page" :length="pages" density="comfortable" @update:model-value="load" />
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>
