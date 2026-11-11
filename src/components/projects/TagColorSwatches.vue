<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { TAG_COLORS } from '@/utils/projects';
import type { ProjectColor } from '@/types/projects';

/**
 * Los colores de etiqueta, círculos iguales; el elegido lleva una ✓ y el nombre del color sale debajo al pasar el ratón. Lo usan la
 * opción «Crear» del buscador de etiquetas, el menú de una etiqueta puesta en una tarea y el diálogo «Administrar etiquetas».
 */
const model = defineModel<ProjectColor>({ required: true });
const { t } = useI18n();
</script>

<template>
  <div class="d-flex align-center flex-wrap ga-2" role="radiogroup" :aria-label="t('projects.tags.color')">
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
      @click="model = c"
    >
      <v-icon v-if="model === c" icon="mdi-check" size="small" />
    </v-btn>
  </div>
</template>
