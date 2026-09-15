<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFiscalStore } from '@/stores/fiscal';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const { t } = useI18n();
const fiscalStore = useFiscalStore();

const quickCertFile = ref<File | null>(null);
const quickCertPassword = ref('');
const quickCertAlias = ref('');
const certDialogError = ref('');

function close(): void {
  emit('update:modelValue', false);
}

async function submit(): Promise<void> {
  if (!quickCertFile.value || !quickCertPassword.value) return;
  certDialogError.value = '';
  try {
    await fiscalStore.uploadCertificate(quickCertFile.value, quickCertPassword.value, quickCertAlias.value || undefined);
    close();
    quickCertFile.value = null;
    quickCertPassword.value = '';
    quickCertAlias.value = '';
  } catch (e: any) {
    certDialogError.value = e?.response?.data?.message || e.message || t('invoices.certUploadError');
  }
}

function onQuickCertFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  quickCertFile.value = input.files?.[0] ?? null;
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="420"
    @update:model-value="(v) => { if (!v) close(); }"
  >
    <v-card>
      <v-card-title>{{ $t('invoices.uploadCertificateTitle') }}</v-card-title>
      <v-card-text>
        <v-alert v-if="certDialogError" type="error" class="mb-4">
          {{ certDialogError }}
        </v-alert>
        <p class="text-caption text-medium-emphasis mb-3">
          {{ $t('invoices.certEncryptedHint') }}
        </p>
        <v-file-input
          :label="$t('invoices.certFile')"
          accept=".p12,.pfx"
          class="mb-3"
          @change="onQuickCertFileChange"
        />
        <v-text-field
          v-model="quickCertPassword"
          :label="$t('invoices.certPassword')"
          type="password"
          class="mb-3"
        />
        <v-text-field
          v-model="quickCertAlias"
          :label="$t('invoices.certAlias')"
          :placeholder="$t('invoices.certAliasPlaceholder')"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" :loading="fiscalStore.saving" :disabled="!quickCertFile || !quickCertPassword" @click="submit">
          {{ $t('common.upload') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>