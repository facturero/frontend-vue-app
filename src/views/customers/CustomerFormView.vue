<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
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
const idTypes = computed(() => {
  const all = store.identificationTypes;
  if (type.value === 'company') {
    return all.filter((t) => t.code === 'RUC' || t.code === 'PASAPORTE' || t.code === 'EXTERIOR');
  }
  return all;
});

const selectedIdType = computed(() =>
  identificationTypeId.value
    ? store.identificationTypes.find((t) => t.id === identificationTypeId.value) ?? null
    : null,
);

const isConsumidorFinal = computed(() => selectedIdType.value?.code === 'CONSUMIDOR_FINAL');

// Auto-fill y limpiar identificación según tipo seleccionado
watch(identificationTypeId, (newId, oldId) => {
  const newType = store.identificationTypes.find((t) => t.id === newId);
  const oldType = store.identificationTypes.find((t) => t.id === oldId);
  if (newType?.code === 'CONSUMIDOR_FINAL') {
    identification.value = '9999999999999';
  } else if (oldType?.code === 'CONSUMIDOR_FINAL') {
    identification.value = '';
  }
});
const identificationHint = computed(() => {
  const t = selectedIdType.value;
  if (!t || !identification.value) return '';
  if (!t.regex) return '';
  const lenMatch = t.regex.match(/\{(\d+)\}/);
  if (lenMatch && identification.value.length !== parseInt(lenMatch[1])) return '';
  try {
    const re = new RegExp(t.regex);
    if (!re.test(identification.value)) return `Formato inválido para ${t.name}`;
  } catch {
    /* regex mal formado en el catálogo: se ignora en el front, el back lo valida */
  }
  return '';
});

const phoneHint = computed(() => {
  const p = phone.value.trim();
  if (!p) return '';
  const clean = p.replace(/[\s\-\(\)]/g, '');
  if (clean.length === 10 && !/^0\d{9}$/.test(clean)) return 'Formato inválido. Ej: 0991234567';
  if (clean.length === 9 && !/^[2-7]\d{8}$/.test(clean)) return 'Formato inválido. Ej: 022345678';
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
  store.current = null;
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

    <v-alert v-if="store.error" type="warning" density="compact" variant="tonal" closable class="mb-4"
      @click:close="store.error = null">
      {{ store.error }}
    </v-alert>

    <v-row>
      <v-col cols="12" md="8">
        <v-card elevation="2" rounded="lg">
          <v-card-text>
            <v-form @submit.prevent="submit">
              <!-- Tipo (persona / empresa) — solo al crear; no editable en edición -->
              <v-radio-group v-model="type" :disabled="isEdit" inline class="mb-4" hide-details
                @update:model-value="(v) => { tradeName = ''; if (v === 'company' && identificationTypeId && !['RUC','PASAPORTE','EXTERIOR'].includes(store.identificationTypes.find(t => t.id === identificationTypeId)?.code ?? '')) identificationTypeId = null; }">
                <v-radio label="Persona" value="person" />
                <v-radio label="Empresa" value="company" />
              </v-radio-group>

              <v-row dense>
                <v-col :cols="type === 'company' ? 'md-8' : '12'">
                  <v-text-field v-model="businessName" :label="type === 'company' ? 'Razón social' : 'Nombre completo'"
                    variant="outlined" density="compact" required hide-details="auto" class="mb-4" />
                </v-col>
                <v-col v-if="type === 'company'" cols="12" md="4">
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
                    :maxlength="selectedIdType?.regex?.match(/\{(\d+)\}/)?.[1] ?? 20"
                    :disabled="isConsumidorFinal"
                    class="mb-4" hide-details="auto" inputmode="numeric" pattern="[0-9]*" />
                </v-col>
              </v-row>

              <v-row dense>
                <v-col cols="12" md="6">
                  <v-text-field v-model="email" label="Email" type="email" variant="outlined" density="compact"
                    hide-details="auto" class="mb-4" />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field v-model="phone" label="Teléfono" variant="outlined" density="compact"
                    :hint="phoneHint" :error="!!phoneHint" persistent-hint
                    maxlength="10" inputmode="numeric" pattern="[0-9]*"
                    class="mb-4" />
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
