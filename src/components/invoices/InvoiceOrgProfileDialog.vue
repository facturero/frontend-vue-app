<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useOrganizationStore } from '@/stores/organization';
import { supportedCountries } from '@/config/fiscalRegimes';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const { t } = useI18n();
const orgStore = useOrganizationStore();

const quickTaxId = ref('');
const quickCountryCode = ref('EC');
const orgDialogError = ref('');
const orgDialogSaving = ref(false);

function close(): void {
  emit('update:modelValue', false);
}

async function submit(): Promise<void> {
  if (!quickTaxId.value) return;
  orgDialogError.value = '';
  orgDialogSaving.value = true;
  try {
    await orgStore.upsert({
      legalName: orgStore.org?.legalName || 'Mi empresa',
      taxId: quickTaxId.value,
      countryCode: quickCountryCode.value,
    });
    close();
    quickTaxId.value = '';
  } catch (e: any) {
    orgDialogError.value = e?.response?.data?.message || e.message || t('common.saveError');
  } finally {
    orgDialogSaving.value = false;
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="420"
    @update:model-value="(v) => { if (!v) close(); }"
  >
    <v-card>
      <v-card-title>{{ $t('invoices.completeFiscalProfile') }}</v-card-title>
      <v-card-text>
        <v-alert v-if="orgDialogError" type="error" class="mb-4">
          {{ orgDialogError }}
        </v-alert>
        <v-text-field
          v-model="quickTaxId"
          :label="$t('invoices.taxIdLabel')"
          class="mb-3"
          :placeholder="$t('invoices.taxIdPlaceholder')"
        />
        <v-select
          v-model="quickCountryCode"
          :items="supportedCountries()"
          :label="$t('common.country')"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" :loading="orgDialogSaving" :disabled="!quickTaxId" @click="submit">
          {{ $t('common.save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>