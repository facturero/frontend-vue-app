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

function icon(a: TaskAttachment): string {
  if (a.mimeType.startsWith('image/')) return 'mdi-file-image-outline';
  if (a.mimeType === 'application/pdf') return 'mdi-file-pdf-box';
  if (a.mimeType.includes('sheet') || a.mimeType.includes('excel') || a.mimeType === 'text/csv') return 'mdi-file-excel-outline';
  if (a.mimeType.includes('word') || a.mimeType.includes('document')) return 'mdi-file-word-outline';
  return 'mdi-file-outline';
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
      <v-list-item v-for="a in items" :key="a.id" :prepend-icon="icon(a)" class="px-0" @click="openFile(a.documentId)">
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
