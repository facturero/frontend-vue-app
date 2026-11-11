<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { fileUrl, openFile } from '@/composable/useFileUrl';

/**
 * Imagen dentro de una descripción o un comentario. El documento guarda el id del archivo en document-service y no su URL (la
 * firmada caduca en una hora): aquí se pide el enlace con la sesión y se pinta en línea, para verla sin descargarla.
 *
 * A tamaño completo se ve en un visor dentro del CRM, no en otra pestaña (lo pidió un cliente: «verlas sin tener que descargarlas»).
 * Al leer, un clic en la imagen lo abre; dentro del editor el clic la selecciona (para moverla o borrarla), así que el visor se abre
 * con la lupa que sale al pasar el ratón. Desde el visor se puede abrir en otra pestaña si hace falta.
 */
const props = withDefaults(defineProps<{ documentId: string; alt?: string; selected?: boolean; clickable?: boolean }>(), { alt: '', selected: false, clickable: true });
const { t } = useI18n();
const { xs } = useDisplay();
const src = computed(() => fileUrl(props.documentId));
const viewing = ref(false);
</script>

<template>
  <div class="rich-image my-2" :class="{ 'rich-image--selected': selected }">
    <template v-if="src">
      <img :src="src" :alt="alt" class="rounded" :class="{ 'cursor-zoom-in': clickable }" @click="clickable && (viewing = true)" />
      <v-btn
        v-if="!clickable"
        v-tooltip:top="t('projects.image.view')"
        icon="mdi-magnify-plus-outline"
        size="small"
        class="rich-image__zoom"
        :aria-label="t('projects.image.view')"
        @mousedown.prevent.stop
        @click.stop="viewing = true"
      />
    </template>
    <v-skeleton-loader v-else type="image" width="240" height="120" />

    <v-dialog v-model="viewing" :fullscreen="xs" max-width="1200">
      <v-card>
        <v-card-title class="d-flex align-center ga-2">
          <span class="text-truncate flex-grow-1">{{ alt || t('projects.image.title') }}</span>
          <v-btn variant="text" size="small" prepend-icon="mdi-open-in-new" @click="openFile(documentId)">{{ t('projects.image.openTab') }}</v-btn>
          <v-btn icon="mdi-close" variant="text" size="small" :aria-label="t('common.close')" @click="viewing = false" />
        </v-card-title>
        <v-card-text class="d-flex justify-center align-center">
          <img v-if="src" :src="src" :alt="alt" class="rich-image__full rounded" />
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.rich-image {
  position: relative;
  display: inline-block;
  max-width: 100%;
}
.rich-image img {
  display: block;
  max-width: 100%;
  max-height: 360px;
  object-fit: contain;
}
.rich-image--selected img {
  outline: 2px solid rgb(var(--v-theme-primary));
}
.cursor-zoom-in {
  cursor: zoom-in;
}
/* Lupa del editor: escondida hasta pasar el ratón por la imagen o enfocarla (en pantalla táctil, el primer toque la muestra). */
.rich-image__zoom {
  position: absolute;
  top: 8px;
  right: 8px;
  opacity: 0;
  transition: opacity 0.15s;
}
.rich-image:hover .rich-image__zoom,
.rich-image__zoom:focus-visible {
  opacity: 1;
}
/* En el visor, la imagen entera: cabe en la pantalla sin recortarse. */
.rich-image .rich-image__full,
.rich-image__full {
  max-width: 100%;
  max-height: calc(100vh - 160px);
  object-fit: contain;
}
</style>
