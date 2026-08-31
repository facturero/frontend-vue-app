<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useFiscalStore } from '@/stores/fiscal';

const { t, locale } = useI18n();
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
    uploadError.value = e?.response?.data?.message || e.message || t('certificates.uploadError');
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
        <h2 class="text-h5 font-weight-medium">{{ $t('certificates.title') }}</h2>
        <p class="text-body-2 text-medium-emphasis mb-0">
          {{ $t('certificates.intro') }}
        </p>
      </div>
      <v-btn v-if="canManage" color="primary" prepend-icon="mdi-upload" @click="showUploadDialog = true">
        {{ $t('invoices.uploadCertificate') }}
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
              {{ cert.status === 'revoked' ? $t('certificates.statusRevoked') : isExpired(cert.valid_until) ?
                $t('certificates.statusExpired') : $t('common.active') }}
            </v-chip>
            <v-chip v-if="cert.status === 'active' && isExpiringSoon(cert.valid_until)" size="x-small" color="warning" variant="tonal">
              {{ $t('certificates.expiringSoon') }}
            </v-chip>
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ $t('certificates.validRange', {
              from: new Date(cert.valid_from).toLocaleDateString(locale),
              to: new Date(cert.valid_until).toLocaleDateString(locale),
            }) }}
          </v-list-item-subtitle>
          <template #append v-if="canManage && cert.status === 'active'">
            <v-btn icon="mdi-delete-outline" variant="text" size="small" :title="$t('certificates.revoke')" @click="revoke(cert.id)" />
          </template>
        </v-list-item>
        <v-list-item v-if="store.certificates.length === 0 && !store.loading">
          <v-list-item-title class="text-medium-emphasis">
            {{ $t('certificates.empty') }}
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>

    <v-dialog v-model="showUploadDialog" max-width="480">
      <v-card>
        <v-card-title>{{ $t('invoices.uploadCertificateTitle') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="uploadError" type="error" density="compact" variant="tonal" class="mb-4">
            {{ uploadError }}
          </v-alert>
          <p class="text-caption text-medium-emphasis mb-3">
            {{ $t('certificates.encryptedHint') }}
          </p>
          <v-file-input
            :label="$t('invoices.certFile')"
            variant="outlined"
            density="compact"
            accept=".p12,.pfx"
            class="mb-3"
            hide-details="auto"
            @change="onFileChange"
          />
          <v-text-field
            v-model="password"
            :label="$t('invoices.certPassword')"
            type="password"
            variant="outlined"
            density="compact"
            class="mb-3"
            hide-details="auto"
          />
          <v-text-field
            v-model="alias"
            :label="$t('invoices.certAlias')"
            variant="outlined"
            density="compact"
            hide-details="auto"
            :placeholder="$t('invoices.certAliasPlaceholder')"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showUploadDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" :disabled="!selectedFile || !password" @click="submit">
            {{ $t('common.upload') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
