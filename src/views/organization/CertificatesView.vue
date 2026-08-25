<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useFiscalStore } from '@/stores/fiscal';

const auth = useAuthStore();
const store = useFiscalStore();

const canManage = computed(() => auth.can('fiscal:manage'));

const showUploadDialog = ref(false);
const selectedFile = ref<File | null>(null);
const password = ref('');
const alias = ref('');
const uploadError = ref('');

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
}

async function submit(): Promise<void> {
  uploadError.value = '';
  if (!selectedFile.value || !password.value) return;
  try {
    await store.uploadCertificate(selectedFile.value, password.value, alias.value || undefined);
    showUploadDialog.value = false;
    selectedFile.value = null;
    password.value = '';
    alias.value = '';
  } catch (e: any) {
    uploadError.value = e?.response?.data?.message || e.message || 'Error al subir el certificado';
  }
}

async function revoke(id: string): Promise<void> {
  try {
    await store.revokeCertificate(id);
  } catch {
    // el error ya se muestra desde el store
  }
}

function isExpiringSoon(validUntil: string): boolean {
  const days = (new Date(validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days > 0 && days <= 30;
}

function isExpired(validUntil: string): boolean {
  return new Date(validUntil).getTime() < Date.now();
}

onMounted(() => {
  store.fetchCertificates();
});
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mt-6 mb-4">
      <div>
        <h2 class="text-h5 font-weight-medium">Certificado electrónico</h2>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Necesario para firmar y autorizar tus facturas ante el SRI. Sin un certificado activo, las
          facturas se emiten comercialmente igual, pero nunca quedan autorizadas por el SRI.
        </p>
      </div>
      <v-btn v-if="canManage" color="primary" prepend-icon="mdi-upload" @click="showUploadDialog = true">
        Subir certificado
      </v-btn>
    </div>

    <v-alert v-if="store.error" type="error" density="compact" variant="tonal" closable class="mb-4"
      @click:close="store.error = null">
      {{ store.error }}
    </v-alert>

    <v-card elevation="2" rounded="lg">
      <v-list density="compact">
        <v-list-item v-for="cert in store.certificates" :key="cert.id">
          <v-list-item-title class="d-flex align-center ga-2">
            {{ cert.alias }}
            <v-chip
              size="x-small"
              :color="cert.status === 'active' ? (isExpired(cert.valid_until) ? 'error' : 'success') : 'grey'"
              variant="tonal"
            >
              {{ cert.status === 'revoked' ? 'Revocado' : isExpired(cert.valid_until) ? 'Vencido' : 'Activo' }}
            </v-chip>
            <v-chip v-if="cert.status === 'active' && isExpiringSoon(cert.valid_until)" size="x-small" color="warning" variant="tonal">
              Vence pronto
            </v-chip>
          </v-list-item-title>
          <v-list-item-subtitle>
            Vigente desde {{ new Date(cert.valid_from).toLocaleDateString('es-EC') }}
            hasta {{ new Date(cert.valid_until).toLocaleDateString('es-EC') }}
          </v-list-item-subtitle>
          <template #append v-if="canManage && cert.status === 'active'">
            <v-btn icon="mdi-delete-outline" variant="text" size="small" title="Revocar" @click="revoke(cert.id)" />
          </template>
        </v-list-item>
        <v-list-item v-if="store.certificates.length === 0 && !store.loading">
          <v-list-item-title class="text-medium-emphasis">
            No hay ningún certificado cargado todavía.
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>

    <v-dialog v-model="showUploadDialog" max-width="480">
      <v-card>
        <v-card-title>Subir certificado (.p12)</v-card-title>
        <v-card-text>
          <v-alert v-if="uploadError" type="error" density="compact" variant="tonal" class="mb-4">
            {{ uploadError }}
          </v-alert>
          <p class="text-caption text-medium-emphasis mb-3">
            El archivo y la contraseña se guardan cifrados. Nunca se muestran de nuevo tras subirlos.
          </p>
          <v-file-input
            label="Archivo .p12"
            variant="outlined"
            density="compact"
            accept=".p12,.pfx"
            class="mb-3"
            hide-details="auto"
            @change="onFileChange"
          />
          <v-text-field
            v-model="password"
            label="Contraseña del certificado"
            type="password"
            variant="outlined"
            density="compact"
            class="mb-3"
            hide-details="auto"
          />
          <v-text-field
            v-model="alias"
            label="Nombre para identificarlo (opcional)"
            variant="outlined"
            density="compact"
            hide-details="auto"
            placeholder="Ej. Firma 2026"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showUploadDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="store.saving" :disabled="!selectedFile || !password" @click="submit">
            Subir
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
