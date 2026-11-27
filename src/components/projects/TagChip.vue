<script setup lang="ts">
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { readableOn, resolveTagColor } from '@/utils/projects';
import type { TagColor } from '@/types/projects';

/**
 * Chip de una etiqueta de Proyectos: fondo del color de la etiqueta y texto claro u oscuro según el contraste (2026-11-27).
 *
 * El color se resuelve a `#rrggbb` (también los de la paleta, desde el tema activo) y el texto lo elige `readableOn` por contraste
 * WCAG. Con el nombre del token Vuetify usaba el `on-*` del tema, que para `warning`, `success` o `tag-yellow` es blanco (contraste
 * 1,7–2,6 medido), y con un hexadecimal su propio cálculo también dejaba blanco el amarillo o el salmón. El resto de props y eventos (`size`,
 * `closable`, `link`, `@click:close`…) pasan tal cual al `v-chip`.
 */
const props = defineProps<{ color: TagColor }>();
const theme = useTheme();
const background = computed(() => resolveTagColor(props.color, theme.current.value.colors));
const foreground = computed(() => readableOn(background.value));
</script>

<template>
  <v-chip :color="background" variant="flat" :style="foreground ? { color: foreground } : undefined" data-tag-chip>
    <slot />
  </v-chip>
</template>
