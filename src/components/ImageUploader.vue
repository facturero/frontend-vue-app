<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { fileApi } from '@/api/files';
import avatarPlaceholder from '@/assets/avatar-placeholder.svg';

/**
 * Subida de imágenes (avatar de cliente y de persona, fotos de producto) con el flujo de archivos del CRM: URL prefirmada →
 * `PUT` directo al almacenamiento → confirmación con el SHA-256. Las vistas eligen y el padre decide cuándo subir
 * (`uploadAll()` al guardar el formulario), así un formulario a medias no deja archivos huérfanos.
 *
 * Tres formas, todas con componentes de Vuetify y sin hoja de estilo propia (UI-UX.md §1):
 * - **galería** (`multiple`, fotos de producto): `v-file-upload`, con su zona para soltar, su lista con miniatura, tamaño y quitar;
 * - **imagen única** (avatar de cliente): sin imagen, la misma zona de `v-file-upload`; con imagen, la imagen entera con una capa
 *   (`v-overlay`) que al pasar el ratón invita a cambiarla, y mientras sube, el progreso encima;
 * - **compacta** (avatar del perfil): solo la imagen o la silueta, que llena el círculo del padre; la acción vive en el botón de
 *   cámara del padre, que llama a `openPicker()`.
 *
 * API para el padre (no cambió con la migración a `v-file-upload`, 2026-11-18): `uploadAll()`, `hasPending()`, `openPicker()`.
 */
interface ExistingImage {
  id: string;
  url: string;
}

const props = withDefaults(
  defineProps<{
    resourceType: string;
    resourceId: string;
    category?: string;
    accept?: string;
    maxSizeMB?: number;
    multiple?: boolean;
    existingImages?: ExistingImage[];
    /** Solo la imagen, sin zona para soltar ni capa: para usos pequeños como un avatar circular. */
    compact?: boolean;
  }>(),
  {
    category: 'avatar',
    accept: 'image/*',
    maxSizeMB: 5,
    multiple: false,
    existingImages: () => [],
    compact: false,
  },
);

const { t } = useI18n();

const emit = defineEmits<{
  'upload-success': [fileIds: string[]];
  error: [message: string];
}>();

/** Lo elegido y aún sin subir (el modelo de `v-file-upload`). */
const files = ref<File[]>([]);
const uploading = ref(false);
const completed = ref(0);
const total = ref(0);
/** Aviso de lo que no se aceptó (tipo, tamaño, repetida) o de un fallo al subir. */
const problem = ref<string | null>(null);
const failed = ref(false);
/** Tras subir: cuántas se subieron (galería) y la imagen que se queda a la vista hasta que el padre traiga la nueva (única). */
const uploadedCount = ref(0);
const justUploaded = ref(false);

const maxBytes = computed(() => props.maxSizeMB * 1024 * 1024);

function warn(message: string): void {
  problem.value = message;
  emit('error', message);
}

/**
 * Filtro de lo que entra, sobre el modelo de `v-file-upload`: el tipo ya lo filtra `filter-by-type`, pero lo que se arrastra o se
 * pega puede colarse, y el tamaño y las repetidas no los mira Vuetify. Lo rechazado sale del modelo y se dice por qué.
 */
function take(next: File[] | File | null): void {
  const list = next ? (Array.isArray(next) ? next : [next]) : [];
  problem.value = null;
  failed.value = false;
  justUploaded.value = false;
  const kept: File[] = [];
  let duplicates = 0;
  for (const file of list) {
    if (!file.type.startsWith('image/')) {
      warn(t('uploader.onlyImages'));
      continue;
    }
    if (file.size > maxBytes.value) {
      warn(t('uploader.tooLarge', { mb: props.maxSizeMB }));
      continue;
    }
    // Repetida: mismo nombre, tamaño y fecha de modificación.
    if (kept.some((k) => k.name === file.name && k.size === file.size && k.lastModified === file.lastModified)) {
      duplicates++;
      continue;
    }
    kept.push(file);
  }
  if (duplicates) warn(duplicates === 1 ? t('uploader.duplicate') : t('uploader.duplicates', { count: duplicates }));
  files.value = props.multiple ? kept : kept.slice(-1);
}

/** `v-file-upload` avisa del rechazo ANTES de actualizar su modelo, y `take()` limpia el aviso: se dice en el tick siguiente. */
function onRejected(): void {
  void nextTick(() => warn(t('uploader.onlyImages')));
}

/** Vista previa de la imagen única elegida. La URL temporal se libera al cambiarla y al desmontar. */
const previewUrl = shallowRef<string | null>(null);
watch(
  () => (props.multiple ? null : files.value[0] ?? null),
  (file) => {
    if (previewUrl.value && !justUploaded.value) URL.revokeObjectURL(previewUrl.value);
    if (file) previewUrl.value = URL.createObjectURL(file);
    else if (!justUploaded.value) previewUrl.value = null;
  },
);
onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});

/** La imagen que se ve en los modos de imagen única: lo elegido, lo recién subido o la que ya tenía. */
const shownUrl = computed(() => previewUrl.value ?? props.existingImages[0]?.url ?? null);

/** Abre el selector de archivos del sistema (el botón de cámara del perfil, cambiar la imagen única). */
function openPicker(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = props.accept;
  input.multiple = props.multiple;
  input.addEventListener('change', () => {
    const picked = input.files ? [...input.files] : [];
    if (picked.length) take(props.multiple ? [...files.value, ...picked] : picked);
  });
  input.click();
}

