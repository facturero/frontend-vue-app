<script setup lang="ts">
/**
 * Gráfico de anillo sobre `VPie`, que en Vuetify 4.3 todavía es *labs*: el dueño lo aprobó el 2026-11-10 (UI-UX.md §1). Va
 * envuelto aquí para que un cambio de su API toque este archivo y no cada pantalla.
 *
 * Los colores se piden por token del tema (`success`, `error`…), nunca en hexadecimal: `VPie` pinta con CSS, así que el token se
 * traduce a la variable del tema (`rgb(var(--v-theme-success))`) y el anillo cambia con el modo oscuro como todo lo demás.
 */
import { computed } from 'vue';
import { VPie } from 'vuetify/labs/VPie';

export interface PieSlice {
  key: string;
  title: string;
  value: number;
  /** Token del tema. */
  color: string;
}

const props = withDefaults(defineProps<{ items: PieSlice[]; size?: number; label: string }>(), { size: 160 });

const slices = computed(() =>
  props.items.filter((s) => s.value > 0).map((s) => ({ key: s.key, title: s.title, value: s.value, color: `rgb(var(--v-theme-${s.color}))` })),
);
</script>

<template>
  <div role="img" :aria-label="label">
    <VPie :items="slices" :size="size" inner-cut="70" gap="2" rounded="2" legend tooltip hide-slice>
      <template #center>
        <slot name="center" />
      </template>
    </VPie>
  </div>
</template>
