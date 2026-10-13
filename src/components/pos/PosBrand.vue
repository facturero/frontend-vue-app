<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { fileUrl } from '@/composable/useFileUrl';
import { usePosCashierThemeStore } from '@/stores/posCashierTheme';
import { POS_THEME_LOGO_HEIGHT_PX } from '@/types/posTheme';

/**
 * La marca de la caja: la imagen de la empresa (si el tema trae una) o, sin ella, el logotipo «POS KIOSKO» (chip con «POS» + palabra),
 * igual que en la caja de escritorio. Se dibuja SIEMPRE con <img> (un SVG cargado así no ejecuta scripts); si la imagen aún no
 * baja o falla, se muestra el logotipo: el encabezado nunca queda vacío.
 */
const props = withDefaults(defineProps<{ height?: number; byline?: boolean }>(), { height: undefined, byline: false });

const theme = usePosCashierThemeStore();
const px = computed(() => props.height ?? POS_THEME_LOGO_HEIGHT_PX[theme.config.branding.logoSize]);

const logoFileId = computed(() => {
  const b = theme.config.branding;
  return theme.mode === 'dark' && b.logoDarkFileId ? b.logoDarkFileId : b.logoFileId;
});
const logoSrc = computed(() => fileUrl(logoFileId.value));
const failed = ref(false);
watch(logoFileId, () => (failed.value = false));
const showImage = computed(() => !!logoSrc.value && !failed.value);

// Centrado óptico de «POS» y de «KIOSKO» (las mayúsculas no tienen descendentes y, según la fuente, quedan altas o bajas): se mide
// con canvas dónde cae la tinta de cada palabra y se corrige con un desplazamiento en em. Mismo cálculo que la caja de escritorio.
const chipText = ref<HTMLElement | null>(null);
const wordText = ref<HTMLElement | null>(null);
const chipShiftEm = ref(0);
const wordShiftEm = ref(0);

function inkShiftEm(el: HTMLElement | null, text: string): number | null {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!el || !ctx) return null;
  const cs = getComputedStyle(el);
  const size = parseFloat(cs.fontSize);
  if (!size) return null;
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const m = ctx.measureText(text);
  if (!m.fontBoundingBoxAscent && !m.fontBoundingBoxDescent) return null;
  const baseline = (size - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
  const inkCenter = baseline + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2;
  return (size / 2 - inkCenter) / size;
}

function measureInk(): void {
  chipShiftEm.value = inkShiftEm(chipText.value, 'POS') ?? chipShiftEm.value;
  wordShiftEm.value = inkShiftEm(wordText.value, 'KIOSKO') ?? wordShiftEm.value;
}

onMounted(() => {
  measureInk();
  void document.fonts?.ready.then(measureInk);
});
watch([px, showImage], () => void nextTick(measureInk));
</script>

<template>
  <img v-if="showImage" :src="logoSrc" alt="Logo" class="pk-brand__img" :style="{ height: `${px}px` }" @error="failed = true" />
  <span v-else class="pk-brand">
    <span role="img" aria-label="POS KIOSKO" class="pk-brand__mark" :style="{ fontSize: `${Math.round(px * 0.75)}px` }">
      <span class="pk-brand__chip">
        <span ref="chipText" :style="{ transform: `translateY(${chipShiftEm}em)` }">POS</span>
      </span>
      <span ref="wordText" class="pk-brand__word" :style="{ transform: `translateY(${wordShiftEm}em)` }">KIOSKO</span>
    </span>
    <span v-if="byline" class="pk-brand__by">{{ $t('pos.brand.byline') }}</span>
  </span>
</template>
