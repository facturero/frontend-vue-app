<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useInventoryStore } from '@/stores/inventory';
import { useProductStore } from '@/stores/products';
import PageHeader from '@/components/ui/PageHeader.vue';
import AdjustStockDialog from '@/components/inventory/AdjustStockDialog.vue';
import type { StockPosition } from '@/types/inventory';

const { t, locale } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = useInventoryStore();
const products = useProductStore();

/**
 * La paginación es del SERVIDOR, no de la tabla.
 *
 * Antes esta vista pedía 100 filas y dejaba que la tabla paginara sobre ellas:
 * con más de 100 posiciones, el resto desaparecía sin que nada lo dijera. Ahora
 * `page` y `pageSize` viajan al API y la tabla declara `items-length` con el
 * total real.
 *
 * Consecuencia: no hay buscador de texto libre, porque `GET /stock` no tiene
 * parámetro de búsqueda y filtrar solo la página visible mentiría. En su lugar
 * se elige un producto, que sí es un filtro que el servidor entiende.
 */
const productFilter = ref<string | null>(null);
const warehouseFilter = ref<string | null>(null);
const stockStateFilter = ref<'with_stock' | 'without_stock' | null>(null);
const page = ref(1);
const pageSize = ref(25);

const adjustDialog = ref(false);
const adjustTarget = ref<StockPosition | null>(null);

const canAdjust = computed(() => auth.can('inventory:adjust'));
const canManage = computed(() => auth.can('inventory:manage'));

/** El stock viene por productId; el nombre vive en product-service. Se cruza en
 *  el cliente porque son dos servicios con base propia y no hay JOIN posible. */
const productById = computed(() => new Map(products.list.map((p) => [p.id, p])));

function productName(productId: string): string {
  return productById.value.get(productId)?.name ?? t('inventory.unknownProduct');
}

function productSku(productId: string): string {
  return productById.value.get(productId)?.sku ?? '—';
}

const productOptions = computed(() => [
  { title: t('inventory.allProducts'), value: null },
  ...products.list.map((p) => ({
    title: p.sku ? `${p.sku} — ${p.name}` : p.name,
    value: p.id,
  })),
]);

const warehouseOptions = computed(() => [
  { title: t('inventory.allWarehouses'), value: null },
  ...store.activeWarehouses.map((w) => ({ title: `${w.code} — ${w.name}`, value: w.id })),
]);

const stockStateOptions = computed(() => [
  { title: t('inventory.allStockStates'), value: null },
  { title: t('inventory.withStock'), value: 'with_stock' },
  { title: t('inventory.withoutStock'), value: 'without_stock' },
]);

const headers = computed(() => {
  const cols = [
    { title: 'SKU', key: 'sku', sortable: false, align: 'start' as const },
    { title: t('common.name'), key: 'product', sortable: false, align: 'start' as const },
  ];
  // Con una sola bodega la columna es ruido: todas las filas dirían lo mismo.
  if (!store.isSingleWarehouse) {
    cols.push({ title: t('inventory.warehouse'), key: 'warehouseCode', sortable: false, align: 'start' as const });
  }
  return [
    ...cols,
    { title: t('inventory.onHand'), key: 'quantityOnHand', sortable: false, align: 'end' as const },
    { title: t('inventory.available'), key: 'quantityAvailable', sortable: false, align: 'end' as const },
    { title: t('inventory.averageCost'), key: 'averageCost', sortable: false, align: 'end' as const },
    { title: t('common.actions'), key: 'actions', sortable: false, align: 'end' as const },
  ];
});

/** Las cantidades llegan como string decimal a propósito. Se recortan los ceros
 *  de relleno solo para mostrar; no se convierten a number en ningún momento. */
function formatQuantity(value: string): string {
  const trimmed = value.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
  return trimmed === '' ? '0' : trimmed;
}

