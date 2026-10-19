<script setup lang="ts">
/**
 * Facturas de compra: lo que facturó el proveedor contra lo pedido y lo recibido. Aquí se ven y se filtran por estado y por
 * resultado de la conciliación; el detalle abre la conciliación a tres vías. Registrar una factura pide `purchase_bill:create`.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { usePurchasingStore } from '@/stores/purchasing';
import { formatMoney } from '@/utils/accounting';
import { BILL_STATUS_COLOR, MATCH_STATUS_COLOR } from '@/utils/purchasing';
import { BILL_STATUSES, MATCH_STATUSES, type BillStatus, type MatchStatus, type PurchaseBill } from '@/types/purchasing';
import PageHeader from '@/components/ui/PageHeader.vue';
import PurchasingTabs from '@/components/purchasing/PurchasingTabs.vue';

const { t, locale } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = usePurchasingStore();

const canCreate = computed(() => auth.can('purchase_bill:create'));

const search = ref('');
const status = ref<BillStatus | null>(null);
const matchStatus = ref<MatchStatus | null>(null);
const supplierId = ref<string | null>(null);
const from = ref('');
const to = ref('');
const pages = computed(() => Math.max(1, Math.ceil(store.billsTotal / store.pageSize)));

const headers = computed(() => [
  { title: t('purchasing.bills.number'), key: 'internalNumber', sortable: false, align: 'start' as const },
  { title: t('purchasing.bills.supplierDocument'), key: 'document', sortable: false, align: 'start' as const },
  { title: t('purchasing.orders.supplier'), key: 'supplier', sortable: false, align: 'start' as const },
  { title: t('common.date'), key: 'issueDate', sortable: false, align: 'start' as const },
  { title: t('invoices.total'), key: 'totalCents', sortable: false, align: 'end' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
  { title: t('purchasing.bills.matchLabel'), key: 'matchStatus', sortable: false, align: 'start' as const },
]);
const statusItems = computed(() => BILL_STATUSES.map((value) => ({ value, title: t(`purchasing.bills.status.${value}`) })));
const matchItems = computed(() => MATCH_STATUSES.map((value) => ({ value, title: t(`purchasing.bills.match.${value}`) })));
const supplierItems = computed(() => store.suppliers.map((s) => ({ value: s.id, title: s.legalName })));

function load(page = 1): Promise<void> {
  return store.fetchBills({
    q: search.value || undefined,
    status: status.value ?? undefined,
    matchStatus: matchStatus.value ?? undefined,
    supplierId: supplierId.value ?? undefined,
    from: from.value || undefined,
    to: to.value || undefined,
    page,
  });
}

let timer: ReturnType<typeof setTimeout> | null = null;
watch([search, status, matchStatus, supplierId, from, to], () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void load(1), 300);
});

onMounted(async () => {
  void store.fetchSuppliers();
  await load(1);
});

const open = (bill: PurchaseBill) => router.push({ name: 'purchasing-bill', params: { id: bill.id } });
/** El documento del proveedor, tal como quedó partido en la base. */
const document = (bill: PurchaseBill) => `${bill.establishment}-${bill.emissionPoint}-${bill.sequential}`;
</script>

<template>
  <v-container>
    <PageHeader :title="$t('purchasing.title')" :subtitle="$t('purchasing.bills.intro')">
      <template #actions>
        <v-btn v-if="canCreate" color="primary" prepend-icon="mdi-plus" @click="router.push({ name: 'purchasing-bill-new' })">
          {{ $t('purchasing.bills.new') }}
        </v-btn>
      </template>
    </PageHeader>
    <PurchasingTabs />

    <v-alert v-if="store.error" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-card>
      <v-card-text>
        <v-row class="mb-2">
          <v-col cols="12" sm="6" md="3">
            <v-text-field v-model="search" :label="$t('purchasing.bills.search')" prepend-inner-icon="mdi-magnify" clearable />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-select v-model="status" :items="statusItems" :label="$t('common.status')" clearable />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-select v-model="matchStatus" :items="matchItems" :label="$t('purchasing.bills.matchLabel')" clearable />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-autocomplete v-model="supplierId" :items="supplierItems" :label="$t('purchasing.orders.supplier')" clearable />
          </v-col>
          <v-col cols="6" sm="3" md="1">
            <v-text-field v-model="from" type="date" :label="$t('purchasing.orders.from')" />
          </v-col>
          <v-col cols="6" sm="3" md="1">
            <v-text-field v-model="to" type="date" :label="$t('purchasing.orders.to')" />
          </v-col>
        </v-row>

        <v-data-table
          :headers="headers"
          :items="store.bills"
          :loading="store.loading"
          :items-per-page="-1"
          hide-default-footer
          @click:row="(_: Event, { item }: { item: PurchaseBill }) => open(item)"
        >
          <template #item.internalNumber="{ item }">
            {{ item.internalNumber ?? $t('purchasing.bills.draft') }}
          </template>
          <template #item.document="{ item }">{{ document(item) }}</template>
          <template #item.supplier="{ item }">
            {{ item.supplier?.legalName ?? '—' }}
            <div v-if="item.supplier" class="text-body-2 text-medium-emphasis">{{ item.supplier.identification }}</div>
          </template>
          <template #item.totalCents="{ item }">{{ formatMoney(item.totalCents, locale, item.currencyCode) }}</template>
          <template #item.status="{ item }">
            <v-chip :color="BILL_STATUS_COLOR[item.status]" variant="flat" size="small">{{ $t(`purchasing.bills.status.${item.status}`) }}</v-chip>
          </template>
          <template #item.matchStatus="{ item }">
            <v-chip :color="MATCH_STATUS_COLOR[item.matchStatus]" variant="flat" size="small">{{ $t(`purchasing.bills.match.${item.matchStatus}`) }}</v-chip>
          </template>
          <template #no-data>{{ $t('purchasing.bills.empty') }}</template>
        </v-data-table>

        <div v-if="pages > 1" class="d-flex justify-center mt-4">
          <v-pagination :model-value="store.billsPage" :length="pages" density="comfortable" @update:model-value="load" />
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>
