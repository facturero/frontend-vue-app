<script setup lang="ts">
/**
 * Kardex de un producto: el historial completo e inmutable de sus movimientos.
 *
 * Es la fuente de verdad del stock y del costo, no la bitácora de auditoría.
 * Cada fila muestra su naturaleza contable porque es el dato del que saldrán
 * los asientos cuando exista el libro mayor, y porque distinguir una merma de
 * un consumo interno solo es posible aquí.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useInventoryStore } from '@/stores/inventory';
import { useProductStore } from '@/stores/products';
import PageHeader from '@/components/ui/PageHeader.vue';
import type { AccountingNature, MovementType } from '@/types/inventory';

const props = defineProps<{ productId: string }>();

const { t, locale } = useI18n();
const store = useInventoryStore();
const products = useProductStore();

const warehouseFilter = ref<string | null>(null);
const typeFilter = ref<MovementType | null>(null);
// Paginacion del servidor, igual que en la lista de stock: un kardex de meses
// no cabe en una peticion y truncarlo en silencio esconde movimientos.
const page = ref(1);
const pageSize = ref(25);

const product = computed(() => products.list.find((p) => p.id === props.productId) ?? null);
const productLabel = computed(() => product.value?.name ?? t('inventory.unknownProduct'));

const warehouseOptions = computed(() => [
  { title: t('inventory.allWarehouses'), value: null },
  ...store.activeWarehouses.map((w) => ({ title: `${w.code} — ${w.name}`, value: w.id })),
]);

const typeOptions = computed(() => [
  { title: t('inventory.allTypes'), value: null },
  ...(
    [
      'purchase_in',
      'sale_out',
      'adjustment_in',
      'adjustment_out',
      'transfer_in',
      'transfer_out',
      'opening_balance',
    ] as MovementType[]
  ).map((type) => ({ title: t(`inventory.movement.${type}`), value: type })),
]);

const headers = computed(() => [
  { title: t('common.date'), key: 'createdAt', sortable: false, align: 'start' as const },
  { title: t('common.type'), key: 'type', sortable: false, align: 'start' as const },
  { title: t('inventory.warehouse'), key: 'warehouseId', sortable: false, align: 'start' as const },
  { title: t('inventory.quantity'), key: 'quantity', sortable: false, align: 'end' as const },
  { title: t('inventory.totalCost'), key: 'totalCost', sortable: false, align: 'end' as const },
  { title: t('inventory.accountingNature'), key: 'accountingNature', sortable: false, align: 'start' as const },
  { title: t('inventory.reference'), key: 'reference', sortable: false, align: 'start' as const },
]);

/** Los tipos que restan existencias. El backend guarda la cantidad siempre en
 *  positivo y deja que el tipo indique el signo lógico; aquí se pinta. */
const OUTGOING: MovementType[] = ['sale_out', 'adjustment_out', 'transfer_out'];

function isOutgoing(type: MovementType): boolean {
  return OUTGOING.includes(type);
}

function natureColor(nature: AccountingNature): string {
  switch (nature) {
    case 'inventory_in':
    case 'inventory_gain':
      return 'lightsuccess';
    case 'cogs':
      return 'lightinfo';
    case 'expense':
    case 'shrinkage':
      return 'lightwarning';
    default:
      return 'lightinfo';
  }
}

function formatQuantity(value: string, type: MovementType): string {
  const trimmed = value.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
  return `${isOutgoing(type) ? '−' : '+'}${trimmed === '' ? '0' : trimmed}`;
}

