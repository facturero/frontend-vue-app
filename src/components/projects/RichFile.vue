<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { openFile } from '@/composable/useFileUrl';
import { fileKind } from '@/utils/projects';

/**
 * Documento dentro de una descripción o un comentario (Excel, PDF, Word…): una ficha con el icono y el color de su tipo y el
 * nombre. Un clic lo abre en otra pestaña, también dentro del editor (la descripción de quien puede editarla es siempre el editor,
 * así que si el clic solo seleccionara nunca se podría abrir). En el editor trae además una ✕ para quitarla del texto; el archivo
 * sigue en Adjuntos.
 */
const props = withDefaults(defineProps<{ documentId: string; name: string; mimeType?: string; selected?: boolean; removable?: boolean }>(), {
  mimeType: '',
  selected: false,
  removable: false,
});
const emit = defineEmits<{ remove: [] }>();
const { t } = useI18n();
const kind = computed(() => fileKind(props.mimeType, props.name));
</script>

<template>
  <div class="my-1">
    <v-chip
      :prepend-icon="kind.icon"
      :color="selected ? 'primary' : kind.color"
      :variant="selected ? 'tonal' : 'outlined'"
      label
      link
      :closable="removable"
      :close-label="t('projects.editor.removeFile')"
      @click="openFile(documentId)"
      @click:close="emit('remove')"
    >
      {{ name }}
    </v-chip>
  </div>
</template>
