<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useProductStore } from '@/stores/products';
import { useOrganizationStore } from '@/stores/organization';
import { productApi } from '@/api/products';
import ImageUploader from '@/components/ImageUploader.vue';
import PageHeader from '@/components/ui/PageHeader.vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useProductStore();
const organizationStore = useOrganizationStore();

const productId = computed(() => route.params.id as string);
const canUpdate = computed(() => auth.can('product:update'));
const disabling = ref(false);

const product = computed(() => store.current);

const apiUrl = import.meta.env.VITE_API_URL as string;

const productEstablishments = computed(() =>
  (product.value?.establishmentIds ?? []).map((id) => {
    const est = organizationStore.establishments.find((e) => e.id === id);
    return {
      id,
      code: est?.code ?? '—',
      name: est?.name ?? t('organization.establishment'),
    };
  }),
);

function imageUrl(fileId: string): string {
  return `${apiUrl}/files/${fileId}/download`;
}

function taxRateLabel(taxRateId: string): string {
  const rate = store.taxRates.find((r) => r.id === taxRateId);
  return rate ? `${rate.name || rate.code} (${rate.percentage}%)` : taxRateId;
}

function taxKindLabel(kind: string): string {
  const key = `products.taxKind.${kind}`;
  const label = t(key);
  // vue-i18n devuelve la propia clave cuando no existe traducción: en ese caso
  // se muestra el kind crudo del backend en vez de una ruta de i18n.
  return label === key ? kind : label;
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
  if (!confirm(t('products.deactivateConfirm'))) return;
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
    uploadError.value = (e as { message?: string })?.message ?? t('products.uploadError');
  } finally {
    uploading.value = false;
  }
}

async function removeImage(imageId: string): Promise<void> {
  if (!confirm(t('products.removeImageConfirm'))) return;
  try {
    await productApi.removeImage(productId.value, imageId);
    await store.fetchById(productId.value);
  } catch (e) {
    uploadError.value = (e as { message?: string })?.message ?? t('products.removeImageError');
  }
}

async function setPrimary(imageId: string): Promise<void> {
  try {
    await productApi.setPrimaryImage(productId.value, imageId);
    await store.fetchById(productId.value);
  } catch (e) {
    uploadError.value = (e as { message?: string })?.message ?? t('products.setPrimaryError');
  }
}

onMounted(async () => {
  try {
    await store.fetchById(productId.value);
    await store.fetchCatalog();
    await organizationStore.fetchEstablishments();
  } catch {
    router.push({ name: 'products' });
  }
});
</script>