function formatMoney(amount: string | null, currency: string): string {
  if (amount === null) return '—';
  return Number(amount).toLocaleString(locale.value, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(locale.value, { dateStyle: 'short', timeStyle: 'short' });
}

function warehouseCode(id: string): string {
  return store.warehouses.find((w) => w.id === id)?.code ?? '—';
}

async function reload(): Promise<void> {
  await store.fetchMovements({
    productId: props.productId,
    warehouseId: warehouseFilter.value ?? undefined,
    type: typeFilter.value ?? undefined,
    page: page.value,
    pageSize: pageSize.value,
  });
}

/** Cambiar un filtro vuelve a la primera pagina. */
async function applyFilters(): Promise<void> {
  page.value = 1;
  await reload();
}

async function onTableUpdate(options: { page: number; itemsPerPage: number }): Promise<void> {
  page.value = options.page;
  pageSize.value = options.itemsPerPage;
  await reload();
}

watch(() => props.productId, applyFilters);

onMounted(async () => {
  await Promise.all([store.fetchWarehouses(), products.fetch()]);
  await Promise.all([reload(), store.fetchProductStock(props.productId)]);
});
</script>

<template>
  <v-container>
    <PageHeader :title="$t('inventory.kardex')" :subtitle="productLabel">
      <template #actions>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" :to="{ name: 'inventory-stock' }">
          {{ $t('common.back') }}
        </v-btn>
      </template>
    </PageHeader>

    <v-alert v-if="store.error" type="error" closable class="mb-4" @click:close="store.error = null">
      {{ store.error }}
    </v-alert>

    <v-row v-if="store.productStock" class="mb-2" dense>
      <v-col cols="12" sm="4">
        <v-card variant="tonal" color="lightprimary">
          <v-card-text>
            <div class="text-caption">{{ $t('inventory.onHand') }}</div>
            <div class="text-h6">{{ store.productStock.totalOnHand }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card variant="tonal" color="lightprimary">
          <v-card-text>
            <div class="text-caption">{{ $t('inventory.available') }}</div>
            <div class="text-h6">{{ store.productStock.totalAvailable }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card variant="tonal" color="lightprimary">
          <v-card-text>
            <div class="text-caption">{{ $t('inventory.warehousesWithStock') }}</div>
            <div class="text-h6">{{ store.productStock.positions.length }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="mb-4">
      <v-card-text>
        <v-row dense align="end">
          <v-col v-if="!store.isSingleWarehouse" cols="6" sm="4">
            <v-select
              v-model="warehouseFilter"
              :items="warehouseOptions"
              :label="$t('inventory.warehouse')"
              hide-details
              clearable
              @update:model-value="applyFilters"
            />
          </v-col>
          <v-col cols="6" sm="4">
            <v-select
              v-model="typeFilter"
              :items="typeOptions"
              :label="$t('common.type')"
              hide-details
              clearable
              @update:model-value="applyFilters"
            />
          </v-col>
          <v-col cols="12" sm="1">
            <v-btn variant="text" icon="mdi-refresh" :loading="store.loading" @click="reload" />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card>
      <v-data-table-server
        :headers="headers"
        :items="store.movements"
        :items-length="store.movementsTotal"
        :loading="store.loading"
        :page="page"
        :items-per-page="pageSize"
        item-value="id"
        :items-per-page-options="[
          { title: '10', value: 10 },
          { title: '25', value: 25 },
          { title: '50', value: 50 },
        ]"
        @update:options="onTableUpdate"
      >
        <template #item.createdAt="{ item }">
          <span class="text-caption">{{ formatDateTime(item.createdAt) }}</span>
        </template>

        <template #item.type="{ item }">
          {{ $t(`inventory.movement.${item.type}`) }}
        </template>

        <template #item.warehouseId="{ item }">
          {{ warehouseCode(item.warehouseId) }}
        </template>

        <template #item.quantity="{ item }">
          <span :class="isOutgoing(item.type) ? 'text-error' : 'text-success'">
            {{ formatQuantity(item.quantity, item.type) }}
          </span>
        </template>

        <template #item.totalCost="{ item }">
          {{ formatMoney(item.totalCost, item.currencyCode) }}
        </template>

        <template #item.accountingNature="{ item }">
          <v-chip size="x-small" variant="flat" :color="natureColor(item.accountingNature)">
            {{ $t(`inventory.nature.${item.accountingNature}`) }}
          </v-chip>
          <div v-if="item.reasonCode" class="text-caption text-medium-emphasis mt-1">
            {{ $t(`inventory.reason.${item.reasonCode}`) }}
          </div>
        </template>

        <template #item.reference="{ item }">
          <span v-if="item.referenceType" class="text-caption">
            {{ $t(`inventory.referenceType.${item.referenceType}`) }}
          </span>
          <span v-else class="text-medium-emphasis">—</span>
          <div v-if="item.notes" class="text-caption text-medium-emphasis">{{ item.notes }}</div>
        </template>

        <template #no-data>
          <div class="text-center text-medium-emphasis pa-6">
            {{ $t('inventory.noMovements') }}
          </div>
        </template>
      </v-data-table-server>
    </v-card>
  </v-container>
</template>
