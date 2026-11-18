<script setup lang="ts">
/**
 * Un cuadro del selector de tema, como los de Slack: una miniatura de la aplicación pintada con los colores del tema (barra
 * lateral, fondo, una tarjeta con dos líneas de texto y un botón) y el nombre debajo. Los colores son datos del tema (los
 * integrados salen de plugins/vuetify.ts, los propios de lo que guardó la empresa), por eso van por prop y no son tokens.
 *
 * `split`: para «Como el sistema», mitad claro y mitad oscuro.
 */
export interface TilePalette {
  primary: string;
  background: string;
  surface: string;
  text: string;
}

defineProps<{ name: string; palette: TilePalette; split?: TilePalette; selected?: boolean; disabled?: boolean; caption?: string }>();
defineEmits<{ select: [] }>();
</script>

<template>
  <v-card
    :disabled="disabled"
    :color="selected ? 'lightprimary' : undefined"
    :class="selected ? 'border-primary border-opacity-100' : 'border'"
    class="h-100"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <div class="d-flex pa-2 ga-2">
      <template v-for="(pal, i) in split ? [palette, split] : [palette]" :key="i">
        <v-sheet :color="pal.background" rounded="lg" height="72" class="d-flex flex-1-1 overflow-hidden border">
          <v-sheet :color="pal.primary" width="14" rounded="0" />
          <div class="d-flex flex-column flex-1-1 ga-1 pa-2">
            <v-sheet :color="pal.surface" rounded="sm" class="d-flex flex-column ga-1 pa-1 flex-1-1">
              <v-sheet :color="pal.text" height="4" width="70%" rounded="pill" />
              <v-sheet :color="pal.text" height="4" width="45%" rounded="pill" class="opacity-60" />
            </v-sheet>
            <v-sheet :color="pal.primary" height="8" width="40%" rounded="pill" />
          </div>
        </v-sheet>
      </template>
    </div>
    <div class="d-flex align-center ga-2 px-3 pb-2">
      <div class="flex-1-1 overflow-hidden">
        <div class="text-body-medium font-weight-medium text-truncate">{{ name }}</div>
        <div v-if="caption" class="text-body-small text-medium-emphasis text-truncate">{{ caption }}</div>
      </div>
      <v-icon v-if="selected" icon="mdi-check-circle" color="primary" size="20" />
    </div>
  </v-card>
</template>
