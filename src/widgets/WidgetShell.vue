<script setup lang="ts">
import { useI18n } from 'vue-i18n';

/**
 * El marco común de todo widget del tablero: icono con su color tonal, título, «Ver todo» hacia el módulo y, al editar, la ✕ para
 * quitarlo. El cuerpo ocupa lo que quede y se desplaza si no cabe (el tamaño lo elige la persona entre el mínimo y el máximo del
 * widget). Los botones llevan `no-drag`: en edición, arrastrar la tarjeta no debe dispararse al pulsarlos.
 *
 * `fit` (teléfono, una columna): la tarjeta mide lo que su contenido, no la celda de la rejilla, para no dejar media tarjeta en blanco;
 * con `maxHeight` se topa ahí y el cuerpo se desplaza.
 */
withDefaults(
  defineProps<{ title: string; icon: string; color: string; to?: string; editing?: boolean; fit?: boolean; maxHeight?: number }>(),
  { to: undefined, editing: false, fit: false, maxHeight: undefined },
);
const emit = defineEmits<{ remove: [] }>();
const { t } = useI18n();
</script>

<template>
  <v-card
    class="widget-shell d-flex flex-column"
    :class="{ 'h-100': !fit, 'widget-shell--editing': editing }"
    :style="fit && maxHeight ? { maxHeight: `${maxHeight}px` } : undefined"
  >
    <div class="d-flex align-center ga-2 px-4 pt-4 pb-2">
      <v-sheet :color="`light${color}`" class="widget-shell__icon d-flex align-center justify-center rounded-lg flex-shrink-0">
        <v-icon :icon="icon" :color="color" size="20" />
      </v-sheet>
      <span class="text-body-large font-weight-medium text-truncate flex-grow-1">{{ title }}</span>
      <div class="d-flex align-center ga-1 no-drag">
        <slot name="actions" />
        <v-btn v-if="to && !editing" :to="to" variant="text" size="small" class="px-2">{{ t('dashboard.seeAll') }}</v-btn>
        <v-btn v-if="editing" icon="mdi-close" variant="text" size="small" :aria-label="t('dashboard.remove', { name: title })" @click="emit('remove')" />
      </div>
    </div>
    <div class="widget-shell__body flex-grow-1 px-4 pb-4">
      <slot />
    </div>
  </v-card>
</template>

<style scoped>
.widget-shell__icon {
  width: 36px;
  height: 36px;
}
/* El cuerpo se desplaza dentro del tamaño elegido; sin `min-height: 0` el flex lo estiraba y el contenido se salía de la tarjeta. */
.widget-shell__body {
  min-height: 0;
  overflow-y: auto;
}
/* En edición se ve que la tarjeta se arrastra. */
.widget-shell--editing {
  cursor: move;
  outline: 1px dashed rgb(var(--v-theme-primary));
}
</style>
