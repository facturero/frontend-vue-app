<script setup lang="ts">
/**
 * Paleta de comandos (Ctrl+K) sobre `VCommandPalette`, que en Vuetify 4.3 todavía es *labs*: el dueño la aprobó el 2026-11-10
 * (UI-UX.md §1). Va envuelta aquí, como `DateField` con `VDateInput`, para que un cambio de su API toque este archivo y no cada
 * pantalla que la use.
 *
 * El filtro de Vuetify se apaga (`no-filter`): quien la usa decide qué mostrar y en qué orden (puntuación propia, resultados del
 * servidor). Los atajos para abrirla también los pone quien la usa: Vuetify solo sabe de uno, y la búsqueda global tiene dos (Ctrl+K y «/»).
 */
import { VCommandPalette } from 'vuetify/labs/VCommandPalette';

/** Un elemento: acción (con `onClick`), subtítulo de grupo o separador. `chip` lo pinta el hueco `append` de la fila. */
export type PaletteItem =
  | { type?: 'item'; title: string; subtitle?: string; prependIcon?: string; value?: string; chip?: { label: string; color: string }; onClick: () => void }
  | { type: 'subheader'; title: string }
  | { type: 'divider' };

defineProps<{ items: PaletteItem[]; placeholder?: string }>();
const open = defineModel<boolean>({ default: false });
const search = defineModel<string>('search', { default: '' });

/** El hueco `append` de la fila recibe el elemento tal cual se pasó; sus tipos en *labs* todavía no lo dicen. */
function chipOf(slotProps: unknown): { label: string; color: string } | undefined {
  return (slotProps as { item?: { chip?: { label: string; color: string } } } | undefined)?.item?.chip;
}
</script>

<template>
  <VCommandPalette
    v-model="open"
    v-model:search="search"
    :items="items"
    :placeholder="placeholder"
    no-filter
    max-width="600"
    max-height="70vh"
  >
    <template #activator="slotProps">
      <slot name="activator" v-bind="slotProps" />
    </template>
    <template #[`item.append`]="slotProps">
      <v-chip v-if="chipOf(slotProps)" size="x-small" variant="flat" :color="chipOf(slotProps)!.color">{{ chipOf(slotProps)!.label }}</v-chip>
    </template>
    <template #no-data>
      <slot name="no-data" />
    </template>
  </VCommandPalette>
</template>