function formatMoney(amount: string, currency: string): string {
  return Number(amount).toLocaleString(locale.value, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(locale.value, { dateStyle: 'medium' });
}

function isNegative(value: string): boolean {
  return value.trim().startsWith('-');
}

async function reload(): Promise<void> {
  await store.fetchStock({
    productId: productFilter.value ?? undefined,
    warehouseId: warehouseFilter.value ?? undefined,
    stockState: stockStateFilter.value ?? undefined,
    page: page.value,
    pageSize: pageSize.value,
  });
}

/** Cambiar un filtro vuelve a la primera página: quedarse en la 7 de un
 *  resultado que ahora tiene 2 muestra una tabla vacía sin explicación. */
async function applyFilters(): Promise<void> {
  page.value = 1;
  await reload();
}

async function onTableUpdate(options: { page: number; itemsPerPage: number }): Promise<void> {
  page.value = options.page;
  pageSize.value = options.itemsPerPage;
  await reload();
}

function openAdjust(position: StockPosition): void {
  adjustTarget.value = position;
  adjustDialog.value = true;
}

function viewKardex(position: StockPosition): void {
  router.push({ name: 'inventory-kardex', params: { productId: position.productId } });
}

async function onAdjusted(): Promise<void> {
  adjustDialog.value = false;
  await reload();
}

onMounted(async () => {
  await Promise.all([store.fetchWarehouses(), products.fetch()]);
  await reload();
});
</script>

<template>
  <v-container>
    <PageHeader :title="$t('inventory.title')" :subtitle="$t('inventory.intro')">
      <template #actions>
        <v-btn
          v-if="canManage && !store.isSingleWarehouse"
          variant="text"
          prepend-icon="mdi-warehouse"
          :to="{ name: 'inventory-warehouses' }"
        >
          {{ $t('inventory.warehouses') }}
        </v-btn>
      </template>
    </PageHeader>

    <!--
      Aviso de hueco. No es decorativo: mientras esté visible, las cifras de
      abajo llevan sin actualizarse desde que alguien apagó el módulo, y creer
      en ellas es peor que no tenerlas. Desaparece solo cuando se carga el
      conteo físico (ajuste con motivo "conteo físico"), sin botón de descartar.
    -->
    <v-alert
      v-if="store.staleWarning"
      type="warning"
      class="mb-4"
      :title="$t('inventory.stale.title')"
      data-testid="inventory-stale-warning"
    >
      <p class="mb-2">
        {{
          $t('inventory.stale.body', {
            from: formatDate(store.staleWarning.startedAt),
            to: formatDate(store.staleWarning.endedAt),
            count: store.staleWarning.skippedMovements,
          })
        }}
      </p>
      <p class="mb-0 text-body-2">{{ $t('inventory.stale.action') }}</p>
    </v-alert>

    <v-alert v-if="store.error" type="error" closable class="mb-4" @click:close="store.error = null">
      {{ store.error }}
    </v-alert>

    <v-card class="mb-4">
      <v-card-text>
        <v-row dense align="end">
          <v-col cols="12" sm="5">
            <v-autocomplete
              v-model="productFilter"
              :items="productOptions"
              :label="$t('inventory.productFilter')"
              :hint="$t('inventory.productFilterHint')"
              persistent-hint
              clearable
              prepend-inner-icon="mdi-magnify"
              data-testid="inventory-product-filter"
              @update:model-value="applyFilters"
            />
          </v-col>
          <v-col v-if="!store.isSingleWarehouse" cols="6" sm="3">
            <v-select
              v-model="warehouseFilter"
              :items="warehouseOptions"
              :label="$t('inventory.warehouse')"
              hide-details
              clearable
              @update:model-value="applyFilters"
            />
          </v-col>
          <v-col cols="6" sm="3">
            <v-select
              v-model="stockStateFilter"
              :items="stockStateOptions"
              :label="$t('inventory.stockState')"
              hide-details
              clearable
              data-testid="inventory-stock-state-filter"
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
        :items="store.positions"
        :items-length="store.total"
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
        <template #item.sku="{ item }">
          <span class="text-caption font-weight-medium">{{ productSku(item.productId) }}</span>
        </template>

        <template #item.product="{ item }">
          {{ productName(item.productId) }}
        </template>

        <template #item.quantityOnHand="{ item }">
          <!-- Una posición negativa significa que se facturó sin existencias.
               No se oculta ni se recorta a cero: es una incidencia a revisar. -->
          <span :class="isNegative(item.quantityOnHand) ? 'text-error font-weight-bold' : ''">
            {{ formatQuantity(item.quantityOnHand) }}
          </span>
        </template>

        <template #item.quantityAvailable="{ item }">
          {{ formatQuantity(item.quantityAvailable) }}
        </template>

        <template #item.averageCost="{ item }">
          {{ formatMoney(item.averageCost, item.currencyCode) }}
        </template>

        <template #item.actions="{ item }">
          <v-btn
            size="small"
            variant="text"
            icon="mdi-clipboard-text-clock-outline"
            :title="$t('inventory.kardex')"
            @click="viewKardex(item)"
          />
          <v-btn
            v-if="canAdjust"
            size="small"
            variant="text"
            icon="mdi-tune"
            :title="$t('inventory.adjust')"
            @click="openAdjust(item)"
          />
        </template>

        <template #no-data>
          <div class="text-center text-medium-emphasis pa-6">
            {{ $t('inventory.empty') }}
          </div>
        </template>
      </v-data-table-server>
    </v-card>

    <AdjustStockDialog
      v-model="adjustDialog"
      :position="adjustTarget"
      :product-name="adjustTarget ? productName(adjustTarget.productId) : ''"
      @adjusted="onAdjusted"
    />
  </v-container>
</template>
