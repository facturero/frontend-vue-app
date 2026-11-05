<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { openFile } from '@/composable/useFileUrl';
import { useAuthStore } from '@/stores/auth';
import { useProjectsStore } from '@/stores/projects';
import type { TaskAttachment } from '@/types/projects';

/**
 * Adjuntos de la tarea. El archivo se sube a document-service (URL firmada) y la tarea guarda la referencia; abrirlo pide un enlace
 * firmado con la sesión, así que un archivo de otra empresa no se abre aunque alguien conozca su id.
 */
const { t, locale } = useI18n();
const store = useProjectsStore();
const auth = useAuthStore();

const input = ref<HTMLInputElement | null>(null);
const uploading = ref(0);

const items = computed(() => store.detail?.attachments ?? []);

function icon(a: TaskAttachment): string {
  if (a.mimeType.startsWith('image/')) return 'mdi-file-image-outline';
  if (a.mimeType === 'application/pdf') return 'mdi-file-pdf-box';
  if (a.mimeType.includes('sheet') || a.mimeType.includes('excel') || a.mimeType === 'text/csv') return 'mdi-file-excel-outline';
  if (a.mimeType.includes('word') || a.mimeType.includes('document')) return 'mdi-file-word-outline';
  return 'mdi-file-outline';
}

const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
    ? `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(bytes / 1024)} KB`
    : `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;

async function picked(event: Event): Promise<void> {
  const files = [...((event.target as HTMLInputElement).files ?? [])];
  (event.target as HTMLInputElement).value = '';
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
    <div class="d-flex align-center mb-2">
      <span class="text-body-1 font-weight-medium">{{ t('projects.attachments.title') }}</span>
      <v-spacer />
      <template v-if="store.detail.canComment">
        <input ref="input" type="file" multiple class="d-none" @change="picked" />
        <v-btn variant="text" size="small" prepend-icon="mdi-paperclip" :loading="uploading > 0" @click="input?.click()">
          {{ t('projects.attachments.add') }}
        </v-btn>
      </template>
    </div>
    <v-list v-if="items.length" density="compact" class="pa-0">
      <v-list-item v-for="a in items" :key="a.id" :prepend-icon="icon(a)" class="px-0" @click="openFile(a.documentId)">
        <v-list-item-title class="text-body-2">{{ a.fileName }}</v-list-item-title>
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
    <div v-else class="text-caption text-medium-emphasis">{{ t('projects.attachments.empty') }}</div>
  </div>
</template>
