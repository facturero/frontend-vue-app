<script setup lang="ts">
/**
 * Órdenes de compra: el compromiso con el proveedor. Aquí se ven, se filtran y se abren; quien tiene `purchase:approve` fija
 * además desde qué monto una orden pide la aprobación de OTRA persona (separación de funciones).
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useInventoryStore } from '@/stores/inventory';
import { usePurchasingStore } from '@/stores/purchasing';
import { formatMoney } from '@/utils/accounting';
import { fromCents, toCents } from '@/utils/taxDocuments';
import { ORDER_STATUS_COLOR } from '@/utils/purchasing';
import { ORDER_STATUSES, type OrderStatus, type PurchaseOrder } from '@/types/purchasing';
import PageHeader from '@/components/ui/PageHeader.vue';
import PurchasingTabs from '@/components/purchasing/PurchasingTabs.vue';

const { t, locale } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = usePurchasingStore();
const inventory = useInventoryStore();

const canCreate = computed(() => auth.can('purchase:create'));
const canConfigure = computed(() => auth.can('purchase:approve'));

const search = ref('');
const status = ref<OrderStatus | null>(null);
const supplierId = ref<string | null>(null);
const from = ref('');
const to = ref('');
const pages = computed(() => Math.max(1, Math.ceil(store.ordersTotal / store.pageSize)));

const headers = computed(() => [
  { title: t('purchasing.orders.number'), key: 'number', sortable: false, align: 'start' as const },
  { title: t('common.date'), key: 'orderDate', sortable: false, align: 'start' as const },
  { title: t('purchasing.orders.supplier'), key: 'supplier', sortable: false, align: 'start' as const },
  { title: t('purchasing.orders.lines'), key: 'lineCount', sortable: false, align: 'end' as const },
  { title: t('invoices.total'), key: 'totalCents', sortable: false, align: 'end' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
]);
const statusItems = computed(() => ORDER_STATUSES.map((value) => ({ value, title: t(`purchasing.status.${value}`) })));
const supplierItems = computed(() => store.suppliers.map((s) => ({ value: s.id, title: s.legalName })));

function load(page = 1): Promise<void> {
  return store.fetchOrders({
    q: search.value || undefined,
    status: status.value ?? undefined,
    supplierId: supplierId.value ?? undefined,
    from: from.value || undefined,
    to: to.value || undefined,
    page,
  });
}

let timer: ReturnType<typeof setTimeout> | null = null;
watch([search, status, supplierId, from, to], () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void load(1), 300);
});

onMounted(async () => {
  void store.fetchSuppliers();
  await load(1);
});

const open = (order: PurchaseOrder) => router.push({ name: 'purchasing-order', params: { id: order.id } });

// ── Política de aprobación ──────────────────────────────────────────────────
const settingsDialog = ref(false);
const settingsError = ref<string | null>(null);
const requireApproval = ref(false);
const threshold = ref('0.00');
const defaultWarehouseId = ref<string | null>(null);

async function openSettings(): Promise<void> {
  settingsError.value = null;
  await Promise.all([store.fetchSettings(), inventory.fetchWarehouses()]);
  const s = store.settings;
  requireApproval.value = s?.approvalThresholdCents != null;
  threshold.value = fromCents(s?.approvalThresholdCents ?? 0);
  defaultWarehouseId.value = s?.defaultWarehouseId ?? null;
  settingsDialog.value = true;
}

const thresholdCents = computed(() => toCents(threshold.value.replace(',', '.')));
const settingsValid = computed(() => !requireApproval.value || thresholdCents.value !== null);

async function saveSettings(): Promise<void> {
  if (!settingsValid.value) return;
  settingsError.value = null;
  try {
    await store.saveSettings({
      approvalThresholdCents: requireApproval.value ? thresholdCents.value : null,
      defaultWarehouseId: defaultWarehouseId.value,
    });
    settingsDialog.value = false;
  } catch {
    settingsError.value = store.error;
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('purchasing.title')" :subtitle="$t('purchasing.orders.intro')">
      <template #actions>
        <v-btn v-if="canConfigure" variant="tonal" prepend-icon="mdi-shield-check-outline" @click="openSettings">
          {{ $t('purchasing.settings.title') }}
        </v-btn>
        <v-btn v-if="canCreate" color="primary" prepend-icon="mdi-plus" @click="router.push({ name: 'purchasing-order-new' })">
          {{ $t('purchasing.orders.new') }}
        </v-btn>
      </template>
    </PageHeader>
    <PurchasingTabs />

    <v-alert v-if="store.error && !settingsDialog" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-card>
      <v-card-text>
        <v-row class="mb-2">
          <v-col cols="12" sm="6" md="3">
            <v-text-field v-model="search" :label="$t('purchasing.orders.search')" prepend-inner-icon="mdi-magnify" clearable />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select v-model="status" :items="statusItems" :label="$t('common.status')" clearable />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-autocomplete v-model="supplierId" :items="supplierItems" :label="$t('purchasing.orders.supplier')" clearable />
          </v-col>
          <v-col cols="6" sm="3" md="1">
            <v-text-field v-model="from" type="date" :label="$t('purchasing.orders.from')" />
          </v-col>
          <v-col cols="6" sm="3" md="2">
            <v-text-field v-model="to" type="date" :label="$t('purchasing.orders.to')" />
          </v-col>
        </v-row>

        <v-data-table
          :headers="headers"
          :items="store.orders"
          :loading="store.loading"
          :items-per-page="-1"
          hide-default-footer
          @click:row="(_: Event, { item }: { item: PurchaseOrder }) => open(item)"
        >
          <template #item.number="{ item }">
            {{ item.number ?? $t('purchasing.orders.draft') }}
          </template>
          <template #item.supplier="{ item }">
            {{ item.supplier.legalName }}
            <div class="text-body-2 text-medium-emphasis">{{ item.supplier.identification }}</div>
          </template>
          <template #item.totalCents="{ item }">{{ formatMoney(item.totalCents, locale, item.currencyCode) }}</template>
          <template #item.status="{ item }">
            <v-chip :color="ORDER_STATUS_COLOR[item.status]" variant="flat" size="small">{{ $t(`purchasing.status.${item.status}`) }}</v-chip>
          </template>
          <template #no-data>{{ $t('purchasing.orders.empty') }}</template>
        </v-data-table>

        <div v-if="pages > 1" class="d-flex justify-center mt-4">
          <v-pagination :model-value="store.ordersPage" :length="pages" density="comfortable" @update:model-value="load" />
        </div>
      </v-card-text>
    </v-card>

    <v-dialog v-model="settingsDialog" max-width="560">
      <v-card>
        <v-card-title>{{ $t('purchasing.settings.title') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="settingsError" type="error" class="mb-4">{{ settingsError }}</v-alert>
          <p class="text-body-2 text-medium-emphasis mb-4">{{ $t('purchasing.settings.intro') }}</p>
          <v-switch v-model="requireApproval" :label="$t('purchasing.settings.require')" color="primary" />
          <v-text-field
            v-if="requireApproval"
            v-model="threshold"
            :label="$t('purchasing.settings.threshold')"
            :hint="$t('purchasing.settings.thresholdHint')"
            persistent-hint
            inputmode="decimal"
            class="mb-4"
          />
          <v-select
            v-model="defaultWarehouseId"
            :items="inventory.activeWarehouses.map((w) => ({ value: w.id, title: w.name }))"
            :label="$t('purchasing.settings.defaultWarehouse')"
            clearable
          />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="settingsDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" :disabled="!settingsValid" @click="saveSettings">{{ $t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
