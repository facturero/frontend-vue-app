<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useProductStore } from '@/stores/products';
import { productApi } from '@/api/products';
import { extractError } from '@/utils/error';
import ImageUploader from '@/components/ImageUploader.vue';
import type { ProductType, CreateProductInput, UpdateProductInput } from '@/types/products';

const route = useRoute();
const router = useRouter();
const store = useProductStore();

const isEdit = computed(() => !!route.params.id);
const productId = computed(() => route.params.id as string | undefined);

const name = ref('');
const sku = ref('');
const type = ref<ProductType>('good');
const description = ref('');
const price = ref('');
const currencyCode = ref('USD');
const priceIncludesTax = ref(false);
const categoryId = ref<string | null>(null);
const unitId = ref<string | null>(null);
const selectedTaxIds = ref<string[]>([]);
const vatRateId = ref<string | null>(null);
const saving = ref(false);
const saveError = ref<string | null>(null);

const imageUploaderRef = ref<InstanceType<typeof ImageUploader> | null>(null);
const uploading = ref(false);

const apiUrl = import.meta.env.VITE_API_URL as string;
const tempId = crypto.randomUUID();

const imageResourceId = computed(() => productId.value ?? tempId);

const existingImages = computed(() =>
  store.current?.images.map((img) => ({
    id: img.id,
    url: `${apiUrl}/files/${img.fileId}/download`,
  })) ?? [],
);

// Solo tasas de IVA (kind: vat) para el selector principal. En un producto solo hay
// UNA tasa de IVA (0% o 15% en Ecuador). Los otros impuestos (retenciones, ICE) se
// modelan como campos separados cuando se implementen; ver `docs/IMPUESTOS.md`.
const vatRates = computed(() => store.taxRates.filter((r) => r.kind === 'vat'));

/**
 * Sanitiza la entrada del campo Precio: solo dígitos y un único punto decimal.
 * - Elimina cualquier carácter que no sea dígito o punto (incluyendo comas).
 * - Deja solo el primer punto; los siguientes se descartan (ej. "12.3.4" → "12.34").
 * - Limita a 2 decimales para dinero (se puede subir si haces cálculos con más).
 */
function sanitizePrice(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
    const [intPart, decPart = ''] = s.split('.');
    s = intPart + '.' + decPart.slice(0, 2);
  }
  return s;
}

function onPriceInput(e: Event): void {
  const target = e.target as HTMLInputElement;
  const sanitized = sanitizePrice(target.value);
  if (sanitized !== target.value) {
    target.value = sanitized;
  }
  price.value = sanitized;
}

onMounted(async () => {
  await store.fetchCatalog();
  if (isEdit.value && productId.value) {
    try {
      await store.fetchById(productId.value);
      if (store.current) {
        const p = store.current;
        name.value = p.name;
        sku.value = p.sku ?? '';
        type.value = p.type;
        description.value = p.description ?? '';
        price.value = p.price;
        currencyCode.value = p.currencyCode;
        priceIncludesTax.value = p.priceIncludesTax;
        categoryId.value = p.categoryId;
        unitId.value = p.unitId;
        selectedTaxIds.value = p.taxes.map((t) => t.taxRateId);
        // Extrae la tasa de IVA (kind vat) para el selector principal.
        vatRateId.value = p.taxes.find((t) => t.kind === 'vat')?.taxRateId ?? null;
      }
    } catch {
      router.push({ name: 'products' });
    }
  }
});

