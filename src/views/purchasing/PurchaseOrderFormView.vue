<script setup lang="ts">
/**
 * Alta y edición de una orden de compra en BORRADOR. Una orden enviada no se edita (es un compromiso con el proveedor): si hay que
 * cambiarla se cancela y se hace otra, o —si fue rechazada— se reabre como borrador.
 *
 * Los importes se muestran con la misma regla que el servidor (cantidad hasta 6 decimales, costo en centavos, IVA por línea, un
 * solo redondeo por línea); el servidor los recalcula y manda.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { productApi } from '@/api/products';
import { useInventoryStore } from '@/stores/inventory';
import { useProductStore } from '@/stores/products';
import { usePurchasingStore } from '@/stores/purchasing';
import { formatMoney } from '@/utils/accounting';
import { lineAmounts, sumAmounts } from '@/utils/purchasing';
import { fromCents, toCents, todayIso } from '@/utils/taxDocuments';
import type { OrderInput } from '@/types/purchasing';
import type { ProductSummary } from '@/types/products';
import PageHeader from '@/components/ui/PageHeader.vue';
import PurchasingTabs from '@/components/purchasing/PurchasingTabs.vue';

const { locale } = useI18n();
const route = useRoute();
const router = useRouter();
const store = usePurchasingStore();
const inventory = useInventoryStore();
const productStore = useProductStore();

const orderId = computed(() => (route.params.id as string | undefined) ?? null);
const loadError = ref<string | null>(null);
const formError = ref<string | null>(null);

interface LineRow {
  key: number;
  productId: string | null;
  description: string;
  quantity: string;
  unitCost: string;
  discount: string;
  taxRateId: string | null;
}

let nextKey = 1;
const emptyLine = (): LineRow => ({ key: nextKey++, productId: null, description: '', quantity: '1', unitCost: '', discount: '0', taxRateId: null });

const supplierId = ref<string | null>(null);
const warehouseId = ref<string | null>(null);
const orderDate = ref(todayIso());
const expectedDate = ref('');
const paymentTermDays = ref('0');
const notes = ref('');
const lines = ref<LineRow[]>([emptyLine()]);

// ── Catálogos ───────────────────────────────────────────────────────────────
const supplierItems = computed(() => store.suppliers.filter((s) => s.status === 'active').map((s) => ({ value: s.id, title: `${s.legalName} · ${s.identification}` })));
const warehouseItems = computed(() => inventory.activeWarehouses.map((w) => ({ value: w.id, title: w.name })));
const vatRates = computed(() => productStore.taxRates.filter((r) => r.kind === 'vat'));
/** «Sin IVA» no puede ser `null` en el selector (Vuetify lo toma como «nada elegido»): se usa un valor propio y se traduce al guardar. */
const NO_TAX = '__none__';
const vatItems = computed(() => [
  ...vatRates.value.map((r) => ({ value: r.id, title: r.name ?? `${r.code} (${Number(r.percentage)}%)` })),
  { value: NO_TAX, title: '—' },
]);
// tax-service entrega el porcentaje como número (15) o como texto («15.00»): se normaliza a texto.
const percentOf = (taxRateId: string | null): string => String(vatRates.value.find((r) => r.id === taxRateId)?.percentage ?? '0.00');

// Búsqueda de productos en el servidor: un catálogo grande no cabe en una lista.
const productCache = ref(new Map<string, ProductSummary>());
const productOptions = ref<Array<{ value: string; title: string }>>([]);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function rememberProducts(items: ProductSummary[]): void {
  for (const p of items) productCache.value.set(p.id, p);
  productOptions.value = [...productCache.value.values()].map((p) => ({ value: p.id, title: p.sku ? `${p.name} · ${p.sku}` : p.name }));
}

function searchProducts(text: string | null): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    try {
      const page = await productApi.list({ search: text?.trim() || undefined, status: 'active', pageSize: 20 });
      rememberProducts(page.items);
    } catch {
      /* el selector sigue con lo que ya tenía */
    }
  }, 250);
}

function onProductChange(row: LineRow, productId: string | null): void {
  row.productId = productId;
  const product = productId ? productCache.value.get(productId) : undefined;
  if (!product) return;
  row.description = product.name;
  // El IVA que el producto trae asignado; la persona lo puede cambiar.
  const vat = product.taxes?.find((t) => t.kind === 'vat');
  row.taxRateId = vat?.taxRateId ?? null;
}

