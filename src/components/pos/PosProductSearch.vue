<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { productApi } from '@/api/products';
import { usePosMoney } from '@/composable/usePosMoney';
import { usePosStore } from '@/stores/pos';
import type { ProductSummary } from '@/types/products';

/**
 * Búsqueda de productos de la caja. El lector de código de barras «escribe» el código y pulsa Enter: si ese código es el SKU de un
 * producto (o es el único resultado), se agrega solo y el campo queda listo para el siguiente. Solo se ofrecen productos activos
 * del establecimiento con el que se factura.
 */
const emit = defineEmits<{ add: [product: ProductSummary] }>();

const pos = usePosStore();
const { money } = usePosMoney();

const search = ref('');
const items = ref<ProductSummary[]>([]);
const loading = ref(false);
const failed = ref(false);
const field = ref<{ focus: () => void } | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;
let sequence = 0;

/** Consulta el catálogo. Las respuestas que llegan tarde (de una búsqueda ya superada) se descartan. */
async function load(): Promise<ProductSummary[]> {
  const mine = ++sequence;
  loading.value = true;
  failed.value = false;
  try {
    const page = await productApi.list({
      search: search.value.trim() || undefined,
      status: 'active',
      establishmentId: pos.point?.establishmentId,
      pageSize: 24,
    });
    if (mine === sequence) items.value = page.items;
    return page.items;
  } catch {
    if (mine === sequence) failed.value = true;
    return [];
  } finally {
    if (mine === sequence) loading.value = false;
  }
}

watch(search, () => {
  clearTimeout(timer);
  timer = setTimeout(load, 250);
});
watch(() => pos.point?.establishmentId, load);
onMounted(load);
onBeforeUnmount(() => clearTimeout(timer));

function pick(product: ProductSummary): void {
  if (product.priceCents <= 0) return;
  emit('add', product);
  search.value = '';
  void nextTick(() => field.value?.focus());
}

async function onEnter(): Promise<void> {
  clearTimeout(timer);
  const text = search.value.trim().toLowerCase();
  if (!text) return;
  const found = await load();
  const exact = found.find((p) => p.sku?.toLowerCase() === text);
  const target = exact ?? (found.length === 1 ? found[0] : undefined);
  if (target) pick(target);
}
</script>

<template>
  <div>
    <v-text-field
      ref="field"
      v-model="search"
      :label="$t('pos.search.label')"
      :placeholder="$t('pos.search.placeholder')"
      prepend-inner-icon="mdi-magnify"
      clearable
      autofocus
      autocomplete="off"
      class="mb-4"
      @keyup.enter="onEnter"
    />
    <v-progress-linear v-if="loading" indeterminate class="mb-2" />

    <v-alert v-if="failed" type="error" class="mb-4">{{ $t('pos.search.error') }}</v-alert>
    <p v-else-if="!loading && items.length === 0" class="text-body-2 text-medium-emphasis text-center pa-6">
      {{ $t('pos.search.empty') }}
    </p>

    <v-row dense>
      <v-col v-for="p in items" :key="p.id" cols="6" sm="4" xl="3">
        <v-card hover :disabled="p.priceCents <= 0" class="h-100" @click="pick(p)">
          <v-card-text class="d-flex flex-column ga-1">
            <span class="text-subtitle-2">{{ p.name }}</span>
            <span v-if="p.sku" class="text-caption text-medium-emphasis">{{ p.sku }}</span>
            <span v-if="p.priceCents > 0" class="text-body-1 font-weight-medium text-primary">{{ money(p.priceCents) }}</span>
            <v-chip v-else size="x-small" color="warning" class="align-self-start">{{ $t('pos.search.noPrice') }}</v-chip>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>
