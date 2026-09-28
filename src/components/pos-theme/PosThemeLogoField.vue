<script setup lang="ts">
/**
 * Un campo de imagen del tema (logotipo, logotipo para modo oscuro, fondo del
 * acceso): muestra la imagen actual, permite quitarla y elegir otra.
 *
 * Elegir el archivo lo sube al momento (presigned → PUT → confirmación, el mismo
 * flujo de `ImageUploader`) y guarda solo el `fileId` en el tema. No se usa
 * `ImageUploader` porque está pensado para fotos de producto y avatares: aquí una
 * miniatura de 160×48 basta y un paso menos (sin botón "Subir") evita imágenes
 * elegidas que nunca llegan al tema.
 *
 * Los archivos cuelgan de la organización, no del tema: un tema nuevo todavía no
 * existe y no tiene id al que atarlos.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { fileApi } from '@/api/files';
import { fileUrl } from '@/composable/useFileUrl';
import { POS_THEME_IMAGE_MAX_MB, POS_THEME_IMAGE_MIME } from '@/types/posTheme';

const props = defineProps<{
  modelValue: string | null;
  label: string;
  hint?: string;
  /** `logo`, `logo-dark` o `login-background`: separa los archivos en document-service. */
  category: string;
  organizationId: string;
  /** El fondo del acceso admite más peso que un logotipo. */
  maxSizeMb?: number;
}>();

const emit = defineEmits<{ 'update:modelValue': [fileId: string | null] }>();

const { t } = useI18n();
const uploading = ref(false);
const error = ref<string | null>(null);

const maxMb = computed(() => props.maxSizeMb ?? POS_THEME_IMAGE_MAX_MB);
const currentUrl = computed(() => fileUrl(props.modelValue));

async function sha256(file: File): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function onPick(picked: File | File[] | null): Promise<void> {
  const file = Array.isArray(picked) ? picked[0] : picked;
  if (!file) return;
  error.value = null;

  if (!(POS_THEME_IMAGE_MIME as readonly string[]).includes(file.type)) {
    error.value = t('posThemes.imageBadType');
    return;
  }
  if (file.size > maxMb.value * 1024 * 1024) {
    error.value = t('uploader.tooLarge', { mb: maxMb.value });
    return;
  }

  uploading.value = true;
  try {
    const presigned = await fileApi.requestPresigned({
      resourceType: 'pos-theme-brand',
      resourceId: props.organizationId,
      category: props.category,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
    });
    const put = await fetch(presigned.presignedUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });
    if (!put.ok) throw new Error(`Error HTTP ${put.status}`);
    await fileApi.confirm(presigned.fileId, await sha256(file));
    emit('update:modelValue', presigned.fileId);
  } catch (e) {
    error.value = (e as { message?: string })?.message ?? t('posThemes.imageUploadError');
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <div>
    <div class="text-body-2 font-weight-medium mb-1">{{ label }}</div>
    <p v-if="hint" class="text-caption text-medium-emphasis mb-2">{{ hint }}</p>

    <div v-if="modelValue" class="d-flex align-center ga-4 mb-2">
      <v-img v-if="currentUrl" :src="currentUrl" max-height="48" max-width="160" width="160" alt="" />
      <v-progress-circular v-else indeterminate size="20" />
      <v-btn
        variant="text"
        color="error"
        size="small"
        prepend-icon="mdi-delete-outline"
        @click="emit('update:modelValue', null)"
      >
        {{ $t('posThemes.imageRemove') }}
      </v-btn>
    </div>

    <v-file-input
      :model-value="[]"
      :accept="POS_THEME_IMAGE_MIME.join(',')"
      :label="$t('posThemes.imagePick')"
      :loading="uploading"
      :disabled="uploading || !organizationId"
      prepend-icon=""
      prepend-inner-icon="mdi-upload"
      :error-messages="error ?? undefined"
      @update:model-value="onPick"
    />
  </div>
</template>
