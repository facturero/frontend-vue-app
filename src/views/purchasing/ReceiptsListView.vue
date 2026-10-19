<script setup lang="ts">
/**
 * Recepciones de mercadería: cada entrega registrada contra una orden, con lo que entró a la bodega y a qué costo. Son la prueba
 * física contra la que se concilian las facturas; la recepción no se edita (si hubo error, se corrige con un ajuste de inventario).
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { usePurchasingStore } from '@/stores/purchasing';
import { formatMoney } from '@/utils/accounting';
import type { GoodsReceipt } from '@/types/purchasing';
import PageHeader from '@/components/ui/PageHeader.vue';
import PurchasingTabs from '@/components/purchasing/PurchasingTabs.vue';

const { t, locale } = useI18n();
const router = useRouter();
const store = usePurchasingStore();

const search = ref('');
const supplierId = ref<string | null>(null);
const from = ref('');
const to = ref('');
const pages = computed(() => Math.max(1, Math.ceil(store.receiptsTotal / store.pageSize)));

const headers = computed(() => [
  { title: t('purchasing.receipts.number'), key: 'number', sortable: false, align: 'start' as const },
  { title: t('purchasing.receipts.date'), key: 'receiptDate', sortable: false, align: 'start' as const },
  { title: t('purchasing.receipts.supplier'), key: 'supplierId', sortable: false, align: 'start' as const },
  { title: t('purchasing.receipts.ref'), key: 'supplierDeliveryRef', sortable: false, align: 'start' as const },
  { title: t('purchasing.receipts.lines'), key: 'lineCount', sortable: false, align: 'end' as const },
]);
const supplierItems = computed(() => store.suppliers.map((s) => ({ value: s.id, title: s.legalName })));

function load(page = 1): Promise<void> {
  return store.fetchReceipts({
    q: search.value || undefined,
    supplierId: supplierId.value ?? undefined,
    from: from.value || undefined,
    to: to.value || undefined,
    page,
  });
}

let timer: ReturnType<typeof setTimeout> | null = null;
watch([search, supplierId, from, to], () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void load(1), 300);
});

onMounted(async () => {
  void store.fetchSuppliers();
  await load(1);
});

// El listado no trae el nombre del proveedor: se resuelve con la lista de proveedores ya cargada.
const supplierName = (receipt: GoodsReceipt) => store.suppliers.find((s) => s.id === receipt.supplierId)?.legalName ?? '—';

const detailDialog = ref(false);

async function open(receipt: GoodsReceipt): Promise<void> {
  detailDialog.value = true;
  await store.fetchReceipt(receipt.id);
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('purchasing.title')" :subtitle="$t('purchasing.receipts.intro')" />
    <PurchasingTabs />

    <v-alert v-if="store.error && !detailDialog" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-card>
      <v-card-text>
        <v-row class="mb-2">
          <v-col cols="12" sm="6" md="4">
            <v-text-field v-model="search" :label="$t('purchasing.receipts.search')" prepend-inner-icon="mdi-magnify" clearable />
          </v-col>
          <v-col cols="12" sm="6" md="4">
            <v-autocomplete v-model="supplierId" :items="supplierItems" :label="$t('purchasing.receipts.supplier')" clearable />
          </v-col>
          <v-col cols="6" sm="3" md="2">
            <v-text-field v-model="from" type="date" :label="$t('purchasing.orders.from')" />
          </v-col>
          <v-col cols="6" sm="3" md="2">
            <v-text-field v-model="to" type="date" :label="$t('purchasing.orders.to')" />
          </v-col>
        </v-row>

        <v-data-table
          :headers="headers"
          :items="store.receipts"
          :loading="store.loading"
          :items-per-page="-1"
          hide-default-footer
          @click:row="(_: Event, { item }: { item: GoodsReceipt }) => open(item)"
        >
          <template #item.supplierId="{ item }">{{ supplierName(item) }}</template>
          <template #item.supplierDeliveryRef="{ item }">{{ item.supplierDeliveryRef ?? '—' }}</template>
          <template #no-data>{{ $t('purchasing.receipts.empty') }}</template>
        </v-data-table>

        <div v-if="pages > 1" class="d-flex justify-center mt-4">
          <v-pagination :model-value="store.receiptsPage" :length="pages" density="comfortable" @update:model-value="load" />
        </div>
      </v-card-text>
    </v-card>

    <v-dialog v-model="detailDialog" max-width="720">
      <v-card>
        <v-card-title class="d-flex flex-wrap align-center ga-2">
          {{ $t('purchasing.receipts.detail') }}
          <v-spacer />
          <v-btn
            v-if="store.currentReceipt?.purchaseOrderId"
            variant="text"
            prepend-icon="mdi-clipboard-list-outline"
            @click="router.push({ name: 'purchasing-order', params: { id: store.currentReceipt!.purchaseOrderId! } })"
          >
            {{ $t('purchasing.bills.viewOrder') }}
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-progress-linear v-if="store.loading && !store.currentReceipt" indeterminate class="mb-4" />
          <template v-if="store.currentReceipt">
            <v-row class="mb-2">
              <v-col cols="12" sm="4">
                <div class="text-body-2 text-medium-emphasis">{{ $t('purchasing.receipts.number') }}</div>
                <div>{{ store.currentReceipt.number }}</div>
              </v-col>
              <v-col cols="6" sm="4">
                <div class="text-body-2 text-medium-emphasis">{{ $t('purchasing.receipts.date') }}</div>
                <div>{{ store.currentReceipt.receiptDate }}</div>
              </v-col>
              <v-col cols="6" sm="4">
                <div class="text-body-2 text-medium-emphasis">{{ $t('purchasing.receipts.ref') }}</div>
                <div>{{ store.currentReceipt.supplierDeliveryRef ?? '—' }}</div>
              </v-col>
              <v-col v-if="store.currentReceipt.notes" cols="12">
                <div class="text-body-2 text-medium-emphasis">{{ $t('common.notes') }}</div>
                <div>{{ store.currentReceipt.notes }}</div>
              </v-col>
            </v-row>

            <v-table>
              <thead>
                <tr>
                  <th class="text-end">{{ $t('invoices.quantity') }}</th>
                  <th class="text-end">{{ $t('purchasing.form.unitCost') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in store.currentReceipt.lines" :key="line.id">
                  <td class="text-end">{{ line.quantity }}</td>
                  <td class="text-end">{{ formatMoney(line.unitCostCents, locale, line.currencyCode) }}</td>
                </tr>
              </tbody>
            </v-table>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="detailDialog = false">{{ $t('purchasing.receipts.close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
