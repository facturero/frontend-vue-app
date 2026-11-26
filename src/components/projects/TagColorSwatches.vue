<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { TAG_COLORS } from '@/utils/projects';
import type { TagColor } from '@/types/projects';

/**
 * Los colores de etiqueta, círculos iguales; el elegido lleva una ✓ y el nombre del color sale debajo al pasar el ratón. Lo usan la
 * opción «Crear» del buscador de etiquetas, el menú de una etiqueta puesta en una tarea y el diálogo «Administrar etiquetas».
 *
 * Son 16 (los del tema y la paleta `tag-*`): van en una cuadrícula de 8 por fila, que cabe en un menú y en el teléfono, en vez de una
 * tira que ocupaba todo el ancho.
 */
const model = defineModel<TagColor>({ required: true });
const { t } = useI18n();
/** 8 por fila: círculos de 32 px (`x-small` con icono) y 8 px entre ellos. */
const GRID = { maxWidth: '312px' };
</script>

<template>
  <div class="d-flex align-center flex-wrap ga-2" :style="GRID" role="radiogroup" :aria-label="t('projects.tags.color')">
    <v-btn
      v-for="c in TAG_COLORS"
      :key="c"
      v-tooltip:bottom="t(`projects.colors.${c}`)"
      icon
      :color="c"
      rounded="circle"
      size="x-small"
      role="radio"
      :aria-checked="model === c"
      :aria-label="t('projects.tags.colorOption', { color: t(`projects.colors.${c}`) })"
      :data-color="c"
      @click="model = c"
    >
      <v-icon v-if="model === c" icon="mdi-check" size="small" />
    </v-btn>
  </div>
</template>
