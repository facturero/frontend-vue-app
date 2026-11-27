<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { defaultFileUrlResolver, FILE_URL_RESOLVER } from '@/composable/useFileUrl';

/**
 * Imagen dentro de una descripción o un comentario. El documento guarda el id del archivo en document-service y no su URL (la
 * firmada caduca en una hora): aquí se pide el enlace con la sesión y se pinta en línea, para verla sin descargarla.
 *
 * Se pinta como miniatura de tamaño fijo y, si hay varias seguidas, en fila (lo pidió un cliente: una captura de pantalla alta
 * ocupaba media tarea y se veía mal). A tamaño completo se ve en un visor dentro del CRM con un clic en la imagen, también dentro
 * del editor: antes allí había que atinar a una lupa que solo salía al pasar el ratón. En el editor, la «×» la quita del texto.
 *
 * El enlace sale de document-service, salvo que quien la muestra provea otro origen (`FILE_URL_RESOLVER`): el buzón de comentarios
 * reutiliza este visor con capturas de otras empresas, que sirve feedback-service.
 */
const props = withDefaults(defineProps<{ documentId: string; alt?: string; selected?: boolean; removable?: boolean }>(), {
  alt: '',
  selected: false,
  removable: false,
});
const emit = defineEmits<{ remove: [] }>();
const { t } = useI18n();
const { xs } = useDisplay();
const resolver = inject(FILE_URL_RESOLVER, defaultFileUrlResolver);
const src = computed(() => resolver.url(props.documentId));
const viewing = ref(false);
/**
 * Cómo cabe en el recuadro, según su forma. Una captura horizontal se ve entera (con bandas arriba y abajo): recortada perdía los
 * lados, que es donde suele estar el menú. Una vertical llena el recuadro y se ve desde arriba: entera quedaría como una tira.
 */
const portrait = ref(false);
function onLoad(event: Event): void {
  const img = event.target as HTMLImageElement;
  portrait.value = img.naturalHeight > img.naturalWidth * (THUMB_H / THUMB_W);
}
</script>

<script lang="ts">
/** Tamaño de la miniatura (también en el estilo): caben dos por fila en el panel de una tarea. */
const THUMB_W = 200;
const THUMB_H = 136;
</script>

<template>
  <div class="rich-image my-2" :class="{ 'rich-image--selected': selected }">
    <template v-if="src">
      <img
        :src="src"
        :alt="alt"
        :title="t('projects.image.view')"
        class="rich-image__thumb rounded cursor-zoom-in"
        :class="{ 'rich-image__thumb--portrait': portrait }"
        data-rich-image
        @load="onLoad"
        @click="viewing = true"
      />
      <v-btn
        v-if="removable"
        v-tooltip:top="t('projects.image.remove')"
        icon="mdi-close"
        size="x-small"
        class="rich-image__remove"
        :aria-label="t('projects.image.remove')"
        @mousedown.prevent.stop
        @click.stop="emit('remove')"
      />
    </template>
    <v-skeleton-loader v-else type="image" width="200" height="136" />

    <v-dialog v-model="viewing" :fullscreen="xs" max-width="1200">
      <v-card>
        <v-card-title class="d-flex align-center ga-2">
          <span class="text-truncate flex-grow-1">{{ alt || t('projects.image.title') }}</span>
          <v-btn variant="text" size="small" prepend-icon="mdi-open-in-new" @click="resolver.open(documentId)">{{ t('projects.image.openTab') }}</v-btn>
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
/* En línea: varias imágenes seguidas quedan en fila y bajan de renglón cuando no caben. */
.rich-image {
  position: relative;
  display: inline-block;
  vertical-align: top;
  max-width: 100%;
  overflow: hidden;
  margin-right: 8px;
}
/* Miniatura de tamaño fijo, la misma para cualquier captura: con solo el alto fijo, una vertical quedaba como una tira estrecha y
   una horizontal ocupaba el renglón (lo vio un cliente). Horizontal, entera dentro del recuadro; vertical, llenándolo desde arriba,
   que en una captura es donde está lo que importa (ver `portrait`). Entera siempre, en el visor. Tamaños en px y no en %: un tope en % no cuenta al calcular el ancho de
   un `inline-block` y la fila se rompía. */
.rich-image__thumb {
  display: block;
  width: 200px;
  height: 136px;
  max-width: 100%;
  object-fit: contain;
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.rich-image__thumb--portrait {
  object-fit: cover;
  object-position: top center;
}
.rich-image--selected .rich-image__thumb {
  outline: 2px solid rgb(var(--v-theme-primary));
}
.cursor-zoom-in {
  cursor: zoom-in;
}
/* «×» del editor: escondida hasta pasar el ratón por la imagen o enfocarla (en pantalla táctil, el primer toque la muestra). */
.rich-image__remove {
  position: absolute;
  top: 6px;
  right: 6px;
  opacity: 0;
  transition: opacity 0.15s;
}
.rich-image:hover .rich-image__remove,
.rich-image--selected .rich-image__remove,
.rich-image__remove:focus-visible {
  opacity: 1;
}
/* En el visor, la imagen entera: cabe en la pantalla sin recortarse. */
.rich-image__full {
  max-width: 100%;
  max-height: calc(100vh - 160px);
  object-fit: contain;
}
</style>
