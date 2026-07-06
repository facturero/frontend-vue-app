<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fileApi } from '@/api/files';

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
  }>(),
  {
    category: 'avatar',
    accept: 'image/*',
    maxSizeMB: 5,
    multiple: false,
    existingImages: () => [],
  },
);

const emit = defineEmits<{
  'upload-success': [fileIds: string[]];
  error: [message: string];
}>();

const STATE = { IDLE: 'idle', SELECTED: 'selected', UPLOADING: 'uploading', DONE: 'done', ERROR: 'error' } as const;
type State = (typeof STATE)[keyof typeof STATE];

const state = ref<State>(STATE.IDLE);
const selectedFiles = ref<{ file: File; url: string }[]>([]);
const completed = ref(0);
const total = ref(0);
const uploadError = ref<string | null>(null);
const uploadedIds = ref<string[]>([]);
const dragOver = ref(false);

const inputRef = ref<HTMLInputElement | null>(null);

const maxBytes = computed(() => props.maxSizeMB * 1024 * 1024);
const hasExisting = computed(() => props.existingImages.length > 0);
const hasPending = computed(() => selectedFiles.value.length > 0);

function openPicker(): void {
  inputRef.value?.click();
}

function onDragOver(e: DragEvent): void {
  e.preventDefault();
  dragOver.value = true;
}

function onDragLeave(): void {
  dragOver.value = false;
}

function onDrop(e: DragEvent): void {
  e.preventDefault();
  dragOver.value = false;
  const files = e.dataTransfer?.files;
  if (files) addFiles(files);
}

function onInputChange(e: Event): void {
  const files = (e.target as HTMLInputElement)?.files;
  if (files) addFiles(files);
}

async function addFiles(fileList: FileList): Promise<void> {
  uploadError.value = null;
  if (!props.multiple) {
    for (const item of selectedFiles.value) URL.revokeObjectURL(item.url);
    selectedFiles.value = [];
  }
  const max = props.multiple ? fileList.length : 1;
  for (let i = 0; i < max && i < fileList.length; i++) {
    const file = fileList[i];
    if (!file.type.startsWith('image/')) {
      uploadError.value = 'Solo se permiten imágenes';
      emit('error', 'Solo se permiten imágenes');
      continue;
    }
    if (file.size > maxBytes.value) {
      uploadError.value = `La imagen no debe superar ${props.maxSizeMB} MB`;
      emit('error', `La imagen no debe superar ${props.maxSizeMB} MB`);
      continue;
    }
    selectedFiles.value.push({ file, url: URL.createObjectURL(file) });
  }
  if (selectedFiles.value.length > 0) {
    state.value = STATE.SELECTED;
  }
}

function removePending(index: number): void {
  const item = selectedFiles.value[index];
  URL.revokeObjectURL(item.url);
  selectedFiles.value.splice(index, 1);
  if (selectedFiles.value.length === 0) {
    state.value = STATE.IDLE;
  }
}

function reset(): void {
  for (const item of selectedFiles.value) {
    URL.revokeObjectURL(item.url);
  }
  selectedFiles.value = [];
  completed.value = 0;
  total.value = 0;
  uploadError.value = null;
  uploadedIds.value = [];
  state.value = STATE.IDLE;
  if (inputRef.value) inputRef.value.value = '';
}

async function uploadAll(): Promise<string[]> {
  if (selectedFiles.value.length === 0) return [];

  state.value = STATE.UPLOADING;
  total.value = selectedFiles.value.length;
  completed.value = 0;
  uploadError.value = null;
  uploadedIds.value = [];

  for (const item of selectedFiles.value) {
    try {
      await uploadOne(item.file);
      completed.value++;
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? 'Error al subir';
      uploadError.value = `${item.file.name}: ${msg}`;
      state.value = STATE.ERROR;
      return [];
    }
  }

  state.value = STATE.DONE;
  emit('upload-success', uploadedIds.value);
  return uploadedIds.value;
}

async function uploadOne(file: File): Promise<void> {
  const presigned = await fileApi.requestPresigned({
    resourceType: props.resourceType,
    resourceId: props.resourceId,
    category: props.category,
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
  });

  const uploadUrl = presigned.presignedUrl;
  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });

  if (!uploadResp.ok) {
    throw new Error(`Error HTTP ${uploadResp.status}`);
  }

  const checksum = await sha256(file);
  await fileApi.confirm(presigned.fileId, checksum);
  uploadedIds.value.push(presigned.fileId);
}

async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

defineExpose({ uploadAll, hasPending: () => hasPending.value });

watch(() => props.existingImages, () => {
  if (state.value === STATE.DONE) {
    reset();
  }
});
</script>