async function submit(): Promise<void> {
  saving.value = true;
  saveError.value = null;
  try {
    if (isEdit.value && productId.value) {
      const input: UpdateProductInput = {
        name: name.value,
        sku: sku.value || null,
        type: type.value,
        description: description.value || null,
        price: String(price.value),
        currencyCode: currencyCode.value,
        priceIncludesTax: priceIncludesTax.value,
        categoryId: categoryId.value,
        unitId: unitId.value,
      };
      await store.update(productId.value, input);
      // La lista de impuestos del producto es el IVA seleccionado (único por ahora).
      // Cuando se agreguen retenciones/ICE, aquí se combinarán con los otros ids.
      const taxIdsToSave = vatRateId.value ? [vatRateId.value] : [];
      await store.updateTaxes(productId.value, taxIdsToSave);

      if (imageUploaderRef.value?.hasPending()) {
        uploading.value = true;
        const fileIds = await imageUploaderRef.value.uploadAll();
        for (const fileId of fileIds) {
          await productApi.addImage(productId.value, { fileId });
        }
        uploading.value = false;
      }

      router.push({ name: 'products-detail', params: { id: productId.value } });
    } else {
      let uploadedFileIds: string[] = [];
      if (imageUploaderRef.value?.hasPending()) {
        uploading.value = true;
        uploadedFileIds = await imageUploaderRef.value.uploadAll();
      }

      const input: CreateProductInput = {
        name: name.value,
        type: type.value,
        price: String(price.value),
        currencyCode: currencyCode.value,
        sku: sku.value || undefined,
        description: description.value || undefined,
        categoryId: categoryId.value ?? undefined,
        unitId: unitId.value ?? undefined,
        taxRateIds: vatRateId.value ? [vatRateId.value] : undefined,
        priceIncludesTax: priceIncludesTax.value,
      };
      const product = await store.create(input);

      if (uploadedFileIds.length > 0) {
        for (const fileId of uploadedFileIds) {
          await productApi.addImage(product.id, { fileId });
        }
        uploading.value = false;
      }

      router.push({ name: 'products-detail', params: { id: product.id } });
    }
  } catch (e) {
    saveError.value = extractError(e);
  } finally {
    saving.value = false;
  }
}
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
      <h2 class="text-h5 font-weight-medium">
        {{ isEdit ? 'Editar producto' : 'Nuevo producto' }}
      </h2>
    </div>

    <v-alert
      v-if="saveError"
      type="error"
      density="compact"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="saveError = null"
    >
      {{ saveError }}
    </v-alert>

    <v-row>
      <v-col cols="12" md="10" lg="8">
        <v-card elevation="2" rounded="lg">
          <v-card-text>
            <v-form @submit.prevent="submit">
              <v-row dense>
                <v-col cols="12" md="8">
                  <v-text-field
                    v-model="name"
                    label="Nombre del producto"
                    variant="outlined"
                    density="compact"
                    required
                    hide-details="auto"
                    class="mb-4"
                  />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field
                    v-model="sku"
                    label="SKU"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    class="mb-4"
                  />
                </v-col>
              </v-row>

              <v-select
                v-model="type"
                :items="[
                  { title: 'Producto', value: 'good' },
                  { title: 'Servicio', value: 'service' },
                ]"
                label="Tipo"
                variant="outlined"
                density="compact"
                required
                hide-details="auto"
                class="mb-4"
              />

              <v-textarea
                v-model="description"
                label="Descripción"
                variant="outlined"
                density="compact"
                hide-details="auto"
                class="mb-4"
                rows="2"
              />

              <v-row dense align="center">
                <v-col cols="12" md="4">
                  <v-text-field
                    :model-value="price"
                    label="Precio"
                    variant="outlined"
                    density="compact"
                    required
                    type="text"
                    inputmode="decimal"
                    placeholder="0.00"
                    hide-details="auto"
                    @input="onPriceInput"
                  />
                </v-col>
                <v-col cols="12" md="4">
                  <v-select
                    v-model="currencyCode"
                    :items="['USD', 'EUR', 'COP', 'PEN', 'MXN']"
                    label="Moneda"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                  />
                </v-col>
                <v-col cols="12" md="4" class="d-flex align-center pl-3">
                  <v-switch
                    v-model="priceIncludesTax"
                    label="Precio incluye IVA"
                    density="compact"
                    hide-details
                    inset
                    color="primary"
                    class="mt-0"
                  />
                </v-col>
              </v-row>
              <div class="mb-4" />

              <v-row dense>
                <v-col cols="12" md="6">
                  <v-select
                    v-model="categoryId"
                    :items="store.categories"
                    item-title="name"
                    item-value="id"
                    label="Categoría"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    clearable
                    class="mb-4"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-select
                    v-model="unitId"
                    :items="store.units"
                    item-title="name"
                    item-value="id"
                    label="Unidad de medida"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    clearable
                    class="mb-4"
                  />
                </v-col>
              </v-row>

              <v-select
                v-model="vatRateId"
                :items="vatRates"
                item-title="name"
                item-value="id"
                label="IVA"
                variant="outlined"
                density="compact"
                hide-details="auto"
                clearable
                class="mb-4"
              />

              <v-divider class="my-4" />
              <p class="text-body-2 text-medium-emphasis mb-2">Imágenes</p>
              <div v-if="isEdit && existingImages.length > 0" class="d-flex flex-wrap ga-2 mb-3">
                <v-img
                  v-for="img in existingImages"
                  :key="img.id"
                  :src="img.url"
                  width="80"
                  height="80"
                  cover
                  class="rounded border"
                />
              </div>
              <ImageUploader
                ref="imageUploaderRef"
                resource-type="product"
                :resource-id="imageResourceId"
                category="product-image"
                :multiple="true"
                accept="image/*"
                :max-size-mb="5"
                class="mb-4"
              />

              <v-btn
                block
                color="primary"
                type="submit"
                :loading="saving || uploading"
                :disabled="!name || !price"
              >
                {{ isEdit ? 'Guardar cambios' : 'Crear producto' }}
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