<template>
  <v-container>
    <PageHeader
      :title="product?.name || $t('products.singular')"
      :back-to="{ name: 'products' }"
    >
      <template #actions>
        <v-btn
          v-if="canUpdate && product?.status === 'active'"
          color="error"
          variant="tonal"
          size="small"
          prepend-icon="mdi-archive"
          :loading="disabling"
          @click="disable"
        >
          {{ $t('common.deactivate') }}
        </v-btn>
        <v-btn
          v-if="canUpdate"
          color="primary"
          variant="tonal"
          size="small"
          prepend-icon="mdi-pencil"
          @click="goEdit"
        >
          {{ $t('common.edit') }}
        </v-btn>
      </template>
    </PageHeader>

    <v-alert
      v-if="store.error"
      type="error"
      closable
      class="mb-4"
      @click:close="store.error = null"
    >
      {{ store.error }}
    </v-alert>

    <v-alert
      v-if="uploadError"
      type="error"
      closable
      class="mb-4"
      @click:close="uploadError = null"
    >
      {{ uploadError }}
    </v-alert>

    <div v-if="!store.loading && product">
      <v-row>
        <v-col cols="12" md="8">
          <v-card class="mb-4">
            <v-card-title class="text-h6">{{ $t('common.generalInfo') }}</v-card-title>
            <v-card-text>
              <v-row>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">{{ $t('common.name') }}</p>
                  <p class="text-body-1 mb-3">{{ product.name }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">SKU</p>
                  <p class="text-body-1 mb-3">{{ product.sku || '—' }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">{{ $t('common.type') }}</p>
                  <v-chip size="x-small" color="info" class="mb-3">
                    {{ product.type === 'good' ? $t('products.good') : $t('products.service') }}
                  </v-chip>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">{{ $t('common.status') }}</p>
                  <v-chip
                    size="x-small"
                    :color="product.status === 'active' ? 'success' : 'warning'"
                    class="mb-3"
                  >
                    {{ product.status === 'active' ? $t('common.active') : $t('common.inactive') }}
                  </v-chip>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">{{ $t('products.price') }}</p>
                  <p class="text-body-1 mb-3">
                    {{ product.currencyCode }} {{ product.price }}
                    <span v-if="product.priceIncludesTax" class="text-caption text-medium-emphasis">{{
                      $t('products.priceIncludesTaxShort') }}</span>
                  </p>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">{{ $t('products.currency') }}</p>
                  <p class="text-body-1 mb-3">{{ product.currencyCode }}</p>
                </v-col>
                <v-col cols="12">
                  <p class="text-caption text-medium-emphasis">{{ $t('products.category') }}</p>
                  <p class="text-body-1 mb-3">{{ product.categoryId || '—' }}</p>
                </v-col>
                <v-col cols="12">
                  <p class="text-caption text-medium-emphasis">{{ $t('common.description') }}</p>
                  <p class="text-body-1 mb-3">{{ product.description || $t('products.noDescription') }}</p>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <v-card class="mb-4">
            <v-card-title class="text-h6">{{ $t('products.taxes') }}</v-card-title>
            <v-card-text>
              <v-table v-if="product.taxes.length > 0">
                <thead>
                  <tr>
                    <th class="text-left font-weight-medium">{{ $t('products.taxRate') }}</th>
                    <th class="text-left font-weight-medium">{{ $t('common.type') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="tax in product.taxes" :key="tax.id">
                    <td>{{ taxRateLabel(tax.taxRateId) }}</td>
                    <td>
                      <v-chip size="x-small" color="primary">
                        {{ taxKindLabel(tax.kind) }}
                      </v-chip>
                    </td>
                  </tr>
                </tbody>
              </v-table>
              <p v-else class="text-body-2 text-medium-emphasis">{{ $t('products.noTaxes') }}</p>
            </v-card-text>
          </v-card>

          <v-card class="mb-4">
            <v-card-title class="text-h6">{{ $t('products.establishments') }}</v-card-title>
            <v-card-text>
              <div v-if="productEstablishments.length > 0" class="d-flex flex-wrap ga-2">
                <v-chip
                  v-for="est in productEstablishments"
                  :key="est.id"
                  size="small"
                  color="primary"
                  data-testid="product-establishment-chip"
                >
                  {{ est.code }} — {{ est.name }}
                </v-chip>
              </div>
              <p v-else class="text-body-2 text-medium-emphasis">{{ $t('products.noEstablishments') }}</p>
            </v-card-text>
          </v-card>

          <v-card class="mb-4">
            <v-card-title class="text-h6">{{ $t('common.images') }}</v-card-title>
            <v-card-text>
              <div v-if="product.images.length > 0" class="d-flex flex-wrap ga-3 mb-4">
                <v-hover
                  v-for="img in product.images"
                  :key="img.id"
                  v-slot="{ isHovering, props: hoverProps }"
                >
                  <div v-bind="hoverProps" class="position-relative rounded-lg overflow-hidden">
                    <v-img
                      :src="imageUrl(img.fileId)"
                      :alt="img.alt || $t('products.imageAlt')"
                      width="140"
                      height="140"
                      cover
                      class="rounded-lg border"
                    >
                      <template #placeholder>
                        <v-skeleton-loader type="image" class="w-100 h-100" />
                      </template>
                    </v-img>

                    <v-overlay
                      :model-value="isHovering"
                      contained
                      scrim="black"
                      class="align-center justify-center"
                      persistent
                      no-click-animation
                    >
                      <div class="d-flex flex-column align-center ga-1">
                        <v-btn
                          v-if="!img.isPrimary"
                          size="x-small"
                          variant="tonal"
                          color="white"
                          @click="setPrimary(img.id)"
                        >
                          {{ $t('common.primary') }}
                        </v-btn>
                        <v-btn
                          size="x-small"
                          variant="tonal"
                          color="error"
                          @click="removeImage(img.id)"
                        >
                          {{ $t('common.delete') }}
                        </v-btn>
                      </div>
                    </v-overlay>

                    <v-chip
                      v-if="img.isPrimary"
                      size="x-small"
                      color="primary"
                      class="position-absolute top-0 left-0 ma-1"
                    >
                      {{ $t('common.primary') }}
                    </v-chip>
                  </div>
                </v-hover>
              </div>
              <p v-else class="text-body-2 text-medium-emphasis mb-4">{{ $t('products.noImages') }}</p>

              <v-divider class="mb-4" />

              <p class="text-body-2 text-medium-emphasis mb-2">{{ $t('products.addImages') }}</p>
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
                {{ $t('products.uploadImages') }}
              </v-btn>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="4">
          <v-card>
            <v-card-title class="text-h6">{{ $t('common.metadata') }}</v-card-title>
            <v-card-text>
              <p class="text-caption text-medium-emphasis">{{ $t('common.createdAt') }}</p>
              <p class="text-body-2 mb-3">{{ new Date(product.createdAt).toLocaleDateString(locale) }}</p>
              <p class="text-caption text-medium-emphasis">{{ $t('common.updatedAt') }}</p>
              <p class="text-body-2">{{ new Date(product.updatedAt).toLocaleDateString(locale) }}</p>
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
