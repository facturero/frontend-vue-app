<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useProductStore } from '@/stores/products';
import { productApi } from '@/api/products';
import ImageUploader from '@/components/ImageUploader.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useProductStore();

const productId = computed(() => route.params.id as string);
const canUpdate = computed(() => auth.can('product:update'));
const disabling = ref(false);

const product = computed(() => store.current);

const apiUrl = import.meta.env.VITE_API_URL as string;

function imageUrl(fileId: string): string {
  return `${apiUrl}/files/${fileId}/download`;
}

function taxRateLabel(taxRateId: string): string {
  const rate = store.taxRates.find((r) => r.id === taxRateId);
  return rate ? `${rate.name || rate.code} (${rate.percentage}%)` : taxRateId;
}

const taxKindLabels: Record<string, string> = {
  vat: 'IVA',
  withholding_iva: 'Ret. IVA',
  withholding_rent: 'Ret. Renta',
  special: 'ICE',
};

function taxKindLabel(kind: string): string {
  return taxKindLabels[kind] ?? kind;
}

const existingImages = computed(() =>
  product.value?.images.map((img) => ({
    id: img.id,
    url: imageUrl(img.fileId),
  })) ?? [],
);

const imageUploaderRef = ref<InstanceType<typeof ImageUploader> | null>(null);
const uploading = ref(false);
const uploadError = ref<string | null>(null);

async function disable(): Promise<void> {
  if (!confirm('¿Desactivar este producto?')) return;
  disabling.value = true;
  try {
    await store.disable(productId.value);
  } finally {
    disabling.value = false;
  }
}

function goEdit(): void {
  router.push({ name: 'products-edit', params: { id: productId.value } });
}

async function uploadImages(): Promise<void> {
  if (!imageUploaderRef.value || !imageUploaderRef.value.hasPending()) return;
  uploading.value = true;
  uploadError.value = null;
  try {
    const fileIds = await imageUploaderRef.value.uploadAll();
    if (fileIds.length > 0) {
      for (const fileId of fileIds) {
        await productApi.addImage(productId.value, { fileId });
      }
      await store.fetchById(productId.value);
    }
  } catch (e) {
    uploadError.value = (e as { message?: string })?.message ?? 'Error al subir imágenes';
  } finally {
    uploading.value = false;
  }
}

async function removeImage(imageId: string): Promise<void> {
  if (!confirm('¿Eliminar esta imagen?')) return;
  try {
    await productApi.removeImage(productId.value, imageId);
    await store.fetchById(productId.value);
  } catch (e) {
    uploadError.value = (e as { message?: string })?.message ?? 'Error al eliminar imagen';
  }
}

async function setPrimary(imageId: string): Promise<void> {
  try {
    await productApi.setPrimaryImage(productId.value, imageId);
    await store.fetchById(productId.value);
  } catch (e) {
    uploadError.value = (e as { message?: string })?.message ?? 'Error al cambiar imagen principal';
  }
}

onMounted(async () => {
  try {
    await store.fetchById(productId.value);
    await store.fetchCatalog();
  } catch {
    router.push({ name: 'products' });
  }
});
</script>

