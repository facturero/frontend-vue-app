<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useFiscalStore } from '@/stores/fiscal';
import PageHeader from '@/components/ui/PageHeader.vue';

const { t, locale } = useI18n();
const auth = useAuthStore();
const store = useFiscalStore();

// `embedded`: la vista vive dentro de Ajustes (arquetipo F) como pestaña, sin
// container ni PageHeader propios. La acción de subir certificado pasa a un
// botón de la pestaña, no del PageHeader.
const props = defineProps<{ embedded?: boolean }>();

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
  <!-- El wrapper cambia según el modo: en Ajustes (embedded) no hay container propio. -->
  <component :is="props.embedded ? 'div' : 'v-container'">
    <PageHeader v-if="!props.embedded" :title="$t('certificates.title')" :subtitle="$t('certificates.intro')">
      <template #actions>
        <v-btn v-if="canManage" color="primary" prepend-icon="mdi-upload" @click="showUploadDialog = true">
          {{ $t('invoices.uploadCertificate') }}
        </v-btn>
      </template>
    </PageHeader>

    <v-alert v-if="store.error" type="error" closable class="mb-4"
      @click:close="store.error = null">
      {{ store.error }}
    </v-alert>

    <v-card>
      <v-card-title v-if="props.embedded" class="d-flex align-center justify-space-between">
        <span class="text-body-1 font-weight-medium">{{ $t('certificates.title') }}</span>
        <v-btn v-if="canManage" size="small" variant="tonal" color="primary" prepend-icon="mdi-upload"
          @click="showUploadDialog = true">
          {{ $t('invoices.uploadCertificate') }}
        </v-btn>
      </v-card-title>
      <v-list density="compact">
        <v-list-item v-for="cert in store.certificates" :key="cert.id">
          <v-list-item-title class="d-flex align-center ga-2">
            {{ cert.alias }}
            <v-chip
              size="x-small"
              variant="flat"
              :color="cert.status === 'active' ? (isExpired(cert.valid_until) ? 'lighterror' : 'lightsuccess') : 'lightsecondary'"
            >
              {{ cert.status === 'revoked' ? $t('certificates.statusRevoked') : isExpired(cert.valid_until) ?
                $t('certificates.statusExpired') : $t('common.active') }}
            </v-chip>
            <v-chip v-if="cert.status === 'active' && isExpiringSoon(cert.valid_until)" size="x-small" variant="flat" color="lightwarning">
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
          <v-alert v-if="uploadError" type="error" class="mb-4">
            {{ uploadError }}
          </v-alert>
          <p class="text-caption text-medium-emphasis mb-3">
            {{ $t('certificates.encryptedHint') }}
          </p>
          <v-file-input
            :label="$t('invoices.certFile')"
            accept=".p12,.pfx"
            class="mb-3"
            @change="onFileChange"
          />
          <v-text-field
            v-model="password"
            :label="$t('invoices.certPassword')"
            type="password"
            class="mb-3"
          />
          <v-text-field
            v-model="alias"
            :label="$t('invoices.certAlias')"
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
  </component>
</template>