// ── Importes ────────────────────────────────────────────────────────────────
const rowAmounts = (row: LineRow) =>
  lineAmounts({
    quantity: row.quantity,
    unitCostCents: toCents(row.unitCost.replace(',', '.')),
    discountCents: toCents((row.discount || '0').replace(',', '.')) ?? -1,
    taxPercent: percentOf(row.taxRateId),
  });
const totals = computed(() => sumAmounts(lines.value.map(rowAmounts)));
const money = (cents: number) => formatMoney(cents, locale.value);

const rowValid = (row: LineRow) => row.productId !== null && row.description.trim() !== '' && rowAmounts(row) !== null;
const days = computed(() => Number(paymentTermDays.value));
const canSave = computed(
  () => supplierId.value !== null && warehouseId.value !== null && lines.value.length > 0 && lines.value.every(rowValid)
    && Number.isInteger(days.value) && days.value >= 0 && days.value <= 365
    && (expectedDate.value === '' || expectedDate.value >= orderDate.value),
);

function buildInput(): OrderInput {
  return {
    supplierId: supplierId.value!,
    warehouseId: warehouseId.value!,
    orderDate: orderDate.value,
    expectedDate: expectedDate.value || null,
    paymentTermDays: days.value,
    notes: notes.value.trim() || null,
    lines: lines.value.map((r) => ({
      productId: r.productId!,
      description: r.description.trim(),
      quantity: r.quantity.trim().replace(',', '.'),
      unitCostCents: toCents(r.unitCost.replace(',', '.'))!,
      discountCents: toCents((r.discount || '0').replace(',', '.')) ?? 0,
      // Siempre explícito: lo que se ve en pantalla es lo que se guarda (sin «el IVA del producto» por defecto).
      taxRateId: r.taxRateId,
    })),
  };
}

async function save(andSubmit: boolean): Promise<void> {
  if (!canSave.value) return;
  formError.value = null;
  try {
    const order = await store.saveOrder(orderId.value, buildInput());
    if (andSubmit) await store.transition('submit', order.id);
    await router.push({ name: 'purchasing-order', params: { id: order.id } });
  } catch {
    formError.value = store.error;
  }
}

// El proveedor propone sus días de crédito (se pueden cambiar en la orden).
function onSupplierChange(id: string | null): void {
  supplierId.value = id;
  const supplier = store.suppliers.find((s) => s.id === id);
  if (supplier && !orderId.value) paymentTermDays.value = String(supplier.paymentTermDays);
}

onMounted(async () => {
  store.error = null;
  await Promise.all([store.fetchSuppliers({ status: 'active' }), inventory.fetchWarehouses(), productStore.fetchCatalog(), store.fetchSettings()]);
  searchProducts(null);
  if (!orderId.value) {
    warehouseId.value = store.settings?.defaultWarehouseId ?? inventory.defaultWarehouse?.id ?? null;
    return;
  }
  await store.fetchOrder(orderId.value);
  const order = store.current;
  if (!order) {
    loadError.value = store.error;
    return;
  }
  if (order.status !== 'draft') {
    loadError.value = 'purchasing.form.onlyDraft';
    return;
  }
  supplierId.value = order.supplierId;
  warehouseId.value = order.warehouseId;
  orderDate.value = order.orderDate;
  expectedDate.value = order.expectedDate ?? '';
  paymentTermDays.value = String(order.paymentTermDays);
  notes.value = order.notes ?? '';
  lines.value = (order.lines ?? []).map((l) => ({
    key: nextKey++,
    productId: l.productId,
    description: l.description,
    quantity: l.quantity,
    unitCost: fromCents(l.unitCostCents),
    discount: fromCents(l.discountCents),
    taxRateId: l.taxRateId,
  }));
  // Los productos de la orden deben poder mostrarse aunque no salgan en la búsqueda inicial.
  productOptions.value = [
    ...productOptions.value,
    ...(order.lines ?? []).filter((l) => !productOptions.value.some((o) => o.value === l.productId)).map((l) => ({ value: l.productId, title: l.description })),
  ];
});
</script>

