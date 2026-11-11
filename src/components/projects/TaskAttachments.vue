<script setup lang="ts">
import { computed } from 'vue';
import { formatBytes } from '@/utils/format';
import { useI18n } from 'vue-i18n';
import { openFile } from '@/composable/useFileUrl';
import { useAuthStore } from '@/stores/auth';
import { useProjectsStore } from '@/stores/projects';
import type { TaskAttachment } from '@/types/projects';
import { fileKind } from '@/utils/projects';

/**
 * Adjuntos de la tarea: la lista de todo lo que se subió, para encontrarlo sin buscarlo en el texto. El archivo se sube a
 * document-service (URL firmada) y la tarea guarda la referencia; abrirlo pide un enlace firmado con la sesión, así que un archivo de
 * otra empresa no se abre aunque alguien conozca su id.
 *
 * Aquí ya no se sube nada: se adjunta desde la descripción o un comentario (clip, pegar o soltar), donde además queda a la vista. El
 * recuadro grande de «Suelta archivos aquí» ocupaba media pantalla del panel (lo pidió un cliente). Sin adjuntos, la sección no sale.
 */
const { t } = useI18n();
const store = useProjectsStore();
const auth = useAuthStore();

const items = computed(() => store.detail?.attachments ?? []);
const size = (bytes: number) => formatBytes(bytes);
const canRemove = (a: TaskAttachment) => a.uploadedBy === auth.user?.id || !!store.detail?.canEdit;
</script>

<template>
  <div v-if="store.detail && items.length">
    <div class="text-body-large font-weight-medium mb-2">{{ t('projects.attachments.title') }} ({{ items.length }})</div>
    <v-list density="compact" class="pa-0">
      <v-list-item v-for="a in items" :key="a.id" class="px-0" @click="openFile(a.documentId)">
        <template #prepend>
          <!-- `opacity-100`: la fila atenúa los iconos de la izquierda y el color del tipo (el azul de Word, por ejemplo) casi no se veía. -->
          <v-icon :icon="fileKind(a.mimeType, a.fileName).icon" :color="fileKind(a.mimeType, a.fileName).color" class="opacity-100" />
        </template>
        <v-list-item-title class="text-body-medium">{{ a.fileName }}</v-list-item-title>
        <v-list-item-subtitle>{{ size(a.sizeBytes) }}</v-list-item-subtitle>
        <template #append>
          <v-btn
            v-if="canRemove(a)"
            icon="mdi-close"
            variant="text"
            size="x-small"
            :aria-label="t('projects.attachments.remove')"
            @click.stop="store.removeAttachment(a.id)"
          />
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>