<template>
  <v-container>
    <div class="d-flex align-center mt-6 mb-4">
      <v-btn
        variant="text"
        icon="mdi-arrow-left"
        class="mr-2"
        @click="router.push({ name: 'products' })"
      />
      <h2 class="text-h5 font-weight-medium">{{ product?.name || 'Producto' }}</h2>
      <v-spacer />
      <v-btn
        v-if="canUpdate && product?.status === 'active'"
        color="error"
        variant="tonal"
        size="small"
        prepend-icon="mdi-archive"
        :loading="disabling"
        @click="disable"
        class="mr-2"
      >
        Desactivar
      </v-btn>
      <v-btn
        v-if="canUpdate"
        color="primary"
        variant="tonal"
        size="small"
        prepend-icon="mdi-pencil"
        @click="goEdit"
      >
        Editar
      </v-btn>
    </div>

    <v-alert
      v-if="store.error"
      type="error"
      density="compact"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="store.error = null"
    >
      {{ store.error }}
    </v-alert>

    <v-alert
      v-if="uploadError"
      type="error"
      density="compact"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="uploadError = null"
    >
      {{ uploadError }}
    </v-alert>

    <div v-if="!store.loading && product">
      <v-row>
        <v-col cols="12" md="8">
          <v-card elevation="2" rounded="lg" class="mb-4">
            <v-card-title class="text-h6">Información general</v-card-title>
            <v-card-text>
              <v-row>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">Nombre</p>
                  <p class="text-body-1 mb-3">{{ product.name }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">SKU</p>
                  <p class="text-body-1 mb-3">{{ product.sku || '—' }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">Tipo</p>
                  <v-chip size="x-small" variant="tonal" color="info" class="mb-3">
                    {{ product.type === 'good' ? 'Producto' : 'Servicio' }}
                  </v-chip>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">Estado</p>
                  <v-chip
                    size="x-small"
                    :color="product.status === 'active' ? 'success' : 'warning'"
                    variant="tonal"
                    class="mb-3"
                  >
                    {{ product.status === 'active' ? 'Activo' : 'Inactivo' }}
                  </v-chip>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">Precio</p>
                  <p class="text-body-1 mb-3">
                    {{ product.currencyCode }} {{ product.price }}
                    <span v-if="product.priceIncludesTax" class="text-caption text-medium-emphasis">(inc. IVA)</span>
                  </p>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">Moneda</p>
                  <p class="text-body-1 mb-3">{{ product.currencyCode }}</p>
                </v-col>
                <v-col cols="12">
                  <p class="text-caption text-medium-emphasis">Categoría</p>
                  <p class="text-body-1 mb-3">{{ product.categoryId || '—' }}</p>
                </v-col>
                <v-col cols="12">
                  <p class="text-caption text-medium-emphasis">Descripción</p>
                  <p class="text-body-1 mb-3">{{ product.description || 'Sin descripción' }}</p>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <v-card elevation="2" rounded="lg" class="mb-4">
            <v-card-title class="text-h6">Impuestos</v-card-title>
            <v-card-text>
              <v-table v-if="product.taxes.length > 0">
                <thead>
                  <tr>
                    <th class="text-left font-weight-medium">Tasa</th>
                    <th class="text-left font-weight-medium">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="tax in product.taxes" :key="tax.id">
                    <td>{{ taxRateLabel(tax.taxRateId) }}</td>
                    <td>
                      <v-chip size="x-small" variant="tonal" color="primary">
                        {{ taxKindLabel(tax.kind) }}
                      </v-chip>
                    </td>
                  </tr>
                </tbody>
              </v-table>
              <p v-else class="text-body-2 text-medium-emphasis">Sin impuestos asignados</p>
            </v-card-text>
          </v-card>

          <v-card elevation="2" rounded="lg" class="mb-4">
            <v-card-title class="text-h6">Imágenes</v-card-title>
            <v-card-text>
              <div v-if="product.images.length > 0" class="d-flex flex-wrap ga-3 mb-4">
                <div
                  v-for="img in product.images"
                  :key="img.id"
                  class="image-card position-relative"
                >
                  <v-img
                    :src="imageUrl(img.fileId)"
                    :alt="img.alt || 'Imagen del producto'"
                    width="140"
                    height="140"
                    cover
                    class="rounded-lg border"
                  >
                    <template #placeholder>
                      <v-skeleton-loader type="image" class="w-100 h-100" />
                    </template>
                  </v-img>
                  <div class="image-overlay d-flex flex-column align-center justify-center ga-1">
                    <v-btn
                      v-if="!img.isPrimary"
                      size="x-small"
                      variant="tonal"
                      color="white"
                      class="opacity-80"
                      @click="setPrimary(img.id)"
                    >
                      Principal
                    </v-btn>
                    <v-btn
                      size="x-small"
                      variant="tonal"
                      color="error"
                      class="opacity-80"
                      @click="removeImage(img.id)"
                    >
                      Eliminar
                    </v-btn>
                  </div>
                  <v-chip
                    v-if="img.isPrimary"
                    size="x-small"
                    color="primary"
                    class="primary-badge"
                  >
                    Principal
                  </v-chip>
                </div>
              </div>
              <p v-else class="text-body-2 text-medium-emphasis mb-4">Sin imágenes</p>

              <v-divider class="mb-4" />

              <p class="text-body-2 text-medium-emphasis mb-2">Agregar imágenes</p>
              <ImageUploader
                ref="imageUploaderRef"
                resource-type="product"
                :resource-id="productId"
                category="product-image"
                :multiple="true"
                :accept="'image/*'"
                :max-size-mb="5"
              />
              <v-btn
                v-if="canUpdate"
                color="primary"
                variant="tonal"
                size="small"
                prepend-icon="mdi-upload"
                :loading="uploading"
                :disabled="!imageUploaderRef?.hasPending()"
                class="mt-3"
                @click="uploadImages"
              >
                Subir imágenes
              </v-btn>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="4">
          <v-card elevation="2" rounded="lg">
            <v-card-title class="text-h6">Metadatos</v-card-title>
            <v-card-text>
              <p class="text-caption text-medium-emphasis">Creado</p>
              <p class="text-body-2 mb-3">{{ new Date(product.createdAt).toLocaleDateString() }}</p>
              <p class="text-caption text-medium-emphasis">Actualizado</p>
              <p class="text-body-2">{{ new Date(product.updatedAt).toLocaleDateString() }}</p>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <div v-else class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>
  </v-container>
</template>

<style scoped>
.image-card {
  overflow: hidden;
}

.image-card .image-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 0.2s;
  border-radius: 8px;
}

.image-card:hover .image-overlay {
  opacity: 1;
}

.primary-badge {
  position: absolute;
  top: 4px;
  left: 4px;
}

.opacity-80 {
  opacity: 0.9;
}
</style>
