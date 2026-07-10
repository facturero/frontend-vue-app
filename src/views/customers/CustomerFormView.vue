<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCustomerStore } from '@/stores/customers';
import ImageUploader from '@/components/ImageUploader.vue';
import type { CreateCustomerInput, UpdateCustomerInput, CustomerType } from '@/types/customers';

const route = useRoute();
const router = useRouter();
const store = useCustomerStore();

const customerId = computed(() => (route.params.id as string) || null);
const isEdit = computed(() => !!customerId.value);

const apiUrl = import.meta.env.VITE_API_URL as string;
const tempId = crypto.randomUUID();

// Campos
const businessName = ref('');
const tradeName = ref('');
const type = ref<CustomerType>('person');
const identificationTypeId = ref<string | null>(null);
const identification = ref('');
const email = ref('');
const phone = ref('');
const imageFileId = ref<string | null>(null);

const formError = ref<string | null>(null);

const imageUploaderRef = ref<InstanceType<typeof ImageUploader> | null>(null);

const existingImages = computed(() =>
  store.current?.imageFileId
    ? [{ id: store.current.imageFileId, url: `${apiUrl}/files/${store.current.imageFileId}/download` }]
    : [],
);

// Solo se puede escoger un tipo de identificación válido para el país del contexto
// (viene del read-model alimentado por tax-service).
const idTypes = computed(() => store.identificationTypes);

const selectedIdType = computed(() =>
  identificationTypeId.value
    ? store.identificationTypes.find((t) => t.id === identificationTypeId.value) ?? null
    : null,
);

// Valida el input contra el regex del tipo elegido (si tiene). Feedback en vivo.
const identificationHint = computed(() => {
  const t = selectedIdType.value;
  if (!t || !identification.value) return '';
  if (!t.regex) return '';
  try {
    const re = new RegExp(t.regex);
    if (!re.test(identification.value)) return `Formato inválido para ${t.name}`;
  } catch {
    /* regex mal formado en el catálogo: se ignora en el front, el back lo valida */
  }
  return '';
});

async function submit(): Promise<void> {
  formError.value = null;
  if (!businessName.value.trim()) {
    formError.value = 'El nombre o razón social es requerido';
    return;
  }
  try {
    let uploadedFileId: string | undefined;
    if (imageUploaderRef.value?.hasPending()) {
      const ids = await imageUploaderRef.value.uploadAll();
      uploadedFileId = ids[0];
    }

    if (isEdit.value && customerId.value) {
      const input: UpdateCustomerInput = {
        businessName: businessName.value,
        tradeName: tradeName.value || undefined,
        identificationTypeId: identificationTypeId.value ?? undefined,
        identification: identification.value || undefined,
        email: email.value || undefined,
        phone: phone.value || undefined,
        imageFileId: uploadedFileId ?? imageFileId.value ?? undefined,
      };
      await store.update(customerId.value, input);
      router.push({ name: 'customers-detail', params: { id: customerId.value } });
    } else {
      const input: CreateCustomerInput = {
        businessName: businessName.value,
        type: type.value,
        tradeName: tradeName.value || undefined,
        identificationTypeId: identificationTypeId.value ?? undefined,
        identification: identification.value || undefined,
        email: email.value || undefined,
        phone: phone.value || undefined,
        imageFileId: uploadedFileId,
      };
      const created = await store.create(input);
      router.push({ name: 'customers-detail', params: { id: created.id } });
    }
  } catch (e) {
    formError.value = (e as { message?: string })?.message ?? 'Error al guardar el cliente';
  }
}

onMounted(async () => {
  await store.fetchCatalog();
  if (isEdit.value && customerId.value) {
    await store.fetchById(customerId.value);
    const c = store.current;
    if (c) {
      businessName.value = c.businessName;
      tradeName.value = c.tradeName ?? '';
      type.value = c.type;
      identificationTypeId.value = c.identificationTypeId;
      identification.value = c.identification ?? '';
      email.value = c.email ?? '';
      phone.value = c.phone ?? '';
      imageFileId.value = c.imageFileId;
    }
  }
});
</script>

<template>
  <v-container>
    <div class="d-flex align-center mt-6 mb-4">
      <v-btn variant="text" icon="mdi-arrow-left" class="mr-2" @click="router.push({ name: 'customers' })" />
      <h2 class="text-h5 font-weight-medium">
        {{ isEdit ? 'Editar cliente' : 'Nuevo cliente' }}
      </h2>
    </div>

    <v-alert v-if="formError" type="error" density="compact" variant="tonal" closable class="mb-4"
      @click:close="formError = null">
      {{ formError }}
    </v-alert>

    <v-row>
      <v-col cols="12" md="8">
        <v-card elevation="2" rounded="lg">
          <v-card-text>
            <v-form @submit.prevent="submit">
              <!-- Tipo (persona / empresa) — solo al crear; no editable en edición -->
              <v-radio-group v-model="type" :disabled="isEdit" inline class="mb-4" hide-details>
                <v-radio label="Persona" value="person" />
                <v-radio label="Empresa" value="company" />
              </v-radio-group>

              <v-row dense>
                <v-col cols="12" md="8">
                  <v-text-field v-model="businessName" :label="type === 'company' ? 'Razón social' : 'Nombre completo'"
                    variant="outlined" density="compact" required hide-details="auto" class="mb-4" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="tradeName" label="Nombre comercial" variant="outlined" density="compact"
                    hide-details="auto" class="mb-4" />
                </v-col>
              </v-row>

              <v-row dense>
                <v-col cols="12" md="4">
                  <v-select v-model="identificationTypeId" :items="idTypes" item-title="name" item-value="id"
                    label="Tipo de identificación" variant="outlined" density="compact" hide-details="auto" clearable
                    class="mb-4" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="identification" label="Número de identificación" variant="outlined"
                    density="compact" :hint="identificationHint" :error="!!identificationHint" persistent-hint
                    class="mb-4" hide-details="auto"/>
                </v-col>
              </v-row>

              <v-row dense>
                <v-col cols="12" md="6">
                  <v-text-field v-model="email" label="Email" type="email" variant="outlined" density="compact"
                    hide-details="auto" class="mb-4" />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field v-model="phone" label="Teléfono" variant="outlined" density="compact"
                    hide-details="auto" class="mb-4" />
                </v-col>
              </v-row>

              <div class="d-flex justify-end ga-2 mt-4">
                <v-btn variant="text" @click="router.push({ name: 'customers' })">Cancelar</v-btn>
                <v-btn type="submit" color="primary" variant="tonal" :loading="store.saving">
                  {{ isEdit ? 'Guardar cambios' : 'Crear cliente' }}
                </v-btn>
              </div>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card elevation="2" rounded="lg">
          <v-card-title class="text-h6">Avatar</v-card-title>
          <v-card-text>
            <ImageUploader
              ref="imageUploaderRef"
              resource-type="customer"
              :resource-id="customerId ?? tempId"
              :existing-images="existingImages"
            />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
