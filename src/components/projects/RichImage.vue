<script setup lang="ts">
import { computed } from 'vue';
import { fileUrl, openFile } from '@/composable/useFileUrl';

/**
 * Imagen dentro de una descripción o un comentario. El documento guarda el id del archivo en document-service y no su URL (la
 * firmada caduca en una hora): aquí se pide el enlace con la sesión y se pinta en línea, para verla sin descargarla. Un clic la abre
 * a tamaño completo en otra pestaña (al leer; dentro del editor, el clic la selecciona).
 */
const props = withDefaults(defineProps<{ documentId: string; alt?: string; selected?: boolean; clickable?: boolean }>(), { alt: '', selected: false, clickable: true });
const src = computed(() => fileUrl(props.documentId));
</script>

<template>
  <div class="rich-image my-2" :class="{ 'rich-image--selected': selected }">
    <img v-if="src" :src="src" :alt="alt" class="rounded" :class="{ 'cursor-pointer': clickable }" @click="clickable && openFile(documentId)" />
    <v-skeleton-loader v-else type="image" width="240" height="120" />
  </div>
</template>

<style scoped>
.rich-image img {
  display: block;
  max-width: 100%;
  max-height: 360px;
  object-fit: contain;
}
.rich-image--selected img {
  outline: 2px solid rgb(var(--v-theme-primary));
}
</style>
