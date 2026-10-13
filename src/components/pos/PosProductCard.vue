<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fileUrl } from '@/composable/useFileUrl';
import { usePosMoney } from '@/composable/usePosMoney';
import { usePosCashierThemeStore } from '@/stores/posCashierTheme';
import type { ProductSummary } from '@/types/products';

/**
 * Tarjeta del catálogo, con las cuatro variantes del tema (`layout.productCard`) como en la caja de escritorio: foto arriba, foto a la
 * izquierda, solo texto, o compacta. Con fotos activadas todas las tarjetas miden lo mismo: si el producto no tiene foto (o aún no
 * baja) se muestra un icono para que la cuadrícula no quede desigual. Un producto sin precio no se puede vender.
 */
const props = defineProps<{ product: ProductSummary; showImages: boolean }>();
const emit = defineEmits<{ select: [product: ProductSummary] }>();

const theme = usePosCashierThemeStore();
const { money } = usePosMoney();

const variant = computed(() => theme.config.layout.productCard);
const showImage = computed(() => props.showImages && variant.value !== 'text-only');
const horizontal = computed(() => variant.value === 'image-left' || variant.value === 'compact');

const failed = ref(false);
watch(() => props.product.imageFileId, () => (failed.value = false));
const src = computed(() => (failed.value ? undefined : fileUrl(props.product.imageFileId)));
const sellable = computed(() => props.product.priceCents > 0);
</script>

<template>
  <button
    type="button"
    class="pk-card"
    :class="[horizontal ? 'pk-card--row' : '', variant === 'image-left' ? 'pk-card--left' : '', variant === 'compact' ? 'pk-card--compact' : '']"
    :disabled="!sellable"
    @click="emit('select', product)"
  >
    <div v-if="showImage" class="pk-card__img">
      <img v-if="src" :src="src" :alt="product.name" loading="lazy" @error="failed = true" />
      <i v-else class="mdi mdi-image-outline" />
    </div>
    <div class="pk-card__body">
      <span class="pk-card__name" :title="product.name">{{ product.name }}</span>
      <span v-if="sellable" class="pk-card__price">{{ money(product.priceCents) }}</span>
      <span v-else class="pk-card__noprice">{{ $t('pos.search.noPrice') }}</span>
    </div>
  </button>
</template>
