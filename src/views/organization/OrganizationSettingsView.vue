<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useOrganizationStore } from '@/stores/organization';

const auth = useAuthStore();
const store = useOrganizationStore();

const legalName = ref('');
const tradeName = ref('');
const taxId = ref('');
const countryCode = ref('EC');
const obligadoContabilidad = ref(false);
const saved = ref(false);

onMounted(async () => {
  try {
    await store.fetch();
    if (store.org) {
      legalName.value = store.org.legalName ?? '';
      tradeName.value = store.org.tradeName ?? '';
      taxId.value = store.org.taxId ?? '';
      countryCode.value = store.org.countryCode ?? 'EC';
      obligadoContabilidad.value = Boolean((store.org.settings as Record<string, unknown> | null)?.obligadoContabilidad);
    }
  } catch {
    // handled by store
  }
});

async function submit(): Promise<void> {
  saved.value = false;
  try {
    await store.upsert({
      legalName: legalName.value,
      tradeName: tradeName.value || undefined,
      taxId: taxId.value,
      countryCode: countryCode.value,
    });
    // El perfil legal/tributario va por upsert (PUT); obligadoContabilidad vive en
    // settings, que se actualiza por separado (PATCH) porque updateSettings()
    // reemplaza el objeto settings entero, así que hay que mergear lo que ya había.
    await store.update({
      settings: {
        ...((store.org?.settings as Record<string, unknown> | null) ?? {}),
        obligadoContabilidad: obligadoContabilidad.value,
      },
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
              Datos fiscales de tu organización. Se usan para emitir facturas y en el perfil de la empresa.
              El RUC y el país son obligatorios para poder emitir documentos electrónicos.
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
                label="Nombre legal (razón social)"
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
                class="mb-4"
                hide-details="auto"
                placeholder="Ej. MiEmpresa"
              />

              <v-text-field
                v-model="taxId"
                label="RUC / identificación tributaria"
                variant="outlined"
                density="compact"
                class="mb-4"
                hide-details="auto"
                placeholder="Ej. 1793176071001"
              />

              <v-select
                v-model="countryCode"
                :items="[{ title: 'Ecuador', value: 'EC' }]"
                label="País"
                variant="outlined"
                density="compact"
                class="mb-4"
                hide-details="auto"
              />

              <v-checkbox
                v-model="obligadoContabilidad"
                label="Obligado a llevar contabilidad"
                density="compact"
                hide-details="auto"
                class="mb-4"
              />
              <p class="text-caption text-medium-emphasis mb-4" style="margin-top: -8px;">
                Depende de tus ingresos/patrimonio según el SRI — marca esta opción si tu empresa está obligada.
                Afecta el campo <code>obligadoContabilidad</code> de las facturas electrónicas.
              </p>

              <v-btn
                block
                color="primary"
                type="submit"
                :loading="store.saving"
                :disabled="!legalName || !taxId || !countryCode"
              >
                Guardar cambios
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="8" lg="6">
        <v-card elevation="2" rounded="lg" class="mt-2">
          <v-card-text class="d-flex align-center justify-space-between">
            <div>
              <p class="text-body-1 font-weight-medium mb-1">Establecimientos y puntos de emisión</p>
              <p class="text-body-2 text-medium-emphasis mb-0">
                Necesarios para emitir facturas.
              </p>
            </div>
            <v-btn variant="outlined" color="primary" to="/organization/establishments">
              Gestionar
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="8" lg="6">
        <v-card elevation="2" rounded="lg" class="mt-2">
          <v-card-text class="d-flex align-center justify-space-between">
            <div>
              <p class="text-body-1 font-weight-medium mb-1">Certificado electrónico</p>
              <p class="text-body-2 text-medium-emphasis mb-0">
                Necesario para que el SRI autorice tus facturas.
              </p>
            </div>
            <v-btn variant="outlined" color="primary" to="/organization/certificates">
              Gestionar
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
