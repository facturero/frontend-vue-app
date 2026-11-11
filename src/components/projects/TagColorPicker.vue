<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { TAG_COLORS } from '@/utils/projects';
import type { ProjectColor } from '@/types/projects';

/**
 * Opción «Crear» de una etiqueta nueva, con su color. Muestra la etiqueta tal como quedará (vista previa en el color elegido) y debajo
 * los colores, círculos iguales: el elegido lleva una ✓ (el nombre del color sale debajo al pasar el ratón, para no tapar la vista previa). Antes el elegido era un cuadrado relleno y los demás puntos sueltos,
 * y no se veía cómo iba a quedar la etiqueta hasta crearla.
 *
 * Va dentro de la lista desplegable del buscador de etiquetas (debajo del campo la tapaba la propia lista), así que la fila de colores
 * corta el `mousedown` para que el campo no pierda el foco ni lo escrito.
 */
defineProps<{ name: string }>();
const model = defineModel<ProjectColor>({ required: true });
const emit = defineEmits<{ create: [] }>();
const { t } = useI18n();
</script>

<template>
  <v-list-item prepend-icon="mdi-plus" :aria-label="t('projects.tags.create', { name })" @click="emit('create')">
    <div class="d-flex align-center flex-wrap ga-2">
      <span>{{ t('projects.tags.createLabel') }}</span>
      <v-chip size="small" :color="model" prepend-icon="mdi-tag">{{ name }}</v-chip>
    </div>
  </v-list-item>
  <div class="d-flex align-center flex-wrap ga-2 px-4 pb-2" role="radiogroup" :aria-label="t('projects.tags.color')" @mousedown.prevent @click.stop>
    <span class="text-body-small text-medium-emphasis">{{ t('projects.tags.color') }}</span>
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
