<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useOrganizationStore } from '@/stores/organization';

const auth = useAuthStore();
const store = useOrganizationStore();

const legalName = ref('');
const tradeName = ref('');
const saved = ref(false);

onMounted(async () => {
  try {
    await store.fetch();
    if (store.org) {
      legalName.value = store.org.legalName ?? '';
      tradeName.value = store.org.tradeName ?? '';
    }
  } catch {
    // handled by store
  }
});

async function submit(): Promise<void> {
  saved.value = false;
  try {
    await store.update({
      legalName: legalName.value || undefined,
      tradeName: tradeName.value || undefined,
    });
    await auth.fetchMe();
    saved.value = true;
  } catch {
    // handled by store
  }
}
</script>

<template>
  <v-container>
    <h2 class="text-h5 font-weight-medium mt-6 mb-4">Configuración de la organización</h2>

    <v-row>
      <v-col cols="12" md="8" lg="6">
        <v-card elevation="2" rounded="lg">
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis mb-4">
              Datos básicos de tu organización. Estos datos se usarán en facturas y notificaciones.
            </p>

            <v-alert
              v-if="store.error"
              type="error"
              variant="tonal"
              closable
              class="mb-4"
              density="compact"
              @click:close="store.error = null"
            >
              {{ store.error }}
            </v-alert>

            <v-alert
              v-if="saved"
              type="success"
              variant="tonal"
              closable
              class="mb-4"
              density="compact"
              @click:close="saved = false"
            >
              Organización actualizada
            </v-alert>

            <v-form @submit.prevent="submit">
              <v-text-field
                v-model="legalName"
                label="Nombre legal"
                variant="outlined"
                density="compact"
                class="mb-4"
                hide-details="auto"
                placeholder="Ej. Mi Empresa S.A.S."
              />

              <v-text-field
                v-model="tradeName"
                label="Nombre comercial"
                variant="outlined"
                density="compact"
                class="mb-6"
                hide-details="auto"
                placeholder="Ej. MiEmpresa"
              />

              <v-btn
                block
                color="primary"
                type="submit"
                :loading="store.saving"
                :disabled="!legalName"
              >
                Guardar cambios
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