function remove(): void {
  files.value = [];
  problem.value = null;
}

async function uploadAll(): Promise<string[]> {
  if (!files.value.length) return [];
  uploading.value = true;
  failed.value = false;
  problem.value = null;
  total.value = files.value.length;
  completed.value = 0;
  const ids: string[] = [];
  for (const file of files.value) {
    try {
      ids.push(await uploadOne(file));
      completed.value++;
    } catch (e) {
      const message = (e as { message?: string })?.message ?? t('uploader.uploadError');
      problem.value = `${file.name}: ${message}`;
      failed.value = true;
      uploading.value = false;
      return [];
    }
  }
  uploading.value = false;
  uploadedCount.value = ids.length;
  // La imagen única se queda a la vista (sin liberar su URL) hasta que el padre traiga la definitiva por `existingImages`.
  justUploaded.value = true;
  files.value = [];
  emit('upload-success', ids);
  return ids;
}

async function uploadOne(file: File): Promise<string> {
  const presigned = await fileApi.requestPresigned({
    resourceType: props.resourceType,
    resourceId: props.resourceId,
    category: props.category,
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
  });
  const response = await fetch(presigned.presignedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await fileApi.confirm(presigned.fileId, await sha256(file));
  return presigned.fileId;
}

async function sha256(file: File): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// El padre trajo la imagen definitiva: se suelta la vista previa de lo recién subido.
watch(
  () => props.existingImages,
  () => {
    if (!justUploaded.value) return;
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
    justUploaded.value = false;
  },
);

const progress = computed(() => (total.value ? (completed.value / total.value) * 100 : 0));

defineExpose({ uploadAll, hasPending: () => files.value.length > 0, openPicker });
</script>

<template>
  <div>
    <!-- Compacta: la imagen llena el contenedor del padre (el círculo del perfil). Sin acción propia: la pone el padre. -->
    <v-img v-if="compact" :src="shownUrl ?? avatarPlaceholder" cover height="100%" width="100%" alt="">
      <v-overlay :model-value="uploading" contained persistent scrim="black" class="align-center justify-center">
        <v-progress-circular :model-value="progress" color="white" size="36" width="3" />
      </v-overlay>
    </v-img>

    <!-- Imagen única con imagen: clic o soltar encima para cambiarla; la capa lo dice al pasar el ratón. La interacción va en el
         `v-sheet`: `v-img` no pasa `role`, `tabindex` ni los eventos a su raíz. -->
    <v-hover v-else-if="!multiple && shownUrl" v-slot="{ isHovering, props: hover }">
      <v-sheet
        v-bind="hover"
        height="200"
        class="position-relative overflow-hidden border cursor-pointer"
        role="button"
        tabindex="0"
        :aria-label="t('uploader.replace')"
        @click="!uploading && openPicker()"
        @keydown.enter="!uploading && openPicker()"
        @dragover.prevent
        @drop.prevent="take([...($event.dataTransfer?.files ?? [])])"
      >
        <v-img :src="shownUrl" cover height="200" alt="" />
        <!-- La capa no recibe clics (pasan al `v-sheet`, que abre el selector) y va por debajo del botón de quitar: con su
             `z-index` por defecto tapaba el botón y no se podía quitar lo elegido. -->
        <v-overlay
          :model-value="uploading || !!isHovering"
          contained
          persistent
          scrim="black"
          :z-index="0"
          class="align-center justify-center pointer-events-none"
        >
          <v-progress-circular v-if="uploading" :model-value="progress" color="white" size="36" width="3" />
          <v-icon v-else icon="mdi-camera" size="32" color="white" />
        </v-overlay>
        <v-btn
          v-if="files.length && !uploading"
          icon="mdi-close"
          size="small"
          variant="flat"
          class="position-absolute top-0 right-0 ma-2"
          :aria-label="t('uploader.remove')"
          @click.stop="remove"
        />
      </v-sheet>
    </v-hover>

    <!-- Galería, o imagen única aún sin imagen: la zona de Vuetify para soltar o explorar, con su lista de lo elegido. -->
    <v-file-upload
      v-else
      :model-value="files"
      :multiple="multiple"
      :filter-by-type="props.accept"
      :title="t('uploader.dropHint')"
      icon="mdi-cloud-upload-outline"
      density="compact"
      :disabled="uploading"
      :loading="uploading"
      clearable
      show-size
      @update:model-value="take"
      @rejected="onRejected"
    />

    <!-- Subiendo una galería: no hay una imagen sobre la que poner el progreso. -->
    <div v-if="uploading && multiple" class="mt-2">
      <v-progress-linear :model-value="progress" color="primary" height="6" rounded />
      <div class="text-body-small text-medium-emphasis mt-1">{{ t('uploader.uploading', { done: completed, total }) }}</div>
    </div>

    <div v-if="multiple && justUploaded && uploadedCount" class="mt-2 d-flex align-center ga-2 text-body-medium text-success">
      <v-icon icon="mdi-check-circle" />
      {{ uploadedCount > 1 ? t('uploader.uploaded', { count: uploadedCount }) : t('uploader.uploadedOne') }}
    </div>

    <v-alert v-if="problem && !uploading" :type="failed ? 'error' : 'warning'" class="mt-2" :text="problem">
      <template v-if="failed" #append>
        <v-btn size="small" variant="text" @click="uploadAll">{{ t('uploader.retry') }}</v-btn>
      </template>
    </v-alert>
  </div>
</template>
