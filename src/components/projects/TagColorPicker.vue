<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { PROJECT_COLORS } from '@/utils/projects';
import type { ProjectColor } from '@/types/projects';

/**
 * Colores para una etiqueta nueva. Va dentro de la lista desplegable del buscador de etiquetas (debajo del campo la tapaba la propia
 * lista), así que corta el `mousedown` para que el campo no pierda el foco ni lo escrito.
 */
const model = defineModel<ProjectColor>({ required: true });
const { t } = useI18n();
</script>

<template>
  <div class="d-flex align-center flex-wrap ga-2 px-4 py-2" @mousedown.prevent @click.stop>
    <span class="text-body-small text-medium-emphasis">{{ t('projects.tags.color') }}</span>
    <v-btn
      v-for="c in PROJECT_COLORS"
      :key="c"
      :color="c"
      :icon="model === c ? 'mdi-check' : 'mdi-circle'"
      :variant="model === c ? 'flat' : 'text'"
      size="x-small"
      :aria-label="t('projects.tags.colorOption', { color: t(`projects.colors.${c}`) })"
      :aria-pressed="model === c"
      @click="model = c"
    />
  </div>
</template>