<template>
  <v-card flat class="image-uploader">
    <v-card-text class="pa-0">
    <input
      ref="inputRef"
      type="file"
      :accept="accept"
      :multiple="multiple"
      class="d-none"
      @change="onInputChange"
    />

    <!-- IDLE / drop zone (single mode: existing image inside) -->
    <div
      v-if="state === 'idle' && !multiple && hasExisting"
      class="drop-zone single-preview d-flex align-center justify-center rounded-lg border position-relative"
      :class="{ 'drag-over': dragOver }"
      @click="openPicker"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <v-img :src="existingImages[0].url" alt="preview" cover class="preview-img rounded-lg" />
      <div class="overlay-icon d-flex align-center justify-center rounded-lg">
        <v-icon icon="mdi-camera" size="32" color="white" />
      </div>
    </div>

    <!-- IDLE / drop zone (empty or multiple) -->
    <div
      v-else-if="state === 'idle'"
      class="drop-zone d-flex flex-column align-center justify-center pa-6 rounded-lg border"
      :class="{ 'drag-over': dragOver }"
      @click="openPicker"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <v-icon icon="mdi-cloud-upload-outline" :size="48" :color="dragOver ? 'primary' : 'grey'" class="mb-2" />
      <span class="text-body-2 text-medium-emphasis">Arrastra o haz clic para seleccionar</span>
    </div>

    <!-- SELECTED / single mode: show selected image full card -->
    <div
      v-if="state === 'selected' && !multiple && selectedFiles.length > 0"
      class="drop-zone single-preview d-flex align-center justify-center rounded-lg border position-relative"
      :class="{ 'drag-over': dragOver }"
      @click="openPicker"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <v-img :src="selectedFiles[0].url" alt="preview" cover class="preview-img rounded-lg" />
      <v-btn
        icon="mdi-close-circle"
        size="small"
        color="error"
        variant="text"
        class="remove-top-right"
        @click.stop="removePending(0)"
      />
      <div class="overlay-icon d-flex align-center justify-center rounded-lg">
        <v-icon icon="mdi-camera" size="28" color="white" @click.stop="openPicker" />
      </div>
    </div>

    <!-- SELECTED / multiple mode: show pending thumbnails -->
    <div v-if="state === 'selected' && multiple" class="d-flex flex-wrap ga-2">
      <div v-for="(item, i) in selectedFiles" :key="i" class="pending-thumb position-relative">
        <v-img :src="item.url" class="pending-img rounded border" cover />
        <v-btn
          icon="mdi-close-circle"
          size="x-small"
          color="error"
          variant="text"
          class="remove-btn"
          @click="removePending(i)"
        />
      </div>
    </div>

    <!-- Existing images gallery (multiple mode) -->
    <div v-if="state === 'idle' && multiple && hasExisting" class="d-flex flex-wrap ga-2 mt-2">
      <v-img
        v-for="img in existingImages"
        :key="img.id"
        :src="img.url"
        max-width="100"
        max-height="100"
        cover
        class="rounded border existing-thumb"
      />
    </div>
    
    <!-- SELECTED: pending files -->
    <div v-if="state === 'selected'" class="mt-2">
      <div class="d-flex flex-wrap ga-2 mb-2">
        <div v-for="(item, i) in selectedFiles" :key="i" class="pending-thumb position-relative">
          <v-img :src="item.url" class="pending-img rounded border" cover />
          <v-btn
            icon="mdi-close-circle"
            color="error"
            variant="text"
            class="remove-btn"
            @click="removePending(i)"
          />
        </div>
      </div>
    </div>

    <!-- UPLOADING -->
    <div v-if="state === 'uploading'" class="mt-2">
      <v-progress-linear
        :model-value="total > 0 ? (completed / total) * 100 : 0"
        color="primary"
        height="6"
        rounded
      />
      <span class="text-caption text-medium-emphasis mt-1 d-block">
        Subiendo... {{ completed }} / {{ total }}
      </span>
    </div>

    <!-- DONE (single mode) -->
    <div
      v-if="state === 'done' && !multiple"
      class="drop-zone single-preview d-flex align-center justify-center rounded-lg border position-relative"
      @click="reset"
    >
      <img
        v-if="selectedFiles[0]"
        :src="selectedFiles[0].url"
        alt="preview"
        class="preview-img rounded-lg"
      />
      <div class="overlay-icon d-flex align-center justify-center rounded-lg">
        <v-icon icon="mdi-camera" size="32" color="white" />
      </div>
    </div>

    <!-- DONE (multiple mode) -->
    <div v-if="state === 'done' && multiple" class="mt-2 d-flex align-center ga-2">
      <v-icon icon="mdi-check-circle" color="success" />
      <span class="text-body-2 text-success">
        {{ uploadedIds.length > 1 ? `${uploadedIds.length} imágenes subidas` : 'Imagen subida' }}
      </span>
      <v-btn size="small" variant="text" prepend-icon="mdi-refresh" @click="reset">
        {{ multiple ? 'Añadir más' : 'Cambiar' }}
      </v-btn>
    </div>

    <!-- ERROR -->
    <div v-if="state === 'error'" class="mt-2 d-flex align-center ga-2">
      <v-icon icon="mdi-alert-circle" color="error" />
      <span class="text-body-2 text-error flex-grow-1">{{ uploadError }}</span>
      <v-btn size="small" variant="text" @click="reset">Reintentar</v-btn>
    </div>

    <div v-if="uploadError && state !== 'error' && state !== 'uploading'" class="mt-1">
      <span class="text-caption text-error">{{ uploadError }}</span>
    </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.drop-zone {
  border-style: dashed;
  border-width: 2px;
  border-color: rgba(var(--v-border-color), var(--v-border-opacity));
  transition: border-color 0.2s, background-color 0.2s;
  cursor: pointer;
  min-height: 120px;
}

.drop-zone.single-preview {
  border-style: solid;
  min-height: 200px;
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 0;
}

.drop-zone.single-preview .preview-img {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
}

.drop-zone.single-preview .overlay-icon {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0);
  transition: all 0.2s;
  opacity: 0;
}

.drop-zone.single-preview:hover .overlay-icon {
  background: rgba(0, 0, 0, 0.4);
  opacity: 1;
}

.drop-zone.drag-over {
  border-color: rgb(var(--v-theme-primary));
  background-color: rgba(var(--v-theme-primary), 0.05);
}

.pending-thumb {
  display: inline-block;
}

.pending-img {
  width: 100px;
  height: 100px;
  object-fit: cover;
  display: block;
}

.remove-btn {
  position: absolute;
  top: 0px;
  right: 0px;
}

.remove-top-right {
  position: absolute;
  top: 0px;
  right: 0px;
  z-index: 2;
}

.existing-thumb {
  object-fit: cover;
}
</style>