<template>
  <v-container>
    <PageHeader :title="$t('purchasing.title')" :subtitle="$t(orderId ? 'purchasing.form.editIntro' : 'purchasing.form.newIntro')" />
    <PurchasingTabs />

    <v-alert v-if="loadError" type="error" class="mb-4">{{ loadError.startsWith('purchasing.') ? $t(loadError) : loadError }}</v-alert>
    <v-alert v-if="formError" type="error" closable class="mb-4" @click:close="formError = null">{{ formError }}</v-alert>

    <v-form v-if="!loadError" @submit.prevent="save(false)">
      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('purchasing.form.header') }}</v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="6">
              <v-autocomplete :model-value="supplierId" :items="supplierItems" :label="$t('purchasing.orders.supplier')" @update:model-value="onSupplierChange" />
            </v-col>
            <v-col cols="12" md="6">
              <v-select v-model="warehouseId" :items="warehouseItems" :label="$t('purchasing.form.warehouse')" />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field v-model="orderDate" type="date" :label="$t('purchasing.form.orderDate')" />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field v-model="expectedDate" type="date" :min="orderDate" :label="$t('purchasing.form.expectedDate')" />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field v-model="paymentTermDays" inputmode="numeric" :label="$t('purchasing.suppliers.creditDays')" :hint="$t('purchasing.suppliers.creditDaysHint')" persistent-hint />
            </v-col>
            <v-col cols="12">
              <v-textarea v-model="notes" :label="$t('common.notes')" rows="2" auto-grow maxlength="1000" />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('purchasing.orders.lines') }}</v-card-title>
        <v-card-text>
          <v-sheet v-for="(row, i) in lines" :key="row.key" color="grey100" rounded="lg" class="pa-4 mb-4">
            <v-row class="align-start">
              <v-col cols="12" md="5">
                <v-autocomplete
                  :model-value="row.productId"
                  :items="productOptions"
                  :label="$t('products.singular')"
                  no-filter
                  @update:search="searchProducts"
                  @update:model-value="onProductChange(row, $event)"
                />
              </v-col>
              <v-col cols="12" md="7">
                <v-text-field v-model="row.description" :label="$t('common.description')" maxlength="300" />
              </v-col>
              <v-col cols="6" md="2">
                <v-text-field v-model="row.quantity" :label="$t('invoices.quantity')" inputmode="decimal" />
              </v-col>
              <v-col cols="6" md="3">
                <v-text-field v-model="row.unitCost" :label="$t('purchasing.form.unitCost')" inputmode="decimal" />
              </v-col>
              <v-col cols="6" md="2">
                <v-text-field v-model="row.discount" :label="$t('invoices.discount')" inputmode="decimal" />
              </v-col>
              <v-col cols="6" md="3">
                <v-select
                  :model-value="row.taxRateId ?? NO_TAX"
                  :items="vatItems"
                  :label="$t('purchasing.form.vat')"
                  @update:model-value="row.taxRateId = $event === NO_TAX ? null : $event"
                />
              </v-col>
              <v-col cols="12" md="2" class="d-flex align-center justify-space-between ga-2">
                <span class="text-body-2">{{ rowAmounts(row) ? money(rowAmounts(row)!.totalCents) : '—' }}</span>
                <v-btn icon="mdi-close" variant="text" :aria-label="$t('common.delete')" :disabled="lines.length === 1" @click="lines.splice(i, 1)" />
              </v-col>
            </v-row>
          </v-sheet>
          <v-btn variant="text" color="primary" prepend-icon="mdi-plus" :disabled="lines.length >= 200" @click="lines.push(emptyLine())">
            {{ $t('purchasing.form.addLine') }}
          </v-btn>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-text class="d-flex flex-column align-end ga-2">
          <div>{{ $t('invoices.subtotal') }}: {{ money(totals.subtotalCents) }}</div>
          <div>{{ $t('invoices.taxTotal') }}: {{ money(totals.taxCents) }}</div>
          <div class="text-h6">{{ $t('invoices.total') }}: {{ money(totals.totalCents) }}</div>
        </v-card-text>
      </v-card>

      <div class="d-flex justify-end flex-wrap ga-2">
        <v-btn variant="text" @click="router.push(orderId ? { name: 'purchasing-order', params: { id: orderId } } : { name: 'purchasing-orders' })">{{ $t('common.cancel') }}</v-btn>
        <v-btn variant="tonal" :loading="store.saving" :disabled="!canSave" @click="save(false)">{{ $t('purchasing.form.saveDraft') }}</v-btn>
        <v-btn color="primary" :loading="store.saving" :disabled="!canSave" @click="save(true)">{{ $t('purchasing.form.saveAndSubmit') }}</v-btn>
      </div>
    </v-form>
  </v-container>
</template>
