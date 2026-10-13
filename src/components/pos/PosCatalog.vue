<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import PosProductCard from '@/components/pos/PosProductCard.vue';
import { productApi } from '@/api/products';
import { usePosStore } from '@/stores/pos';
import { usePosCashierThemeStore } from '@/stores/posCashierTheme';
import type { Category, ProductSummary } from '@/types/products';

/**
 * Catálogo de la caja: búsqueda, categorías y cuadrícula de productos, igual que la de escritorio. El lector de código de barras
 * «escribe» el código y pulsa Enter: si ese código es el SKU de un producto (o es el único resultado) se agrega solo y el campo queda
 * listo para el siguiente. Solo se ofrecen productos activos del establecimiento con el que se factura.
 */
const emit = defineEmits<{ add: [product: ProductSummary] }>();

const PAGE_SIZE = 60;

const pos = usePosStore();
const theme = usePosCashierThemeStore();

const search = ref('');
const categories = ref<Category[]>([]);
const categoryId = ref<string | null>(null);
const items = ref<ProductSummary[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const failed = ref(false);
const field = ref<HTMLInputElement | null>(null);

/** La preferencia de ver el catálogo con o sin fotos es de esta caja (y de quien la usa), no de la organización. */
const IMAGES_KEY = 'pos:images';
function readImagesPreference(): boolean | null {
  try {
    const v = localStorage.getItem(IMAGES_KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}
const imagesPreference = ref<boolean | null>(readImagesPreference());
const showImages = computed(() => imagesPreference.value ?? theme.config.layout.showProductImages);
function toggleImages(): void {
  imagesPreference.value = !showImages.value;
  try {
    localStorage.setItem(IMAGES_KEY, imagesPreference.value ? '1' : '0');
  } catch {
    // sin almacenamiento: vale para esta sesión
  }
}

const placement = computed(() => theme.config.layout.categoriesPlacement);
const columns = computed(() => theme.config.layout.catalogColumns);
const gridStyle = computed(() => (columns.value === 'auto' ? undefined : { gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))` }));
const hasMore = computed(() => items.value.length < total.value);

let timer: ReturnType<typeof setTimeout> | undefined;
let sequence = 0;

/** Consulta el catálogo. Las respuestas que llegan tarde (de una búsqueda ya superada) se descartan. */
async function load(append = false): Promise<ProductSummary[]> {
  const mine = ++sequence;
  loading.value = true;
  failed.value = false;
  const wanted = append ? page.value + 1 : 1;
  try {
    const res = await productApi.list({
      search: search.value.trim() || undefined,
      categoryId: categoryId.value ?? undefined,
      status: 'active',
      establishmentId: pos.point?.establishmentId,
      page: wanted,
      pageSize: PAGE_SIZE,
    });
    if (mine === sequence) {
      items.value = append ? [...items.value, ...res.items] : res.items;
      total.value = res.total;
      page.value = wanted;
    }
    return res.items;
  } catch {
    if (mine === sequence) failed.value = true;
    return [];
  } finally {
    if (mine === sequence) loading.value = false;
  }
}

watch(search, () => {
  clearTimeout(timer);
  timer = setTimeout(() => void load(), 300);
});
watch([categoryId, () => pos.point?.establishmentId], () => void load());

onMounted(async () => {
  void load();
  try {
    categories.value = (await productApi.listCategories()).filter((c) => c.status === 'active');
  } catch {
    categories.value = [];
  }
});
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
  <section class="pk-catalog">
    <div class="pk-toolbar">
      <div class="pk-toolbar__row">
        <div class="pk-search">
          <i class="mdi mdi-magnify pk-search__icon" />
          <input
            ref="field"
            v-model="search"
            type="text"
            class="pk-input"
            autofocus
            autocomplete="off"
            :placeholder="$t('pos.search.placeholder')"
            :aria-label="$t('pos.search.label')"
            @keyup.enter="onEnter"
          />
        </div>
        <button
          type="button"
          class="pk-iconbtn"
          :class="{ 'is-on': showImages }"
          :title="showImages ? $t('pos.search.hideImages') : $t('pos.search.showImages')"
          :aria-pressed="showImages"
          :aria-label="$t('pos.search.showImages')"
          @click="toggleImages"
        >
          <i class="mdi" :class="showImages ? 'mdi-image-outline' : 'mdi-image-off-outline'" />
        </button>
      </div>
      <div v-if="placement === 'top'" class="pk-pills">
        <button type="button" class="pk-pill" :class="{ 'is-on': categoryId === null }" @click="categoryId = null">{{ $t('pos.search.all') }}</button>
        <button v-for="c in categories" :key="c.id" type="button" class="pk-pill" :class="{ 'is-on': categoryId === c.id }" @click="categoryId = c.id">{{ c.name }}</button>
      </div>
    </div>

    <div class="pk-catalog__area">
      <nav v-if="placement === 'left'" class="pk-sidecats">
        <button type="button" class="pk-sidecat" :class="{ 'is-on': categoryId === null }" @click="categoryId = null">{{ $t('pos.search.all') }}</button>
        <button v-for="c in categories" :key="c.id" type="button" class="pk-sidecat" :class="{ 'is-on': categoryId === c.id }" @click="categoryId = c.id">{{ c.name }}</button>
      </nav>

      <div class="pk-products">
        <p v-if="failed" class="pk-error">{{ $t('pos.search.error') }}</p>
        <p v-else-if="loading && items.length === 0" class="pk-hint">{{ $t('pos.search.loading') }}</p>
        <div v-else class="pk-grid" :class="{ 'pk-grid--auto': columns === 'auto' }" :style="gridStyle">
          <PosProductCard v-for="p in items" :key="p.id" :product="p" :show-images="showImages" @select="pick" />
        </div>
        <p v-if="!loading && !failed && items.length === 0" class="pk-empty">{{ $t('pos.search.empty') }}</p>
        <button v-if="hasMore && !failed" type="button" class="pk-btn pk-btn--alt pk-more" :disabled="loading" @click="load(true)">
          {{ loading ? $t('pos.search.loading') : $t('pos.search.more') }}
        </button>
      </div>
    </div>
  </section>
</template>
