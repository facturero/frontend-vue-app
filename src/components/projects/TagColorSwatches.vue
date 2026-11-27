<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { isCustomTagColor, readableTagColor, TAG_COLORS } from '@/utils/projects';
import type { TagColor } from '@/types/projects';

/**
 * Selector de color de etiqueta. Arriba, la paleta (los colores del tema y los `tag-*`) en círculos: un clic y listo. El último círculo,
 * «Color personalizado», abre el selector de Vuetify (`v-color-picker`: lienzo, tono y campo hexadecimal) para cualquier otro color
 * (lo pidió el dueño, 2026-11-26). Mientras se arrastra solo cambia la vista previa; se aplica con «Usar este color», así mover el
 * cursor no guarda veinte cambios en el servidor.
 *
 * El color libre pasa por `readableTagColor` (misma tonalidad, luminosidad media): las etiquetas son chips tonales y un pastel no se
 * leería sobre blanco ni uno muy oscuro en el tema oscuro. La vista previa ya muestra el color ajustado, el que se guarda.
 *
 * Lo usan la opción «Crear» del buscador de etiquetas (allí sin el color libre: `custom=false`, el campo del buscador perdería el foco
 * y lo escrito), el menú de una etiqueta puesta en una tarea y el diálogo «Administrar etiquetas».
 */
const model = defineModel<TagColor>({ required: true });
const props = withDefaults(defineProps<{ custom?: boolean }>(), { custom: true });
const { t } = useI18n();
/** 8 por fila: círculos de 32 px (`x-small` con icono) y 8 px entre ellos. */
const GRID = { maxWidth: '312px' };

const customOpen = ref(false);
/** Lo que se ve en el selector libre mientras se elige (aún sin aplicar). */
const draft = ref<string>(isCustomTagColor(model.value) ? model.value : '#7048E8');
const preview = computed(() => readableTagColor(draft.value));
const customSelected = computed(() => isCustomTagColor(model.value));

// Otra etiqueta en el mismo selector (o un cambio que llegó de fuera): el libre arranca desde su color.
watch(model, (c) => {
  if (isCustomTagColor(c)) draft.value = c;
});

function pick(c: TagColor): void {
  customOpen.value = false;
  model.value = c;
}

function applyCustom(): void {
  customOpen.value = false;
  model.value = preview.value;
}

const label = (c: TagColor) => (isCustomTagColor(c) ? c.toUpperCase() : t(`projects.colors.${c}`));
</script>

<template>
  <div class="d-flex flex-column ga-4" data-tag-color-select>
    <div class="d-flex align-center flex-wrap ga-2" :style="GRID" role="radiogroup" :aria-label="t('projects.tags.color')">
      <v-btn
        v-for="c in TAG_COLORS"
        :key="c"
        v-tooltip:bottom="label(c)"
        icon
        :color="c"
        rounded="circle"
        size="x-small"
        role="radio"
        :aria-checked="model === c"
        :aria-label="t('projects.tags.colorOption', { color: label(c) })"
        :data-color="c"
        @click="pick(c)"
      >
        <v-icon v-if="model === c" icon="mdi-check" size="small" />
      </v-btn>
      <!-- Color personalizado: con su color si la etiqueta ya tiene uno libre (y la ✓); si no, el icono de la paleta. -->
      <v-btn
        v-if="props.custom"
        v-tooltip:bottom="customSelected ? label(model) : t('projects.tags.customColor')"
        icon
        :color="customSelected ? model : undefined"
        :variant="customSelected ? 'flat' : 'tonal'"
        rounded="circle"
        size="x-small"
        role="radio"
        :aria-checked="customSelected"
        :aria-expanded="customOpen"
        :aria-label="t('projects.tags.customColor')"
        data-color="custom"
        @click="customOpen = !customOpen"
      >
        <v-icon :icon="customSelected ? 'mdi-check' : 'mdi-palette-outline'" size="small" />
      </v-btn>
    </div>

    <div v-if="props.custom && customOpen" class="d-flex flex-column ga-2" data-custom-color>
      <v-color-picker v-model="draft" mode="hex" :modes="['hex']" elevation="0" width="312" canvas-height="120" />
      <div class="d-flex align-center ga-2">
        <v-chip size="small" :color="preview" prepend-icon="mdi-tag">{{ preview.toUpperCase() }}</v-chip>
        <v-spacer />
        <v-btn color="primary" size="small" data-use-color @click="applyCustom">{{ t('projects.tags.useColor') }}</v-btn>
      </div>
      <div class="text-body-small text-medium-emphasis">{{ t('projects.tags.customHint') }}</div>
    </div>
  </div>
</template>
