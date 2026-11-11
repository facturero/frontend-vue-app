<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatBytes } from '@/utils/format';
import { useI18n } from 'vue-i18n';
import { openFile } from '@/composable/useFileUrl';
import { useAuthStore } from '@/stores/auth';
import { useProjectsStore } from '@/stores/projects';
import type { TaskAttachment } from '@/types/projects';

/**
 * Adjuntos de la tarea. El archivo se sube a document-service (URL firmada) y la tarea guarda la referencia; abrirlo pide un enlace
 * firmado con la sesión, así que un archivo de otra empresa no se abre aunque alguien conozca su id.
 */
const { t } = useI18n();
const store = useProjectsStore();
const auth = useAuthStore();

const uploading = ref(0);
/** Lo que `v-file-upload` tiene en la mano: se sube al instante y se vacía, así la lista que manda es la de adjuntos de la tarea. */
const dropped = ref<File[]>([]);

const items = computed(() => store.detail?.attachments ?? []);

/**
 * Icono y color por tipo, para reconocer el archivo de un vistazo (lo pidió un cliente): Excel verde, PDF rojo, Word azul, imagen
 * naranja, presentación en el color secundario. Colores del tema, no hexadecimales.
 */
function kind(a: TaskAttachment): { icon: string; color: string | undefined } {
  const mime = a.mimeType.toLowerCase();
  const ext = a.fileName.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return { icon: 'mdi-file-image-outline', color: 'warning' };
  if (mime === 'application/pdf' || ext === 'pdf') return { icon: 'mdi-file-pdf-box', color: 'error' };
  if (mime.includes('sheet') || mime.includes('excel') || mime === 'text/csv' || ['xlsx', 'xls', 'csv', 'ods'].includes(ext)) return { icon: 'mdi-file-excel-outline', color: 'success' };
  if (mime.includes('presentation') || mime.includes('powerpoint') || ['pptx', 'ppt', 'odp'].includes(ext)) return { icon: 'mdi-file-powerpoint-outline', color: 'secondary' };
  if (mime.includes('word') || mime.includes('document') || ['docx', 'doc', 'odt'].includes(ext)) return { icon: 'mdi-file-word-outline', color: 'info' };
  if (mime.includes('zip') || mime.includes('compressed') || ['zip', 'rar', '7z'].includes(ext)) return { icon: 'mdi-folder-zip-outline', color: undefined };
  return { icon: 'mdi-file-outline', color: undefined };
}

const size = (bytes: number) => formatBytes(bytes);

async function picked(value: File | File[] | null): Promise<void> {
  const files = value ? (Array.isArray(value) ? value : [value]) : [];
  dropped.value = [];
  for (const file of files) {
    uploading.value += 1;
    try {
      await store.attachFile(file);
    } catch {
      // El aviso lo deja el store; se sigue con los demás archivos.
    } finally {
      uploading.value -= 1;
    }
  }
}

const canRemove = (a: TaskAttachment) => a.uploadedBy === auth.user?.id || !!store.detail?.canEdit;
</script>

<template>
  <div v-if="store.detail">
    <div class="text-body-large font-weight-medium mb-2">{{ t('projects.attachments.title') }}</div>
    <!-- `v-file-upload` (Vuetify 4): soltar archivos sobre la tarea o elegirlos; en vez de un <input type="file"> oculto. -->
    <v-file-upload
      v-if="store.detail.canComment"
      :model-value="dropped"
      multiple
      density="compact"
      :title="t('projects.attachments.drop')"
      :loading="uploading > 0"
      class="mb-2"
      @update:model-value="picked"
    />
    <v-list v-if="items.length" density="compact" class="pa-0">
      <v-list-item v-for="a in items" :key="a.id" class="px-0" @click="openFile(a.documentId)">
        <template #prepend>
          <v-icon :icon="kind(a).icon" :color="kind(a).color" />
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
    <div v-else class="text-body-small text-medium-emphasis">{{ t('projects.attachments.empty') }}</div>
  </div>
</template>
